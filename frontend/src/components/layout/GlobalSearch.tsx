import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Briefcase,
  ClipboardList,
  CornerDownLeft,
  LifeBuoy,
  Loader2,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "../../context/auth-context";
import { roleBasePath } from "../../lib/navigation";
import { globalSearch } from "../../lib/search-api";
import { loadRecent, saveRecent } from "../../lib/recent-search";
import {
  SEARCH_ENTITY_LABELS,
  type SearchEntity,
  type SearchResult,
} from "../../types/search";
import type { Role } from "../../types/auth";

const ENTITY_ICON: Record<SearchEntity, LucideIcon> = {
  task: ClipboardList,
  project: Briefcase,
  user: Users,
  expense: Wallet,
  ticket: LifeBuoy,
};

// Per-entity colour identity — matches the activity feed for a cohesive system.
const ENTITY_STYLE: Record<SearchEntity, string> = {
  task: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
  project: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  user: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  expense: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  ticket: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
};

const RECENT_MAX = 6;

/** Best-effort destination for a result, given the viewer's role. */
function hrefFor(r: SearchResult, role: Role): string {
  const base = roleBasePath[role];
  switch (r.entity) {
    case "expense":
      return `${base}/expenses/${r.id}`;
    case "project":
      return `${base}/projects/${r.id}`;
    case "task":
      return role === "EMPLOYEE" ? "/employee/tasks" : `${base}/kanban`;
    case "user":
      return role === "ADMIN" ? `/admin/users/${r.id}` : `${base}/employees`;
    case "ticket":
      return `${base}/helpdesk`;
  }
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-sans text-[10px] font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

export function GlobalSearch() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recent, setRecent] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Open (loading recent history) or close + reset the palette.
  function setPaletteOpen(next: boolean) {
    setOpen(next);
    if (next) {
      if (user) setRecent(loadRecent(user.id));
    } else {
      setQuery("");
      setResults([]);
      setActive(0);
    }
  }

  // Open with Cmd/Ctrl+K from anywhere. Re-bound when the user changes so recent
  // history is loaded for the currently signed-in user.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
        if (user) setRecent(loadRecent(user.id));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [user]);

  // Debounced search whenever the query changes — all state is set inside the
  // timer callback (never synchronously in the effect body).
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    let cancelled = false;
    const handle = window.setTimeout(() => {
      if (!q) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      void globalSearch(q)
        .then((r) => {
          if (!cancelled) setResults(r);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, q ? 180 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, open]);

  // Keep the highlighted row in view during keyboard navigation (DOM sync only).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const counts = useMemo(() => {
    const c = {} as Record<SearchEntity, number>;
    for (const r of results) c[r.entity] = (c[r.entity] ?? 0) + 1;
    return c;
  }, [results]);

  if (!user) return null;

  const showingRecent = query.trim() === "";
  const items = showingRecent ? recent : results;

  function go(r: SearchResult) {
    // Remember it (most-recent first, de-duped, capped).
    const next = [
      r,
      ...recent.filter((x) => !(x.entity === r.entity && x.id === r.id)),
    ].slice(0, RECENT_MAX);
    saveRecent(user!.id, next);
    setRecent(next);
    setOpen(false);
    navigate(hrefFor(r, user!.role));
  }

  function clearRecent() {
    saveRecent(user!.id, []);
    setRecent([]);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && items[active]) {
      e.preventDefault();
      go(items[active]);
    }
  }

  let lastEntity: SearchEntity | null = null;

  function Row({ r, i }: { r: SearchResult; i: number }) {
    const Icon = ENTITY_ICON[r.entity];
    const isActive = i === active;
    return (
      <button
        ref={isActive ? activeRef : undefined}
        type="button"
        onClick={() => go(r)}
        onMouseMove={() => setActive(i)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors",
          isActive ? "bg-accent" : "hover:bg-muted/60",
        )}
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            ENTITY_STYLE[r.entity],
          )}
        >
          <Icon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {r.title}
            </span>
            {r.code && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {r.code}
              </span>
            )}
          </span>
          {r.subtitle && (
            <span className="block truncate text-xs capitalize text-muted-foreground">
              {r.subtitle.toLowerCase().replace(/_/g, " ")}
            </span>
          )}
        </span>
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground transition-opacity",
            isActive ? "opacity-100" : "opacity-0",
          )}
        >
          Open <CornerDownLeft className="size-3" />
        </span>
      </button>
    );
  }

  return (
    <>
      {/* Trigger — reads as a real search field. */}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        aria-label="Search"
        className="group inline-flex h-9 items-center gap-2 rounded-lg border border-input bg-muted/40 px-2.5 text-sm text-muted-foreground shadow-sm transition-colors hover:border-ring/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-64"
      >
        <Search className="size-4 transition-colors group-hover:text-foreground" />
        <span className="hidden flex-1 text-left sm:inline">Search workspace…</span>
        <span className="hidden items-center gap-0.5 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <Dialog open={open} onOpenChange={setPaletteOpen}>
        <DialogContent
          showCloseButton={false}
          className="gap-0 overflow-hidden p-0 shadow-2xl ring-1 ring-foreground/10 sm:max-w-2xl"
        >
          {/* Search header */}
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-5 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder="Search tasks, projects, people, expenses, tickets…"
              className="h-14 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground/70"
            />
            {loading ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            ) : null}
          </div>

          {/* Results */}
          <div className="max-h-[22rem] overflow-y-auto px-2 py-2">
            {showingRecent && recent.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                <span className="flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <Search className="size-5" />
                </span>
                <p className="text-sm font-medium text-foreground">
                  Search across your workspace
                </p>
                <p className="max-w-xs text-xs text-muted-foreground">
                  Find anything by name or code — a project, a teammate,{" "}
                  <span className="font-mono">TSK-12</span>, or{" "}
                  <span className="font-mono">EXP-0041</span>.
                </p>
              </div>
            ) : !showingRecent && !loading && results.length === 0 ? (
              <div className="flex flex-col items-center gap-1 px-4 py-12 text-center">
                <p className="text-sm font-medium text-foreground">No matches</p>
                <p className="text-xs text-muted-foreground">
                  Nothing found for “{query.trim()}”.
                </p>
              </div>
            ) : showingRecent ? (
              <>
                <div className="flex items-center justify-between px-2 pb-1 pt-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Recent
                  </span>
                  <button
                    type="button"
                    onClick={clearRecent}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                </div>
                {recent.map((r, i) => (
                  <Row key={`${r.entity}:${r.id}`} r={r} i={i} />
                ))}
              </>
            ) : (
              results.map((r, i) => {
                const showHeader = r.entity !== lastEntity;
                lastEntity = r.entity;
                return (
                  <div key={`${r.entity}:${r.id}`}>
                    {showHeader && (
                      <div className="flex items-center gap-2 px-2 pb-1 pt-3 first:pt-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {SEARCH_ENTITY_LABELS[r.entity]}
                        </span>
                        <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                          {counts[r.entity]}
                        </span>
                      </div>
                    )}
                    <Row r={r} i={i} />
                  </div>
                );
              })
            )}
          </div>

          {/* Keyboard legend */}
          <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                navigate
              </span>
              <span className="flex items-center gap-1">
                <Kbd>↵</Kbd>
                open
              </span>
              <span className="flex items-center gap-1">
                <Kbd>esc</Kbd>
                close
              </span>
            </span>
            {items.length > 0 && (
              <span className="tabular-nums">
                {showingRecent
                  ? `${items.length} recent`
                  : `${items.length} result${items.length === 1 ? "" : "s"}`}
              </span>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
