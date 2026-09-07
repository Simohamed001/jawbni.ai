import { prisma } from "@/lib/prisma";
import { matchCategoryId } from "@/lib/ai/prompt";
import {
  getCurrentModel,
  getGeminiClient,
  recordRequest,
} from "@/lib/ai/gemini-rotation";
import { UNDEFINED_LABEL } from "@/lib/utils";

export type ClassificationLike = {
  mainCategoryId: string;
  subCategoryId: string | null;
  productName: string;
  rawAiResponse: string | null;
  mainCategoryName: string;
  subCategoryName: string;
  inferredByAi?: boolean;
};

type CategoryContext = {
  id: string;
  name: string;
  subCategories: { id: string; name: string }[];
};

type ProductContext = {
  officialName: string;
  keywords: string[];
};

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
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

function parseKeywords(value: string) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function findProduct(value: string, products: ProductContext[]) {
  const normalized = normalize(value);
  if (!normalized || normalized === normalize(UNDEFINED_LABEL)) return null;

  return (
    products.find((product) => normalize(product.officialName) === normalized) ||
    products.find((product) =>
      product.keywords.some((keyword) => normalize(keyword) === normalized),
    ) ||
    null
  );
}

function buildAnalysisPrompt(
  text: string,
  primary: ClassificationLike,
  categories: CategoryContext[],
  products: ProductContext[],
) {
  const categoryCatalog = categories
    .map(
      (category) =>
        `- ${category.name} (subcategories: ${
          category.subCategories.map((sub) => sub.name).join(", ") || "غير محدد"
        })`,
    )
    .join("\n");
  const productCatalog = products.length
    ? products
        .map((product) => `- ${product.officialName}`)
        .join("\n")
    : "لا توجد منتجات مسجلة";

  return `أنت محلل نوايا لرسائل الزبائن المغاربة. حلل الرسالة كاملة من سياقها، ولا تعتمد على عدد علامات الاستفهام أو كلمات منفردة لاتخاذ القرار.

التصنيف الأساسي الذي اختاره النظام:
- القسم: ${primary.mainCategoryName}
- القسم الفرعي: ${primary.subCategoryName}
- المنتج: ${primary.productName}

التصنيفات المتاحة:
${categoryCatalog}

المنتجات المتاحة:
${productCatalog}

الرسالة:
"${text}"

المطلوب:
1. قرر من المعنى والسياق هل تحتوي الرسالة على نية واحدة أم أكثر من طلب/سؤال مستقل.
2. إذا كانت نية واحدة، أعد مصفوفة فارغة حتى لو ذكرت الرسالة أكثر من كلمة مرتبطة بتصنيفات مختلفة.
3. إذا احتوت على طلبات أو أسئلة مستقلة فعلًا، أعد فقط التصنيفات الإضافية غير الموجودة في التصنيف الأساسي.
4. لا تضف تصنيفًا بسبب ذكر كلمة عابرة أو لأن موضوعًا ثانويًا ورد كجزء من نفس الطلب.
5. استخدم أسماء الأقسام والمنتجات من القوائم كما هي. لا تخترع أسماء.

أعد JSON فقط بهذا الشكل:
{
  "hasMultipleIntents": true أو false,
  "additionalClassifications": [
    {
      "mainCategory": "اسم القسم",
      "subCategory": "اسم القسم الفرعي أو غير محدد",
      "product": "اسم المنتج الرسمي أو غير محدد"
    }
  ]
}`;
}

/**
 * يترك قرار تعدد التصنيف لنموذج الذكاء الاصطناعي، مع التحقق من أن كل نتيجة
 * تطابق قسمًا أو منتجًا موجودًا لدى التاجر قبل حفظها.
 */
export async function detectAdditionalClassifications(
  merchantId: string,
  text: string,
  primary: ClassificationLike,
) {
  if (!text.trim() || text.trim() === "🎤 رسالة صوتية") return [];

  const [categories, rawProducts] = await Promise.all([
    prisma.mainCategory.findMany({
      where: { merchantId },
      select: {
        id: true,
        name: true,
        subCategories: { select: { id: true, name: true } },
      },
    }),
    prisma.product.findMany({
      where: { merchantId, isSold: true },
      select: { officialName: true, keywords: true },
    }),
  ]);

  const products = rawProducts.map((product) => ({
    officialName: product.officialName,
    keywords: parseKeywords(product.keywords),
  }));

  try {
    const model = getGeminiClient(undefined, true);
    recordRequest(getCurrentModel());
    const response = await model.generateContent(
      buildAnalysisPrompt(text, primary, categories, products),
    );
    const raw = response.response.text();
    const parsed = extractJsonObject(raw);
    const additional = parsed?.additionalClassifications;

    if (
      parsed?.hasMultipleIntents !== true ||
      !Array.isArray(additional)
    ) {
      return [];
    }

    const results: ClassificationLike[] = [];
    for (const item of additional) {
      if (!item || typeof item !== "object") continue;

      const candidate = item as Record<string, unknown>;
      const mainCategoryName =
        typeof candidate.mainCategory === "string"
          ? candidate.mainCategory
          : "";
      const mainCategoryId = matchCategoryId(mainCategoryName, categories);
      if (!mainCategoryId) {
        continue;
      }

      const category = categories.find((entry) => entry.id === mainCategoryId);
      if (!category) continue;

      const subCategoryName =
        typeof candidate.subCategory === "string"
          ? candidate.subCategory
          : UNDEFINED_LABEL;
      const subCategoryId =
        matchCategoryId(subCategoryName, category.subCategories) || null;
      const productValue =
        typeof candidate.product === "string" ? candidate.product : "";
      const product = findProduct(productValue, products);
      const productName = product?.officialName || UNDEFINED_LABEL;

      if (
        mainCategoryId === primary.mainCategoryId &&
        subCategoryId === primary.subCategoryId &&
        productName === primary.productName
      ) {
        continue;
      }

      if (
        results.some(
          (entry) =>
            entry.mainCategoryId === mainCategoryId &&
            entry.subCategoryId === subCategoryId &&
            entry.productName === productName,
        )
      ) {
        continue;
      }

      results.push({
        mainCategoryId,
        subCategoryId,
        productName,
        rawAiResponse: raw,
        mainCategoryName: category.name,
        subCategoryName: subCategoryId
          ? category.subCategories.find((sub) => sub.id === subCategoryId)?.name ||
            UNDEFINED_LABEL
          : UNDEFINED_LABEL,
        inferredByAi: true,
      });
    }

    return results;
  } catch (error) {
    console.error("[Additional Classification] Gemini analysis failed:", error);
    return [];
  }
}