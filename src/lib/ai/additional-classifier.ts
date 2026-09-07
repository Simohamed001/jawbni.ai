import { prisma } from "@/lib/prisma";
import { UNDEFINED_LABEL } from "@/lib/utils";

export type ClassificationLike = {
  mainCategoryId: string;
  subCategoryId: string | null;
  productName: string;
  rawAiResponse: string | null;
  mainCategoryName: string;
  subCategoryName: string;
};

const questionCuePattern =
  /واش|هل|كيفاش|كيف|شحال|كم|متى|فين|أين|شنو|اشنو|ماهو|ما هي|combien|comment|quand|où|quel(?:le|s)?|est-ce que|what|how|when|where|price/gi;

const shippingPattern =
  /توصيل|الشحن|شحن|استلام|livraison|shipping|delivery|tawssil|twsel|wssel/i;

const complaintPattern =
  /مشكلة|شكوى|تالف|مكسور|probl[eè]me|plainte|bug|erreur|ma khdam|khdamch|mchkel/i;

const confirmationPattern =
  /تأكيد|أكد|بغيت نطلب|بغيت نشري|نطلب|commande|command|ncommandi|nchri|order|confirm/i;

const returnPattern =
  /رجع|ارجاع|إرجاع|مرتجع|استبدال|nrj3|return|retour/i;

const productQuestionPattern =
  /الثمن|السعر|سعر|بكم|شحال|كم|منتج|منتوج|عطر|produit|price|combien|واش موجود|هل موجود|كاين|موجود/i;

function countQuestionCues(text: string) {
  const punctuationCount = (text.match(/[؟?]/g) || []).length;
  const cueCount = text.match(questionCuePattern)?.length || 0;
  return Math.max(punctuationCount, cueCount);
}

function splitQuestionParts(text: string) {
  const explicitParts = text
    .split(/[؟?]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (explicitParts.length > 1) return explicitParts;

  const matches = [...text.matchAll(questionCuePattern)];
  if (matches.length <= 1) return text.trim() ? [text.trim()] : [];

  const separatedMatches = matches.filter((match, index) => {
    if (index === 0) return true;
    const previousEnd =
      (matches[index - 1].index ?? 0) + matches[index - 1][0].length;
    return /(?:^|\s)(?:و|and|et)\s*$/i.test(
      text.slice(previousEnd, match.index ?? text.length),
    );
  });

  if (separatedMatches.length <= 1) return text.trim() ? [text.trim()] : [];

  return separatedMatches.map((match, index) => {
    const start = match.index ?? 0;
    const nextStart = separatedMatches[index + 1]?.index ?? text.length;
    return text.slice(start, nextStart).trim();
  });
}

export function hasMultipleQuestions(text: string) {
  return countQuestionCues(text) >= 2 && splitQuestionParts(text).length >= 2;
}

function createClassification(
  category: { id: string; name: string },
  productName = UNDEFINED_LABEL,
): ClassificationLike {
  return {
    mainCategoryId: category.id,
    subCategoryId: null,
    productName,
    rawAiResponse: null,
    mainCategoryName: category.name,
    subCategoryName: UNDEFINED_LABEL,
  };
}

/**
 * يسمح بأكثر من تصنيف فقط عندما تحتوي الرسالة على سؤالين أو أكثر.
 * كل تصنيف إضافي يجب أن يكون مدعومًا بإشارة واضحة داخل سياق سؤال مستقل.
 */
export async function detectAdditionalClassifications(
  merchantId: string,
  text: string,
  primary: ClassificationLike,
) {
  if (!hasMultipleQuestions(text)) return [];

  const parts = splitQuestionParts(text);

  const [categories, products] = await Promise.all([
    prisma.mainCategory.findMany({
      where: { merchantId },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { merchantId, isSold: true },
      select: { officialName: true, keywords: true },
    }),
  ]);

  const results: ClassificationLike[] = [];
  const add = (value: ClassificationLike) => {
    if (
      value.mainCategoryId === primary.mainCategoryId &&
      value.productName === primary.productName
    ) {
      return;
    }

    if (
      !results.some(
        (item) =>
          item.mainCategoryId === value.mainCategoryId &&
          item.productName === value.productName,
      )
    ) {
      results.push(value);
    }
  };

  for (const part of parts) {
    const shipping = categories.find((category) => category.name === "الشحن والتوصيل");
    if (shipping && shippingPattern.test(part)) {
      add(createClassification(shipping));
    }

    const complaint = categories.find((category) => category.name === "الشكاوى أو المشاكل");
    if (complaint && complaintPattern.test(part)) {
      add(createClassification(complaint));
    }

    const confirmation = categories.find((category) => category.name === "التأكيد");
    if (confirmation && confirmationPattern.test(part)) {
      add(createClassification(confirmation));
    }

    const returns = categories.find((category) => category.name === "المرتجعات");
    if (returns && returnPattern.test(part)) {
      add(createClassification(returns));
    }

    const productCategory = categories.find((category) => category.name === "أسئلة عن المنتج");
    if (productCategory && productQuestionPattern.test(part)) {
      const product = products.find((candidate) => {
        let keywords: string[] = [];
        try {
          keywords = JSON.parse(candidate.keywords || "[]") as string[];
        } catch {
          keywords = [];
        }

        return [candidate.officialName, ...keywords].some(
          (term) => term.trim() && part.toLowerCase().includes(term.toLowerCase()),
        );
      });

      const productName =
        product?.officialName ||
        (primary.productName !== UNDEFINED_LABEL ? primary.productName : UNDEFINED_LABEL);

      if (productName !== UNDEFINED_LABEL) {
        add(createClassification(productCategory, productName));
      }
    }
  }

  return results;
}