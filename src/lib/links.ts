/** Public base URL for links sellers share (VITE_APP_URL, else this site). */
function baseUrl(): string {
  const configured = import.meta.env.VITE_APP_URL;
  return (configured || window.location.origin).replace(/\/$/, "");
}

/** The seller's public shop page. */
export function shopUrl(handle: string): string {
  return `${baseUrl()}/s/${encodeURIComponent(handle)}`;
}

/** A single product's buy page. */
export function listingUrl(id: string): string {
  return `${baseUrl()}/buy/${encodeURIComponent(id)}`;
}

/** Same URL without the protocol, for display. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/** The buyer's private order page (keyed by their secret buyer token). */
export function orderUrl(buyerToken: string): string {
  return `${baseUrl()}/order/${encodeURIComponent(buyerToken)}`;
}
