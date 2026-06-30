import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Pagination } from "./Pagination";

describe("Pagination", () => {
  it("renders nothing when there is a single page", () => {
    const { container } = render(
      <Pagination page={1} totalPages={1} onPageChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the current page and total", () => {
    render(<Pagination page={2} totalPages={5} onPageChange={() => {}} />);
    expect(screen.getByText(/page 2 of 5/i)).toBeInTheDocument();
  });

  it("calls onPageChange when Next/Prev are clicked", async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={2} totalPages={5} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);
    await userEvent.click(screen.getByRole("button", { name: /prev/i }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("disables Prev on page 1 and Next on the last page", () => {
    const { rerender } = render(
      <Pagination page={1} totalPages={3} onPageChange={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /prev/i })).toBeDisabled();
    rerender(<Pagination page={3} totalPages={3} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();
  });
});
