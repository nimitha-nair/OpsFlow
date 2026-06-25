/**
 * Sound alerts for new notifications. The preference is persisted per-browser;
 * the chime is synthesized with the Web Audio API so no asset is required.
 */

const KEY = "opsflow:sound-alerts";

/** Whether new-notification sound alerts are enabled (default: on). */
export function soundAlertsEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundAlertsEnabled(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable — ignore */
  }
}

/**
 * Play a short two-note chime for a new notification. No-op when sound alerts
 * are disabled or audio is unavailable. Browsers may suppress audio until the
 * user has interacted with the page; that first interaction is the login click.
 */
export function playNotificationChime(): void {
  if (!soundAlertsEnabled()) return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    // A context created outside a user gesture may start suspended; resume it
    // (allowed once the user has interacted with the page at least once).
    if (ctx.state === "suspended") void ctx.resume();
    const start = ctx.currentTime;
    const notes = [
      { freq: 880, at: 0 },
      { freq: 1174.66, at: 0.12 },
    ];
    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = note.freq;
      const t0 = start + note.at;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    }
    window.setTimeout(() => void ctx.close(), 600);
  } catch {
    /* audio unavailable — silently ignore */
  }
}
