import { UNDEFINED_LABEL, OTHER_QUESTIONS_SUBCATEGORY, PRODUCT_QUESTIONS_CATEGORY } from "@/lib/utils";
import type { MerchantContext } from "@/lib/ai/prompt";

export const CONFIRMATION_CATEGORY = "التأكيد";
export const PRODUCT_QUESTIONS_CATEGORY = "أسئلة عن المنتج";
export const SHIPPING_CATEGORY = "الشحن والتوصيل";
export const COMPLAINTS_CATEGORY = "الشكاوى أو المشاكل";
export const OTHER_QUESTIONS_SUBCATEGORY = "أسئلة أخرى";

export type RawIntent = {
  mainCategory: string;
  subCategory: string;
  product: string;
  deliveryCity: string;
};

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const STOPWORDS = new Set(
  [
    "bghit",
    "bghite",
    "nbghi",
    "3tini",
    "3atini",
    "khasni",
    "khassni",
    "wahd",
    "wahed",
    "wa7d",
    "wa7ed",
    "mn",
    "min",
    "dyal",
    "dial",
    "o",
    "w",
    "wa",
    "l",
    "f",
    "b",
    "li",
    "ila",
    "twsil",
    "tousil",
    "twssil",
    "livraison",
    "shipping",
    "delivery",
    "x7l",
    "ch7al",
    "ch3al",
    "chhal",
    "tmn",
    "taman",
    "prix",
    "wach",
    "wesh",
    "kayn",
    "kayen",
    "3ndkom",
    "3andkom",
    "3ndk",
    "3andk",
    "chi",
    "page",
    "ana",
    "chft",
    "cheft",
    "li",
    "siftou",
    "sifto",
    "fih",
    "mochkil",
    "probleme",
    "problème",
    "mxrg",
    "3afak",
    "afak",
    "svt",
    "svp",
    "please",
    "chno",
    "shno",
    "kayn",
    "3ndkom",
  ].map(normalize),
);

const PURCHASE_RE =
  /\b(bghit|bghite|nbghi|3tini|3atini|khasni|khassni|commande[rs]?)\b/i;
const COMPLAINT_RE =
  /mochkil|probleme|probl[eè]me|mxrg|3ayb|talf|كسرو|خاسر|plainte|bug/i;
const SHIPPING_CUT_RE = /\b(twsil|tousil|livraison|shipping|delivery|x7l|ch7al|ch3al)\b/i;

export function findCatalogProduct(
  value: string,
  products: MerchantContext["products"],
): MerchantContext["products"][number] | null {
  const normalized = normalize(value);
  if (!normalized || normalized === normalize(UNDEFINED_LABEL)) return null;

  const byOfficial = products.find(
    (product) => normalize(product.officialName) === normalized,
  );
  if (byOfficial) return byOfficial;

  return (
    products.find((product) =>
      product.keywords.some((keyword) => normalize(keyword) === normalized),
    ) || null
  );
}

function isStopword(value: string) {
  return STOPWORDS.has(normalize(value)) || /^\d+$/.test(value.trim());
}

function isCityName(value: string, cities: MerchantContext["deliveryCities"]) {
  const normalized = normalize(value);
  return cities.some(
    (city) =>
      normalize(city.name) === normalized ||
      (city.name.startsWith("ال") && normalize(city.name.slice(2)) === normalized),
  );
}

function cleanPhrase(value: string, cities: MerchantContext["deliveryCities"]) {
  return value
    .replace(/[?!؟.,،;:()[\]{}"«»]/g, " ")
    .replace(/\b(\d+|wahd|wahed|wa7d|wa7ed|mn|min|dyal|dial)\b/gi, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token && !isStopword(token) && !isCityName(token, cities))
    .join(" ");
}

function catalogMentionsInText(
  messageText: string,
  products: MerchantContext["products"],
): MerchantContext["products"][number][] {
  const text = ` ${normalize(messageText)} `;
  const found: MerchantContext["products"][number][] = [];
  for (const product of products) {
    const name = normalize(product.officialName);
    if (!name) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const mentioned = new RegExp(
      `(^|[^\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`,
      "u",
    ).test(text);
    if (mentioned) found.push(product);
  }
  return found;
}

export function extractProductCandidates(
  messageText: string,
  cities: MerchantContext["deliveryCities"],
): string[] {
  const text = messageText.toLowerCase();
  const candidates: string[] = [];

  const purchaseMatch = text.match(
    /\b(bghit|bghite|nbghi|3tini|3atini|khasni|khassni|commande[rs]?)\b([\s\S]*)$/i,
  );
  if (purchaseMatch) {
    const clause = purchaseMatch[2].split(SHIPPING_CUT_RE)[0];
    for (const part of clause.split(/\s+(?:o|w|و)\s+/)) {
      const cleaned = cleanPhrase(part, cities);
      if (cleaned) candidates.push(cleaned);
    }
  }

  const haveMatch = text.match(
    /\b(3andkom|3ndkom|3andkoum|3ndkoum)\s+(.+?)(?:[?؟]|$)/i,
  );
  if (haveMatch) {
    const cleaned = cleanPhrase(haveMatch[2], cities);
    if (cleaned) candidates.push(cleaned);
  }

  const seenMatch = text.match(/\b(chft|cheft|shft|shofto|shuft)\s+(\S+)/i);
  if (seenMatch) {
    const cleaned = cleanPhrase(seenMatch[2], cities);
    if (cleaned) candidates.push(cleaned);
  }

  const complaintMatch = text.match(
    /\b(\S+)\s+li\s+(sift|siftou|sifto|wsl|wslni)/i,
  );
  if (complaintMatch) {
    const cleaned = cleanPhrase(complaintMatch[1], cities);
    if (cleaned) candidates.push(cleaned);
  }

  return [...new Set(candidates.map(normalize).filter(Boolean))];
}

function categoryKind(
  name: string,
  reviewCategoryName: string,
): "confirmation" | "product_q" | "shipping" | "complaint" | "review" | "other" {
  const normalized = normalize(name);
  if (normalized === normalize(CONFIRMATION_CATEGORY)) return "confirmation";
  if (normalized === normalize(PRODUCT_QUESTIONS_CATEGORY)) return "product_q";
  if (normalized === normalize(SHIPPING_CATEGORY)) return "shipping";
  if (normalized === normalize(COMPLAINTS_CATEGORY)) return "complaint";
  if (normalized === normalize(reviewCategoryName)) return "review";
  return "other";
}

function knownProductQuestionSub(
  subCategory: string,
  ctx: MerchantContext,
): string {
  if (!subCategory || subCategory === UNDEFINED_LABEL) {
    return OTHER_QUESTIONS_SUBCATEGORY;
  }
  const productMain = ctx.mainCategories.find(
    (category) => category.name === PRODUCT_QUESTIONS_CATEGORY,
  );
  const match = ctx.subCategories.find(
    (sub) =>
      normalize(sub.name) === normalize(subCategory) &&
      (!productMain || sub.mainCategoryId === productMain.id),
  );
  return match?.name ?? OTHER_QUESTIONS_SUBCATEGORY;
}

function reviewIntent(reviewCategoryName: string): RawIntent {
  return {
    mainCategory: reviewCategoryName,
    subCategory: UNDEFINED_LABEL,
    product: UNDEFINED_LABEL,
    deliveryCity: UNDEFINED_LABEL,
  };
}

function uniqueIntents(intents: RawIntent[]): RawIntent[] {
  const seen = new Set<string>();
  const result: RawIntent[] = [];
  for (const intent of intents) {
    const key = `${intent.mainCategory}|${intent.subCategory}|${intent.product}|${intent.deliveryCity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(intent);
  }
  return result;
}

/**
 * Intent-level validation after Gemini parsing.
 * Does not run for single-product merchants.
 */
export function validateIntentSemantics(
  intents: RawIntent[],
  ctx: MerchantContext,
  messageText: string,
  reviewCategoryName: string,
): RawIntent[] {
  if (ctx.singleProduct) {
    return intents;
  }

  const catalogInText = catalogMentionsInText(messageText, ctx.products);
  const messageCandidates = extractProductCandidates(
    messageText,
    ctx.deliveryCities,
  );

  const unregisteredFromMessage = messageCandidates.filter(
    (candidate) => !findCatalogProduct(candidate, ctx.products),
  );

  const unregisteredFromIntents: string[] = [];
  const registeredFromIntents: MerchantContext["products"][number][] = [];
  for (const intent of intents) {
    const kind = categoryKind(intent.mainCategory, reviewCategoryName);
    if (!intent.product || intent.product === UNDEFINED_LABEL) continue;
    const catalog = findCatalogProduct(intent.product, ctx.products);
    if (catalog) {
      registeredFromIntents.push(catalog);
      continue;
    }
    if (kind === "confirmation") {
      unregisteredFromIntents.push(intent.product);
    } else if (kind === "product_q" && messageCandidates.length > 0) {
      unregisteredFromIntents.push(intent.product);
    }
  }

  const registered = [
    ...catalogInText,
    ...registeredFromIntents.filter(
      (product) =>
        !catalogInText.some((item) => item.officialName === product.officialName),
    ),
  ];
  const hasRegistered = registered.length > 0;
  const hasUnregistered =
    unregisteredFromMessage.length > 0 || unregisteredFromIntents.length > 0;

  const kinds = intents.map((intent) =>
    categoryKind(intent.mainCategory, reviewCategoryName),
  );
  const hasPurchaseIntent =
    kinds.includes("confirmation") || PURCHASE_RE.test(messageText);
  const hasComplaintIntent =
    kinds.includes("complaint") || COMPLAINT_RE.test(messageText);
  const hasProductQuestionIntent = kinds.includes("product_q");
  const hasShippingIntent =
    kinds.includes("shipping") ||
    /\b(twsil|tousil|livraison|shipping|delivery)\b/i.test(messageText);

  const mixedPurchase = hasPurchaseIntent && hasRegistered && hasUnregistered;
  const complaintOnlyUnregistered =
    hasUnregistered &&
    !hasRegistered &&
    !hasPurchaseIntent &&
    hasComplaintIntent;

  const wholeMessageReview =
    hasUnregistered && !mixedPurchase && !complaintOnlyUnregistered;

  if (wholeMessageReview) {
    return [reviewIntent(reviewCategoryName)];
  }

  const next: RawIntent[] = [];

  if (hasPurchaseIntent && hasRegistered) {
    for (const product of registered) {
      next.push({
        mainCategory: CONFIRMATION_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: product.officialName,
        deliveryCity: UNDEFINED_LABEL,
      });
    }
  } else if (hasPurchaseIntent && !hasUnregistered) {
    for (const intent of intents) {
      if (categoryKind(intent.mainCategory, reviewCategoryName) !== "confirmation") {
        continue;
      }
      const catalog = findCatalogProduct(intent.product, ctx.products);
      next.push({
        ...intent,
        mainCategory: CONFIRMATION_CATEGORY,
        product: catalog?.officialName ?? UNDEFINED_LABEL,
        deliveryCity: UNDEFINED_LABEL,
      });
    }
  }

  if (mixedPurchase) {
    next.push(reviewIntent(reviewCategoryName));
  }

  if (hasComplaintIntent) {
    for (const intent of intents) {
      if (categoryKind(intent.mainCategory, reviewCategoryName) !== "complaint") {
        continue;
      }
      const catalog = findCatalogProduct(intent.product, ctx.products);
      next.push({
        mainCategory: COMPLAINTS_CATEGORY,
        subCategory:
          intent.subCategory && intent.subCategory !== UNDEFINED_LABEL
            ? intent.subCategory
            : UNDEFINED_LABEL,
        product: catalog?.officialName ?? UNDEFINED_LABEL,
        deliveryCity: UNDEFINED_LABEL,
      });
    }
    if (!intents.some((intent) => categoryKind(intent.mainCategory, reviewCategoryName) === "complaint")) {
      next.push({
        mainCategory: COMPLAINTS_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
        deliveryCity: UNDEFINED_LABEL,
      });
    }
  }

  if (hasProductQuestionIntent && !hasUnregistered) {
    for (const intent of intents) {
      if (categoryKind(intent.mainCategory, reviewCategoryName) !== "product_q") {
        continue;
      }
      const catalog = findCatalogProduct(intent.product, ctx.products);
      next.push({
        mainCategory: PRODUCT_QUESTIONS_CATEGORY,
        subCategory: knownProductQuestionSub(intent.subCategory, ctx),
        product: catalog?.officialName ?? UNDEFINED_LABEL,
        deliveryCity: UNDEFINED_LABEL,
      });
    }
  }

  if (hasShippingIntent && (mixedPurchase || !hasUnregistered)) {
    const shippingFromGemini = intents.filter(
      (intent) => categoryKind(intent.mainCategory, reviewCategoryName) === "shipping",
    );
    if (shippingFromGemini.length > 0) {
      for (const intent of shippingFromGemini) {
        next.push({
          mainCategory: SHIPPING_CATEGORY,
          subCategory:
            intent.subCategory && intent.subCategory !== UNDEFINED_LABEL
              ? intent.subCategory
              : UNDEFINED_LABEL,
          product: UNDEFINED_LABEL,
          deliveryCity:
            intent.deliveryCity && intent.deliveryCity !== UNDEFINED_LABEL
              ? intent.deliveryCity
              : UNDEFINED_LABEL,
        });
      }
    } else if (hasShippingIntent) {
      next.push({
        mainCategory: SHIPPING_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
        deliveryCity: UNDEFINED_LABEL,
      });
    }
  }

  for (const intent of intents) {
    const kind = categoryKind(intent.mainCategory, reviewCategoryName);
    if (
      kind === "confirmation" ||
      kind === "product_q" ||
      kind === "shipping" ||
      kind === "complaint" ||
      kind === "review"
    ) {
      continue;
    }
    next.push({
      ...intent,
      product: findCatalogProduct(intent.product, ctx.products)?.officialName ?? UNDEFINED_LABEL,
    });
  }

  const unique = uniqueIntents(next);
  return unique.length > 0 ? unique : [reviewIntent(reviewCategoryName)];
}

export function isWholeMessageReview(
  intents: RawIntent[],
  reviewCategoryName: string,
): boolean {
  return (
    intents.length === 1 &&
    categoryKind(intents[0].mainCategory, reviewCategoryName) === "review" &&
    intents[0].product === UNDEFINED_LABEL
  );
}
