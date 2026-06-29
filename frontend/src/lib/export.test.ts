import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { toCsv, downloadCsv, printElement } from "./export";

describe("toCsv", () => {
  const cols = [
    { label: "Name", value: (r: { name: string; amount: number }) => r.name },
    { label: "Amount", value: (r: { name: string; amount: number }) => r.amount },
  ];

  it("renders a header row even with no data", () => {
    expect(toCsv([], cols)).toBe("Name,Amount");
  });

  it("serializes rows with values", () => {
    const csv = toCsv([{ name: "Travel", amount: 120 }], cols);
    expect(csv).toBe("Name,Amount\r\nTravel,120");
  });

  it("escapes commas, quotes, and newlines per RFC 4180", () => {
    const csv = toCsv(
      [{ name: 'A, "B"\nC', amount: 1 }],
      cols,
    );
    expect(csv).toBe('Name,Amount\r\n"A, ""B""\nC",1');
  });

  it("renders empty string for null/undefined values", () => {
    const csv = toCsv(
      [{ name: "x", amount: 0 }],
      [
        { label: "Name", value: (r: { name: string }) => r.name },
        { label: "Missing", value: () => undefined },
        { label: "Null", value: () => null },
      ],
    );
    expect(csv).toBe("Name,Missing,Null\r\nx,,");
  });
});

describe("downloadCsv", () => {
  let createUrl: ReturnType<typeof vi.fn>;
  let revokeUrl: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createUrl = vi.fn(() => "blob:mock");
    revokeUrl = vi.fn();
    // jsdom doesn't implement object URLs.
    Object.defineProperty(URL, "createObjectURL", { value: createUrl, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeUrl, configurable: true });
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  afterEach(() => {
    clickSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("creates a blob with a UTF-8 BOM and downloads a sanitized filename", async () => {
    downloadCsv(
      "OpsFlow Report 2026!",
      [{ name: "Travel", amount: 120 }],
      [{ label: "Name", value: (r: { name: string }) => r.name }],
    );
    expect(createUrl).toHaveBeenCalledTimes(1);
    const blob = createUrl.mock.calls[0]![0] as Blob;
    // Raw bytes start with the UTF-8 BOM (EF BB BF). (blob.text() would strip it
    // per the Encoding spec, so assert on bytes.)
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const text = await blob.text();
    expect(text).toContain("Name");
    expect(clickSpy).toHaveBeenCalled();
  });
});

describe("printElement", () => {
  let printSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    printSpy = vi.fn();
    window.print = printSpy as unknown as typeof window.print;
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    document.body.className = "";
    document.body.innerHTML = "";
    document.getElementById("print-portal")?.remove();
  });

  it("clones the target's real content into #print-portal and enters print mode", () => {
    const target = document.createElement("div");
    target.innerHTML = "<h2>Executive Overview</h2><p>Approved spend</p>";
    document.body.appendChild(target);

    printElement(target, "My Report");

    const portal = document.getElementById("print-portal");
    expect(portal).not.toBeNull();
    // Real, non-empty content is present in the print document.
    expect(portal!.textContent).toContain("Executive Overview");
    expect(portal!.textContent).toContain("Approved spend");
    expect(document.body.classList.contains("printing")).toBe(true);
    expect(document.title).toBe("my-report");
    // print() is deferred a tick so the browser can lay out the clone first.
    vi.advanceTimersByTime(120);
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it("applies the prepare() transform to the clone (e.g. reveal hidden panels)", () => {
    const target = document.createElement("div");
    target.innerHTML =
      '<div class="report-panel hidden">A</div><div class="report-panel hidden">B</div>';
    document.body.appendChild(target);

    printElement(target, "all", (clone) =>
      clone.querySelectorAll(".report-panel").forEach((p) => p.classList.remove("hidden")),
    );

    const portal = document.getElementById("print-portal")!;
    expect(portal.querySelectorAll(".report-panel.hidden").length).toBe(0);
    expect(portal.querySelectorAll(".report-panel").length).toBe(2);
  });

  it("restores the page on afterprint", () => {
    const prevTitle = document.title;
    const target = document.createElement("div");
    target.textContent = "content";
    document.body.appendChild(target);

    printElement(target, "My Report");
    window.dispatchEvent(new Event("afterprint"));

    expect(document.getElementById("print-portal")!.childElementCount).toBe(0);
    expect(document.body.classList.contains("printing")).toBe(false);
    expect(document.title).toBe(prevTitle);
  });
});
