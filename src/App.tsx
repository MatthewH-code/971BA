import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import Login from "./pages/Login";
import CalendarPage from "./pages/CalendarPage";
import ReservationsPage from "./pages/ReservationsPage";
import StatsPage from "./pages/StatsPage";
import SettingsModal from "./pages/SettingsModal";
import InspectionModal from "./InspectionModal";
import InspectionBanner from "./InspectionBanner";
import ErrorBoundary from "./ErrorBoundary";

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showInspection, setShowInspection] = useState(false);

  useEffect(() => {
    api<{ authenticated: boolean }>("/api/me")
      .then((d) => setAuthed(d.authenticated))
      .catch(() => setAuthed(false));
    const onExpired = () => setAuthed(false);
    window.addEventListener("auth-expired", onExpired);
    return () => window.removeEventListener("auth-expired", onExpired);
  }, []);

  if (authed === null) return null;

  if (!authed) {
    return <Login onLogin={() => setAuthed(true)} />;
  }

  return (
    <div className="app">
      <nav className="topbar">
        <div className="brand">N971BA</div>
        <div className="topbar-links">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            Calendar
          </NavLink>
          <NavLink to="/reservations" className={({ isActive }) => (isActive ? "active" : "")}>
            Reservations
          </NavLink>
          <NavLink to="/stats" className={({ isActive }) => (isActive ? "active" : "")}>
            Statistics
          </NavLink>
        </div>
        <div className="topbar-actions">
          <button className="ghost" title="Record 100-hour inspection" onClick={() => setShowInspection(true)}>
            100-hr
          </button>
          <button
            className="icon-btn ghost"
            title="Settings"
            onClick={() => setShowSettings(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <button
            className="ghost"
            onClick={async () => {
              await api("/api/logout", { method: "POST" });
              setAuthed(false);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className="sign-out-label">Sign out</span>
          </button>
        </div>
      </nav>
      <InspectionBanner />
      <main className="content">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<CalendarPage />} />
            <Route path="/reservations" element={<ReservationsPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showInspection && (
        <InspectionModal
          onClose={() => setShowInspection(false)}
          onSaved={() => window.dispatchEvent(new CustomEvent("inspection-updated"))}
        />
      )}
    </div>
  );
}
