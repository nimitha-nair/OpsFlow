/**
 * Lightweight, dependency-free export helpers for the reporting surfaces.
 *
 *  - CSV: a small, correctly-escaped serializer + browser download.
 *  - PDF: reuses the app's existing print-to-PDF mechanism (see the `@media
 *    print` block in index.css, which reveals only the `[data-print-root]`
 *    subtree and hides `.no-print`). `printElement` temporarily promotes a
 *    chosen section to the print root so a single section — or the whole
 *    report — can be exported to PDF via the browser's "Save as PDF".
 */

export interface CsvColumn<T> {
  /** Header label shown in the first row. */
  label: string;
  /** Cell value for a row (string | number | boolean | null | undefined). */
  value: (row: T) => string | number | boolean | null | undefined;
}

/** Escape a single CSV field per RFC 4180 (quote when it contains , " or newline). */
function csvField(input: string | number | boolean | null | undefined): string {
  const s =
    input === null || input === undefined
      ? ""
      : typeof input === "string"
        ? input
        : String(input);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Serialize rows to a CSV string with the given column definitions. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => csvField(c.label)).join(",");
  const body = rows
    .map((row) => columns.map((c) => csvField(c.value(row))).join(","))
    .join("\r\n");
  return body ? `${header}\r\n${body}` : header;
}

/** Build a CSV and trigger a download with a timestamped, sanitized filename. */
export function downloadCsv<T>(
  baseName: string,
  rows: T[],
  columns: CsvColumn<T>[],
): void {
  const csv = toCsv(rows, columns);
  // Prepend a BOM so Excel opens UTF-8 correctly.
  const blob = new Blob([`﻿${csv}`], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFileName(baseName)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function sanitizeFileName(name: string): string {
  return name
    .trim()
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

/**
 * Export a DOM subtree to PDF using the browser print dialog. Temporarily marks
 * `target` as the sole `[data-print-root]` so the print stylesheet renders only
 * that section, swaps the document title (browsers use it as the default PDF
 * filename), and restores everything afterward. Pass no target to print the
 * current print root as-is.
 */
export function printElement(target?: HTMLElement | null, title?: string): void {
  const previousRoots = Array.from(
    document.querySelectorAll<HTMLElement>("[data-print-root]"),
  );
  const previousTitle = document.title;

  if (target) {
    previousRoots.forEach((n) => n.removeAttribute("data-print-root"));
    target.setAttribute("data-print-root", "");
  }
  if (title) {
    document.title = sanitizeFileName(title);
  }

  const restore = () => {
    if (target) {
      target.removeAttribute("data-print-root");
      previousRoots.forEach((n) => n.setAttribute("data-print-root", ""));
    }
    document.title = previousTitle;
    window.removeEventListener("afterprint", restore);
  };

  window.addEventListener("afterprint", restore);
  // Fallback for browsers that don't fire afterprint reliably.
  window.setTimeout(restore, 60_000);
  window.print();
}
