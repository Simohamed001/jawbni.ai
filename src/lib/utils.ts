import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("ar-MA", { hour: "2-digit", minute: "2-digit" });
}

export function parseKeywords(raw: string): string[] {
  return raw
    .split(/[,،\n]/)
    .map((k) => k.trim())
    .filter(Boolean);
}

export function keywordsToString(keywords: string[] | string): string {
  if (typeof keywords === "string") {
    try {
      const parsed = JSON.parse(keywords) as string[];
      return parsed.join(", ");
    } catch {
      return keywords;
    }
  }
  return keywords.join(", ");
}

export const UNDEFINED_LABEL = "غير محدد";

export const REVIEW_CATEGORY_NAME = "رسائل تحتاج مراجعة";

export const DEFAULT_MAIN_CATEGORIES = [
  { name: "الشكاوى أو المشاكل", isSystem: false },
  { name: "أسئلة عن المنتج", isSystem: false },
  { name: "الشحن والتوصيل", isSystem: false },
  { name: "التأكيد", isSystem: false },
  { name: REVIEW_CATEGORY_NAME, isSystem: true },
];

export const DEFAULT_SUB_CATEGORIES: Record<string, string[]> = {
  "أسئلة عن المنتج": ["الثمن", "التوفر", "المواصفات"],
  "الشحن والتوصيل": ["مدة التوصيل", "تكلفة الشحن"],
  "الشكاوى أو المشاكل": ["منتج تالف", "تأخر التوصيل"],
};
