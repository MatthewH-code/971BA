import { useState, type FormEvent } from "react";
import { api } from "../api";

interface Props {
  onLogin: () => void;
}

export default function Login({ onLogin }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/login", { method: "POST", body: { password } });
      onLogin();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>N971BA Scheduler</h1>
        <p className="muted">Enter the access password to continue</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
        />
        {error && <p className="error">{error}</p>}
        <button className="primary" type="submit" disabled={busy || !password}>
          Sign in
        </button>
      </form>
    </div>
  );
}
