import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import type { Inspection, Reservation } from "./types";

interface Props {
  reservation: Reservation;
  onClose: () => void;
  onSaved: () => void;
  onDelete?: () => void;
  onInspectionWarning?: (warning: { kind: "warn" | "danger"; text: string }) => void;
}

interface FormState {
  billTo: string;
  hobbsStart: string;
  hobbsEnd: string;
  fuelUsed: string;
}

export default function FlightLogModal({ reservation, onClose, onSaved, onDelete, onInspectionWarning }: Props) {
  const [form, setForm] = useState<FormState>({
    billTo: reservation.bill_to || reservation.person || "",
    hobbsStart: reservation.hobbs_start != null ? String(reservation.hobbs_start) : "",
    hobbsEnd: reservation.hobbs_end != null ? String(reservation.hobbs_end) : "",
    fuelUsed: reservation.fuel_used != null ? String(reservation.fuel_used) : "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [prevUnlogged, setPrevUnlogged] = useState(false);

  useEffect(() => {
    if (reservation.hobbs_start != null) return;
    let cancelled = false;
    api<Reservation[]>("/api/reservations")
      .then((rows) => {
        if (cancelled) return;
        const sorted = rows
          .filter((r) => r.id !== reservation.id)
          .sort((a, b) => a.start_time.localeCompare(b.start_time));
        const prev = sorted
          .filter((r) => r.start_time < reservation.start_time)
          .pop();
        if (prev) {
          const prevLogged = prev.hobbs_end != null;
          setPrevUnlogged(!prevLogged);
          if (prevLogged && prev.hobbs_end != null) {
            setForm((f) =>
              f.hobbsStart === "" ? { ...f, hobbsStart: String(prev.hobbs_end) } : f
            );
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [reservation.id, reservation.hobbs_start]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasStart = form.hobbsStart.trim() !== "";
  const hasEnd = form.hobbsEnd.trim() !== "";
  const hs = Number(form.hobbsStart);
  const he = Number(form.hobbsEnd);
  const flightTime =
    hasStart && hasEnd && !Number.isNaN(hs) && !Number.isNaN(he) && he >= hs
      ? Math.round((he - hs) * 100) / 100
      : null;

  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body: { billTo: string; hobbsStart?: number; hobbsEnd?: number; fuelUsed?: number } = {
        billTo: form.billTo,
      };
      if (hasStart || hasEnd) {
        if (hasStart && (Number.isNaN(hs) || hs < 0)) {
          setError("Hobbs start must be a valid number");
          setBusy(false);
          return;
        }
        if (hasEnd && (Number.isNaN(he) || he < 0)) {
          setError("Hobbs end must be a valid number");
          setBusy(false);
          return;
        }
        if (hasStart && hasEnd && he < hs) {
          setError("Hobbs end must be >= start");
          setBusy(false);
          return;
        }
        if (hasStart) body.hobbsStart = hs;
        if (hasEnd) body.hobbsEnd = he;
      }
      if (form.fuelUsed !== "") {
        const f = Number(form.fuelUsed);
        if (Number.isNaN(f) || f < 0) {
          setError("Fuel used must be a valid number");
          setBusy(false);
          return;
        }
        body.fuelUsed = f;
      }
      await api(`/api/reservations/${reservation.id}`, { method: "PATCH", body });
      let warning: { kind: "warn" | "danger"; text: string } | null = null;
      if (body.hobbsEnd !== undefined) {
        try {
          const insp = await api<Inspection>("/api/inspection");
          if (insp.remainingHours != null && insp.remainingHours <= 10) {
            warning =
              insp.remainingHours < 0
                ? {
                    kind: "danger",
                    text: `The 100-hour inspection has been exceeded by ${Math.round(-insp.remainingHours * 10) / 10} hrs. No reservations can be made except for maintenance.`,
                  }
                : {
                    kind: "warn",
                    text: `Within ${Math.round(insp.remainingHours * 10) / 10} hrs of the 100-hour inspection.`,
                  };
          }
        } catch {
          /* ignore */
        }
      }
      if (warning) onInspectionWarning?.(warning);
      onSaved();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Cancel "${reservation.title}"?`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/reservations/${reservation.id}`, { method: "DELETE" });
      onClose();
      onSaved();
      onDelete?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <form className="modal" onSubmit={save} onMouseDown={(e) => e.stopPropagation()}>
        <h3>Log flight data</h3>
        <p className="muted">
          <span className="strong">{reservation.title}</span> — enter details after the flight.
        </p>
        <div className="field">
          <label>Bill to</label>
          <input
            value={form.billTo}
            onChange={(e) => setForm({ ...form, billTo: e.target.value })}
            placeholder="Who to bill"
          />
          <span className="muted small">Autofilled from the reserver; change if needed.</span>
        </div>
        <div className="field">
          <label>
            Hobbs start (hrs)
            {prevUnlogged && <span className="field-warn">previous flight not logged</span>}
          </label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={form.hobbsStart}
            onChange={(e) => setForm({ ...form, hobbsStart: e.target.value })}
            placeholder="e.g. 1250.5"
          />
        </div>
        <div className="field">
          <label>Hobbs end (hrs)</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={form.hobbsEnd}
            onChange={(e) => setForm({ ...form, hobbsEnd: e.target.value })}
            placeholder="e.g. 1253.0"
          />
          <span className="muted small">
            Read the Hobbs meter before and after the flight; flight time is computed
            automatically{flightTime != null ? ` (${flightTime} hrs)` : ""}.
          </span>
        </div>
        <div className="field">
          <label>Fuel used (gal)</label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={form.fuelUsed}
            onChange={(e) => setForm({ ...form, fuelUsed: e.target.value })}
            placeholder="e.g. 120"
          />
        </div>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          {onDelete && (
            <button
              type="button"
              className="ghost small danger modal-delete"
              onClick={remove}
              disabled={busy}
            >
              Cancel reservation
            </button>
          )}
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
