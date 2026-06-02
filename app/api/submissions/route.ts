import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// GET /api/submissions — list completed quiz attempts. Admin only (engagement stats).
export async function GET(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  try {
    const submissions = await prisma.submission.findMany({
      orderBy: { createdAt: "desc" },
    });
    return Response.json(submissions);
  } catch (err) {
    console.error("GET /api/submissions failed:", err);
    return Response.json(
      { error: "Failed to load submissions" },
      { status: 500 }
    );
  }
}

// POST /api/submissions — record a completed attempt. Public (any quiz taker).
// Body: { score: number, total: number }
export async function POST(req: Request) {
  let body: { score?: unknown; total?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const score =
    typeof body.score === "number" && Number.isInteger(body.score)
      ? body.score
      : NaN;
  const total =
    typeof body.total === "number" && Number.isInteger(body.total)
      ? body.total
      : NaN;

  if (!Number.isInteger(total) || total < 1) {
    return Response.json({ error: "Invalid total" }, { status: 400 });
  }
  if (!Number.isInteger(score) || score < 0 || score > total) {
    return Response.json({ error: "Invalid score" }, { status: 400 });
  }

  try {
    const submission = await prisma.submission.create({
      data: { score, total },
    });
    return Response.json(submission, { status: 201 });
  } catch (err) {
    console.error("POST /api/submissions failed:", err);
    return Response.json(
      { error: "Failed to record submission" },
      { status: 500 }
    );
  }
}
