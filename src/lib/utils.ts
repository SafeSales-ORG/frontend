import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sanitize a URL from an untrusted source (Nostr event tag, user input,
 * etc.) before using it as an `href`, `src`, iframe `src`, or CSS
 * `url()`. Returns `null` for anything that isn't safe to render.
 *
 * Allowlist: `https:`, loopback `http:`, and inline raster images
 * (`data:image/*` except SVG, used by demo-mode uploads that have no
 * backend to host files). Everything else (javascript:, blob:, file:,
 * vbscript:, data:image/svg+xml, schemeless inputs, malformed URLs) is
 * rejected. See `.agents/skills/nostr-security/SKILL.md` for the full
 * threat model — nsec keys live in localStorage and a single XSS
 * permanently compromises every Nostr client the user has ever used.
 */
export function sanitizeUrl(input: unknown): string | null {
  if (typeof input !== "string" || input.length === 0) return null;
  // Inline raster images only — safe as an <img src>. SVG is excluded
  // because it can carry scripts.
  if (
    input.startsWith("data:image/") &&
    !input.startsWith("data:image/svg")
  ) {
    return input;
  }
  try {
    const u = new URL(input);
    if (u.protocol === "https:") return u.toString();
    // The local dev backend serves uploaded images over http://localhost.
    // Allow http only for loopback hosts so dev images render; remote
    // (untrusted) URLs are still required to be https.
    if (
      u.protocol === "http:" &&
      (u.hostname === "localhost" || u.hostname === "127.0.0.1")
    ) {
      return u.toString();
    }
    return null;
  } catch {
    return null;
  }
}
