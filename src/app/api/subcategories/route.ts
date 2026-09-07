import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  badRequest,
  requireMerchantId,
  unauthorizedResponse,
} from "@/lib/api-auth";

export async function GET(request: Request) {
  try {
    const { merchantId } = await requireMerchantId();
    const { searchParams } = new URL(request.url);
    const mainCategoryId = searchParams.get("mainCategoryId");

    const subcategories = await prisma.subCategory.findMany({
      where: {
        merchantId,
        ...(mainCategoryId ? { mainCategoryId } : {}),
      },
      include: { mainCategory: true },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json(subcategories);
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { merchantId } = await requireMerchantId();
    const { name, mainCategoryId, description } = await request.json();
    if (!name?.trim()) return badRequest("الاسم مطلوب");

    const count = await prisma.subCategory.count({
      where: { merchantId, mainCategoryId: mainCategoryId || null },
    });

    const sub = await prisma.subCategory.create({
      data: {
        merchantId,
        mainCategoryId: mainCategoryId || null,
        name: name.trim(),
        description: description?.trim() || null,
        sortOrder: count,
      },
      include: { mainCategory: true },
    });
    return NextResponse.json(sub, { status: 201 });
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

    const existing = await prisma.subCategory.findFirst({
      where: { id, merchantId },
    });
    if (!existing) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }

    const updated = await prisma.subCategory.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.mainCategoryId !== undefined ? { mainCategoryId: body.mainCategoryId } : {}),
      },
      include: { mainCategory: true },
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

    const existing = await prisma.subCategory.findFirst({
      where: { id, merchantId },
    });
    if (!existing) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }

    await prisma.classification.updateMany({
      where: { subCategoryId: id },
      data: { subCategoryId: null },
    });
    await prisma.subCategory.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}
