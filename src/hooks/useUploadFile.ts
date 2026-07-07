import { useMutation } from "@tanstack/react-query";

/**
 * Turn a chosen image file into a small, self-contained `data:` URL the app
 * can store and render directly — no external Blossom host, no Nostr signer.
 *
 * The backend has NO `/api/upload` route yet (see PROGRESS.md), and its listing
 * `images[].url` field accepts any valid URL — including `data:` URLs. So in
 * BOTH demo and real mode we downscale + JPEG-compress the image in the browser
 * (a 3 MB photo becomes ~50–120 KB) and embed that data URL. This keeps demo
 * mode inside its localStorage budget and lets real listings carry their image
 * without a dedicated upload endpoint. Swap back to a POST /api/upload once the
 * backend adds one (larger images, real CDN URLs).
 *
 * Returns NIP-94-style tags: `[["url", <url>], ["x", ""]]`, so existing
 * callers that do `const [[_, url]] = await uploadFile(file)` keep working.
 */

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

      // Downscale + compress to a small JPEG data URL. Works offline (demo) and
      // against the real backend (which accepts data: URLs and has no upload
      // route). The result is small enough to persist and to POST inline.
      const url = await downscaleToDataUrl(file);
      return [
        ["url", url],
        ["x", ""],
      ];
    },
  });
}
