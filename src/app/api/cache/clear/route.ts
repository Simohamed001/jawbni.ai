import { NextResponse } from "next/server";
import { classificationCache, audioCache } from "@/lib/ai/cache";
import { requireMerchantId, unauthorizedResponse } from "@/lib/api-auth";

export async function POST() {
  try {
    await requireMerchantId();
    
    classificationCache.clear();
    audioCache.clear();
    
    return NextResponse.json({ 
      success: true, 
      message: "تم مسح الـ cache بنجاح" 
    });
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}
