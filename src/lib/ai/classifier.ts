import { prisma } from "@/lib/prisma";
import { getReviewCategory } from "@/lib/categories";
import {
  buildSystemPrompt,
  buildVoiceSystemPrompt,
  classificationSchema,
  matchCategoryId,
  matchCityId,
  findCityInText,
  citiesBlock,
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

export async function classifyMessage(merchantId: string, messageText: string): Promise<{
  mainCategoryId: string;
  subCategoryId: string | null;
  productName: string;
  rawAiResponse: string | null;
  mainCategoryName: string;
  subCategoryName: string;
  cityId: string | null;
  additionalIntents?: Array<{
    mainCategoryId: string;
    mainCategoryName: string;
    subCategoryId: string | null;
    subCategoryName: string;
    productName: string;
    cityId: string | null;
    rawAiResponse: string | null;
    inferredByAi?: boolean;
  }>;
}> {
  // Check cache first
  const cachedResult = classificationCache.get(messageText, merchantId);
  if (cachedResult) {
    console.log("[Text Classification] Cache hit for message:", messageText.substring(0, 50));
    return cachedResult;
  }

  const ctx = await loadMerchantContext(merchantId);
  const reviewCategory = await getReviewCategory(merchantId);
  const formattedProducts = formatProducts(ctx.products);
  const citiesBlockText = citiesBlock(ctx);
  const systemPrompt = buildSystemPrompt(ctx, formattedProducts, citiesBlockText, messageText);

  let parsed = {
    intents: [
      {
        mainCategory: reviewCategory.name,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
        deliveryCity: UNDEFINED_LABEL as string,
      }
    ]
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
      const result = await generateTextContent(systemPrompt, true);
      const raw = result.response.text();
      rawAiResponse = raw;
      console.log("[Text Classification] FULL Gemini raw response:", rawAiResponse);
      console.log("[Text Classification] Gemini raw response parsed JSON:", extractJsonObject(rawAiResponse));

      const json = extractJsonObject(rawAiResponse);
      if (json && Array.isArray(json.intents) && json.intents.length > 0) {
        parsed = classificationSchema.parse({
          intents: json.intents.map((intent: any) => ({
            mainCategory:
              typeof intent.mainCategory === "string"
                ? intent.mainCategory
                : reviewCategory.name,
            subCategory:
              typeof intent.subCategory === "string"
                ? intent.subCategory
                : UNDEFINED_LABEL,
            product:
              typeof intent.product === "string"
                ? intent.product
                : UNDEFINED_LABEL,
            deliveryCity:
              typeof intent.deliveryCity === "string" &&
              intent.deliveryCity !== UNDEFINED_LABEL
                ? intent.deliveryCity
                : UNDEFINED_LABEL,
          }))
        });
        console.log("[Text Classification] Successfully parsed Gemini classification:", parsed);
      } else {
        console.warn("[Text Classification] No valid intents array found in Gemini response");
      }
    } catch (error) {
      console.error("[Text Classification] Gemini classification error:", error);
      console.log(
        "[Text Classification] Keeping the review category because AI classification failed",
      );
    }

    // Override: نصوّب ناتج AI فقط إذا كان التصنيف غير موجود أصلاً في قاعدة البيانات
    // (مثلاً Gemini يرجع شيرو غير معروف). لا نلغي تصنيف AI صحيح فقط لأنه يختلف عن الكلمات المفتاحية.
    const primaryIntent = parsed.intents[0];
    const aiCategory = primaryIntent.mainCategory;
    const aiCategoryId = matchCategoryId(aiCategory, ctx.mainCategories);
    const aiCategoryInvalid = aiCategoryId === null;

    if (aiCategoryInvalid) {
      console.log(
        `[Text Classification] AI category '${aiCategory}' not found in DB; using review category`,
      );
      parsed = {
        intents: [
          {
            mainCategory: reviewCategory.name,
            subCategory: UNDEFINED_LABEL,
            product: UNDEFINED_LABEL,
            deliveryCity: UNDEFINED_LABEL,
          }
        ]
      };
      rawAiResponse = null;
    }
  } else {
    console.log("[Text Classification] Empty message text, using review category");
  }

  // ربط المدينة تلقائياً: ناتج Gemini أولاً، ثم بحث نصي داخل الرسالة كشبكة أمان
  const primaryIntent = parsed.intents[0];
  const baseClassification = mapParsedClassification(
    primaryIntent,
    ctx,
    reviewCategory,
    rawAiResponse,
  );

  // Use the delivery city from the primary intent if it's specified
  let cityId: string | null = null;
  if (primaryIntent.deliveryCity && primaryIntent.deliveryCity !== UNDEFINED_LABEL) {
    cityId = matchCityId(primaryIntent.deliveryCity, ctx.deliveryCities);
  }

  // Fallback: search for city in the full message text
  if (!cityId) {
    cityId = findCityInText(messageText, ctx.deliveryCities);
  }

  let result = { ...baseClassification, cityId };
  if (cityId) {
    console.log(
      `[Text Classification] Linked delivery city: ${ctx.deliveryCities.find((c) => c.id === cityId)?.name}`,
    );
  }
  result = await applyShippingCitySubCategory(merchantId, ctx, result);
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

  // Add additional intents to the result, preserving their delivery cities
  const additionalIntents = parsed.intents.slice(1).map(intent => {
    const intentCategoryId = matchCategoryId(intent.mainCategory, ctx.mainCategories);
    const intentCategory = ctx.mainCategories.find(c => c.id === intentCategoryId);
    const subsForIntent = intentCategory ? ctx.subCategories.filter(s => s.mainCategoryId === intentCategoryId) : [];
    let intentSubCategoryId: string | null = null;
    if (intent.subCategory !== UNDEFINED_LABEL) {
      intentSubCategoryId = matchCategoryId(intent.subCategory, subsForIntent);
    }

    // Preserve the delivery city from the intent if it's specified
    let intentCityId: string | null = null;
    if (intent.deliveryCity && intent.deliveryCity !== UNDEFINED_LABEL) {
      intentCityId = matchCityId(intent.deliveryCity, ctx.deliveryCities);
    }

    return {
      mainCategoryId: intentCategoryId || reviewCategory.id,
      mainCategoryName: intentCategory?.name || reviewCategory.name,
      subCategoryId: intentSubCategoryId,
      subCategoryName: intentSubCategoryId
        ? subsForIntent.find(s => s.id === intentSubCategoryId)?.name || UNDEFINED_LABEL
        : UNDEFINED_LABEL,
      productName: ctx.singleProduct ? UNDEFINED_LABEL : intent.product || UNDEFINED_LABEL,
      cityId: intentCityId, // Preserve the city from the intent
      rawAiResponse,
      inferredByAi: true,
    };
  });

  // Include additional intents in the result
  result = { ...result, additionalIntents } as any;

  // Cache the result
  classificationCache.set(messageText, merchantId, result);

  return result;
}

const SHIPPING_CATEGORY_NAME = "الشحن والتوصيل";

// المدينة تصبح القسم الفرعي الفعلي لرسائل الشحن والتوصيل — لا يوجد تصنيف يدوي،
// كل شيء يمر عبر Gemini. إذا لم تُذكر مدينة، تبقى الرسالة تحت "غير محدد" فعلاً.
async function applyShippingCitySubCategory<
  T extends { mainCategoryId: string; subCategoryId: string | null; subCategoryName: string; cityId: string | null },
>(merchantId: string, ctx: MerchantContext, result: T): Promise<T> {
  const shippingCategory = ctx.mainCategories.find((c) => c.name === SHIPPING_CATEGORY_NAME);
  if (!shippingCategory || result.mainCategoryId !== shippingCategory.id) {
    return result;
  }

  if (!result.cityId) {
    return { ...result, subCategoryId: null, subCategoryName: UNDEFINED_LABEL };
  }

  const city = ctx.deliveryCities.find((c) => c.id === result.cityId);
  if (!city) {
    return { ...result, subCategoryId: null, subCategoryName: UNDEFINED_LABEL };
  }

  const subCategory = await prisma.subCategory.upsert({
    where: {
      merchantId_name_mainCategoryId: {
        merchantId,
        name: city.name,
        mainCategoryId: shippingCategory.id,
      },
    },
    update: {},
    create: {
      merchantId,
      mainCategoryId: shippingCategory.id,
      name: city.name,
      sortOrder: 0,
    },
  });

  return { ...result, subCategoryId: subCategory.id, subCategoryName: subCategory.name };
}

function mapParsedClassification(
  parsed: { mainCategory: string; subCategory: string; product: string },
  ctx: MerchantContext,
  reviewCategory: { id: string; name: string },
  rawAiResponse: string | null,
): {
  mainCategoryId: string;
  subCategoryId: string | null;
  productName: string;
  rawAiResponse: string | null;
  mainCategoryName: string;
  subCategoryName: string;
} {
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
    additionalIntents: [],
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
  const citiesBlockText = citiesBlock(ctx);
  const voicePrompt = buildVoiceSystemPrompt(ctx, formattedProducts, citiesBlockText);

  console.log("[Voice Classification] Attempting direct Gemini voice classification");

  // محاولة التصنيف الصوتي المباشر (Gemini يسمع ويصنّف في خطوة واحدة)
  try {
    const voiceResult = await generateFromVoicePrompt(audioFilePath, voicePrompt);
    const json = voiceResult.json;
    const transcription = json && typeof json.transcription === "string" ? json.transcription : null;
    const parsedTranscription = transcription ? normalizeTranscriptForVoice(transcription) : null;

    let parsed = null;
    if (json && Array.isArray(json.intents) && json.intents.length > 0) {
      parsed = {
        intents: json.intents.map((intent: any) => ({
          mainCategory:
            typeof intent.mainCategory === "string" ? intent.mainCategory : reviewCategory.name,
          subCategory:
            typeof intent.subCategory === "string" ? intent.subCategory : UNDEFINED_LABEL,
          product:
            typeof intent.product === "string" ? intent.product : UNDEFINED_LABEL,
          deliveryCity:
            typeof intent.deliveryCity === "string" && intent.deliveryCity !== UNDEFINED_LABEL
              ? intent.deliveryCity
              : UNDEFINED_LABEL,
        }))
      };
    }

    if (parsed && parsedTranscription) {
      console.log("[Voice Classification] Direct voice classification succeeded:", parsed);
      const primaryIntent = parsed.intents[0];
      const voiceCityId =
        (primaryIntent.deliveryCity && primaryIntent.deliveryCity !== UNDEFINED_LABEL
          ? matchCityId(primaryIntent.deliveryCity, ctx.deliveryCities)
          : null) ?? findCityInText(parsedTranscription, ctx.deliveryCities);
      const classification = await applyShippingCitySubCategory(merchantId, ctx, {
        ...mapParsedClassification(primaryIntent, ctx, reviewCategory, voiceResult.raw),
        cityId: voiceCityId,
      });

      // Add additional intents to the classification, preserving their delivery cities
      const additionalIntents = parsed.intents.slice(1).map(intent => {
        const intentCategoryId = matchCategoryId(intent.mainCategory, ctx.mainCategories);
        const intentCategory = ctx.mainCategories.find(c => c.id === intentCategoryId);
        const subsForIntent = intentCategory ? ctx.subCategories.filter(s => s.mainCategoryId === intentCategoryId) : [];
        let intentSubCategoryId: string | null = null;
        if (intent.subCategory !== UNDEFINED_LABEL) {
          intentSubCategoryId = matchCategoryId(intent.subCategory, subsForIntent);
        }

        // Preserve the delivery city from the intent if it's specified
        let intentCityId: string | null = null;
        if (intent.deliveryCity && intent.deliveryCity !== UNDEFINED_LABEL) {
          intentCityId = matchCityId(intent.deliveryCity, ctx.deliveryCities);
        }

        return {
          mainCategoryId: intentCategoryId || reviewCategory.id,
          mainCategoryName: intentCategory?.name || reviewCategory.name,
          subCategoryId: intentSubCategoryId,
          subCategoryName: intentSubCategoryId
            ? subsForIntent.find(s => s.id === intentSubCategoryId)?.name || UNDEFINED_LABEL
            : UNDEFINED_LABEL,
          productName: ctx.singleProduct ? UNDEFINED_LABEL : intent.product || UNDEFINED_LABEL,
          cityId: intentCityId, // Preserve the city from the intent
          rawAiResponse: voiceResult.raw,
          inferredByAi: true,
        };
      });

      classificationCache.set(parsedTranscription, merchantId, { ...classification, additionalIntents } as any);
      audioCache.set(audioFilePath, merchantId, parsedTranscription, { ...classification, additionalIntents } as any);
      return {
        transcription: parsedTranscription,
        classification: { ...classification, additionalIntents } as any,
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