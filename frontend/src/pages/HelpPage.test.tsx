import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import { HelpPage } from "./HelpPage";
import { AuthContext, type AuthContextValue } from "../context/auth-context";
import { askManual } from "../lib/help-api";

vi.mock("../lib/help-api", () => ({
  askManual: vi.fn(),
}));

const authValue: AuthContextValue = {
  user: { id: "u1", name: "Eve", email: "eve@x.com", role: "EMPLOYEE" },
  isAuthenticated: true,
  login: vi.fn(),
  loginWithSession: vi.fn(),
  logout: vi.fn(),
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={authValue}>
        <HelpPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe("HelpPage — Ask the manual", () => {
  it("renders the Ask box above the static guide cards", () => {
    renderPage();
    expect(screen.getByText("Ask the manual")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/how do i submit an expense/i),
    ).toBeInTheDocument();
    // Static role cards still render below.
    expect(screen.getByText("Getting around")).toBeInTheDocument();
  });

  it("shows the grounded answer and its cited sources", async () => {
    vi.mocked(askManual).mockResolvedValue({
      answer: "Start from Submit Expense and upload a receipt.",
      sources: ["Submitting expenses"],
    });
    renderPage();

    await userEvent.type(
      screen.getByPlaceholderText(/how do i submit an expense/i),
      "How do I submit an expense?",
    );
    await userEvent.click(screen.getByRole("button", { name: /^ask$/i }));

    expect(
      await screen.findByText(/start from submit expense/i),
    ).toBeInTheDocument();
    // The cited source is shown (also a static card title, so >= 2 occurrences).
    expect(screen.getByText("Sources:")).toBeInTheDocument();
    expect(
      screen.getAllByText("Submitting expenses").length,
    ).toBeGreaterThanOrEqual(2);
    expect(askManual).toHaveBeenCalledWith("How do I submit an expense?");
  });
});
