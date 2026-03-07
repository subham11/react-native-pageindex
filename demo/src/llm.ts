import type { LLMProvider } from 'react-native-pageindex';

export type ProviderType = 'openai' | 'anthropic' | 'ollama';

export interface LLMConfig {
  provider: ProviderType;
  apiKey: string;
  model: string;
  ollamaUrl: string;
}

export const DEFAULT_MODELS: Record<ProviderType, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-opus-4-5',
  ollama: 'llama3',
};

export const PROVIDER_LABELS: Record<ProviderType, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  ollama: 'Ollama (local)',
};

export function createLLMProvider(cfg: LLMConfig): LLMProvider {
  switch (cfg.provider) {
    case 'openai':    return makeOpenAI(cfg.apiKey, cfg.model);
    case 'anthropic': return makeAnthropic(cfg.apiKey, cfg.model);
    case 'ollama':    return makeOllama(cfg.model, cfg.ollamaUrl);
    default: throw new Error(`Unknown provider: ${cfg.provider}`);
  }
}

// ─── OpenAI ──────────────────────────────────────────────────────────────────
//
// OpenAI does NOT send CORS headers, so direct browser → api.openai.com calls
// fail with "Failed to fetch".  In dev we route through the Vite proxy at
// /llm-proxy/openai → https://api.openai.com (server-to-server, no CORS).
//
// import.meta.env.DEV is replaced with `true` in dev and `false` in prod builds.
const OPENAI_BASE = import.meta.env.DEV
  ? '/llm-proxy/openai'          // Vite dev-server proxy (no CORS)
  : 'https://api.openai.com';    // Direct call (needs a backend proxy in prod)

function makeOpenAI(apiKey: string, model: string): LLMProvider {
  return async (prompt, opts) => {
    const res = await fetch(`${OPENAI_BASE}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          ...(opts?.chatHistory ?? []),
          { role: 'user', content: prompt },
        ],
        max_tokens: 4096,
        temperature: 0.1,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`OpenAI ${res.status}: ${err?.error?.message ?? res.statusText}`);
    }
    const data = await res.json() as {
      choices: { message: { content: string }; finish_reason: string }[];
    };
    return {
      content: data.choices[0].message.content ?? '',
      finishReason: data.choices[0].finish_reason,
    };
  };
}

// ─── Anthropic ───────────────────────────────────────────────────────────────
//
// Anthropic supports direct browser calls via the
// `anthropic-dangerous-direct-browser-access: true` header — no proxy needed.
function makeAnthropic(apiKey: string, model: string): LLMProvider {
  return async (prompt, opts) => {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [
          ...(opts?.chatHistory?.map(m => ({ role: m.role, content: m.content })) ?? []),
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(`Anthropic ${res.status}: ${err?.error?.message ?? res.statusText}`);
    }
    const data = await res.json() as {
      content: { type: string; text?: string }[];
      stop_reason: string;
    };
    return {
      content: data.content.find(b => b.type === 'text')?.text ?? '',
      finishReason: data.stop_reason ?? 'stop',
    };
  };
}

// ─── Ollama ───────────────────────────────────────────────────────────────────
//
// Ollama runs locally so there are no CORS issues when calling it directly.
function makeOllama(model: string, baseUrl: string): LLMProvider {
  return async (prompt, opts) => {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          ...(opts?.chatHistory?.map(m => ({ role: m.role, content: m.content })) ?? []),
          { role: 'user', content: prompt },
        ],
        stream: false,
        options: { temperature: 0.1 },
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${res.statusText}`);
    const data = await res.json() as { message?: { content?: string } };
    return { content: data.message?.content ?? '', finishReason: 'stop' };
  };
}
