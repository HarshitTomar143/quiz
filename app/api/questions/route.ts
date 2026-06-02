import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// GET /api/questions — list all questions with their options.
// Used by both the quiz (to play) and the admin panel (to manage).
export async function GET() {
  try {
    const questions = await prisma.question.findMany({
      orderBy: { createdAt: "desc" },
      include: { options: true },
    });
    return Response.json(questions);
  } catch (err) {
    console.error("GET /api/questions failed:", err);
    return Response.json(
      { error: "Failed to load questions. Is the database configured?" },
      { status: 500 }
    );
  }
}

type IncomingOption = { text?: unknown; isCorrect?: unknown };

// POST /api/questions — create a question with options. Admin only.
// Body: { text: string, options: { text: string, isCorrect: boolean }[] }
export async function POST(req: Request) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  let body: { text?: unknown; options?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return Response.json({ error: "Question text is required" }, { status: 400 });
  }

  const rawOptions = Array.isArray(body.options) ? (body.options as IncomingOption[]) : [];
  const options = rawOptions
    .map((o) => ({
      text: typeof o.text === "string" ? o.text.trim() : "",
      isCorrect: o.isCorrect === true,
    }))
    .filter((o) => o.text.length > 0);

  if (options.length < 2) {
    return Response.json(
      { error: "At least 2 non-empty options are required" },
      { status: 400 }
    );
  }

  const correctCount = options.filter((o) => o.isCorrect).length;
  if (correctCount !== 1) {
    return Response.json(
      { error: "Exactly one option must be marked correct" },
      { status: 400 }
    );
  }

  try {
    const question = await prisma.question.create({
      data: { text, options: { create: options } },
      include: { options: true },
    });
    return Response.json(question, { status: 201 });
  } catch (err) {
    console.error("POST /api/questions failed:", err);
    return Response.json({ error: "Failed to create question" }, { status: 500 });
  }
}
