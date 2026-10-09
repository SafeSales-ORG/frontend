import confetti from "canvas-confetti";

const COLORS = ["#9DF2C0", "#0E6B4E", "#0B3A2A", "#C9F7DC", "#FFFFFF"];

/** A short confetti burst for real milestones. Skipped under reduced motion. */
export function celebrate(): void {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const base = { colors: COLORS, disableForReducedMotion: true, zIndex: 9999 };
  void confetti({ ...base, particleCount: 70, spread: 70, startVelocity: 38, origin: { y: 0.65 } });
  window.setTimeout(() => {
    void confetti({ ...base, particleCount: 40, angle: 60, spread: 55, origin: { x: 0, y: 0.7 } });
    void confetti({ ...base, particleCount: 40, angle: 120, spread: 55, origin: { x: 1, y: 0.7 } });
  }, 180);
}
