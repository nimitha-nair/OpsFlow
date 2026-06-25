import { useState } from "react";
import {
  ChevronDown,
  HelpCircle,
  LogOut,
  Menu,
  Smartphone,
  User,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { ThemeToggle } from "./ThemeToggle";
import { NotificationBell } from "./NotificationBell";
import { GlobalSearch } from "./GlobalSearch";
import { MobileLoginDialog } from "./MobileLoginDialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "../../context/auth-context";
import {
  playNotificationChime,
  setSoundAlertsEnabled,
  soundAlertsEnabled,
} from "../../lib/notification-sound";

function initialsOf(name: string | undefined): string {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "U";
}

interface AppTopbarProps {
  onMenuClick: () => void;
}

export function AppTopbar({ onMenuClick }: AppTopbarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [soundOn, setSoundOn] = useState(soundAlertsEnabled());
  const [mobileLoginOpen, setMobileLoginOpen] = useState(false);

  function handleLogout() {
    // Clear auth state + storage, then redirect imperatively. Doing the
    // navigation here (rather than relying on a declarative <Navigate> during
    // re-render) guarantees the redirect even as the menu/portal unmounts.
    logout();
    navigate("/login", { replace: true });
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    setSoundAlertsEnabled(next);
    // Play a confirmation chime when enabling — also unlocks audio playback
    // (browsers require a user gesture before the first sound).
    if (next) playNotificationChime();
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-16 items-center gap-3 border-b border-border bg-background/80 px-4 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <GlobalSearch />

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => navigate("/help")}
          aria-label="Help & user manual"
          title="Help & user manual"
          className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <HelpCircle className="size-5" />
        </button>
        <NotificationBell />
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg p-1 pr-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
                {initialsOf(user?.name)}
              </AvatarFallback>
            </Avatar>
            <span className="hidden leading-tight sm:block">
              <span className="block text-sm font-medium text-foreground">
                {user?.name ?? "User"}
              </span>
              <span className="block text-xs text-muted-foreground">
                {user?.role ?? ""}
              </span>
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                {user?.email ?? "Signed in"}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem closeOnClick={false} onClick={toggleSound}>
              {soundOn ? (
                <Volume2 className="size-4" />
              ) : (
                <VolumeX className="size-4" />
              )}
              Sound alerts: {soundOn ? "On" : "Off"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setMobileLoginOpen(true)}>
              <Smartphone className="size-4" />
              Log in on mobile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/profile")}>
              <User className="size-4" />
              My Profile
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <MobileLoginDialog
        open={mobileLoginOpen}
        onOpenChange={setMobileLoginOpen}
      />
    </header>
  );
}
