import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ScopeSelector } from "./ScopeSelector";

describe("ScopeSelector", () => {
  it("renders both scope options", () => {
    render(<ScopeSelector value="GENERAL" onChange={() => {}} />);
    expect(
      screen.getByRole("button", { name: /general expense/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /project expense/i }),
    ).toBeInTheDocument();
  });

  it("marks the selected option as pressed", () => {
    render(<ScopeSelector value="PROJECT" onChange={() => {}} />);
    expect(
      screen.getByRole("button", { name: /project expense/i }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /general expense/i }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onChange when a different option is clicked", async () => {
    const onChange = vi.fn();
    render(<ScopeSelector value="GENERAL" onChange={onChange} />);
    await userEvent.click(
      screen.getByRole("button", { name: /project expense/i }),
    );
    expect(onChange).toHaveBeenCalledWith("PROJECT");
  });
});
