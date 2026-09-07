import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  badRequest,
  requireMerchantId,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { getReviewCategory } from "@/lib/categories";

export async function GET() {
  try {
    const { merchantId } = await requireMerchantId();
    const categories = await prisma.mainCategory.findMany({
      where: { merchantId },
      include: {
        subCategories: { orderBy: { sortOrder: "asc" } },
        _count: {
          select: {
            classifications: true,
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json(categories);
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { merchantId } = await requireMerchantId();
    const { name, description } = await request.json();
    if (!name?.trim()) return badRequest("الاسم مطلوب");

    const count = await prisma.mainCategory.count({ where: { merchantId } });
    const category = await prisma.mainCategory.create({
      data: {
        merchantId,
        name: name.trim(),
        description: description?.trim() || null,
        sortOrder: count,
      },
    });
    return NextResponse.json(category, { status: 201 });
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

    const existing = await prisma.mainCategory.findFirst({
      where: { id, merchantId },
    });
    if (!existing) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }

    const updated = await prisma.mainCategory.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name.trim() } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
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

    const existing = await prisma.mainCategory.findFirst({
      where: { id, merchantId },
    });
    if (!existing) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }
    if (existing.isSystem) {
      return badRequest("لا يمكن حذف هذا التصنيف");
    }

    const review = await getReviewCategory(merchantId);
    await prisma.classification.updateMany({
      where: { mainCategoryId: id },
      data: { mainCategoryId: review.id, subCategoryId: null },
    });

    await prisma.mainCategory.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}
