import { useEffect, useState } from "react";
import { api } from "../api";
import { monthRange, toLocalIso } from "../utils";
import type { Stats } from "../types";

function fmt(n: number, digits = 1): string {
  return Number(n).toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

export default function StatsPage() {
  const [range, setRange] = useState(() => {
    const { start, end } = monthRange();
    return {
      start: toLocalIso(start).slice(0, 10),
      end: toLocalIso(end).slice(0, 10),
    };
  });
  const [billTo, setBillTo] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      setError("");
      try {
        const params = new URLSearchParams({
          start: `${range.start}T00:00:00`,
          end: `${range.end}T00:00:00`,
        });
        if (billTo) params.set("billTo", billTo);
        const data = await api<Stats>(`/api/stats?${params.toString()}`);
        setStats(data);
      } catch (err) {
        setError((err as Error).message);
      }
    }
    load();
  }, [range, billTo]);

  const maxHours =
    stats && Array.isArray(stats.byBillTo) && stats.byBillTo.length
      ? Math.max(...stats.byBillTo.map((b) => b.hours), 0.0001)
      : 1;
  const billToOptions = stats && Array.isArray(stats.billToOptions) ? stats.billToOptions : [];
  const remaining = stats?.inspection?.remainingHours ?? null;
  const remainingCls =
    remaining == null
      ? ""
      : remaining < 0
        ? " danger"
        : remaining <= 10
          ? " warn"
          : " ok";

  return (
    <div>
      <div className="page-head">
        <h2>Statistics</h2>
        <p className="muted">
          Fuel used and flight hours for reservations in the selected range.
        </p>
      </div>

      <div className="range-picker">
        <label>
          Start
          <input
            type="date"
            value={range.start}
            onChange={(e) => setRange({ ...range, start: e.target.value })}
          />
        </label>
        <label>
          End
          <input
            type="date"
            value={range.end}
            onChange={(e) => setRange({ ...range, end: e.target.value })}
          />
        </label>
        <label>
          Who flew it
          <select value={billTo} onChange={(e) => setBillTo(e.target.value)}>
            <option value="">Everyone</option>
            {billToOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            {billTo && !billToOptions.includes(billTo) && (
              <option value={billTo}>{billTo}</option>
            )}
          </select>
        </label>
      </div>

      {error && <p className="error">{error}</p>}

      {stats && (
        <>
          <div className="cards">
            <div className="card">
              <span className={`card-value${remainingCls}`}>
                {remaining != null ? fmt(remaining) : "—"}
              </span>
              <span className="card-label">hrs to 100-hr inspection</span>
              {stats.inspection && stats.inspection.hobbs != null && (
                <span className="card-sub">
                  {remaining != null && remaining < 0
                    ? `Overdue by ${fmt(-remaining)} hrs`
                    : `Next due at ${fmt(stats.inspection.nextHobbs ?? 0)} hrs`}
                  {stats.inspection.date
                    ? ` · last done ${stats.inspection.date.slice(0, 10)}`
                    : ""}
                </span>
              )}
            </div>
            <div className="card">
              <span className="card-value">{stats.flights}</span>
              <span className="card-label">Flights</span>
            </div>
            <div className="card">
              <span className="card-value">{stats.unlogged}</span>
              <span className="card-label">Not logged</span>
            </div>
            <div className="card">
              <span className="card-value">{fmt(stats.totalHours)}</span>
              <span className="card-label">Flight hours</span>
            </div>
            <div className="card">
              <span className="card-value">{fmt(stats.totalFuel)}</span>
              <span className="card-label">Fuel used (gal)</span>
            </div>
            <div className="card">
              <span className="card-value">{fmt(stats.avgFuelPerHour)}</span>
              <span className="card-label">Gal / hour</span>
            </div>
          </div>

          <h3>By bill-to</h3>
          {stats.byBillTo.length === 0 ? (
            <p className="muted">No flights logged in this range.</p>
          ) : (
            <table className="stats-table">
              <thead>
                <tr>
                  <th>Bill to</th>
                  <th className="num">Flights</th>
                  <th className="num">Hours</th>
                  <th className="num">Fuel (gal)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stats.byBillTo.map((b) => (
                  <tr key={b.name}>
                    <td className="strong">{b.name}</td>
                    <td className="num" data-label="Flights">{b.flights}</td>
                    <td className="num" data-label="Hours">{fmt(b.hours)}</td>
                    <td className="num" data-label="Fuel">{fmt(b.fuel)}</td>
                    <td>
                      <div className="bar-wrap">
                        <div
                          className="bar"
                          style={{ width: `${(b.hours / maxHours) * 100}%` }}
                        ></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
