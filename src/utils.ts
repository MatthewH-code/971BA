function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function toLocalIso(d: Date): string {
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes()) +
    ":" +
    pad(d.getSeconds())
  );
}

export function toDateTimeLocal(d: Date): string {
  return toLocalIso(d).slice(0, 16);
}

export function parseLocal(s: string | Date): Date {
  return new Date(s);
}

export function fmtDateTime(s: string | Date): string {
  const d = parseLocal(s);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtDate(s: string | Date): string {
  return parseLocal(s).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function fmtTime(s: string | Date): string {
  return parseLocal(s).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function monthRange(offset = 0): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
  return { start, end };
}

export function measureTextWidth(el: HTMLElement): number {
  const text = (el.textContent || "").trim();
  if (!text) return 0;
  const styles = window.getComputedStyle(el);
  const probe = document.createElement("span");
  probe.style.cssText =
    "visibility:hidden;position:absolute;left:-9999px;top:0;white-space:nowrap;pointer-events:none;";
  probe.style.fontFamily = styles.fontFamily;
  probe.style.fontSize = styles.fontSize;
  probe.style.fontWeight = styles.fontWeight;
  probe.style.fontStyle = styles.fontStyle;
  probe.style.letterSpacing = styles.letterSpacing;
  probe.textContent = text;
  document.body.appendChild(probe);
  const width = probe.getBoundingClientRect().width;
  document.body.removeChild(probe);
  return width;
}

export function textOverflows(el: HTMLElement): boolean {
  const text = (el.textContent || "").trim();
  if (!text) return false;
  // The title element can be laid out wider than the visible event box (flex overflow),
  // so compare against the event box's right edge, not el.clientWidth.
  const host = el.closest(".fc-event") || el.parentElement;
  if (!host) return false;
  const available = host.getBoundingClientRect().right - el.getBoundingClientRect().left;
  return measureTextWidth(el) > available + 1;
}
