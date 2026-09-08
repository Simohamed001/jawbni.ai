import { prisma } from "@/lib/prisma";
import { getReviewCategory } from "@/lib/categories";
import {
  buildSystemPrompt,
  buildVoiceSystemPrompt,
  classificationSchema,
  matchCategoryId,
  matchCityId,
  findCityInText,
  type MerchantContext,
} from "@/lib/ai/prompt";
import { UNDEFINED_LABEL } from "@/lib/utils";
import {
  generateTextContent,
} from "@/lib/ai/gemini-rotation";
import { transcribeAudio, generateFromVoicePrompt } from "@/lib/ai/transcribe";
import { classificationCache, audioCache } from "@/lib/ai/cache";

export { transcribeAudio };

async function loadMerchantContext(merchantId: string): Promise<MerchantContext> {
  const [mainCategories, subCategories, products, review, merchant, deliveryCities] =
    await Promise.all([
    prisma.mainCategory.findMany({
      where: { merchantId },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true },
    }),
    prisma.subCategory.findMany({
      where: { merchantId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        mainCategoryId: true,
        mainCategory: { select: { name: true } },
      },
    }),
    prisma.product.findMany({
      where: { merchantId, isSold: true },
      select: { officialName: true, keywords: true },
    }),
    getReviewCategory(merchantId),
    prisma.merchantProfile.findUnique({
      where: { id: merchantId },
      select: { singleProduct: true },
    }),
    prisma.deliveryCity.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return {
    mainCategories,
    subCategories: subCategories.map((s) => ({
      id: s.id,
      name: s.name,
      mainCategoryId: s.mainCategoryId,
      mainCategoryName: s.mainCategory?.name ?? null,
    })),
    products: products.map((p) => ({
      officialName: p.officialName,
      keywords: JSON.parse(p.keywords || "[]") as string[],
    })),
    reviewCategoryName: review.name,
    singleProduct: merchant?.singleProduct || false,
    deliveryCities,
  };
}

function formatProducts(products: MerchantContext["products"]) {
  if (products.length === 0) return "";
  return products
    .map((p) => {
      const kw = p.keywords.length ? ` (${p.keywords.join(", ")})` : "";
      return `- ${p.officialName}${kw}`;
    })
    .join("\n");
}

export async function classifyMessage(merchantId: string, messageText: string) {
  // Check cache first
  const cachedResult = classificationCache.get(messageText, merchantId);
  if (cachedResult) {
    console.log("[Text Classification] Cache hit for message:", messageText.substring(0, 50));
    return cachedResult;
  }

  const ctx = await loadMerchantContext(merchantId);
  const reviewCategory = await getReviewCategory(merchantId);
  const formattedProducts = formatProducts(ctx.products);
  const systemPrompt = buildSystemPrompt(ctx, formattedProducts, messageText);

  let parsed = {
    mainCategory: reviewCategory.name,
    subCategory: UNDEFINED_LABEL,
    product: UNDEFINED_LABEL,
    deliveryCity: UNDEFINED_LABEL as string,
  };
  let rawAiResponse: string | null = null;

  if (messageText.trim()) {
    // Skip classification for voice messages without actual text
    const lower = messageText.toLowerCase();
    if (lower.includes("🎤 رسالة صوتية") || lower === "🎤 رسالة صوتية") {
      // Voice messages without transcription go to review category
      console.log("[Text Classification] Voice message placeholder detected, using review category");
      const result = {
        mainCategoryId: ctx.mainCategories.find(c => c.name === "رسائل تحتاج مراجعة")?.id || ctx.mainCategories[0]?.id || "",
        subCategoryId: null,
        productName: UNDEFINED_LABEL,
        rawAiResponse: null,
        mainCategoryName: "رسائل تحتاج مراجعة",
        subCategoryName: UNDEFINED_LABEL,
      };
      // Cache the result
      classificationCache.set(messageText, merchantId, { ...result, cityId: null });
      return { ...result, cityId: null };
    }

    try {
      console.log("[Text Classification] Attempting Gemini classification for:", messageText.substring(0, 100));
      const result = await generateTextContent(systemPrompt);
      const raw = result.response.text();
      rawAiResponse = raw;
      console.log("[Text Classification] FULL Gemini raw response:", rawAiResponse);
      console.log("[Text Classification] Gemini raw response parsed JSON:", extractJsonObject(rawAiResponse));

      const json = extractJsonObject(rawAiResponse);
      if (json) {
        parsed = classificationSchema.parse({
          mainCategory:
            typeof json.mainCategory === "string"
              ? json.mainCategory
              : reviewCategory.name,
          subCategory:
            typeof json.subCategory === "string"
              ? json.subCategory
              : UNDEFINED_LABEL,
          product:
            typeof json.product === "string"
              ? json.product
              : UNDEFINED_LABEL,
          deliveryCity:
            typeof json.deliveryCity === "string" &&
            json.deliveryCity !== UNDEFINED_LABEL
              ? json.deliveryCity
              : UNDEFINED_LABEL,
        });
        console.log("[Text Classification] Successfully parsed Gemini classification:", parsed);
      } else {
        console.warn("[Text Classification] No JSON found in Gemini response");
      }
    } catch (error) {
      console.error("[Text Classification] Gemini classification error:", error);
      console.log(
        "[Text Classification] Keeping the review category because AI classification failed",
      );
    }

    // Override: نصوّب ناتج AI فقط إذا كان التصنيف غير موجود أصلاً في قاعدة البيانات
    // (مثلاً Gemini يرجع شيرو غير معروف). لا نلغي تصنيف AI صحيح فقط لأنه يختلف عن الكلمات المفتاحية.
    const aiCategory = parsed.mainCategory;
    const aiCategoryId = matchCategoryId(aiCategory, ctx.mainCategories);
    const aiCategoryInvalid = aiCategoryId === null;

    if (aiCategoryInvalid) {
      console.log(
        `[Text Classification] AI category '${aiCategory}' not found in DB; using review category`,
      );
      parsed = {
        mainCategory: reviewCategory.name,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
        deliveryCity: UNDEFINED_LABEL,
      };
      rawAiResponse = null;
    }
  } else {
    console.log("[Text Classification] Empty message text, using review category");
  }

  // ربط المدينة تلقائياً: ناتج Gemini أولاً، ثم بحث نصي داخل الرسالة كشبكة أمان
  const baseClassification = mapParsedClassification(
    parsed,
    ctx,
    reviewCategory,
    rawAiResponse,
  );
  const aiCityId =
    parsed.deliveryCity && parsed.deliveryCity !== UNDEFINED_LABEL
      ? matchCityId(parsed.deliveryCity, ctx.deliveryCities)
      : null;
  const cityId =
    aiCityId ?? findCityInText(messageText, ctx.deliveryCities);
  let result = { ...baseClassification, cityId };
  if (cityId) {
    console.log(
      `[Text Classification] Linked delivery city: ${ctx.deliveryCities.find((c) => c.id === cityId)?.name}`,
    );
  }
  const returnsCategory = ctx.mainCategories.find((category) => category.name === "المرتجعات");
  if (returnsCategory && /رجع|ارجاع|إرجاع|مرتجع|استبدال|nrj3|nرجع|return|retour/i.test(messageText)) {
    result = {
      ...result,
      mainCategoryId: returnsCategory.id,
      mainCategoryName: returnsCategory.name,
      subCategoryId: null,
      subCategoryName: UNDEFINED_LABEL,
    };
  }

  // Cache the result
  classificationCache.set(messageText, merchantId, result);

  return result;
}

function mapParsedClassification(
  parsed: { mainCategory: string; subCategory: string; product: string },
  ctx: MerchantContext,
  reviewCategory: { id: string; name: string },
  rawAiResponse: string | null,
) {
  const mainCategoryId =
    matchCategoryId(parsed.mainCategory, ctx.mainCategories) ?? reviewCategory.id;

  const mainCategory = ctx.mainCategories.find((c) => c.id === mainCategoryId);
  const subsForMain = ctx.subCategories.filter(
    (s) => s.mainCategoryId === mainCategoryId,
  );

  let subCategoryId: string | null = null;
  if (parsed.subCategory !== UNDEFINED_LABEL) {
    subCategoryId = matchCategoryId(parsed.subCategory, subsForMain);
  }

  return {
    mainCategoryId,
    subCategoryId,
    productName: ctx.singleProduct ? UNDEFINED_LABEL : parsed.product || UNDEFINED_LABEL,
    rawAiResponse,
    mainCategoryName: mainCategory?.name ?? reviewCategory.name,
    subCategoryName: subCategoryId
      ? subsForMain.find((s) => s.id === subCategoryId)?.name ?? UNDEFINED_LABEL
      : UNDEFINED_LABEL,
  };
}

export async function reviewFallback(merchantId: string) {
  const reviewCategory = await getReviewCategory(merchantId);
  return {
    mainCategoryId: reviewCategory.id,
    subCategoryId: null,
    productName: UNDEFINED_LABEL,
    rawAiResponse: null,
    mainCategoryName: reviewCategory.name,
    subCategoryName: UNDEFINED_LABEL,
    cityId: null as string | null,
  };
}

export async function classifyVoiceMessage(
  merchantId: string,
  audioFilePath: string,
) {
  // Check audio cache first
  const cachedAudio = audioCache.get(audioFilePath, merchantId);
  if (cachedAudio) {
    console.log("[Voice Classification] Audio cache hit for:", audioFilePath);
    return {
      transcription: cachedAudio.transcription,
      classification: cachedAudio.classification,
    };
  }

  const ctx = await loadMerchantContext(merchantId);
  const reviewCategory = await getReviewCategory(merchantId);
  const formattedProducts = formatProducts(ctx.products);
  const voicePrompt = buildVoiceSystemPrompt(ctx, formattedProducts);

  console.log("[Voice Classification] Attempting direct Gemini voice classification");

  // محاولة التصنيف الصوتي المباشر (Gemini يسمع ويصنّف في خطوة واحدة)
  try {
    const voiceResult = await generateFromVoicePrompt(audioFilePath, voicePrompt);
    const json = voiceResult.json;
    const transcription = json && typeof json.transcription === "string" ? json.transcription : null;
    const parsedTranscription = transcription ? normalizeTranscriptForVoice(transcription) : null;

    const parsed = json
      ? {
          mainCategory:
            typeof json.mainCategory === "string" ? json.mainCategory : reviewCategory.name,
          subCategory:
            typeof json.subCategory === "string" ? json.subCategory : UNDEFINED_LABEL,
          product:
            typeof json.product === "string" ? json.product : UNDEFINED_LABEL,
          deliveryCity:
            typeof json.deliveryCity === "string" && json.deliveryCity !== UNDEFINED_LABEL
              ? json.deliveryCity
              : UNDEFINED_LABEL,
        }
      : null;

    if (parsed && parsedTranscription) {
      console.log("[Voice Classification] Direct voice classification succeeded:", parsed);
      const voiceCityId =
        (parsed.deliveryCity && parsed.deliveryCity !== UNDEFINED_LABEL
          ? matchCityId(parsed.deliveryCity, ctx.deliveryCities)
          : null) ?? findCityInText(parsedTranscription, ctx.deliveryCities);
      const classification = {
        ...mapParsedClassification(parsed, ctx, reviewCategory, voiceResult.raw),
        cityId: voiceCityId,
      };
      classificationCache.set(parsedTranscription, merchantId, classification);
      audioCache.set(audioFilePath, merchantId, parsedTranscription, classification);
      return {
        transcription: parsedTranscription,
        classification,
      };
    }
  } catch (voiceError) {
    console.error("[Voice Classification] Direct voice classification failed:", voiceError);
  }

  // Fallback: تصنيف عبر تفريغ صوتي ثم تصنيف نصي
  console.log("[Voice Classification] Transcribing voice message with Gemini");
  const transcription = await transcribeAudio(audioFilePath);
  console.log("[Voice Classification] Transcription result:", {
    hasTranscription: !!transcription,
    length: transcription?.length,
  });

  if (!transcription) {
    console.log("[Voice Classification] No transcription available, using review fallback");
    const classification = await reviewFallback(merchantId);
    audioCache.set(audioFilePath, merchantId, null, classification);
    return { transcription: null, classification };
  }

  // تصنيف النص المفرّغ (يستعمل cache تلقائياً)
  console.log("[Voice Classification] Classifying transcribed text with Gemini");
  let classification = await classifyMessage(merchantId, transcription);
  console.log("[Voice Classification] Gemini text classification result:", {
    mainCategory: classification.mainCategoryName,
    subCategory: classification.subCategoryName,
    productName: classification.productName,
  });

  // تخزين النتيجة الصوتية في cache
  classificationCache.set(transcription, merchantId, classification);
  audioCache.set(audioFilePath, merchantId, transcription, classification);

  return { transcription, classification };
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeTranscriptForVoice(text: string): string | null {
  const cleaned = text
    .replace(/^```[\w]*\n?|\n?```$/g, "")
    .replace(/^["«»]|["«»]$/g, "")
    .trim();
  if (!cleaned) return null;
  if (/^🎤?\s*رسالة صوتية/.test(cleaned)) return null;
  return cleaned;
}