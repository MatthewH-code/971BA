import { useEffect, useState } from "react";
import { api } from "../api";
import { fmtDateTime } from "../utils";
import FlightLogModal from "../FlightLogModal";
import AlertModal from "../AlertModal";
import type { Reservation } from "../types";

const FILTERS = ["All", "Upcoming", "Past"] as const;

type Filter = (typeof FILTERS)[number];

const INVITE_STATUS: Record<string, { label: string; cls: string }> = {
  sent: { label: "Invite sent", cls: "logged-badge" },
  pending: { label: "Sending…", cls: "muted small" },
  failed: { label: "Invite failed", cls: "badge-failed" },
  not_configured: { label: "No SMTP", cls: "muted small" },
  skipped: { label: "—", cls: "muted small" },
};

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [filter, setFilter] = useState<Filter>("All");
  const [editing, setEditing] = useState<Reservation | null>(null);
  const [error, setError] = useState("");
  const [inspectionWarning, setInspectionWarning] = useState<{
    kind: "warn" | "danger";
    text: string;
  } | null>(null);

  async function load() {
    try {
      setReservations(await api<Reservation[]>("/api/reservations"));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const now = new Date();
  const rows = reservations
    .filter((r) => {
      if (filter === "Upcoming") return new Date(r.end_time) > now;
      if (filter === "Past") return new Date(r.end_time) <= now;
      return true;
    })
    .sort((a, b) => a.start_time.localeCompare(b.start_time));

  async function remove(r: Reservation) {
    if (!window.confirm(`Cancel "${r.title}"?`)) return;
    try {
      await api(`/api/reservations/${r.id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function openEditor(r: Reservation) {
    setEditing(r);
    setError("");
  }

  return (
    <div>
      <div className="page-head">
        <h2>Reservations</h2>
        <p className="muted">
          Select a reservation and log flight hours and fuel used after the flight.
        </p>
      </div>

      <div className="segmented">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={filter === f ? "active" : ""}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}

      {rows.length === 0 ? (
        <p className="muted">
          No reservations{filter === "All" ? "" : ` ${filter.toLowerCase()}`}.
        </p>
      ) : (
        <table className="res-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Reserved by</th>
              <th>Start</th>
              <th>End</th>
              <th>Bill to</th>
              <th className="num">Hours</th>
              <th className="num">Fuel (gal)</th>
              <th>Invite</th>
              <th>Flight data</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="strong">{r.title}</td>
                <td>{r.person}</td>
                <td>{fmtDateTime(r.start_time)}</td>
                <td>{fmtDateTime(r.end_time)}</td>
                <td>{r.bill_to || "—"}</td>
                <td className="num">
                  {r.hobbs_start != null && r.hobbs_end != null
                    ? Math.round((r.hobbs_end - r.hobbs_start) * 100) / 100
                    : r.flight_hours != null
                      ? r.flight_hours
                      : "—"}
                </td>
                <td className="num">{r.fuel_used != null ? r.fuel_used : "—"}</td>
                <td>
                  {r.invite_status && INVITE_STATUS[r.invite_status] ? (
                    <span className={INVITE_STATUS[r.invite_status].cls}>
                      {INVITE_STATUS[r.invite_status].label}
                    </span>
                  ) : (
                    <span className="muted small">—</span>
                  )}
                </td>
                <td>
                  {r.hobbs_start != null && r.hobbs_end != null && r.fuel_used != null ? (
                    <span className="logged-badge">Logged</span>
                  ) : (
                    <span className="muted small">Not logged</span>
                  )}
                </td>
                <td className="row-actions">
                  <button className="ghost small" onClick={() => openEditor(r)}>
                    Log flight
                  </button>
                  <button className="ghost small danger" onClick={() => remove(r)}>
                    Cancel
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && (
        <FlightLogModal
          reservation={editing}
          onClose={() => setEditing(null)}
          onSaved={load}
          onInspectionWarning={setInspectionWarning}
        />
      )}
      {inspectionWarning && (
        <AlertModal
          kind={inspectionWarning.kind}
          text={inspectionWarning.text}
          onClose={() => setInspectionWarning(null)}
        />
      )}
    </div>
  );
}
