import { useEffect, useState } from "react";

/**
 * True when the viewport is phone-sized (below Tailwind's `md` breakpoint,
 * 768px) — the same cutoff the app uses for its `md:flex` / `md:hidden`
 * desktop-vs-mobile toolbars. Reacts to viewport changes (rotation, resize).
 */
const MOBILE_QUERY = "(max-width: 767px)";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" && "matchMedia" in window
      ? window.matchMedia(MOBILE_QUERY).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
