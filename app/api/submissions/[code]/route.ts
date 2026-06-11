import { prisma } from "@/lib/prisma";

// GET /api/submissions/[code] — look up a past result by its 6-digit code.
// Public: a user enters the code they were given to re-view their result.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  // Codes are always 6 digits — reject anything else without hitting the DB.
  if (!/^\d{6}$/.test(code)) {
    return Response.json({ error: "Invalid code" }, { status: 400 });
  }

  try {
    const submission = await prisma.submission.findUnique({ where: { code } });
    if (!submission) {
      return Response.json(
        { error: "No result found for that code" },
        { status: 404 }
      );
    }
    return Response.json(submission);
  } catch (err) {
    console.error(`GET /api/submissions/${code} failed:`, err);
    return Response.json(
      { error: "Failed to load result" },
      { status: 500 }
    );
  }
}
