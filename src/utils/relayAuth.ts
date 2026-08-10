/**
 * Returns the bearer token presented to the Wormhole relay, or null when
 * VITE_AUTH_TOKEN is unset.
 *
 * The previous fallback was the literal "shogun2025", published in this repo,
 * so every deployment that never set the variable authenticated with a
 * credential anyone can read. Callers must skip the transfer when this returns
 * null rather than present a known token.
 */
export function getRelayAuthToken(): string | null {
  const token = import.meta.env.VITE_AUTH_TOKEN;
  return typeof token === "string" && token.trim() !== "" ? token.trim() : null;
}
