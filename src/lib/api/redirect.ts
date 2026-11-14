/**
 * Turn an untrusted `next=` value into a same-site path, or "/".
 * Blocks absolute and protocol-relative URLs (`//evil`, `/\evil`, `https://…`),
 * header-splitting newlines, and the same tricks hidden behind percent-encoding.
 * A malformed encoding (which makes decodeURIComponent throw) is refused too.
 */
export function safeRedirectPath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "/";
  if (!isPlainPath(raw)) return "/";
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return "/";
  }
  if (!isPlainPath(decoded)) return "/";
  return raw;
}

function isPlainPath(value: string): boolean {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.startsWith("/\\") &&
    !value.includes("://") &&
    !value.includes("\n") &&
    !value.includes("\r")
  );
}
