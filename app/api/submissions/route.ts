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

// A random 6-digit code (100000–999999) the user can use to re-open the result.
function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Categories whose selection cutoff the result card displays.
const CATEGORIES = ["UR", "OBC", "SC", "ST"] as const;

// POST /api/submissions — record a completed attempt. Public (any quiz taker).
// Body: { score, total, answers, order, name?, category?, avatar? }
// Returns the created submission, including its `code` for re-viewing later.
export async function POST(req: Request) {
  let body: {
    score?: unknown;
    total?: unknown;
    answers?: unknown;
    order?: unknown;
    name?: unknown;
    category?: unknown;
    avatar?: unknown;
  };
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

  // answers: a plain object mapping questionId -> optionId (both strings).
  const answers = body.answers;
  if (
    typeof answers !== "object" ||
    answers === null ||
    Array.isArray(answers) ||
    Object.values(answers).some((v) => typeof v !== "string")
  ) {
    return Response.json({ error: "Invalid answers" }, { status: 400 });
  }

  // order: the question ids in the order they were shown.
  const order = body.order;
  if (!Array.isArray(order) || order.some((v) => typeof v !== "string")) {
    return Response.json({ error: "Invalid order" }, { status: 400 });
  }

  // Optional profile fields shown on the result card. All best-effort:
  // anything malformed is simply dropped rather than rejecting the attempt.
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 40)
      : null;
  const category =
    typeof body.category === "string" &&
    (CATEGORIES as readonly string[]).includes(body.category)
      ? body.category
      : null;
  const avatar =
    typeof body.avatar === "string" && body.avatar.trim()
      ? body.avatar.trim().slice(0, 20)
      : null;

  // Generate a unique code, retrying on the (rare) chance of a collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      const submission = await prisma.submission.create({
        data: { code, score, total, answers, order, name, category, avatar },
      });
      return Response.json(submission, { status: 201 });
    } catch (err) {
      // P2002 = unique constraint failed (code already taken) — try a new one.
      if ((err as { code?: string }).code === "P2002" && attempt < 4) continue;
      console.error("POST /api/submissions failed:", err);
      return Response.json(
        { error: "Failed to record submission" },
        { status: 500 }
      );
    }
  }

  return Response.json(
    { error: "Could not generate a unique code, please try again" },
    { status: 500 }
  );
}
