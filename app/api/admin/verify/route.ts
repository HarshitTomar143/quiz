import { requireAdmin } from "@/lib/auth";

// POST /api/admin/verify — used by the admin UI to check a password before
// unlocking the panel. Returns 200 if correct, 401 otherwise.
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  return Response.json({ ok: true });
}
