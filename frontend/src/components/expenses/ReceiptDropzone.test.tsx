import { describe, expect, it, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReceiptDropzone } from "./ReceiptDropzone";

beforeAll(() => {
  // jsdom lacks object-URL APIs used for image thumbnails.
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
  }
});

function pdf(name: string): File {
  return new File([new Uint8Array(10)], name, { type: "application/pdf" });
}

describe("ReceiptDropzone", () => {
  it("renders each staged file with a name", () => {
    render(
      <ReceiptDropzone files={[pdf("a.pdf"), pdf("b.pdf")]} onChange={() => {}} />,
    );
    expect(screen.getByText("a.pdf")).toBeInTheDocument();
    expect(screen.getByText("b.pdf")).toBeInTheDocument();
  });

  it("removes a file via its remove button", async () => {
    const onChange = vi.fn();
    const files = [pdf("a.pdf"), pdf("b.pdf")];
    render(<ReceiptDropzone files={files} onChange={onChange} />);
    await userEvent.click(screen.getByLabelText("Remove a.pdf"));
    expect(onChange).toHaveBeenCalledWith([files[1]]);
  });
});
