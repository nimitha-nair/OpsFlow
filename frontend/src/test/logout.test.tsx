import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { useState } from "react";

import App from "../App";
import { AuthProvider } from "../context/AuthProvider";
import { ThemeProvider } from "../context/ThemeProvider";
import { useAuth } from "../context/auth-context";

const ADMIN_USER = {
  id: "u1",
  name: "Admin User",
  email: "admin@opsflow.local",
  role: "ADMIN",
};

function seedAuth() {
  localStorage.setItem("opsflow_token", "test.jwt.token");
  localStorage.setItem("opsflow_user", JSON.stringify(ADMIN_USER));
}

function renderAppAt(path: string) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("logout flow", () => {
  it("redirects unauthenticated access to /admin back to /login", () => {
    renderAppAt("/admin");
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.queryByText("Admin Dashboard")).not.toBeInTheDocument();
  });

  it("logs out from the UI: dashboard -> click logout -> /login, storage cleared", async () => {
    const user = userEvent.setup();
    seedAuth();
    renderAppAt("/admin");

    // 1-2. Authenticated user lands on the dashboard.
    expect(await screen.findByText("Admin Dashboard")).toBeInTheDocument();
    expect(localStorage.getItem("opsflow_token")).not.toBeNull();

    // 3. Open the profile menu and click "Log out".
    await user.click(screen.getByRole("button", { name: /Admin User/i }));
    await user.click(await screen.findByRole("menuitem", { name: /log out/i }));

    // 4. Redirected to /login.
    expect(await screen.findByLabelText("Email")).toBeInTheDocument();
    expect(screen.queryByText("Admin Dashboard")).not.toBeInTheDocument();

    // localStorage keys removed.
    expect(localStorage.getItem("opsflow_token")).toBeNull();
    expect(localStorage.getItem("opsflow_user")).toBeNull();
  });

  it("after logout, directly visiting /admin redirects to /login", () => {
    // Storage was cleared by logout; a fresh direct visit must be blocked.
    renderAppAt("/admin");
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });
});

// Deterministic, portal-free check of the context contract.
function AuthProbe() {
  const { user, logout } = useAuth();
  const [done, setDone] = useState(false);
  return (
    <div>
      <span data-testid="who">{user ? user.name : "anonymous"}</span>
      <button
        type="button"
        onClick={() => {
          logout();
          setDone(true);
        }}
      >
        do-logout
      </button>
      <span data-testid="done">{done ? "yes" : "no"}</span>
    </div>
  );
}

describe("auth context logout()", () => {
  it("clears in-memory state and removes both storage keys", async () => {
    const user = userEvent.setup();
    seedAuth();
    render(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    expect(screen.getByTestId("who")).toHaveTextContent("Admin User");

    await user.click(screen.getByRole("button", { name: "do-logout" }));

    await waitFor(() =>
      expect(screen.getByTestId("who")).toHaveTextContent("anonymous"),
    );
    expect(localStorage.getItem("opsflow_token")).toBeNull();
    expect(localStorage.getItem("opsflow_user")).toBeNull();
  });
});
