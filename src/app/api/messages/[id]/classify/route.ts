import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireMerchantId,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { classifyMessage, classifyVoiceMessage } from "@/lib/ai/classifier";
import { getFullAudioPath } from "@/lib/audio";
import { existsSync } from "fs";
import { detectAdditionalClassifications, type ClassificationLike } from "@/lib/ai/additional-classifier";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { merchantId } = await requireMerchantId();
    const { id } = await params;

    const message = await prisma.message.findFirst({
      where: { id, merchantId },
    });

    if (!message) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }

    const audioFullPath = message.audioPath
      ? getFullAudioPath(message.audioPath)
      : null;

    let transcription = message.transcription;
    let result;

    if (
      message.messageType === "voice" &&
      audioFullPath &&
      existsSync(audioFullPath)
    ) {
      const voiceResult = await classifyVoiceMessage(merchantId, audioFullPath);
      if (voiceResult.transcription) {
        transcription = voiceResult.transcription;
        result = voiceResult.classification;
      } else if (message.transcription) {
        result = await classifyMessage(merchantId, message.transcription);
      } else {
        result = voiceResult.classification;
      }
    } else {
      const text =
        message.messageType === "voice"
          ? message.transcription || message.body
          : message.body;
      result = await classifyMessage(merchantId, text);
    }

    const additionalClassifications = await detectAdditionalClassifications(
      merchantId,
      transcription || message.body,
      result as ClassificationLike,
    );

    // Use the additional intents from the main classifier or the additional classifier
    // detectAdditionalClassifications already returns the main classifier's additionalIntents if they exist
    let allAdditionalIntents = additionalClassifications;

    // Deduplication validation: remove duplicate intents based on mainCategory, subCategory, and productName
    if (allAdditionalIntents.length > 0) {
      const seen = new Set<string>();
      allAdditionalIntents = allAdditionalIntents.filter(intent => {
        const key = `${intent.mainCategoryId}-${intent.subCategoryId}-${intent.productName}`;
        if (seen.has(key)) {
          console.log(`[API] Removed duplicate intent: ${intent.mainCategoryName}/${intent.subCategoryName}/${intent.productName}`);
          return false;
        }
        seen.add(key);
        return true;
      });
    }

    const updated = await prisma.message.update({
      where: { id },
      data: {
        status: "classified",
        // لا نمسح ربطاً يدوياً موجوداً — نحدّث المدينة فقط إذا تعرف عليها Gemini
        ...(result.cityId ? { cityId: result.cityId } : {}),
        additionalClassifications: allAdditionalIntents.length
          ? JSON.stringify(allAdditionalIntents)
          : null,
        ...(transcription
          ? { transcription, body: transcription }
          : {}),
        classification: {
          upsert: {
            create: {
              mainCategoryId: result.mainCategoryId,
              subCategoryId: result.subCategoryId,
              productName: result.productName,
              rawAiResponse: result.rawAiResponse,
            },
            update: {
              mainCategoryId: result.mainCategoryId,
              subCategoryId: result.subCategoryId,
              productName: result.productName,
              rawAiResponse: result.rawAiResponse,
            },
          },
        },
      },
      include: {
        classification: {
          include: { mainCategory: true, subCategory: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { merchantId } = await requireMerchantId();
    const { id } = await params;
    const { transcription } = await request.json();

    const message = await prisma.message.findFirst({
      where: { id, merchantId, messageType: "voice" },
    });

    if (!message) {
      return NextResponse.json({ error: "غير موجود" }, { status: 404 });
    }

    const body = transcription || message.body;
    const result = await classifyMessage(merchantId, body);
    const additionalClassifications = await detectAdditionalClassifications(
      merchantId,
      body,
      result as ClassificationLike,
    );

    // Use the additional intents from the main classifier or the additional classifier
    // detectAdditionalClassifications already returns the main classifier's
    // additionalIntents when they exist — combining both here would duplicate them
    let allAdditionalIntents = additionalClassifications;

    // Deduplication validation: remove duplicate intents based on mainCategory, subCategory, and productName
    // (same rule as POST /api/messages)
    if (allAdditionalIntents.length > 0) {
      const seen = new Set<string>();
      allAdditionalIntents = allAdditionalIntents.filter(intent => {
        const key = `${intent.mainCategoryId}-${intent.subCategoryId}-${intent.productName}`;
        if (seen.has(key)) {
          console.log(`[API] Removed duplicate intent: ${intent.mainCategoryName}/${intent.subCategoryName}/${intent.productName}`);
          return false;
        }
        seen.add(key);
        return true;
      });
    }

    const updated = await prisma.message.update({
      where: { id },
      data: {
        // تحديث المدينة فقط إذا تعرف عليها Gemini (وإلا نبقي الربط الحالي)
        ...(result.cityId ? { cityId: result.cityId } : {}),
        transcription,
        body: transcription || "🎤 رسالة صوتية",
        additionalClassifications: allAdditionalIntents.length
          ? JSON.stringify(allAdditionalIntents)
          : null,
        classification: {
          upsert: {
            create: {
              mainCategoryId: result.mainCategoryId,
              subCategoryId: result.subCategoryId,
              productName: result.productName,
              rawAiResponse: result.rawAiResponse,
            },
            update: {
              mainCategoryId: result.mainCategoryId,
              subCategoryId: result.subCategoryId,
              productName: result.productName,
              rawAiResponse: result.rawAiResponse,
            },
          },
        },
      },
      include: {
        classification: {
          include: { mainCategory: true, subCategory: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}
