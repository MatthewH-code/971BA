import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import type { Pilot, SmtpSettings } from "../types";

interface Props {
  onClose: () => void;
}

interface SettingsData {
  pilots: Pilot[];
  smtp: SmtpSettings;
}

type SmtpFormState = SmtpSettings & { password: string };

export default function SettingsModal({ onClose }: Props) {
  const [pilots, setPilots] = useState<Pilot[]>([]);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [editingPilot, setEditingPilot] = useState<Pilot | null>(null);
  const [smtp, setSmtp] = useState<SmtpFormState | null>(null);
  const [testTo, setTestTo] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const data = await api<SettingsData>("/api/settings");
      setPilots(data.pilots);
      setSmtp({ ...data.smtp, password: "" });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function addPilot(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await api("/api/settings/pilots", {
        method: "POST",
        body: { name: newName, email: newEmail },
      });
      setNewName("");
      setNewEmail("");
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function removePilot(id: number) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/settings/pilots/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function savePilot(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await api(`/api/settings/pilots/${editingPilot?.id}`, {
        method: "PATCH",
        body: { name: editingPilot?.name, email: editingPilot?.email },
      });
      setEditingPilot(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveSmtp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!smtp) return;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const body: Record<string, unknown> = {
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        user: smtp.user,
        from: smtp.from,
      };
      if (smtp.password) body.password = smtp.password;
      const data = await api<{ smtp: SmtpSettings }>("/api/settings/smtp", {
        method: "PATCH",
        body,
      });
      setSmtp({ ...data.smtp, password: "" });
      setSaved("Email settings saved");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function testEmail(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await api("/api/settings/test-email", {
        method: "POST",
        body: { to: testTo },
      });
      setSaved("Test email sent");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function updateSmtp(patch: Partial<SmtpFormState>) {
    setSmtp((s) => (s ? { ...s, ...patch } : s));
  }

  const smtpReady = !!(smtp && smtp.host && smtp.from);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal settings-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-title-row">
          <h3>Settings</h3>
          <button className="ghost small" onClick={onClose}>
            Close
          </button>
        </div>

        <section>
          <h4>Pilots</h4>
          <p className="muted small">
            These names appear in the "who is reserving" dropdown, and their email is used for
            calendar invites.
          </p>
          {pilots.length === 0 ? (
            <p className="muted small">No pilots yet. Add the first one below.</p>
          ) : (
            <ul className="pilot-list">
              {pilots.map((p) =>
                editingPilot?.id === p.id ? (
                  <li key={p.id} className="pilot-edit">
                    <form className="inline-form" onSubmit={savePilot}>
                      <input
                        value={editingPilot.name}
                        onChange={(e) =>
                          setEditingPilot({ ...editingPilot, name: e.target.value })
                        }
                        placeholder="Name"
                      />
                      <input
                        value={editingPilot.email}
                        onChange={(e) =>
                          setEditingPilot({ ...editingPilot, email: e.target.value })
                        }
                        placeholder="email@example.com"
                      />
                      <button className="primary small" disabled={busy}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => setEditingPilot(null)}
                        disabled={busy}
                      >
                        Cancel
                      </button>
                    </form>
                  </li>
                ) : (
                  <li key={p.id}>
                    <div>
                      <span className="strong">{p.name}</span>
                      <span className="muted small">{p.email}</span>
                    </div>
                    <div className="pilot-actions">
                      <button
                        className="icon-btn ghost small"
                        title="Edit pilot"
                        onClick={() => setEditingPilot(p)}
                        disabled={busy}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                        </svg>
                      </button>
                      <button
                        className="ghost small danger"
                        onClick={() => removePilot(p.id)}
                        disabled={busy}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                )
              )}
            </ul>
          )}
          <form className="inline-form" onSubmit={addPilot}>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name"
            />
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email@example.com"
            />
            <button className="primary small" disabled={busy || !newName || !newEmail}>
              Add
            </button>
          </form>
        </section>

        <section>
          <h4>Email (SMTP)</h4>
          <p className="muted small">
            Used to send calendar invites and cancellations. Leave blank to skip emails.
          </p>
          <form className="smtp-form" onSubmit={saveSmtp}>
            <div className="field">
              <label>Host</label>
              <input
                value={smtp?.host || ""}
                onChange={(e) => updateSmtp({ host: e.target.value })}
                placeholder="smtp.example.com"
              />
            </div>
            <div className="smtp-row">
              <div className="field">
                <label>Port</label>
                <input
                  type="number"
                  value={smtp?.port || 587}
                  onChange={(e) => updateSmtp({ port: Number(e.target.value) })}
                />
              </div>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={Boolean(smtp?.secure)}
                  onChange={(e) => updateSmtp({ secure: e.target.checked })}
                />
                Secure (TLS)
              </label>
            </div>
            <div className="field">
              <label>Username</label>
              <input
                value={smtp?.user || ""}
                onChange={(e) => updateSmtp({ user: e.target.value })}
                placeholder="optional"
              />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                value={smtp?.password || ""}
                onChange={(e) => updateSmtp({ password: e.target.value })}
                placeholder={smtp?.hasPassword ? "•••••••• (saved)" : "optional"}
              />
            </div>
            <div className="field">
              <label>From address</label>
              <input
                value={smtp?.from || ""}
                onChange={(e) => updateSmtp({ from: e.target.value })}
                placeholder="n971ba@example.com"
              />
            </div>
            {error && <p className="error">{error}</p>}
            {saved && <p className="success">{saved}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="ghost small"
                onClick={testEmail}
                disabled={busy || !smtpReady}
              >
                Send test email
              </button>
              <input
                className="test-to"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="test@example.com"
              />
              <button className="primary" disabled={busy}>
                Save
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
