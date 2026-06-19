import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ManualEntryCard } from "./ManualEntryCard";

describe("ManualEntryCard", () => {
  it("shows the call-to-action when closed and opens on click", async () => {
    const onOpen = vi.fn();
    render(
      <ManualEntryCard open={false} onOpen={onOpen}>
        <div>manual form</div>
      </ManualEntryCard>,
    );
    expect(screen.queryByText("manual form")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: /enter manually/i }),
    );
    expect(onOpen).toHaveBeenCalled();
  });

  it("renders children when open and does NOT show reviewer-facing warnings", () => {
    render(
      <ManualEntryCard open onOpen={() => {}}>
        <div>manual form</div>
      </ManualEntryCard>,
    );
    expect(screen.getByText("manual form")).toBeInTheDocument();
    // The "may require additional review" concept belongs to HR, not the employee.
    expect(screen.queryByText(/additional review/i)).not.toBeInTheDocument();
  });
});
