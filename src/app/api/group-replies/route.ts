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
    const productId = searchParams.get("productId");
    const subCategoryId = searchParams.get("subCategoryId");

    const replies = await prisma.groupReply.findMany({
      where: {
        merchantId,
        ...(mainCategoryId ? { mainCategoryId } : {}),
        ...(productId ? { productId } : {}),
        ...(subCategoryId ? { subCategoryId } : {}),
      },
      include: {
        mainCategory: true,
        subCategory: true,
        product: true,
      },
    });
    return NextResponse.json(replies);
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { merchantId } = await requireMerchantId();
    const { mainCategoryId, productId, subCategoryId, replyText } =
      await request.json();

    if (!mainCategoryId) return badRequest("التصنيف الرئيسي مطلوب");

    const reply = await prisma.groupReply.upsert({
      where: {
        merchantId_mainCategoryId_productId_subCategoryId: {
          merchantId,
          mainCategoryId,
          productId: productId || null,
          subCategoryId: subCategoryId || null,
        },
      },
      create: {
        merchantId,
        mainCategoryId,
        productId: productId || null,
        subCategoryId: subCategoryId || null,
        replyText: replyText || "",
      },
      update: {
        replyText: replyText || "",
      },
      include: {
        mainCategory: true,
        subCategory: true,
        product: true,
      },
    });

    return NextResponse.json(reply);
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

    await prisma.groupReply.deleteMany({ where: { id, merchantId } });
    return NextResponse.json({ success: true });
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}
