import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { seedDefaultCategories } from "@/lib/categories";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password, name, shopName } = body;

    if (!email || !password || !name || !shopName) {
      return NextResponse.json(
        { error: "جميع الحقول مطلوبة" },
        { status: 400 },
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "البريد الإلكتروني مستخدم بالفعل" },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        merchant: {
          create: { shopName, locale: "ar" },
        },
      },
      include: { merchant: true },
    });

    if (user.merchant) {
      await seedDefaultCategories(user.merchant.id);
    }

    return NextResponse.json({ success: true, user: { email: user.email, name: user.name } });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "خطأ في التسجيل" }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();
  return NextResponse.json({ user: session?.user ?? null });
}
