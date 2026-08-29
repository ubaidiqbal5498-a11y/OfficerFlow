import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { PasswordField } from "../components/Ui.jsx";

export default function Login() {
  const { user, ready, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const from = location.state?.from || "/";

  if (ready && user) return <Navigate to={from} replace />;

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await login(username, password);
      navigate(from === "/login" ? "/" : from, { replace: true });
    } catch (err) {
      setError(err.message || "Invalid username or password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand" style={{ border: 0, margin: 0, padding: 0 }}>
          <div className="brand-mark">OF</div>
          <div>
            <h1>OfficerFlow</h1>
            <p>Sign in to your account</p>
          </div>
        </div>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <label className="field">
          Username
          <input
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
            autoFocus
          />
        </label>
        <PasswordField
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}
