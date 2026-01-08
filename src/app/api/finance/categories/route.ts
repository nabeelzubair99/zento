import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function getAuthedUserId() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  return user?.id ?? null;
}

export async function GET() {
  const userId = await getAuthedUserId();
  if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

  const categories = await prisma.category.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return json(categories);
}

export async function POST(req: Request) {
  const userId = await getAuthedUserId();
  if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const name = String(body?.name ?? "").trim();
  if (!name) return json({ error: "name is required" }, { status: 400 });
  if (name.length > 40) return json({ error: "name is too long (max 40)" }, { status: 400 });

  try {
    const created = await prisma.category.create({
      data: { userId, name },
      select: { id: true, name: true, createdAt: true, updatedAt: true },
    });

    return json(created, { status: 201 });
  } catch (err: any) {
    // Handles unique constraint: @@unique([userId, name])
    return json(
      { error: "Category already exists (same name)." },
      { status: 409 }
    );
  }
}
