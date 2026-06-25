import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { playNotificationChime } from "../../lib/notification-sound";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useAuth } from "../../context/auth-context";
import { roleBasePath } from "../../lib/navigation";
import { formatDateTime } from "../../lib/format";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../lib/notifications-api";
import type { Notification } from "../../types/notification";

export function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  // Last unread count we've seen; null until the first load so we never chime
  // on initial mount — only when a poll reveals a genuinely new notification.
  const prevUnread = useRef<number | null>(null);

  // Initial load + lightweight polling (every 60s).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await listNotifications();
        if (!cancelled) {
          setItems(r.data);
          setUnread(r.unread);
          if (prevUnread.current !== null && r.unread > prevUnread.current) {
            playNotificationChime();
          }
          prevUnread.current = r.unread;
        }
      } catch {
        /* ignore — bell is best-effort */
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  async function refresh() {
    try {
      const r = await listNotifications();
      setItems(r.data);
      setUnread(r.unread);
      // Opening the bell isn't a "new notification" event — sync without chiming.
      prevUnread.current = r.unread;
    } catch {
      /* ignore */
    }
  }

  async function onItem(n: Notification) {
    setOpen(false);
    if (!n.read) {
      markNotificationRead(n.id).catch(() => {});
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      prevUnread.current = Math.max(0, (prevUnread.current ?? 1) - 1);
    }
    if (user) {
      if (n.ticketId) navigate(`${roleBasePath[user.role]}/helpdesk`);
      else if (n.taskId) navigate(`${roleBasePath[user.role]}/kanban`);
    }
  }

  async function onMarkAll() {
    markAllNotificationsRead().catch(() => {});
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
    prevUnread.current = 0;
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) void refresh();
      }}
    >
      <DropdownMenuTrigger
        aria-label="Notifications"
        className="relative inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(20rem,calc(100vw-1.5rem))] p-0"
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unread > 0 && (
            <button
              type="button"
              onClick={onMarkAll}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              You're all caught up.
            </p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => onItem(n)}
                className={cn(
                  "flex w-full flex-col gap-0.5 border-b border-border/60 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                  !n.read && "bg-primary/[0.04]",
                )}
              >
                <div className="flex items-center gap-2">
                  {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
                  <span className="truncate text-sm font-medium text-foreground">
                    {n.title}
                  </span>
                </div>
                <span className="line-clamp-2 text-xs text-muted-foreground">{n.body}</span>
                <span className="text-[10px] text-muted-foreground/70">
                  {formatDateTime(n.createdAt)}
                </span>
              </button>
            ))
          )}
        </div>
        {user && (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate(`${roleBasePath[user.role]}/notifications`);
            }}
            className="w-full border-t border-border px-3 py-2 text-center text-xs font-medium text-primary hover:bg-muted/50"
          >
            View all notifications
          </button>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
