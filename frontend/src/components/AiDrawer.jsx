import { Loader2, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Button, Drawer } from "./ui.jsx";

/**
 * AI assistant as a side sheet. `question` (from a problem's "Ask AI") is sent
 * as soon as the drawer opens; otherwise it offers a one-tap explanation.
 */
export default function AiDrawer({ open, onClose, astronautId, name, llm, question }) {
  const storeKey = `ag-chat-${astronautId}`;
  const [messages, setMessages] = useState(() => loadChat(storeKey));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const sentFor = useRef(null);

  useEffect(() => {
    saveChat(storeKey, messages);
  }, [storeKey, messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy]);

  // Auto-ask the problem-specific question once per opening.
  useEffect(() => {
    if (open && question && sentFor.current !== question) {
      sentFor.current = question;
      ask(question);
    }
    if (!open) sentFor.current = null;
  }, [open, question]); // eslint-disable-line react-hooks/exhaustive-deps

  async function ask(q) {
    const text = q.trim();
    if (!text || busy) return;
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: text }]);
    setBusy(true);
    try {
      const r = await api.chat(astronautId, text, history);
      setMessages((m) => [...m, { role: "assistant", content: r.text, source: r.source }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: `Couldn't reach the assistant: ${err.message}`, source: "error" }]);
    } finally {
      setBusy(false);
    }
  }

  async function explain() {
    setMessages((m) => [...m, { role: "user", content: "Explain my status." }]);
    setBusy(true);
    try {
      const r = await api.explain(astronautId);
      setMessages((m) => [...m, { role: "assistant", content: r.text, source: r.source }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: `Couldn't reach the assistant: ${err.message}`, source: "error" }]);
    } finally {
      setBusy(false);
    }
  }

  const mode = llm?.enabled ? `${llm.model}${llm.demo_mode ? " via Groq (demo)" : " onboard"}` : "LLM offline: template answers";

  return (
    <Drawer open={open} onClose={onClose} title="AI health assistant" subtitle={`${name} · ${mode}`} width="max-w-lg">
      <div className="flex min-h-full flex-col">
        <p className="text-sm text-ink-3">
          Explains the result in plain language. It can't change the alert level. Ask the CMO for medical decisions.
        </p>

        <div className="mt-4 flex-1 space-y-3" aria-live="polite">
          {messages.length === 0 && !busy && (
            <Button variant="primary" icon={Sparkles} onClick={explain}>Explain my status</Button>
          )}
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "ml-10 rounded-lg bg-series/20 px-3 py-2" : "mr-6"}>
              <p className="whitespace-pre-line leading-relaxed text-ink-1">{m.content}</p>
              {m.role === "assistant" && m.source === "fallback" && (
                <p className="mt-1 text-xs text-ink-3">Template answer: the language model wasn't available.</p>
              )}
            </div>
          ))}
          {busy && (
            <p className="flex items-center gap-2 text-sm text-ink-3"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</p>
          )}
          <div ref={endRef} />
        </div>

        <form className="sticky bottom-0 mt-4 flex gap-2 bg-surface-0 pt-3"
              onSubmit={(e) => { e.preventDefault(); ask(draft); setDraft(""); }}>
          <label htmlFor="ai-q" className="sr-only">Ask the assistant</label>
          <input id="ai-q" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000}
                 placeholder="Ask a follow-up question"
                 className="h-11 min-w-0 flex-1 rounded-lg bg-surface-2 px-3 text-ink-1 ring-1 ring-line placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-series" />
          <Button type="submit" variant="primary" icon={Send} disabled={busy || !draft.trim()} aria-label="Send" />
        </form>
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} className="mt-2 self-start text-xs text-ink-3 hover:text-ink-1">
            Clear conversation
          </button>
        )}
      </div>
    </Drawer>
  );
}

// Conversation is kept per astronaut in this browser only (a per-viewer convenience).
function loadChat(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.slice(-20) : [];
  } catch {
    return [];
  }
}

function saveChat(key, messages) {
  try {
    localStorage.setItem(key, JSON.stringify(messages.slice(-20)));
  } catch { /* storage unavailable: chat just isn't remembered */ }
}
