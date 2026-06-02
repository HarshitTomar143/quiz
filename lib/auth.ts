// Minimal password gate for admin-only API routes.
//
// The admin UI stores the password the user types and sends it on every
// mutating request via the `x-admin-password` header. Each protected route
// calls `requireAdmin(req)` to verify it against the ADMIN_PASSWORD env var.
//
// This is intentionally simple (good enough for a personal tool). For a
// multi-user or public deployment, swap this for real sessions/auth.

import { ADMIN_HEADER } from "./constants";

export function isAdmin(req: Request): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const provided = req.headers.get(ADMIN_HEADER);
  return provided === expected;
}

/**
 * Returns a 401 Response if the request is not authorized, otherwise null.
 * Usage: `const denied = requireAdmin(req); if (denied) return denied;`
 */
export function requireAdmin(req: Request): Response | null {
  if (isAdmin(req)) return null;
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
