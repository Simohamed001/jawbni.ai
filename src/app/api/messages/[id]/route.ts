import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantId, unauthorizedResponse } from "@/lib/api-auth";

/**
 * PATCH /api/messages/[id]
 * ربط رسالة بمدينة شحن أو إلغاء ربطها.
 * body: { cityId: string | null }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { merchantId } = await requireMerchantId();
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const cityId: string | null =
      body?.cityId === null || body?.cityId === "" ? null : body?.cityId;

    if (cityId) {
      const city = await prisma.deliveryCity.findUnique({
        where: { id: cityId },
      });
      if (!city || !city.isActive) {
        return NextResponse.json(
          { error: "مدينة شحن غير صالحة" },
          { status: 400 },
        );
      }
    }

    const message = await prisma.message.findFirst({
      where: { id, merchantId },
    });
    if (!message) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }

    const updated = await prisma.message.update({
      where: { id },
      data: { cityId },
      include: { city: true },
    });

    return NextResponse.json(updated);
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}
