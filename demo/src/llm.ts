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
function makeOpenAI(apiKey: string, model: string): LLMProvider {
  return async (prompt, opts) => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
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
    const data = await res.json() as { choices: { message: { content: string }; finish_reason: string }[] };
    return { content: data.choices[0].message.content ?? '', finishReason: data.choices[0].finish_reason };
  };
}

// ─── Anthropic ───────────────────────────────────────────────────────────────
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
    const data = await res.json() as { content: { type: string; text?: string }[]; stop_reason: string };
    return {
      content: data.content.find(b => b.type === 'text')?.text ?? '',
      finishReason: data.stop_reason ?? 'stop',
    };
  };
}

// ─── Ollama ───────────────────────────────────────────────────────────────────
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
