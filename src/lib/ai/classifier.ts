import { prisma } from "@/lib/prisma";
import { getReviewCategory } from "@/lib/categories";
import {
  buildSystemPrompt,
  classificationSchema,
  matchCategoryId,
  type MerchantContext,
} from "@/lib/ai/prompt";
import { UNDEFINED_LABEL } from "@/lib/utils";
import { classifyLocal } from "@/lib/ai/local-ai";
import { transcribeAudio } from "@/lib/ai/transcribe";
import { classificationCache, audioCache } from "@/lib/ai/cache";

export { transcribeAudio };

async function loadMerchantContext(merchantId: string): Promise<MerchantContext> {
  const [mainCategories, subCategories, products, review, merchant] = await Promise.all([
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

/**
 * مطابقة بالكلمات المفتاحية (عربي + فرانكو/فرنسية).
 * تُستخدم كاحتياط عند فشل نموذج AI، وكتصحيح override
 * عندما يتعارض ناتج AI مع إشارة كلمة مفتاحية قوية (خصوصاً سؤال السعر/المنتج).
 * ترتيب الأسبقية مهم: السؤال قبل الشكوى لأن الاستفسار أرجح في الفرانكو.
 */
function simpleCategoryFallback(text: string): string | null {
  const lower = text.toLowerCase();

  // 1) سؤال عن منتج/سعر — أرجح في الفرانكو عند وجود صيغة سؤال
  const priceQuery =
    lower.includes("chhal") ||
    lower.includes("taman") ||
    lower.includes("thman") ||
    lower.includes("bkam") ||
    lower.includes("كم") ||
    lower.includes("بكم") ||
    lower.includes("الثمن") ||
    lower.includes("sman");
  const question =
    lower.includes("kifach") ||
    lower.includes("kifesh") ||
    lower.includes("comment") ||
    lower.includes("كيف") ||
    lower.includes("cmmt") ||
    lower.includes("wash") ||
    lower.includes("wach") ||
    lower.includes("واش") ||
    lower.includes("ach") ||
    lower.includes("achhad") ||
    lower.includes("؟") ||
    lower.includes("كيفاش") ||
    lower.includes("fin") ||
    lower.includes("فين");
  const productWord =
    lower.includes("produit") ||
    lower.includes("منتوج") ||
    lower.includes("المنتج") ||
    lower.includes("حاجة") ||
    lower.includes("chlor") ||
    lower.includes("عطر") ||
    lower.includes("ga3 merasa") ||
    lower.includes("is3mi");
  if (priceQuery || (question && productWord)) {
    return "أسئلة عن المنتج";
  }

  // 2) تأكيد/طلب شراء
  if (
    lower.includes("confirm") ||
    lower.includes("تأكيد") ||
    lower.includes("commande") ||
    lower.includes("command") ||
    lower.includes("ncommandi") ||
    lower.includes("bghit ncommandi") ||
    lower.includes("nchri") ||
    lower.includes("طلباتي") ||
    lower.includes("askfor") ||
    lower.includes("order")
  ) {
    return "التأكيد";
  }

  // 3) الشحن والتوصيل (عربي + فرانكو)
  if (
    lower.includes("livraison") ||
    lower.includes("tawssil") ||
    lower.includes("twselni") ||
    lower.includes("wsselni") ||
    lower.includes("wslni") ||
    lower.includes("توصيل") ||
    lower.includes("الشحن") ||
    lower.includes("شحن") ||
    lower.includes("shipping") ||
    lower.includes("liver") ||
    lower.includes("tliver") ||
    lower.includes("كيفاش توصيل") ||
    lower.includes("استلام") ||
    lower.includes("stilam")
  ) {
    return "الشحن والتوصيل";
  }

  // 4) الشكاوى / المشاكل (فرانكو شائعة)
  if (
    lower.includes("mchkel") ||
    lower.includes("moushkil") ||
    lower.includes("muchkil") ||
    lower.includes("3ndi problem") ||
    lower.includes("3lach") ||
    lower.includes("problème") ||
    lower.includes("problme") ||
    lower.includes("probl") ||
    lower.includes("مشكلة") ||
    lower.includes("شكوى") ||
    lower.includes("plainte") ||
    lower.includes("bug") ||
    lower.includes("erreur") ||
    lower.includes("خطأ") ||
    lower.includes("مكسور") ||
    lower.includes("تالف") ||
    lower.includes("mchi kifach") ||
    lower.includes("ma khdam") ||
    lower.includes("khdamch") ||
    lower.includes("ma khdem") ||
    lower.includes("rokib") ||
    lower.includes("عرص")
  ) {
    return "الشكاوى أو المشاكل";
  }

  return null;
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
      classificationCache.set(messageText, merchantId, result);
      return result;
    }
    
    try {
      console.log("[Text Classification] Attempting local AI classification for:", messageText.substring(0, 100));
      const result = await classifyLocal(systemPrompt);
      rawAiResponse = result.text;
      console.log("[Text Classification] FULL Local AI response:", rawAiResponse);
      console.log("[Text Classification] Local AI response JSON parsed:", result.json);

      if (result.json) {
        parsed = classificationSchema.parse({
          mainCategory:
            typeof result.json.mainCategory === "string"
              ? result.json.mainCategory
              : reviewCategory.name,
          subCategory:
            typeof result.json.subCategory === "string"
              ? result.json.subCategory
              : UNDEFINED_LABEL,
          product:
            typeof result.json.product === "string"
              ? result.json.product
              : UNDEFINED_LABEL,
        });
        console.log("[Text Classification] Successfully parsed local AI classification:", parsed);
      } else if (rawAiResponse) {
        // Fallback: استخراج JSON من النص الخام إن لم يعدّده السيرفر
        const jsonMatch = rawAiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const json = JSON.parse(jsonMatch[0]);
          parsed = classificationSchema.parse(json);
          console.log("[Text Classification] Successfully parsed JSON from raw response:", parsed);
        } else {
          console.warn("[Text Classification] No JSON found in local AI response");
        }
      } else {
        console.warn("[Text Classification] Empty local AI response");
      }
    } catch (error) {
      console.error("[Text Classification] Local AI classification error:", error);
      console.log("[Text Classification] Falling back to simple category matching (no product keyword matching)");
      // Fallback to simple category matching only (no product keyword matching to avoid misclassification)
      const fallbackCategory = simpleCategoryFallback(lower);
      if (fallbackCategory) {
        parsed = {
          mainCategory: fallbackCategory,
          subCategory: UNDEFINED_LABEL,
          product: UNDEFINED_LABEL,
        };
        console.log("[Text Classification] Fallback matched:", fallbackCategory);
      } else {
        console.log("[Text Classification] No category matched, using review category");
      }
      // If no keywords match, keep default (review category)
    }

    // Override: نصوّب ناتج AI فقط إذا كان التصنيف غير موجود أصلاً في قاعدة البيانات
    // (مثلاً Gemini يرجع شيرو غير معروف). لا نلغي تصنيف AI صحيح فقط لأنه يختلف عن الكلمات المفتاحية.
    const aiCategory = parsed.mainCategory;
    const aiCategoryId = matchCategoryId(aiCategory, ctx.mainCategories);
    const aiCategoryInvalid = aiCategoryId === null;

    if (aiCategoryInvalid) {
      const keywordCategory = simpleCategoryFallback(lower);
      console.log(
        `[Text Classification] AI category '${aiCategory}' not found in DB, keyword fallback: '${keywordCategory}'`,
      );
      parsed = {
        mainCategory: keywordCategory || reviewCategory.name,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
      };
      rawAiResponse = null;
    }
  } else {
    console.log("[Text Classification] Empty message text, using review category");
  }

  let result = mapParsedClassification(parsed, ctx, reviewCategory, rawAiResponse);
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

  console.log("[Voice Classification] Transcribing voice message with local Whisper");

  // Whisper-Large-v3-Turbo: الصوت → نص
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

  // Qwen2.5-7B: تصنيف النص المفرّغ (يستعمل cache تلقائياً)
  console.log("[Voice Classification] Classifying transcribed text with local AI");
  let classification = await classifyMessage(merchantId, transcription);
  console.log("[Voice Classification] AI text classification result:", {
    mainCategory: classification.mainCategoryName,
    subCategory: classification.subCategoryName,
    productName: classification.productName,
  });

  // إن وصل لـ "تحتاج مراجعة"، نجرّب المطابقة بالكلمات المفتاحية أولاً
  if (classification.mainCategoryName === reviewCategory.name) {
    const fallbackCategory = simpleCategoryFallback(transcription);
    if (fallbackCategory) {
      console.log("[Voice Classification] Applying simple keyword fallback:", fallbackCategory);
      const parsed = {
        mainCategory: fallbackCategory,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
      };
      classification = mapParsedClassification(parsed, ctx, reviewCategory, null);
    }
  }

  // تخزين النتيجة الصوتية في cache
  classificationCache.set(transcription, merchantId, classification);
  audioCache.set(audioFilePath, merchantId, transcription, classification);

  return { transcription, classification };
}
