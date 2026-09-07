import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function requireMerchantId() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error("UNAUTHORIZED");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { merchant: { select: { id: true } } },
  });
  const merchantId = user?.merchant?.id;
  if (!merchantId) {
    throw new Error("UNAUTHORIZED");
  }
  return { session, merchantId };
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: "غير مصرح" }, { status: 401 });
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}
