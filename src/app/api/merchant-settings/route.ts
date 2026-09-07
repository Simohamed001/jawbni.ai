import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireMerchantId,
  unauthorizedResponse,
} from "@/lib/api-auth";

export async function GET() {
  try {
    const { merchantId } = await requireMerchantId();
    
    const merchant = await prisma.merchantProfile.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        shopName: true,
        locale: true,
        singleProduct: true,
      },
    });
    
    if (!merchant) {
      return NextResponse.json({ error: "التاجر غير موجود" }, { status: 404 });
    }
    
    return NextResponse.json(merchant);
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { merchantId } = await requireMerchantId();
    const body = await request.json();
    
    const updated = await prisma.merchantProfile.update({
      where: { id: merchantId },
      data: {
        ...(body.singleProduct !== undefined ? { singleProduct: body.singleProduct } : {}),
        ...(body.shopName ? { shopName: body.shopName } : {}),
        ...(body.locale ? { locale: body.locale } : {}),
      },
    });
    
    return NextResponse.json(updated);
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}