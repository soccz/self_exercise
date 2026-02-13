import "server-only";

export function newRequestId(): string {
  // URL-safe, short, good enough for log correlation.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
