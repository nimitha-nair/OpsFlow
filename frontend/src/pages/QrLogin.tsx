import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { useAuth } from "../context/auth-context";
import { apiErrorMessage } from "../lib/users-api";
import { qrExchange } from "../lib/qr-login-api";
import { roleHome } from "../types/auth";

/**
 * Public landing page for a scanned QR login. Reads the token from the URL,
 * exchanges it for a session, and redirects to the user's home.
 */
export function QrLogin() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithSession } = useAuth();
  const [error, setError] = useState<string | null>(null);
  // Guard against the effect running twice (React 18 StrictMode) — the token is
  // single-use, so a second exchange would always fail.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = params.get("token");
    if (!token) {
      setError("This link is missing its sign-in code.");
      return;
    }
    void (async () => {
      try {
        const res = await qrExchange(token);
        loginWithSession(res.token, res.user);
        navigate(roleHome(res.user.role), { replace: true });
      } catch (err) {
        setError(
          apiErrorMessage(
            err,
            "Couldn't sign you in. The code may have expired — generate a new one.",
          ),
        );
      }
    })();
  }, [params, navigate, loginWithSession]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      {error ? (
        <>
          <p className="max-w-sm text-sm font-medium text-destructive">{error}</p>
          <Link
            to="/login"
            className="text-sm font-medium text-primary hover:underline"
          >
            Go to login
          </Link>
        </>
      ) : (
        <>
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Signing you in…</p>
        </>
      )}
    </div>
  );
}
