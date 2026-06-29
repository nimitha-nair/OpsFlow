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
 * TEMP DEBUG (remove once the blank-PDF root cause is found): when true,
 * `printElement` shows the print-portal clone on screen instead of printing,
 * and logs what landed in the portal. This reveals whether the clone is empty
 * (a data/clone bug) or full-but-blank-only-in-print (a print-CSS bug).
 * Set back to false to restore normal printing.
 */
const PRINT_DEBUG = false;

function printDebugInspect(
  portal: HTMLElement,
  clone: HTMLElement,
  title: string | undefined,
  restore: () => void,
): void {
  // Force the portal visible on screen (base CSS sets display:none).
  portal.setAttribute(
    "style",
    "display:block !important;position:fixed;inset:0;z-index:99999;overflow:auto;background:#fff;padding:16px;",
  );
  window.setTimeout(() => {
    const rect = clone.getBoundingClientRect();
    const text = (clone.textContent ?? "").trim();
    const panels = Array.from(clone.querySelectorAll(".report-panel"));
    // eslint-disable-next-line no-console
    console.log("[printDebug]", {
      title,
      portalChildren: portal.childElementCount,
      cloneTag: clone.tagName,
      cloneClass: clone.className,
      cloneSize: { w: Math.round(rect.width), h: Math.round(rect.height) },
      reportPanels: panels.length,
      visiblePanels: panels.filter((p) => !p.classList.contains("hidden")).length,
      svgCount: clone.querySelectorAll("svg").length,
      textLength: text.length,
      textPreview: text.slice(0, 160),
    });
    // A close button so the overlay can be dismissed without reloading.
    const close = document.createElement("button");
    close.textContent = "✕ close print debug";
    close.setAttribute(
      "style",
      "position:fixed;top:8px;right:8px;z-index:100000;padding:6px 12px;background:#111;color:#fff;border-radius:6px;font:600 12px sans-serif;cursor:pointer;",
    );
    close.onclick = () => {
      portal.removeAttribute("style");
      restore();
    };
    portal.appendChild(close);
  }, 100);
}

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
    portal.removeAttribute("style");
    document.body.classList.remove("printing");
    if (wasDark) docRoot.classList.add("dark");
    document.title = previousTitle;
    window.removeEventListener("afterprint", restore);
  };

  if (PRINT_DEBUG) {
    printDebugInspect(portal, clone, title, restore);
    return;
  }

  window.addEventListener("afterprint", restore);
  // Fallback for browsers that don't fire afterprint reliably.
  window.setTimeout(restore, 60_000);
  // Defer the print so the browser lays out the freshly-inserted clone before
  // snapshotting. This matters most for "Export all", whose clone contains
  // panels just revealed from display:none — a synchronous print() can capture
  // them before layout, producing blank or partial pages.
  window.setTimeout(() => window.print(), 120);
}
