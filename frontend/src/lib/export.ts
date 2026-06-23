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
  // Prepend a UTF-8 BOM so Excel opens it with the correct encoding.
  const blob = new Blob([String.fromCharCode(0xfeff), csv], {
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

/** Lazily create the top-level container that print clones are rendered into. */
function ensurePrintPortal(): HTMLElement {
  let portal = document.getElementById("print-portal");
  if (!portal) {
    portal = document.createElement("div");
    portal.id = "print-portal";
    document.body.appendChild(portal);
  }
  return portal;
}

let printSeq = 0;

/**
 * Suffix every `id` in the clone (and the references to it) so duplicate ids
 * between the live, hidden app and the clone don't make SVG paint servers
 * (gradients, clip paths) resolve to the hidden originals — which would render
 * blank fills in the PDF.
 */
function isolateIds(root: HTMLElement): void {
  const ided = Array.from(root.querySelectorAll<HTMLElement>("[id]"));
  if (ided.length === 0) return;
  printSeq += 1;
  const suffix = `_pp${printSeq}`;
  const ids = new Set<string>();
  for (const el of ided) {
    ids.add(el.id);
    el.id = el.id + suffix;
  }
  const refAttrs = [
    "href",
    "xlink:href",
    "fill",
    "stroke",
    "clip-path",
    "mask",
    "filter",
  ];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
    for (const attr of refAttrs) {
      const val = el.getAttribute(attr);
      if (!val || !val.includes("#")) continue;
      let next = val;
      for (const id of ids) {
        next = next
          .split(`#${id})`).join(`#${id}${suffix})`)
          .split(`#${id}"`).join(`#${id}${suffix}"`);
        if (next === `#${id}`) next = `#${id}${suffix}`;
      }
      if (next !== val) el.setAttribute(attr, next);
    }
    const style = el.getAttribute("style");
    if (style && style.includes("url(#")) {
      let next = style;
      for (const id of ids) {
        next = next.split(`url(#${id})`).join(`url(#${id}${suffix})`);
      }
      if (next !== style) el.setAttribute("style", next);
    }
  }
}

/**
 * Export a DOM subtree to PDF using the browser print dialog. Clones `target`
 * into a top-level `#print-portal` and adds `body.printing`, so the print
 * stylesheet hides the live app (`display:none`, no leftover blank pages) and
 * renders only the clone. `prepare` can transform the clone before printing
 * (e.g. reveal hidden tab panels for a full-report export). The document title
 * is swapped so it becomes the default PDF filename.
 */
export function printElement(
  target?: HTMLElement | null,
  title?: string,
  prepare?: (clone: HTMLElement) => void,
): void {
  if (!target) {
    window.print();
    return;
  }
  const portal = ensurePrintPortal();
  const previousTitle = document.title;
  if (title) document.title = sanitizeFileName(title);

  // Always print on the light theme: dark-mode tokens (light text, dark
  // surfaces) become invisible once the printer drops background colors. The
  // live app is hidden during print, so this only affects the printout.
  const docRoot = document.documentElement;
  const wasDark = docRoot.classList.contains("dark");
  if (wasDark) docRoot.classList.remove("dark");

  const clone = target.cloneNode(true) as HTMLElement;
  prepare?.(clone);
  isolateIds(clone);
  portal.replaceChildren(clone);
  document.body.classList.add("printing");

  const restore = () => {
    portal.replaceChildren();
    document.body.classList.remove("printing");
    if (wasDark) docRoot.classList.add("dark");
    document.title = previousTitle;
    window.removeEventListener("afterprint", restore);
  };

  window.addEventListener("afterprint", restore);
  // Fallback for browsers that don't fire afterprint reliably.
  window.setTimeout(restore, 60_000);
  window.print();
}
