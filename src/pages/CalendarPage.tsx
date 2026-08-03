import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { DateClickArg } from "@fullcalendar/interaction";
import type { EventInput, DateSelectArg, EventClickArg, EventMountArg, DatesSetArg } from "@fullcalendar/core";
import { api } from "../api";
import { toLocalIso, toDateTimeLocal, fmtTime, fmtDate, textOverflows, measureTextWidth } from "../utils";
import FlightLogModal from "../FlightLogModal";
import AlertModal from "../AlertModal";
import type { Pilot, Reservation, Inspection } from "../types";

const EVENT_COLORS = [
  "#2563eb",
  "#0d9488",
  "#9333ea",
  "#ea580c",
  "#db2777",
  "#65a30d",
  "#0891b2",
  "#7c3aed",
];

interface Booking {
  start: Date;
  end: Date;
}

export default function CalendarPage() {
  const calendarRef = useRef<FullCalendar | null>(null);
  const [events, setEvents] = useState<EventInput[]>([]);
  const [initialView] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 768 ? "timeGridDay" : "timeGridWeek"
  );
  const [isMobile] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < 768
  );
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [title, setTitle] = useState("");
  const [person, setPerson] = useState("");
  const [pilots, setPilots] = useState<Pilot[]>([]);
  const [invitees, setInvitees] = useState<string[]>([]); // selected pilot emails
  const [extraEmails, setExtraEmails] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState({ title: false, person: false });
  const [maintenance, setMaintenance] = useState(false);
  const [selected, setSelected] = useState<Reservation | null>(null); // reservation for log modal
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [inspectionWarning, setInspectionWarning] = useState<{
    kind: "warn" | "danger";
    text: string;
  } | null>(null);

  const loadInspection = useCallback(async () => {
    try {
      setInspection(await api<Inspection>("/api/inspection"));
    } catch {
      /* ignore */
    }
  }, []);

  const loadRange = useCallback(async (start: string, end: string) => {
    setLoading(true);
    try {
      const rows = await api<Reservation[]>(
        `/api/reservations?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      );
      setEvents(
        rows.map((r, i) => ({
          id: String(r.id),
          title: `${r.title} · ${r.person}`,
          start: r.start_time,
          end: r.end_time,
          color: r.person === "Maintenance" ? "#dc2626" : EVENT_COLORS[i % EVENT_COLORS.length],
        }))
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api<{ pilots: Pilot[] }>("/api/settings")
      .then((d) => setPilots(d.pilots || []))
      .catch(() => {});
    const cal = calendarRef.current?.getApi();
    const view = cal ? cal.view : null;
    if (view) {
      loadRange(toLocalIso(view.currentStart), toLocalIso(view.currentEnd));
    }
  }, [loadRange]);

  useEffect(() => {
    loadInspection();
    const onUpdate = () => loadInspection();
    window.addEventListener("inspection-updated", onUpdate);
    return () => window.removeEventListener("inspection-updated", onUpdate);
  }, [loadInspection]);

  function handleSelect(info: DateSelectArg) {
    let start: Date = info.start;
    let end: Date = info.end;
    if (info.allDay) {
      start = new Date(info.start.getFullYear(), info.start.getMonth(), info.start.getDate(), 9, 0);
      end = new Date(info.start.getFullYear(), info.start.getMonth(), info.start.getDate(), 10, 0);
    }
    openBooking(start, end);
  }

  function handleDateClick(info: DateClickArg) {
    let start: Date = info.date;
    let end = new Date(start.getTime() + 60 * 60 * 1000);
    if (info.allDay) {
      start = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 9, 0);
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 10, 0);
    }
    openBooking(start, end);
  }

  function openBooking(start: Date, end: Date) {
    setInvitees(pilots.map((p) => p.email));
    setMaintenance(false);
    setBooking({ start, end });
    setError("");
  }

  function openBookModal() {
    const start = new Date();
    start.setMinutes(start.getMinutes() < 30 ? 0 : 30, 0, 0);
    openBooking(start, new Date(start.getTime() + 60 * 60 * 1000));
  }

  function toggleInvitee(email: string) {
    setInvitees((cur) =>
      cur.includes(email) ? cur.filter((e) => e !== email) : [...cur, email]
    );
  }

  function toggleAllInvitees() {
    const allChecked = pilots.length > 0 && pilots.every((p) => invitees.includes(p.email));
    setInvitees(allChecked ? [] : pilots.map((p) => p.email));
  }

  function selectPerson(emailOrName: string) {
    const pilot = pilots.find(
      (p) => p.email === emailOrName || p.name === emailOrName
    );
    setPerson(pilot ? pilot.name : emailOrName);
    setInvalid((i) => ({ ...i, person: false }));
    if (pilot && !invitees.includes(pilot.email)) {
      setInvitees((cur) => [...cur, pilot.email]);
    }
  }

  function toggleMaintenance(checked: boolean) {
    setMaintenance(checked);
    setInvalid((i) => ({ ...i, person: false }));
    if (checked) {
      setPerson("Maintenance");
    } else {
      setPerson("");
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!booking) return;
    const bad = { title: !title.trim(), person: !maintenance && !person.trim() };
    setInvalid(bad);
    if (bad.title || bad.person) return;
    const remaining = inspection?.remainingHours ?? null;
    if (remaining != null && remaining < 0 && !maintenance) {
      setError(
        `The 100-hour inspection is overdue by ${Math.round(-remaining * 10) / 10} hrs; only maintenance bookings can be made.`
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      const pilotEmails = new Set(invitees);
      const extras = extraEmails
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const emailList = [...pilotEmails, ...extras];
      const inviteeObjs = emailList.map((email) => {
        const pilot = pilots.find((p) => p.email === email);
        return { name: pilot ? pilot.name : email, email };
      });
      await api("/api/reservations", {
        method: "POST",
        body: {
          title,
          person: maintenance ? "Maintenance" : person,
          start: toLocalIso(booking.start),
          end: toLocalIso(booking.end),
          invitees: inviteeObjs,
        },
      });
      setBooking(null);
      setTitle("");
      setPerson("");
      setInvitees([]);
      setExtraEmails("");
      setMaintenance(false);
      const cal = calendarRef.current?.getApi();
      if (cal) {
        loadRange(toLocalIso(cal.view.currentStart), toLocalIso(cal.view.currentEnd));
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function openLogModal(info: EventClickArg) {
    const id = Number(info.event.id);
    if (!Number.isFinite(id)) return;
    try {
      setError("");
      setSelected(await api<Reservation>(`/api/reservations/${id}`));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function eventDidMount(info: EventMountArg) {
    const el = info.el;
    function enter() {
      const title = el.querySelector<HTMLElement>(".fc-event-title");
      if (!title || !textOverflows(title)) return;
      const naturalHeight = el.offsetHeight;
      const naturalWidth = el.offsetWidth;
      el.classList.add("fc-expanded");
      el.style.minHeight = naturalHeight + "px";
      // Widen the box so the full title fits on one line (it wraps if wider than the cap).
      const time = el.querySelector<HTMLElement>(".fc-event-time");
      const timeW = time ? time.getBoundingClientRect().width : 0;
      const titleW = measureTextWidth(title);
      const padding = 14;
      const viewW = document.documentElement.clientWidth;
      const maxW = Math.min(520, viewW - 24);
      const w = Math.min(Math.max(timeW, titleW) + padding, maxW, viewW - 8);
      const rect = el.getBoundingClientRect();
      if (rect.right + (w - naturalWidth) > viewW - 8) {
        el.style.right = "0px";
        el.style.left = "auto";
      }
      el.style.width = w + "px";
      const col = el.closest<HTMLElement>(".fc-timegrid-col-events");
      if (col) col.style.zIndex = "999";
    }
    function leave() {
      el.classList.remove("fc-expanded");
      el.style.minHeight = "";
      el.style.width = "";
      el.style.right = "";
      el.style.left = "";
      const col = el.closest<HTMLElement>(".fc-timegrid-col-events");
      if (col) col.style.zIndex = "";
    }
    el.addEventListener("mouseenter", enter);
    el.addEventListener("mouseleave", leave);
  }

  function refreshRange() {
    const cal = calendarRef.current?.getApi();
    if (cal) {
      loadRange(toLocalIso(cal.view.currentStart), toLocalIso(cal.view.currentEnd));
    }
  }

  return (
    <div>
      <div className="page-head">
        <h2>Schedule</h2>
        <p className="muted">
          Reserved times appear on the calendar. Tap a time to book, or click and drag on the
          grid to block off a range.
        </p>
      </div>
      {loading && <p className="muted small">Loading…</p>}
      <div className="calendar-wrap">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView={initialView}
          height="auto"
          allDaySlot={false}
          nowIndicator
          selectable={!isMobile}
          selectOverlap={false}
          editable={false}
          eventOverlap={false}
          slotDuration="00:30:00"
          slotMinTime="06:00:00"
          slotMaxTime="22:00:00"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay",
          }}
          eventMinHeight={26}
          events={events}
          select={handleSelect}
          dateClick={handleDateClick}
          eventClick={openLogModal}
          eventDidMount={eventDidMount}
          datesSet={(info: DatesSetArg) =>
            loadRange(toLocalIso(info.start), toLocalIso(info.end))
          }
        />
      </div>
      <div className="book-bar">
        <button className="btn" onClick={openBookModal}>
          Book
        </button>
      </div>

      {booking && (
        <div className="modal-backdrop" onMouseDown={() => setBooking(null)}>
          <form className="modal" onSubmit={submit} noValidate onMouseDown={(e) => e.stopPropagation()}>
            <h3>New reservation</h3>
            <div className="field">
              <label>Start</label>
              <input
                type="datetime-local"
                value={toDateTimeLocal(booking.start)}
                onChange={(e) =>
                  setBooking((b) => (b ? { ...b, start: new Date(e.target.value) } : b))
                }
              />
            </div>
            <div className="field">
              <label>End</label>
              <input
                type="datetime-local"
                value={toDateTimeLocal(booking.end)}
                onChange={(e) => setBooking((b) => (b ? { ...b, end: new Date(e.target.value) } : b))}
              />
            </div>
            <div className="field">
              <label>Title</label>
              <input
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setInvalid((i) => ({ ...i, title: false }));
                }}
                placeholder="e.g. Flight to KFDK"
                autoFocus
                className={invalid.title ? "invalid" : ""}
              />
              {invalid.title && (
                <span className="field-error">Please enter a title</span>
              )}
            </div>
            <div className="field">
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={maintenance}
                  onChange={(e) => toggleMaintenance(e.target.checked)}
                />
                <span>Maintenance (no pilot)</span>
              </label>
              <span className="muted small">
                Block the plane for maintenance instead of a flight. Calendar invites can still be
                sent to whoever needs to know.
              </span>
            </div>
            <div className="field">
              <label>Who is reserving</label>
              {pilots.length > 0 ? (
                <select
                  value={person}
                  onChange={(e) => selectPerson(e.target.value)}
                  className={invalid.person ? "invalid" : ""}
                  disabled={maintenance}
                >
                  <option value="">Select a pilot…</option>
                  {pilots.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={person}
                  onChange={(e) => {
                    setPerson(e.target.value);
                    setInvalid((i) => ({ ...i, person: false }));
                  }}
                  placeholder="Your name"
                  className={invalid.person ? "invalid" : ""}
                  disabled={maintenance}
                />
              )}
              {invalid.person && (
                <span className="field-error">
                  {pilots.length > 0 ? "Please select a pilot" : "Please enter your name"}
                </span>
              )}
            </div>
            <div className="field">
              <label>
                Send calendar invite to
                {pilots.length > 0 && (
                  <button
                    type="button"
                    className="link-button small"
                    onClick={toggleAllInvitees}
                  >
                    {pilots.every((p) => invitees.includes(p.email))
                      ? "Uncheck all"
                      : "Check all"}
                  </button>
                )}
              </label>
              <div className="invitee-list">
                {pilots.map((p) => (
                  <label key={p.id} className="check-field">
                    <input
                      type="checkbox"
                      checked={invitees.includes(p.email)}
                      onChange={() => toggleInvitee(p.email)}
                    />
                    <span>{p.name}</span>
                    <span className="muted small">{p.email}</span>
                  </label>
                ))}
              </div>
              <input
                value={extraEmails}
                onChange={(e) => setExtraEmails(e.target.value)}
                placeholder="Extra emails, comma-separated (optional)"
              />
              <span className="muted small">
                Invites go out as email with a Google-Calendar-compatible .ics attachment.
              </span>
            </div>
            {error && <p className="error">{error}</p>}
            {inspection?.remainingHours != null && inspection.remainingHours < 10 && (
              <div className={inspection.remainingHours < 0 ? "alert alert-danger" : "alert alert-warn"}>
                {inspection.remainingHours < 0
                  ? `The 100-hour inspection is overdue by ${Math.round(-inspection.remainingHours * 10) / 10} hrs — only maintenance bookings can be made.`
                  : `Only ${Math.round(inspection.remainingHours * 10) / 10} hrs remain before the 100-hour inspection is due.`}
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setBooking(null)}>
                Cancel
              </button>
              <button className="primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Book"}
              </button>
            </div>
            <p className="muted small">{fmtDate(booking.start)} · {fmtTime(booking.start)} – {fmtTime(booking.end)}</p>
          </form>
        </div>
      )}

      {selected && (
        <FlightLogModal
          reservation={selected}
          onClose={() => setSelected(null)}
          onSaved={refreshRange}
          onDelete={refreshRange}
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
