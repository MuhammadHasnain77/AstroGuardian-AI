import { Send } from "lucide-react";
import { useId, useState } from "react";
import { api } from "../api.js";
import { Button } from "./ui.jsx";

/** Ground flight surgeon writes advice onto an alert; the crew sees it on their Today screen. */
export default function AdviceComposer({ alert, onSaved }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const id = useId();

  async function send(e) {
    e.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.noteAlert(alert.id, note.trim());
      setNote("");
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send} className="space-y-2">
      <label htmlFor={id} className="text-sm text-ink-2">
        {alert.ground_note ? "Replace advice to the crew" : "Advice to the crew"}
      </label>
      <div className="flex gap-2">
        <textarea id={id} rows={2} value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Rest 2 h, recheck SpO₂ hourly, prepare O₂ mask."
                  className="min-h-11 min-w-0 flex-1 resize-y rounded-lg bg-surface-2 px-3 py-2 text-ink-1 ring-1 ring-line placeholder:text-ink-3 focus:outline-none focus:ring-2 focus:ring-series" />
        <Button type="submit" variant="primary" icon={Send} loading={busy} disabled={!note.trim()} className="self-start">
          Send
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-status-text-critical">{error}</p>}
    </form>
  );
}
