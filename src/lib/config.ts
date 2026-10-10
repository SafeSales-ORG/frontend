/** Google OAuth client id (must match the backend's GOOGLE_CLIENT_ID). */
export const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

/**
 * Google sign-in is only wired up when it's enabled AND a client id is set.
 * Loading Google's script without a client id throws and breaks sign-in.
 */
export const GOOGLE_SIGN_IN_ENABLED =
  import.meta.env.VITE_GOOGLE_ENABLED === "true" && GOOGLE_CLIENT_ID.length > 0;
