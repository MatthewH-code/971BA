import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import type { Inspection } from "./types";

interface Props {
  onClose: () => void;
  onSaved?: () => void;
}

export default function InspectionModal({ onClose, onSaved }: Props) {
  const [date, setDate] = useState("");
  const [hobbs, setHobbs] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [inspection, setInspection] = useState<Inspection | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<Inspection>("/api/inspection")
      .then((d) => {
        if (cancelled) return;
        setInspection(d);
        setDate(d.date ? d.date.slice(0, 10) : "");
        setHobbs(d.hobbs != null ? String(d.hobbs) : "");
      })
      .catch((err) => setError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const h = hobbs.trim() === "" ? "" : Number(hobbs);
      if (h !== "" && (Number.isNaN(h) || (h as number) < 0)) {
        setError("Hobbs reading must be a valid number");
        setBusy(false);
        return;
      }
      await api("/api/inspection", {
        method: "PATCH",
        body: { date: date.trim(), hobbs: h },
      });
      onSaved?.();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={save} onMouseDown={(e) => e.stopPropagation()}>
        <h3>100-hour inspection</h3>
        <p className="muted">
          Record when and at what Hobbs reading the last 100-hour inspection was performed. The
          next inspection is due at {inspection && inspection.nextHobbs != null ? `${inspection.nextHobbs} hrs` : "100 hours after the reading above"}.
        </p>
        <div className="field">
          <label>Date performed</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label>Hobbs reading (hrs)</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={hobbs}
            onChange={(e) => setHobbs(e.target.value)}
            placeholder="e.g. 1250.0"
          />
        </div>
        {inspection && inspection.currentHobbs != null && (
          <p className="muted small">
            Current aircraft Hobbs: {inspection.currentHobbs} hrs.
            {inspection.remainingHours != null &&
              ` ${Math.round(inspection.remainingHours * 100) / 100} hrs remaining until the next inspection.`}
          </p>
        )}
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
