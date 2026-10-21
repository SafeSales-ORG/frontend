import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api";

/**
 * Browser-side image compression: a 3 MB photo becomes a ~50–120 KB JPEG
 * data URL, which is then uploaded (see `useUploadFile` below).
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

/**
 * Compress an image in the browser, then upload it (`POST /api/uploads`).
 * Returns `[["url", url], …]` tags. In demo mode, or when the server has no
 * storage configured, the URL is the compressed data URL itself.
 * Buyers uploading dispute evidence pass their order's `buyerToken`.
 */
export function useUploadFile(opts?: { buyerToken?: string }) {
  return useMutation({
    mutationFn: async (file: File): Promise<string[][]> => {
      if (!file.type.startsWith("image/")) {
        throw new Error("Please choose an image file");
      }
      if (file.size > 8 * 1024 * 1024) {
        throw new Error("Image is too large (max 8 MB)");
      }
      const dataUrl = await downscaleToDataUrl(file);
      const url = await apiClient.uploadImage(dataUrl, { buyerToken: opts?.buyerToken });
      return [
        ["url", url],
        ["x", ""],
      ];
    },
  });
}
