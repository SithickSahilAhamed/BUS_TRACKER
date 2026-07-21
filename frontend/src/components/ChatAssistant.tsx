/**
 * Floating AI Chat Assistant widget (PROJECT_SPEC.md section 6). One
 * component reused for the Student, Driver, and Admin assistants — the
 * persona and data grounding are entirely server-side (functions/src/index.ts)
 * based on the caller's role; this component just sends whatever
 * role-specific context summary the host page builds for it.
 *
 * `hideTrigger` lets a mobile page (bottom-nav "AI" tab) open this panel
 * itself via the exposed ref, instead of the built-in bottom-right FAB —
 * see MobileBottomNav. Desktop callers keep passing no ref/hideTrigger and
 * get the exact same self-contained floating widget as before.
 */

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import IconBot from '~icons/material-symbols/smart-toy-outline';
import IconClose from '~icons/material-symbols/close';
import IconSend from '~icons/material-symbols/send';
import { askAssistant } from '../services/chat';

interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

interface ChatAssistantProps {
  title: string;
  examplePrompt: string;
  buildContext: () => Record<string, unknown>;
  hideTrigger?: boolean;
}

export interface ChatAssistantHandle {
  open: () => void;
  close: () => void;
}

export const ChatAssistant = forwardRef<ChatAssistantHandle, ChatAssistantProps>(
  ({ title, examplePrompt, buildContext, hideTrigger }, ref) => {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const bodyRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({ open: () => setOpen(true), close: () => setOpen(false) }));

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
      if (hideTrigger) return null;
      return (
        <button
          className="fixed bottom-lg right-lg z-[100] w-14 h-14 bg-secondary text-on-secondary rounded-full shadow-lg flex items-center justify-center hover:scale-110 active:scale-90 transition-transform"
          onClick={() => setOpen(true)}
          aria-label={`Open ${title}`}
        >
          <IconBot className="w-7 h-7" />
        </button>
      );
    }

    return (
      <div
        className={`fixed z-[100] bg-surface-container-lowest border border-outline-variant shadow-overlay rounded-2xl flex flex-col
          ${hideTrigger
            ? 'inset-x-0 bottom-0 h-[70vh] rounded-b-none'
            : 'bottom-lg right-lg w-80 h-[26rem]'}`}
      >
        <div className="flex items-center gap-sm p-md border-b border-outline-variant shrink-0">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-on-secondary shrink-0">
            <IconBot className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-label-md text-label-md font-bold text-primary truncate">{title}</p>
            <p className="text-[10px] text-green-600 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-600 rounded-full animate-pulse" /> SYSTEM ONLINE
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-high"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-md flex flex-col gap-sm" ref={bodyRef}>
          {messages.length === 0 && (
            <p className="text-body-md text-on-surface-variant">Ask me something — e.g. "{examplePrompt}"</p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === 'user'
                  ? 'self-end max-w-[85%] bg-primary text-on-primary p-sm rounded-xl rounded-br-none text-body-md'
                  : 'self-start max-w-[85%] bg-surface-container p-sm rounded-xl rounded-tl-none text-body-md text-on-surface'
              }
            >
              {m.text}
            </div>
          ))}
          {sending && (
            <div className="self-start bg-surface-container p-sm rounded-xl rounded-tl-none text-body-md text-on-surface-variant">
              …
            </div>
          )}
        </div>

        {error && <p className="px-md pb-xs text-label-md text-error">{error}</p>}

        <form className="flex items-center gap-sm p-md border-t border-outline-variant shrink-0" onSubmit={handleSend}>
          <input
            className="flex-1 bg-surface-container-low border border-outline-variant rounded-full px-md py-sm text-body-md focus:outline-none focus:border-primary"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={examplePrompt}
            disabled={sending}
          />
          <button
            type="submit"
            className="w-9 h-9 shrink-0 flex items-center justify-center bg-primary text-on-primary rounded-full disabled:opacity-50"
            disabled={!input.trim() || sending}
            aria-label="Send"
          >
            <IconSend className="w-4 h-4" />
          </button>
        </form>
      </div>
    );
  }
);
ChatAssistant.displayName = 'ChatAssistant';
