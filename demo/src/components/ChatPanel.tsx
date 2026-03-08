import { useState, useRef, useCallback, useEffect } from 'react';
import {
  searchReverseIndex,
  type ReverseIndex,
  type PageIndexResult,
  type PageData,
} from 'react-native-pageindex';
import type { LLMProvider } from 'react-native-pageindex';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: { title: string; nodeId: string; pages: string; score: number }[];
  isLoading?: boolean;
}

interface Props {
  reverseIndex: ReverseIndex;
  result: PageIndexResult;
  pages: PageData[];
  llm: LLMProvider | null;
}

const MAX_CONTEXT_NODES = 5;
const MAX_HISTORY_MESSAGES = 10;

export default function ChatPanel({ reverseIndex, result, pages, llm }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const question = input.trim();
    if (!question || isLoading) return;

    setInput('');
    setIsLoading(true);

    // Append user message
    setMessages(prev => [...prev, { role: 'user', content: question }]);

    // Append loading placeholder
    setMessages(prev => [
      ...prev,
      { role: 'assistant', content: '', isLoading: true },
    ]);

    try {
      // 1. Search reverse index for relevant nodes
      const hits = searchReverseIndex(reverseIndex, question, MAX_CONTEXT_NODES);

      // 2. Build context from matching nodes (use page text if available)
      const citations: ChatMessage['citations'] = [];
      const contextParts: string[] = [];

      for (const hit of hits) {
        const pageRange =
          hit.startIndex != null && hit.endIndex != null
            ? `${hit.startIndex}–${hit.endIndex}`
            : '?';

        // Try to get actual page text for richer context
        const pageTexts: string[] = [];
        if (hit.startIndex != null && hit.endIndex != null) {
          for (let i = hit.startIndex - 1; i < hit.endIndex && i < pages.length; i++) {
            if (pages[i]?.text) pageTexts.push(pages[i].text);
          }
        }

        const bodyText =
          pageTexts.length > 0
            ? pageTexts.join('\n').slice(0, 1200)
            : hit.summary ?? '(no text available)';

        contextParts.push(
          `[${hit.nodeTitle} | pages ${pageRange} | score: ${hit.totalScore.toFixed(2)}]\n${bodyText}`
        );

        citations.push({
          title: hit.nodeTitle,
          nodeId: hit.nodeId ?? '',
          pages: pageRange,
          score: Math.round(hit.totalScore * 100),
        });
      }

      // 3. Build chat history for multi-turn (last N messages, excluding loading)
      const historyMessages = messages
        .filter(m => !m.isLoading)
        .slice(-MAX_HISTORY_MESSAGES)
        .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

      // 4. Compose system prompt
      const docName = result.doc_name ?? 'the document';
      const docDesc = (result as any).doc_description;
      const systemContent =
        `You are a helpful assistant answering questions about "${docName}".` +
        (docDesc ? ` Document overview: ${docDesc}` : '') +
        `\n\nUse the provided sections as your primary source. Always cite which section your answer comes from (e.g., "According to [Section Name]…"). If the answer is not in the provided sections, say so clearly rather than guessing.`;

      const context =
        contextParts.length > 0
          ? `Relevant sections:\n\n${contextParts.join('\n\n---\n\n')}`
          : 'No closely matching sections found. Answer based on general knowledge of the document structure if possible.';

      const userTurn = `${context}\n\nQuestion: ${question}`;

      // 5. Call LLM
      let answer = '(No LLM provider configured — please set up an API key in the sidebar and rebuild the index.)';

      if (llm) {
        const response = await llm(userTurn, {
          chatHistory: [
            { role: 'system' as any, content: systemContent },
            ...historyMessages,
          ],
        });
        answer = response.content;
      }

      // 6. Replace loading placeholder with real answer
      setMessages(prev => [
        ...prev.filter(m => !m.isLoading),
        { role: 'assistant', content: answer, citations },
      ]);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setMessages(prev => [
        ...prev.filter(m => !m.isLoading),
        { role: 'assistant', content: `⚠️ Error: ${errMsg}`, citations: [] },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [input, isLoading, messages, reverseIndex, result, pages, llm]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => setMessages([]);

  const nodeCount = reverseIndex.stats.totalNodes;
  const termCount = reverseIndex.stats.totalTerms;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '60vh', minHeight: 420 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 12,
      }}>
        <p className="search-hint" style={{ margin: 0 }}>
          Chat with <strong>{result.doc_name}</strong> —
          index covers <strong>{termCount.toLocaleString()} terms</strong> across{' '}
          <strong>{nodeCount} nodes</strong>.
          {!llm && (
            <span style={{ color: 'var(--orange)', marginLeft: 6 }}>
              ⚠️ No LLM configured — rebuild with an API key for full answers.
            </span>
          )}
        </p>
        {messages.length > 0 && (
          <button className="btn btn-outline btn-sm" onClick={handleClear}>
            Clear
          </button>
        )}
      </div>

      {/* Message list */}
      <div style={{
        flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column',
        gap: 12, padding: '4px 2px', marginBottom: 12,
      }}>
        {messages.length === 0 && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 10,
            color: 'var(--text-muted)', padding: '40px 20px', textAlign: 'center',
          }}>
            <span style={{ fontSize: 32 }}>💬</span>
            <strong style={{ fontSize: 15, color: 'var(--text)' }}>
              Ask anything about this document
            </strong>
            <span style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 360 }}>
              PageIndex searches the document tree to find the most relevant sections,
              then uses the LLM to generate a grounded, cited answer.
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, justifyContent: 'center' }}>
              {suggestedQuestions(result.doc_name).map(q => (
                <button
                  key={q}
                  className="btn btn-outline btn-sm"
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={inputRef}
          className="search-input"
          style={{
            flex: 1, resize: 'none', minHeight: 44, maxHeight: 120,
            padding: '10px 14px', lineHeight: 1.5, fontFamily: 'inherit',
          }}
          rows={1}
          placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <button
          className="btn btn-primary"
          style={{ height: 44, paddingInline: 18, flexShrink: 0 }}
          onClick={handleSend}
          disabled={!input.trim() || isLoading}
        >
          {isLoading ? '…' : 'Send ↑'}
        </button>
      </div>
    </div>
  );
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const [citationsOpen, setCitationsOpen] = useState(false);
  const isUser = message.role === 'user';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
      gap: 4,
    }}>
      <div style={{
        maxWidth: '85%',
        background: isUser ? 'var(--green)' : 'var(--card)',
        color: isUser ? '#fff' : 'var(--text)',
        border: isUser ? 'none' : '1px solid var(--border)',
        borderRadius: isUser
          ? 'var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg)'
          : 'var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-sm)',
        padding: '10px 14px',
        fontSize: 14,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
      }}>
        {message.isLoading ? <TypingIndicator /> : message.content}
      </div>

      {/* Citations */}
      {!isUser && !message.isLoading && message.citations && message.citations.length > 0 && (
        <div style={{ maxWidth: '85%' }}>
          <button
            className="btn btn-outline btn-sm"
            style={{ fontSize: 11, padding: '3px 8px' }}
            onClick={() => setCitationsOpen(v => !v)}
          >
            📄 {message.citations.length} source{message.citations.length > 1 ? 's' : ''}{' '}
            {citationsOpen ? '▲' : '▼'}
          </button>

          {citationsOpen && (
            <div style={{
              marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              {message.citations.map((c, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'var(--card)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', padding: '5px 10px',
                  fontSize: 12,
                }}>
                  <span style={{ fontWeight: 600, color: 'var(--text)', flex: 1 }}>
                    {c.title}
                  </span>
                  {c.nodeId && <span className="badge badge-blue">{c.nodeId}</span>}
                  <span className="badge badge-orange">p.{c.pages}</span>
                  <span className="badge badge-green">{c.score}%</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', padding: '2px 0' }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--text-subtle)',
            animation: `chatBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
            display: 'inline-block',
          }}
        />
      ))}
    </span>
  );
}

/** Generic suggested questions based on document name */
function suggestedQuestions(docName: string): string[] {
  const name = (docName ?? '').toLowerCase();
  if (name.includes('farmer') || name.includes('crop'))
    return ['What crops are grown in clay soil?', 'Which states have high risk?', 'List crops suited for sandy soil'];
  if (name.includes('annual') || name.includes('report') || name.includes('earnings'))
    return ['What was the revenue?', 'What are the key risks?', 'Summarise the highlights'];
  return ['What is this document about?', 'List the main topics', 'What are the key findings?'];
}
