import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function getAuthedUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);

  const id = (session?.user as { id?: string } | undefined)?.id;
  if (id) return id;

  const email = session?.user?.email;
  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  return user?.id ?? null;
}

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  const contentType = req.headers.get("content-type") ?? "";

  // JSON
  if (contentType.includes("application/json")) {
    try {
      return (await req.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  // FormData (covers urlencoded + multipart in Route Handlers)
  try {
    const form = await req.formData();
    const out: Record<string, unknown> = {};
    for (const [k, v] of form.entries()) out[k] = v;
    return out;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const userId = await getAuthedUserId();
  if (!userId) return json({ error: "Unauthorized" }, { status: 401 });

  const body = await readBody(req);
  if (!body) return json({ error: "Invalid body" }, { status: 400 });

  // empty string => null => "All accounts"
  const raw = body.defaultTransactionsPaymentSourceId;
  const value =
    raw === undefined || raw === null
      ? null
      : String(raw).trim() === ""
      ? null
      : String(raw).trim();

  // Validate chosen payment source belongs to user (if not null)
  if (value) {
    const exists = await prisma.paymentSource.findFirst({
      where: { id: value, userId },
      select: { id: true },
    });

    if (!exists) {
      return json({ error: "Invalid paymentSourceId" }, { status: 400 });
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { defaultTransactionsPaymentSourceId: value },
    select: { id: true },
  });

  // ✅ If this came from a form submit, redirect back (better UX)
  const contentType = req.headers.get("content-type") ?? "";
  const isFormPost = !contentType.includes("application/json");

  if (isFormPost) {
    return Response.redirect(new URL("/finance/transactions", req.url), 303);
  }

  // JSON callers get JSON back
  return json({ ok: true, defaultTransactionsPaymentSourceId: value });
}
