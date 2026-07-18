/**
 * Floating AI Chat Assistant widget (PROJECT_SPEC.md section 6). One
 * component reused for the Student, Driver, and Admin assistants — the
 * persona and data grounding are entirely server-side (functions/src/index.ts)
 * based on the caller's role; this component just sends whatever
 * role-specific context summary the host page builds for it.
 */

import React, { useEffect, useRef, useState } from 'react';
import { askAssistant } from '../services/chat';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface ChatAssistantProps {
  title: string;
  examplePrompt: string;
  buildContext: () => Record<string, unknown>;
}

export const ChatAssistant: React.FC<ChatAssistantProps> = ({ title, examplePrompt, buildContext }) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setMessages((m) => [...m, { role: 'user', text }]);
    setInput('');
    setSending(true);
    setError(null);
    try {
      const reply = await askAssistant(text, buildContext());
      setMessages((m) => [...m, { role: 'assistant', text: reply }]);
    } catch (err: any) {
      setError(err?.message ?? 'The assistant is unavailable right now — try again shortly.');
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button className="chat-fab" onClick={() => setOpen(true)} aria-label={`Open ${title}`}>
        🤖
      </button>
    );
  }

  return (
    <div className="chat-widget">
      <div className="chat-widget-header">
        <span>🤖 {title}</span>
        <button className="chat-widget-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
      </div>

      <div className="chat-widget-body" ref={bodyRef}>
        {messages.length === 0 && (
          <p className="chat-empty">Ask me something — e.g. "{examplePrompt}"</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-bubble chat-bubble-${m.role}`}>{m.text}</div>
        ))}
        {sending && <div className="chat-bubble chat-bubble-assistant chat-bubble-typing">…</div>}
      </div>

      {error && <p className="chat-error">{error}</p>}

      <form className="chat-widget-input" onSubmit={handleSend}>
        <input
          className="form-control"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={examplePrompt}
          disabled={sending}
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={!input.trim() || sending}>
          Send
        </button>
      </form>
    </div>
  );
};
