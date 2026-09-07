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
                    contains: productName && productName !== UNDEFINED_LABEL
                      ? productName
                      : mainCategoryId,
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

    return NextResponse.json(
      messages.map((message) => ({
        ...message,
        additionalClassifications: parseAdditionalClassifications(
          message.additionalClassifications,
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

async function detectAdditionalClassifications(
  merchantId: string,
  text: string,
  primary: Awaited<ReturnType<typeof classifyMessage>>,
) {
  const [categories, products] = await Promise.all([
    prisma.mainCategory.findMany({ where: { merchantId }, select: { id: true, name: true } }),
    prisma.product.findMany({ where: { merchantId, isSold: true }, select: { officialName: true, keywords: true } }),
  ]);
  const lower = text.toLowerCase();
  const results: typeof primary[] = [];
  const add = (value: typeof primary) => {
    if (value.mainCategoryId === primary.mainCategoryId && value.productName === primary.productName) return;
    if (!results.some((item) => item.mainCategoryId === value.mainCategoryId && item.productName === value.productName)) results.push(value);
  };
  const shipping = categories.find((category) => category.name === "الشحن والتوصيل");
  if (shipping && /(توصيل|الشحن|شحن|استلام|livraison|shipping|delivery)/i.test(lower)) {
    add({ mainCategoryId: shipping.id, subCategoryId: null, productName: UNDEFINED_LABEL, rawAiResponse: null, mainCategoryName: shipping.name, subCategoryName: UNDEFINED_LABEL });
  }
  for (const category of categories) {
    if (category.id !== primary.mainCategoryId && category.id !== shipping?.id && category.name !== "أسئلة عن المنتج" && lower.includes(category.name.toLowerCase())) {
      add({ mainCategoryId: category.id, subCategoryId: null, productName: UNDEFINED_LABEL, rawAiResponse: null, mainCategoryName: category.name, subCategoryName: UNDEFINED_LABEL });
    }
  }
  const productCategory = categories.find((category) => category.name === "أسئلة عن المنتج");
  const isQuestion = /[؟?]|واش|هل|كيف|شنو|شحال|كم|متى|فين|بغيت|رجع|ارجاع|إرجاع|مرتجع|استبدال|nrj3|return|retour|what|how|when|price|combien/i.test(lower);
  if (productCategory && isQuestion) {
    for (const product of products) {
      const keywords = JSON.parse(product.keywords || "[]") as string[];
      const aiProductText = primary.productName.toLowerCase();
      if ([product.officialName, ...keywords].some((term) =>
        term.trim() && (lower.includes(term.toLowerCase()) || aiProductText.includes(term.toLowerCase()))
      )) {
        add({ mainCategoryId: productCategory.id, subCategoryId: null, productName: product.officialName, rawAiResponse: null, mainCategoryName: productCategory.name, subCategoryName: UNDEFINED_LABEL });
      }
    }
  }
  return results;
}

function parseAdditionalClassifications(value: string | null) {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}
