import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// DELETE /api/questions/[id] — remove a question (and its options). Admin only.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const { id } = await params;

  try {
    // Options are removed automatically via onDelete: Cascade.
    await prisma.question.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (err) {
    console.error(`DELETE /api/questions/${id} failed:`, err);
    return Response.json(
      { error: "Question not found or could not be deleted" },
      { status: 404 }
    );
  }
}
