import { useEffect, useState } from "react";
import { api } from "./api";
import type { Inspection } from "./types";

export default function InspectionBanner() {
  const [inspection, setInspection] = useState<Inspection | null>(null);

  useEffect(() => {
    async function load() {
      try {
        setInspection(await api<Inspection>("/api/inspection"));
      } catch {
        /* ignore */
      }
    }
    load();
    window.addEventListener("inspection-updated", load);
    return () => window.removeEventListener("inspection-updated", load);
  }, []);

  const remaining = inspection?.remainingHours ?? null;
  if (remaining == null || remaining > 10) return null;

  return (
    <div className={`alert app-banner ${remaining < 0 ? "alert-danger" : "alert-warn"}`}>
      {remaining < 0
        ? `The 100-hour inspection is overdue by ${Math.round(-remaining * 10) / 10} hrs — no reservations can be made except for maintenance.`
        : `Only ${Math.round(remaining * 10) / 10} hrs remain before the 100-hour inspection is due.`}
    </div>
  );
}
