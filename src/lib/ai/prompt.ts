import { z } from "zod";

export const classificationSchema = z.object({
  mainCategory: z.string(),
  subCategory: z.string(),
  product: z.string(),
});

export type ClassificationResult = z.infer<typeof classificationSchema>;

export interface MerchantContext {
  mainCategories: { id: string; name: string }[];
  subCategories: {
    id: string;
    name: string;
    mainCategoryId: string | null;
    mainCategoryName: string | null;
  }[];
  products: { officialName: string; keywords: string[] }[];
  reviewCategoryName: string;
  singleProduct: boolean;
}

function classificationRules(ctx: MerchantContext, formattedProducts: string) {
  const subCategoriesList = ctx.subCategories.map((s) => s.name);

  const productInstructions = ctx.singleProduct
    ? `
** وضع منتج واحد:**
|- هذا التاجر يبيع منتجاً واحداً فقط
|- إذا كانت الرسالة استفساراً فعلياً عن المنتج، صنف كـ **"أسئلة عن المنتج"** واستخدم اسم المنتج الرسمي
|- لا داعي لتمييز بين منتجات متعددة
`
    : `
** وضع عدة منتجات:**
|- هذا التاجر يبيع عدة منتجات
|- إذا كانت الرسالة استفساراً فعلياً عن منتج معين، حدد المنتج بدقة`;

  return `أنت نظام تصنيف ذكي للمحادثات للتجار المغاربة، تفهم الدارجة المغربية بجميع صيغها (عربية، Franco، Arabizi) والفرنسية والعربية.

** التصنيفات الرئيسية الثابتة:
-- الشكاوى أو المشاكل
-- أسئلة عن المنتج
-- الشحن والتوصيل
-- التأكيد
-- رسائل تحتاج مراجعة

** دليل المنتجات والكلمات المفتاحية المعتمدة لدى التاجر:
${formattedProducts || "لا توجد منتجات مسجلة حالياً"}

${productInstructions}

** التصنيفات الفرعية المتاحة:
${JSON.stringify(subCategoriesList)}

** قواعد التصنيف الذكية:
1. **أولوية التصنيف**: ابحث أولاً عن سياق الرسالة
   - إذا كانت الرسالة شكوى أو مشكلة أو تعبير عن عدم رضا: صنف كـ **"الشكاوى أو المشاكل"**
   - إذا كانت الرسالة عن الشحن أو التوصيل أو الاستلام: صنف كـ **"الشحن والتوصيل"**
   - إذا كانت الرسالة تأكيد طلب أو طلب جديد: صنف كـ **"التأكيد"**

2. **تصنيف أسئلة المنتج**: فقط عندما تكون الرسالة استفساراً واضحاً عن منتج
   - يجب أن يكون هناك سؤال صريح (كيف، كم، متى، هل موجود، إلخ)
   - مجرد ذكر اسم منتج أو كلمة مفتاحية لا يكفي لتصنيف الرسالة كـ "أسئلة عن المنتج"
   - مثال: "بغيت ديك الريحة" = تصنيف حسب السياق (قد يكون شكوى أو طلب)
   - مثال: "كيفاش الثمن ديك؟" = **"أسئلة عن المنتج"**
   - مثال: "واش موجود؟" = **"أسئلة عن المنتج"**

3. **استخدام الكلمات المفتاحية**: الكلمات المفتاحية هي أدلة مساعدة فقط
   - لا تستخدمها كمعيار وحيد للتصنيف
   - استخدمها فقط لتأكيد أن الرسالة عن منتج معين عندما يكون السياق يشير لذلك

4. **المنتجات غير الموجودة**: قاعدة مهمة جداً
   - إذا سُئل عن منتج غير موجود تماماً في قائمة التاجر
   - أو إذا لم تطابق الكلمات المفتاحية المنتج المذكور 100% في المعنى
   - يجب تصنيف الرسالة كـ **"رسائل تحتاج مراجعة"**
   - مثال: إذا التاجر يبيع عطور فقط والزبون يسأل عن ملابس = **"رسائل تحتاج مراجعة"**
   - مثال: إذا التاجر يبيع كريمات والزبون يسأل عن "صابون" (لا يطابق كلمات مفتاحية) = **"رسائل تحتاج مراجعة"**

5. **المراجعة**: إذا لم تتضح نية الرسالة أو كان السياق غامضاً: صنف كـ **"رسائل تحتاج مراجعة"**

6. يمنع استخدام القيمة null، استخدم النص **"غير محدد"** عند عدم وجود قيمة.`;
}

export function buildSystemPrompt(
  ctx: MerchantContext,
  formattedProducts: string,
  userText: string,
) {
  return `${classificationRules(ctx, formattedProducts)}

** القيمة المخرجة (JSON فقط):
{
  "mainCategory": "اسم القسم الرئيسي",
  "subCategory": "القسم الفرعي أو غير محدد",
  "product": "اسم المنتج الرسمي من القائمة أو غير محدد"
}

** الرسالة المراد تصنيفها الآن:
"${userText}"`;
}

export function buildVoiceSystemPrompt(
  ctx: MerchantContext,
  formattedProducts: string,
) {
  return `${classificationRules(ctx, formattedProducts)}

استمع للتسجيل الصوتي كاملاً. المتحدث زبون مغربي قد يستخدم الدارجة أو العربية أو الفرنسية أو مزيجاً منها.

** القيمة المخرجة (JSON فقط):
{
  "transcription": "النص المفرّغ حرفياً من الصوت",
  "mainCategory": "اسم القسم الرئيسي",
  "subCategory": "القسم الفرعي أو غير محدد",
  "product": "اسم المنتج الرسمي من القائمة أو غير محدد"
}`;
}

export function matchCategoryId(
  name: string,
  categories: { id: string; name: string }[],
): string | null {
  const normalized = name.trim().toLowerCase();
  const exact = categories.find(
    (c) => c.name.trim().toLowerCase() === normalized
  );
  if (exact) return exact.id;
  const partial = categories.find(
    (c) =>
      c.name.trim().toLowerCase().includes(normalized) ||
      normalized.includes(c.name.trim().toLowerCase())
  );
  return partial?.id ?? null;
}
