import { z } from "zod";

export interface IntentClassification {
  mainCategory: string;
  subCategory: string | "غير محدد";
  product: string | "غير محدد";
  deliveryCity: string | "غير محدد";
}

export interface GeminiResponse {
  intents: IntentClassification[];
}

export const classificationSchema = z.object({
  intents: z.array(
    z.object({
      mainCategory: z.string(),
      subCategory: z.string(),
      product: z.string(),
      deliveryCity: z.string(),
    })
  ),
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
  deliveryCities: { id: string; name: string }[];
  reviewCategoryName: string;
  singleProduct: boolean;
}

export function citiesBlock(ctx: MerchantContext) {
  return ctx.deliveryCities.length
    ? `\n** مدن التوصيل المتاحة لديك:\n${ctx.deliveryCities.map((c) => `|- ${c.name}`).join("\n")}\n|- إذا سأل الزبون عن التوصيل أو الشحن إلى مدينة موجودة في القائمة أعلاه، أرجع اسمها **كما هو مكتوب في القائمة تماماً** في الحقل deliveryCity\n|- إذا لم تذكر الرسالة مدينة، أو كانت المدينة غير موجودة في القائمة، أرجع "غير محدد" في الحقل deliveryCity\n`
    : `\n|- لا توجد مدن توصيل مسجلة: أرجع دائماً "غير محدد" في الحقل deliveryCity\n`;
}

function classificationRules(ctx: MerchantContext, formattedProducts: string) {
  const subCategoriesList = ctx.subCategories.map((s) => s.name);

  const productInstructions = ctx.singleProduct
    ? `
** وضع منتج واحد:**
|- هذا التاجر يبيع منتجاً واحداً فقط.
|- إذا كانت الرسالة استفساراً فعلياً عن المنتج، صنف كـ **"أسئلة عن المنتج"** واستخدم اسم المنتج الرسمي المسجل في الإعدادات.
`
    : `
** وضع عدة منتجات:**
|- هذا التاجر يبيع عدة منتجات.
|- إذا كانت الرسالة استفساراً فعلياً عن منتج معين، حدد المنتج بدقة واستخدم اسمه الرسمي المسجل في الإعدادات.`;

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

** قواعد الفهم الصوتي والسياقي للدارجة المغربية:

1. **المعالجة الصوتية والنصية (Phonetic Normalization)**:
   - قم بترجمة وترميم الصوتيات والأرقام اللاتينية ذهنياً إلى معانيها بالدارجة المغربية قبل التصنيف:
     * 7 = ح (مثال: x7l / ch7al / bch7al -> شحال)
     * 3 = ع (مثال: 3afak -> عافاك)
     * 9 = ق (مثال: f9ach -> فوقاش)
     * x = ش أو خ حسب السياق (مثال: x7l -> شحال)

2. **التحليل السياقي الكلي ومنع المطابقة السطحية (Contextual Intent vs Keyword Matching)**:
   - يمنع منعاً باتاً الاعتماد على المطابقة السطحية للكلمات.
   - يجب فهم القصد الكامل للجملة:
     * إذا وردت كلمة تعبر عن الثمن مثل "tmn", "ch3al", "bch7al", "prix" مقترنة بكلمات التوصيل أو المدن مثل "twsil", "livraison", "lbenimelal", "casa"، فإن القصد الشامل والوحيد لهذا الجزء هو **"الشحن والتوصيل"**.
     * يُحظر فصل الكلمات المتصلة سياقياً لوضع "ثمن" مع "أسئلة عن المنتج" إذا كان السياق كلياً يتحدث عن ثمن التوصيل.
     * يجب ربط أسماء المنتجات الواردة في رسالة الزبون بالاسم الرسمي المطابق المسجل في الإعدادات حصراً.

3. **التصنيف المتعدد (Multi-Intent)**:
   - عدد العناصر داخل مصفوفة النيات (\`intents\`) مرهون بعدد الأسئلة أو النيات المستقلة التي جاءت في الرسالة الواحدة.

4. **المنتجات غير الموجودة والغامضة**:
   - إذا سُئل عن منتج غير موجود تماماً في قائمة التاجر، أو إذا لم تتضح نية الرسالة وكان السياق غامضاً = **"رسائل تحتاج مراجعة"**.

5. **القيم التخلفية**:
   - يمنع استخدام القيمة null، استخدم النص **"غير محدد"** عند عدم وجود قيمة للقسم الفرعي، المنتج، أو المدينة.`;
}

export function buildSystemPrompt(
  ctx: MerchantContext,
  formattedProducts: string,
  citiesBlockText: string,
  userText: string,
) {
  return `${classificationRules(ctx, formattedProducts)}

${citiesBlockText}

** أمثلة توجيهية إلزامية (Few-Shot Examples):**

- الرسالة: "x7l twsil l beni melal"
  المخرج:
  {
    "intents": [
      { "mainCategory": "الشحن والتوصيل", "subCategory": "غير محدد", "product": "غير محدد", "deliveryCity": "بني ملال" }
    ]
  }

- الرسالة: "ch3al tmn d twsil"
  المخرج:
  {
    "intents": [
      { "mainCategory": "الشحن والتوصيل", "subCategory": "غير محدد", "product": "غير محدد", "deliveryCity": "غير محدد" }
    ]
  }

- الرسالة: "ch3al tmn trico o x7l twsil"
  المخرج:
  {
    "intents": [
      { "mainCategory": "أسئلة عن المنتج", "subCategory": "الثمن", "product": "اسم المنتج الرسمي من الإعدادات", "deliveryCity": "غير محدد" },
      { "mainCategory": "الشحن والتوصيل", "subCategory": "التوصيل بصفة عامة", "product": "غير محدد", "deliveryCity": "غير محدد" }
    ]
  }

- الرسالة: "3ayb 3likom trico mxrg" أو "wslni t shirt mxrg"
  المخرج:
  {
    "intents": [
      { "mainCategory": "الشكاوى أو المشاكل", "subCategory": "غير محدد", "product": "اسم المنتج الرسمي من الإعدادات", "deliveryCity": "غير محدد" }
    ]
  }

- الرسالة: "x7l tmn dyl ba9at mayri o tosil l casa, wax kayn trico l5dr"
  المخرج:
  {
    "intents": [
      { "mainCategory": "أسئلة عن المنتج", "subCategory": "الثمن", "product": "باقة مايري", "deliveryCity": "غير محدد" },
      { "mainCategory": "الشحن والتوصيل", "subCategory": "غير محدد", "product": "غير محدد", "deliveryCity": "الدار البيضاء" },
      { "mainCategory": "أسئلة عن المنتج", "subCategory": "التوفر", "product": "اسم المنتج الرسمي من الإعدادات", "deliveryCity": "غير محدد" }
    ]
  }

** القيمة المخرجة (JSON فقط مطابق للهيكل):
{
  "intents": [
    {
      "mainCategory": "اسم القسم الرئيسي",
      "subCategory": "القسم الفرعي أو غير محدد",
      "product": "اسم المنتج الرسمي من القائمة أو غير محدد",
      "deliveryCity": "اسم مدينة التوصيل من القائمة أو غير محدد"
    }
  ]
}

** الرسالة المراد تصنيفها الآن:
"${userText}"`;
}

export function buildVoiceSystemPrompt(
  ctx: MerchantContext,
  formattedProducts: string,
  citiesBlockText: string,
) {
  return `${classificationRules(ctx, formattedProducts)}

استمع للتسجيل الصوتي كاملاً. المتحدث زبون مغربي قد يستخدم الدارجة أو العربية أو الفرنسية أو مزيجاً منها.

${citiesBlockText}
** القيمة المخرجة (JSON فقط):
{
  "transcription": "النص المفرّغ حرفياً من الصوت",
  "intents": [
    {
      "mainCategory": "اسم القسم الرئيسي",
      "subCategory": "القسم الفرعي أو غير محدد",
      "product": "اسم المنتج الرسمي من القائمة أو غير محدد",
      "deliveryCity": "اسم مدينة التوصيل من القائمة أو غير محدد"
    }
  ]
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

export function matchCityId(
  name: string,
  cities: { id: string; name: string }[],
): string | null {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, " ");
  const exact = cities.find(
    (c) => c.name.trim().toLowerCase().replace(/\s+/g, " ") === normalized,
  );
  if (exact) return exact.id;
  return null;
}

/**
 * مطابقة اسم مدينة داخل نص الرسالة (شبكة أمان محلية إذا لم يتعرف Gemini).
 * نستعمل حدود كلمات حتى لا تتطابق "سلا" مثلاً داخل "سلالة".
 */
export function findCityInText(
  text: string,
  cities: { id: string; name: string }[],
): string | null {
  const norm = text.toLowerCase().replace(/[\s\u0640]+/g, " ").trim();
  for (const city of cities) {
    const name = city.name.trim().toLowerCase().replace(/[\s\u0640]+/g, " ");
    if (!name) continue;
    // نبني صيغتي الاسم: كاملة، ومجردة من "ال" التعريف (المعتادة بعد حرف الجر)
    const variants = new Set([name]);
    if (name.startsWith("ال")) variants.add(name.slice(2));
    for (const variant of variants) {
      const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // يُسمح قبل الاسم بحدود كلمة أو بأدوات متصلة شائعة: ال، و، ف، ب، ل، ك + ال
      const re = new RegExp(
        `(^|[^\\p{L}\\p{N}])(?:ال|لل|[وفبلك](?:ال)?)?${escaped}(?![\\p{L}\\p{N}])`,
        "u",
      );
      if (re.test(norm)) return city.id;
    }
  }
  return null;
}
