import { useAuth } from "../context/auth-context";

/**
 * Minimal authenticated landing area. This is intentionally NOT a dashboard —
 * it only confirms the routing/auth foundation works and provides a logout.
 */
export function AreaPlaceholder({ title }: { title: string }) {
  const { user, logout } = useAuth();

  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "system-ui" }}>
      <h1>{title}</h1>
      {user && (
        <p>
          Signed in as <strong>{user.name}</strong> ({user.email}) —{" "}
          <code>{user.role}</code>
        </p>
      )}
      <button type="button" onClick={logout} style={{ padding: "0.5rem 1rem" }}>
        Log out
      </button>
    </main>
  );
}
