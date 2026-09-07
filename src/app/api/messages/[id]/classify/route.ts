import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireMerchantId,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { classifyMessage, classifyVoiceMessage } from "@/lib/ai/classifier";
import { getFullAudioPath } from "@/lib/audio";
import { existsSync } from "fs";

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

    const updated = await prisma.message.update({
      where: { id },
      data: {
        status: "classified",
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

    const updated = await prisma.message.update({
      where: { id },
      data: {
        transcription,
        body: transcription || "🎤 رسالة صوتية",
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
