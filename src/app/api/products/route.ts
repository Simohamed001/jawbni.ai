import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  badRequest,
  requireMerchantId,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { parseKeywords } from "@/lib/utils";

export async function GET() {
  try {
    const { merchantId } = await requireMerchantId();
    const products = await prisma.product.findMany({
      where: { merchantId },
      orderBy: { officialName: "asc" },
    });
    return NextResponse.json(products);
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { merchantId } = await requireMerchantId();
    const { officialName, keywords } = await request.json();
    if (!officialName?.trim()) return badRequest("اسم المنتج مطلوب");

    const kw = Array.isArray(keywords)
      ? keywords
      : parseKeywords(String(keywords || ""));

    const product = await prisma.product.create({
      data: {
        merchantId,
        officialName: officialName.trim(),
        keywords: JSON.stringify(kw),
      },
    });
    return NextResponse.json(product, { status: 201 });
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { merchantId } = await requireMerchantId();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const body = await request.json();

    if (!id) return badRequest("المعرف مطلوب");

    const existing = await prisma.product.findFirst({
      where: { id, merchantId },
    });
    if (!existing) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }

    const kw =
      body.keywords !== undefined
        ? Array.isArray(body.keywords)
          ? body.keywords
          : parseKeywords(String(body.keywords))
        : undefined;

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(body.officialName ? { officialName: body.officialName.trim() } : {}),
        ...(kw !== undefined ? { keywords: JSON.stringify(kw) } : {}),
        ...(body.isSold !== undefined ? { isSold: body.isSold } : {}),
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { merchantId } = await requireMerchantId();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return badRequest("المعرف مطلوب");

    const existing = await prisma.product.findFirst({
      where: { id, merchantId },
    });
    if (!existing) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }

    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}
