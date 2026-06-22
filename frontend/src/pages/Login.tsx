import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import axios from "axios";
import { Loader2 } from "lucide-react";

import { Brand } from "../components/brand/Brand";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    // TEMP DEBUG (login trace) — remove after diagnosis
    console.log("[login-debug] submit", { email, origin: window.location.origin });
    try {
      const loggedIn = await login(email, password);
      navigate(roleHome(loggedIn.role), { replace: true });
    } catch (err) {
      // TEMP DEBUG (login trace) — remove after diagnosis
      if (axios.isAxiosError(err)) {
        console.log("[login-debug] axios error", {
          requestUrl: err.config?.baseURL ?? "" + (err.config?.url ?? ""),
          status: err.response?.status,
          contentType: err.response?.headers?.["content-type"],
          data: err.response?.data,
        });
      } else {
        console.log("[login-debug] non-axios error", err);
      }
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
    <main className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex justify-center">
          <Brand />
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>
              Welcome back. Enter your credentials to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  placeholder="you@opsflow.local"
                />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting && <Loader2 className="size-4 animate-spin" />}
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
