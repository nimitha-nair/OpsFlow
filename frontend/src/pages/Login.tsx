import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import axios from "axios";

import { useAuth } from "../context/auth-context";
import { roleHome } from "../types/auth";

export function Login() {
  const { isAuthenticated, user, login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already logged in — send to the role's home.
  if (isAuthenticated && user) {
    return <Navigate to={roleHome(user.role)} replace />;
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const loggedIn = await login(email, password);
      navigate(roleHome(loggedIn.role), { replace: true });
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const message = (err.response?.data as { error?: string } | undefined)
          ?.error;
        setError(message ?? "Unable to sign in. Please try again.");
      } else {
        setError("Unexpected error. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: "4rem auto", fontFamily: "system-ui" }}>
      <h1>OpsFlow Sign in</h1>
      <form onSubmit={handleSubmit} noValidate>
        <label style={{ display: "block", marginBottom: "0.75rem" }}>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
            style={{ display: "block", width: "100%", padding: "0.5rem" }}
          />
        </label>
        <label style={{ display: "block", marginBottom: "0.75rem" }}>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{ display: "block", width: "100%", padding: "0.5rem" }}
          />
        </label>
        {error && (
          <p role="alert" style={{ color: "crimson" }}>
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting} style={{ padding: "0.5rem 1rem" }}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
