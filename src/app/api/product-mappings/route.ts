import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  badRequest,
  requireMerchantId,
  unauthorizedResponse,
} from "@/lib/api-auth";

export async function GET() {
  try {
    const { merchantId } = await requireMerchantId();
    
    const mappings = await prisma.productCategoryMapping.findMany({
      where: {
        product: { merchantId },
      },
      include: {
        product: true,
        mainCategory: true,
        subCategory: true,
      },
      orderBy: {
        priority: 'asc',
      },
    });
    
    return NextResponse.json(mappings);
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { merchantId } = await requireMerchantId();
    const { productId, mainCategoryId, subCategoryId, priority } = await request.json();
    
    if (!productId || !mainCategoryId) {
      return badRequest("معرف المنتج والقسم الرئيسي مطلوبان");
    }
    
    // Verify product belongs to merchant
    const product = await prisma.product.findFirst({
      where: { id: productId, merchantId },
    });
    
    if (!product) {
      return NextResponse.json({ error: "المنتج غير موجود" }, { status: 404 });
    }
    
    // Verify category belongs to merchant
    const category = await prisma.mainCategory.findFirst({
      where: { id: mainCategoryId, merchantId },
    });
    
    if (!category) {
      return NextResponse.json({ error: "القسم غير موجود" }, { status: 404 });
    }
    
    // If subCategoryId provided, verify it belongs to merchant and main category
    if (subCategoryId) {
      const subCategory = await prisma.subCategory.findFirst({
        where: { id: subCategoryId, merchantId, mainCategoryId },
      });
      
      if (!subCategory) {
        return NextResponse.json({ error: "القسم الفرعي غير موجود" }, { status: 404 });
      }
    }
    
    // Delete existing mapping for this product and category combination
    await prisma.productCategoryMapping.deleteMany({
      where: {
        productId,
        mainCategoryId,
      },
    });
    
    // Create new mapping
    const mapping = await prisma.productCategoryMapping.create({
      data: {
        productId,
        mainCategoryId,
        subCategoryId: subCategoryId || null,
        priority: priority || 0,
      },
      include: {
        product: true,
        mainCategory: true,
        subCategory: true,
      },
    });
    
    return NextResponse.json(mapping, { status: 201 });
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
    const clear = searchParams.get("clear");
    
    // Clear all mappings for merchant
    if (clear === "true") {
      await prisma.productCategoryMapping.deleteMany({
        where: {
          product: { merchantId },
        },
      });
      return NextResponse.json({ success: true });
    }
    
    if (!id) return badRequest("المعرف مطلوب");
    
    // Verify mapping belongs to merchant
    const mapping = await prisma.productCategoryMapping.findFirst({
      where: {
        id,
        product: { merchantId },
      },
    });
    
    if (!mapping) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }
    
    await prisma.productCategoryMapping.delete({
      where: { id },
    });
    
    return NextResponse.json({ success: true });
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}