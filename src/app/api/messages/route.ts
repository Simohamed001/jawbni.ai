import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  badRequest,
  requireMerchantId,
  unauthorizedResponse,
} from "@/lib/api-auth";
import {
  classifyMessage,
  classifyVoiceMessage,
  reviewFallback,
} from "@/lib/ai/classifier";
import { saveAudioFile } from "@/lib/audio";
import { UNDEFINED_LABEL } from "@/lib/utils";
import {
  detectAdditionalClassifications,
  hasMultipleQuestions,
} from "@/lib/ai/additional-classifier";

export async function GET(request: NextRequest) {
  try {
    const { merchantId } = await requireMerchantId();
    const { searchParams } = new URL(request.url);
    const mainCategoryId = searchParams.get("mainCategoryId");
    const subCategoryId = searchParams.get("subCategoryId");
    const productName = searchParams.get("productName");
    const q = searchParams.get("q");

    const messages = await prisma.message.findMany({
      where: {
        merchantId,
        ...(q
          ? {
              OR: [
                { body: { contains: q } },
                { customerName: { contains: q } },
                { transcription: { contains: q } },
              ],
            }
          : {}),
        ...(mainCategoryId
          ? {
              OR: [
                {
                  classification: {
                    mainCategoryId,
                    ...(subCategoryId ? { subCategoryId } : {}),
                    ...(productName
                      ? productName === UNDEFINED_LABEL
                        ? { productName: UNDEFINED_LABEL }
                        : { productName }
                      : {}),
                  },
                },
                {
                  additionalClassifications: {
                    contains: mainCategoryId,
                  },
                },
              ],
            }
          : {}),
      },
      include: {
        classification: {
          include: {
            mainCategory: true,
            subCategory: true,
          },
        },
      },
      orderBy: { receivedAt: "desc" },
    });

    const filteredMessages = mainCategoryId
      ? messages.filter((message) =>
          getMessageClassifications(message).some(
            (item) =>
              item.mainCategoryId === mainCategoryId &&
              (!subCategoryId || item.subCategoryId === subCategoryId) &&
              (!productName || item.productName === productName),
          ),
        )
      : messages;

    return NextResponse.json(
      filteredMessages.map((message) => ({
        ...message,
        additionalClassifications: parseAdditionalClassifications(
          message.additionalClassifications,
          message.transcription || message.body,
        ),
      })),
    );
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { merchantId } = await requireMerchantId();
    const contentType = request.headers.get("content-type") || "";
    const CLASSIFY_TIMEOUT_MS = Number(process.env.CLASSIFY_TIMEOUT_MS || 120_000);

    let customerName = "زبون";
    let body = "";
    let messageType: "text" | "voice" = "text";
    let audioPath: string | null = null;
    let transcription: string | null = null;
    let source: "demo" | "manual" = "manual";
    let classification: Awaited<ReturnType<typeof classifyMessage>> | null = null;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      customerName = String(form.get("customerName") || "زبون");
      messageType = form.get("messageType") === "voice" ? "voice" : "text";
      const manualTranscription = form.get("transcription")
        ? String(form.get("transcription")).trim()
        : "";
      source = form.get("source") === "demo" ? "demo" : "manual";

      if (messageType === "voice") {
        const audioFile = form.get("audio") as File | null;
        if (!audioFile || audioFile.size === 0) {
          return badRequest("ملف الصوت مطلوب");
        }
        const saved = await saveAudioFile(audioFile);
        audioPath = saved.audioPath;

        const voiceResult = await classifyVoiceMessage(merchantId, saved.fullPath);
        transcription = voiceResult.transcription || manualTranscription || null;
        body = transcription || "🎤 رسالة صوتية";
        classification =
          voiceResult.transcription
            ? voiceResult.classification
            : manualTranscription
              ? await classifyMessage(merchantId, manualTranscription)
              : voiceResult.classification;
      } else {
        body = String(form.get("body") || "");
      }
    } else {
      const json = await request.json();
      customerName = json.customerName || "زبون";
      body = json.body || "";
      messageType = json.messageType === "voice" ? "voice" : "text";
      transcription = json.transcription || null;
      audioPath = json.audioPath || null;
      source = json.source === "demo" ? "demo" : "manual";

      if (messageType === "voice") {
        body = transcription || body || "🎤 رسالة صوتية";
      }
    }

    if (!body.trim() && messageType === "text") {
      return badRequest("نص الرسالة مطلوب");
    }

    if (!classification) {
      if (messageType === "voice" && !transcription) {
        classification = await reviewFallback(merchantId);
      } else {
        const classificationPromise = classifyMessage(
          merchantId,
          messageType === "voice" ? transcription || body : body,
        );
        classification = await Promise.race([
          classificationPromise,
          new Promise<Awaited<ReturnType<typeof classifyMessage>>>((resolve) =>
            setTimeout(
              async () => resolve(await reviewFallback(merchantId)),
              CLASSIFY_TIMEOUT_MS,
            ),
          ),
        ]);
      }
    }

    const additionalClassifications = await detectAdditionalClassifications(
      merchantId,
      messageType === "voice" ? transcription || body : body,
      classification,
    );

    const message = await prisma.message.create({
      data: {
        merchantId,
        customerName,
        body,
        messageType,
        audioPath,
        transcription,
        source,
        status: "classified",
        additionalClassifications: additionalClassifications.length
          ? JSON.stringify(additionalClassifications)
          : null,
        classification: {
          create: {
            mainCategoryId: classification.mainCategoryId,
            subCategoryId: classification.subCategoryId,
            productName: classification.productName,
            rawAiResponse: classification.rawAiResponse,
          },
        },
      },
      include: {
        classification: {
          include: { mainCategory: true, subCategory: true },
        },
      },
    });

    return NextResponse.json(message, { status: 201 });
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json(
      { error: (e as Error).message || "خطأ" },
      { status: 500 },
    );
  }
}

function parseAdditionalClassifications(value: string | null, text: string) {
  if (!value || !hasMultipleQuestions(text)) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function getMessageClassifications(message: {
  body: string;
  transcription: string | null;
  classification: {
    mainCategoryId: string;
    subCategoryId: string | null;
    productName: string;
  } | null;
  additionalClassifications: string | null;
}) {
  const primary = message.classification ? [message.classification] : [];
  if (!hasMultipleQuestions(message.transcription || message.body)) return primary;
  try {
    return primary.concat(JSON.parse(message.additionalClassifications || "[]"));
  } catch {
    return primary;
  }
}
