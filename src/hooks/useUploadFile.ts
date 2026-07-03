import { useMutation } from "@tanstack/react-query";
import { DEMO_MODE } from "@/lib/api";

/**
 * Upload an image to the SafeSale backend (self-contained — no external
 * Blossom host, no Nostr signer needed). The file is read as a base64 data
 * URL in the browser, POSTed to /api/upload, and the backend returns a
 * permanent URL.
 *
 * In demo mode (`VITE_DEMO_MODE=true`) there is no backend, so we skip the
 * network call and return the image as a `data:` URL — browsers render those
 * directly, so avatars and listing images work fully offline. To stay inside
 * the ~5 MB localStorage budget the demo store serialises into, the image is
 * first downscaled + JPEG-compressed (a 3 MB photo becomes ~50–120 KB); a raw
 * multi-MB data URL would overflow the quota and silently break persistence.
 *
 * Returns NIP-94-style tags: `[["url", <url>], ["x", ""]]`, so existing
 * callers that do `const [[_, url]] = await uploadFile(file)` keep working.
 */

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the image file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Downscale + compress an image to a small JPEG data URL via canvas. Keeps
 * the longest edge ≤ `maxDim` and encodes at `quality`. Falls back to the
 * original data URL if the type can't be drawn (e.g. SVG/GIF) or anything
 * throws. Demo-mode only — real uploads return small backend URLs.
 */
async function downscaleToDataUrl(
  file: File,
  maxDim = 1024,
  quality = 0.7,
): Promise<string> {
  const original = await fileToDataUrl(file);
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) return original;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(original);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(original);
      }
    };
    img.onerror = () => resolve(original);
    img.src = original;
  });
}

export function useUploadFile() {
  return useMutation({
    mutationFn: async (file: File): Promise<string[][]> => {
      if (!file.type.startsWith("image/")) {
        throw new Error("Please choose an image file");
      }
      if (file.size > 8 * 1024 * 1024) {
        throw new Error("Image is too large (max 8 MB)");
      }

      // Demo mode: no backend — return a downscaled data URL so uploads work
      // offline AND stay small enough to persist in localStorage.
      if (DEMO_MODE) {
        const url = await downscaleToDataUrl(file);
        return [
          ["url", url],
          ["x", ""],
        ];
      }

      const dataUrl = await fileToDataUrl(file);
      const res = await fetch(`${API_BASE}/api/upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, filename: file.name }),
      });

      if (!res.ok) {
        let msg = `Upload failed (HTTP ${res.status})`;
        try {
          const body = await res.json();
          msg = body?.error?.message || body?.message || msg;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }

      const body = (await res.json()) as { url: string };
      // NIP-94 tag shape expected by callers: tags[0][1] === url
      return [
        ["url", body.url],
        ["x", ""],
      ];
    },
  });
}
