export const ASC_API_BASE_URL = "https://api.appstoreconnect.apple.com";

export function ascApiUrl(path: string): URL {
  // WHATWG URL resolution silently rewrites the result when the input is not
  // slash-anchored; requiring the prefix keeps joins predictable.
  if (!path.startsWith("/")) {
    throw new Error(`ASC API path must start with "/", got "${path}"`);
  }
  return new URL(path, ASC_API_BASE_URL);
}
