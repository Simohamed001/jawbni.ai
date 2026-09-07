# وصف شامل لمشروع jawbni.ai — (لـ Gemini)

> هذا الوصف يجمع كل تفاصيل المشروع الفنية: البنية، قاعدة البيانات، المصادقة، طبقة الذكاء الاصطناعي، كل الـ APIs، كل الواجهات، والملاحظات الفنية. استخدمه لفهم المشروع كاملاً قبل اقتراح أي تعديل على ملفات محددة.

---

## 1. نظرة عامة

**jawbni.ai** هو تطبيق SaaS بالعربية (RTL) موجّه للتجار المغاربة، يعمل كـ **صندوق رسائل ذكي يصنّف تلقائياً رسائل العملاء**.

المهام الأساسية:
- استقبال رسائل العملاء (نصية + صوتية بالدارجة/العربية/الفرنسية/Franco-Arabic)
- **تصنيف كل رسالة تلقائياً** إلى أقسام: الشكاوى أو المشاكل، أسئلة عن المنتج، الشحن والتوصيل، التأكيد، رسائل تحتاج مراجعة
- **تحويل الصوتيات إلى نص** (transcription) عبر Gemini
- تنظيم الرسائل في واجهة Inbox في شكل شجرة تصنيفات
- قوالب ردود جاهزة (Group Replies) مبنيّة حسب (التصنيف × المنتج)
- إدارة فئات فرعية ومنتجات وربط منتج↔تصنيف لكل تاجر
- واجهة إعدادات موحدة لإدارة كل ذلك

---

## 2. التقنيات (Tech Stack)

| التقنية | الإصدار | ملاحظات |
|---|---|---|
| Next.js (App Router) | **16.3.1** | ⚠️ نسخة فيها breaking changes — الـ Middleware سُمّي `proxy` بدل `middleware` |
| React | 19.2.8 | |
| TypeScript | 5 | `strict: true` |
| Prisma ORM | 6.19.3 | قاعدة بيانات **SQLite** |
| NextAuth (Auth.js) | 5.0.0-beta.32 | Credentials provider + JWT |
| Google Gemini | `@google/generative-ai ^0.24.1` | نماذج text + audio |
| Tailwind CSS | 4 | عبر `@import "tailwindcss"` |
| zod | 4.4.3 | التحقق من مخرجات AI |
| lucide-react | 1.33.0 | الأيقونات |
| bcryptjs | 3.0.3 | تشفير كلمات المرور |

**Path alias**: `"@/*": ["./src/*"]`

---

## 3. بنية المجلدات

```
jawbni.ai/
├── .env                      # DATABASE_URL, AUTH_SECRET, GOOGLE_AI_API_KEY, NEXTAUTH_URL
├── .env.example
├── next.config.ts            # فقط { compress: true }
├── tsconfig.json
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts               # مستخدم تجريبي + فئات + منتجات
│   └── dev.db                # SQLite
├── public/uploads/audio/     # الملفات الصوتية المرفوعة
└── src/
    ├── proxy.ts              # ⚠️ الـ middleware (Next 16)
    ├── types/next-auth.d.ts  # توسيع أنواع الجلسة
    ├── lib/
    │   ├── auth.ts           # إعداد NextAuth
    │   ├── api-auth.ts       # requireMerchantId() + استجابات خطأ موحدة
    │   ├── prisma.ts         # Prisma singleton
    │   ├── categories.ts     # seedDefaultCategories + getReviewCategory
    │   ├── utils.ts          # ثوابت + أدوات
    │   ├── audio.ts          # حفظ/تحقق الملفات الصوتية
    │   ├── wav.ts            # تحويل صوت للـ WAV (clientside)
    │   └── ai/
    │       ├── gemini-rotation.ts  # عميل Gemini + تدوير النماذج
    │       ├── classifier.ts       # تصنيف النصوص والصوت
    │       ├── transcribe.ts       # تحويل الصوت إلى نص
    │       ├── prompt.ts           # أنظمة البرومبتات + zod schema
    │       └── cache.ts            # LRU cache للتصنيفات
    ├── components/
    │   ├── dashboard-nav.tsx
    │   ├── ui/button.tsx          # Button + Input + Textarea
    │   └── inbox/
    │       ├── CategoryTree.tsx
    │       ├── InboxLayout.tsx
    │       ├── MessageComposer.tsx
    │       └── MessageList.tsx
    └── app/
        ├── layout.tsx, page.tsx, globals.css
        ├── login/page.tsx
        ├── register/page.tsx
        ├── dashboard/
        │   ├── layout.tsx, page.tsx
        │   ├── inbox/page.tsx
        │   └── settings/
        │       ├── page.tsx
        │       ├── unified/page.tsx          # ⭐ واجهة الإعدادات الرئيسية (926 سطر)
        │       ├── merchant/page.tsx         # → redirect لواجهة unified
        │       ├── categories/page.tsx       # → redirect
        │       ├── products/page.tsx         # → redirect
        │       ├── product-mapping/page.tsx  # → redirect
        │       └── replies/page.tsx          # → redirect
        └── api/
            ├── auth/[...nextauth]/route.ts
            ├── auth/register/route.ts
            ├── cache/clear/route.ts
            ├── group-replies/route.ts
            ├── inbox/tree/route.ts
            ├── main-categories/route.ts
            ├── merchant-settings/route.ts
            ├── messages/route.ts
            ├── messages/[id]/classify/route.ts
            ├── product-mappings/route.ts
            ├── products/route.ts
            └── subcategories/route.ts
```

---

## 4. قاعدة البيانات (prisma/schema.prisma)

**Datasource**: `sqlite` — **Generator**: `prisma-client-js`

### Enums
| Enum | القيم |
|---|---|
| `MessageType` | `text`, `voice` |
| `MessageSource` | `demo`, `manual` |
| `MessageStatus` | `pending`, `classified`, `replied` |

### User
| Field | Type | ملاحظات |
|---|---|---|
| `id` | String | `@id @default(cuid())` |
| `email` | String | `@unique` |
| `passwordHash` | String | bcrypt |
| `name` | String | |
| `createdAt` / `updatedAt` | DateTime | |
| `merchant` | MerchantProfile? | 1:1 |

### MerchantProfile (1:1 مع User)
| Field | Type | ملاحظات |
|---|---|---|
| `id` | String | cuid |
| `userId` | String | `@unique` — Cascade delete |
| `shopName` | String | |
| `locale` | String | default `"ar"` |
| `singleProduct` | Boolean | default `false` — يؤثر على سلوك التصنيف |

علاقات: `mainCategories[]`, `subCategories[]`, `products[]`, `messages[]`, `groupReplies[]`

### MainCategory
| Field | Type | ملاحظات |
|---|---|---|
| `id` | String | cuid |
| `merchantId` | String | FK → Cascade |
| `name` | String | `@@unique([merchantId, name])` |
| `description` | String? | |
| `isSystem` | Boolean | default `false` — فئة "تحتاج مراجعة" هي system |
| `sortOrder` | Int | default `0` |

علاقات: `subCategories[]`, `classifications[]`, `additionalClassifications[]`, `groupReplies[]`, `categoryMappings[]`

### SubCategory
| Field | Type | ملاحظات |
|---|---|---|
| `id` | String | cuid |
| `merchantId` | String | Cascade |
| `mainCategoryId` | String? | FK → `onDelete: SetNull` |
| `name` | String | `@@unique([merchantId, name, mainCategoryId])` |
| `description` | String? | |
| `sortOrder` | Int | |

### Product
| Field | Type | ملاحظات |
|---|---|---|
| `id` | String | cuid |
| `merchantId` | String | Cascade |
| `officialName` | String | `@@unique([merchantId, officialName])` |
| `keywords` | String | JSON string، default `"[]"` — كلمات مفتاحية للتعرف على المنتج |
| `isSold` | Boolean | default `true` — يؤثر على ظهور المنتج في الـ tree |

### ProductCategoryMapping (رابط منتج↔تصنيف)
| Field | Type | ملاحظات |
|---|---|---|
| `id` | String | cuid |
| `productId` | String | Cascade |
| `mainCategoryId` | String | Cascade |
| `subCategoryId` | String? | `onDelete: SetNull` |
| `priority` | Int | default `0` |
| | | `@@unique([productId, mainCategoryId, subCategoryId])` |

### Message
| Field | Type | ملاحظات |
|---|---|---|
| `id` | String | cuid |
| `merchantId` | String | Cascade |
| `customerName` | String | |
| `body` | String | للصوتيات يكون "🎤 رسالة صوتية" إن لم يوجد transcription |
| `messageType` | MessageType | default `text` |
| `audioPath` | String? | URL مسار الصوت |
| `transcription` | String? | نص التفريغ الصوتي |
| `source` | MessageSource | default `manual` |
| `status` | MessageStatus | default `pending` |
| `receivedAt` | DateTime | default `now()` |
| `additionalClassifications` | String? | JSON string للتصنيفات الثانوية |
| `classification` | Classification? | 1:1 |

### Classification (التصنيف الأساسي)
| Field | Type | ملاحظات |
|---|---|---|
| `id` | String | cuid |
| `messageId` | String | `@unique` → Cascade |
| `mainCategoryId` | String | FK |
| `subCategoryId` | String? | FK |
| `productName` | String | default `"غير محدد"` |
| `rawAiResponse` | String? | الاستجابة الخام من Gemini |
| `isPrimary` | Boolean | default `true` |

### AdditionalClassification (تصنيفات ثانوية)
| Field | Type | ملاحظات |
|---|---|---|
| `id` | String | cuid |
| `messageId` | String | Cascade — `@@index([messageId])` |
| `mainCategoryId` | String | `@@index([mainCategoryId])` |
| `subCategoryId` | String? | |
| `productName` | String | default `"غير محدد"` |

### GroupReply (قالب رد)
| Field | Type | ملاحظات |
|---|---|---|
| `id` | String | cuid |
| `merchantId` | String | Cascade |
| `mainCategoryId` | String | FK |
| `productId` | String? | FK |
| `subCategoryId` | String? | FK |
| `replyText` | String | default `""` |
| | | `@@unique([merchantId, mainCategoryId, productId, subCategoryId])` |

---

## 5. الثوابت والإعدادات الافتراضية (src/lib/utils.ts)

- `UNDEFINED_LABEL = "غير محدد"`
- `REVIEW_CATEGORY_NAME = "رسائل تحتاج مراجعة"`
- **DEFAULT_MAIN_CATEGORIES** (5 فئات تُنشأ عند تسجيل أي تاجر):
  1. `الشكاوى أو المشاكل` (isSystem: false)
  2. `أسئلة عن المنتج` (isSystem: false)
  3. `الشحن والتوصيل` (isSystem: false)
  4. `التأكيد` (isSystem: false)
  5. `رسائل تحتاج مراجعة` (isSystem: **true**)

- **DEFAULT_SUB_CATEGORIES**:
  - `أسئلة عن المنتج` → `["الثمن", "التوفر", "المواصفات"]`
  - `الشحن والتوصيل` → `["مدة التوصيل", "تكلفة الشحن"]`
  - `الشكاوى أو المشاكل` → `["منتج تالف", "تأخر التوصيل"]`

- `cn()` = `twMerge(clsx(...))`
- `formatTime(date)` = `toLocaleTimeString("ar-MA", { hour: "2-digit", minute: "2-digit" })`
- `parseKeywords(raw)` — تقسيم على `,` / `،` / أسطر جديدة
- `keywordsToString(keywords)` — JSON → string مفصولة بـ ", "

---

## 6. نظام المصادقة

### src/lib/auth.ts — NextAuth v5 (Credentials + JWT)
- Provider واحد: **Credentials** (`email` / `password`)
  - `authorize()`: يجد المستخدم بالبريد، يقارن `bcrypt.compare` مقابل `passwordHash`، يرجع `{ id, email, name, merchantId }` (merchantId من `user.merchant?.id ?? null`)
- Session strategy: **jwt**
- Cookie: `next-auth.session-token` — `httpOnly: true, path: "/", secure: false` (قسراً غير secure حتى في الإنتاج)
- الاستدعاءات:
  - `jwt` callback: ينسخ `merchantId` للـ token
  - `session` callback: `session.user.id = token.sub`، `session.user.merchantId = token.merchantId`
- `secret` = `AUTH_SECRET`, `trustHost: true`, صفحة الدخول `/login`

### src/types/next-auth.d.ts
يوسع `Session.user { id: string; merchantId: string | null }`، `User { merchantId? }`، `JWT { merchantId? }`

### src/proxy.ts — حارس المسارات (Next 16)
- ⚠️ **في Next.js 16 الـ Middleware أصبح اسمه `proxy`** والتصدير `export function proxy(req: NextRequest)`
- المسارات العامة: `/login`, `/register`, `/api/auth`, `/api/register`, `/`
- يفحص 4 أسماء كوكيز محتملة: `next-auth.session-token`, `__Secure-next-auth.session-token`, `authjs.session-token`, `__Secure-authjs.session-token`
- غير مصادق على مسار محمي → `302 /login`
- مصادق يزور `/login` أو `/register` → `302 /dashboard/inbox`
- `/uploads/*` مستثنى من حماية الدخول
- `matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]`

### src/lib/api-auth.ts
- `requireMerchantId()`: يقرأ الجلسة، إن لا يوجد `user.id` يرمي `Error("UNAUTHORIZED")`، يبحث عن الـ merchant، إن لم يوجد يرمي كذلك، يرجع `{ session, merchantId }`
- `unauthorizedResponse()` → `401 { error: "غير مصرح" }`
- `badRequest(message)` → `400 { error: message }`
- ⚠️ نمط معالجة الأخطاء: كل route تكشف `(e as Error).message === "UNAUTHORIZED"` لإرجاع 401، وإلا `500 { error: "خطأ" }`

### التسجيل (src/app/api/auth/register/route.ts)
- **POST** body: `{ email, password, name, shopName }`
- تحقق كل الحقول → `400 "جميع الحقول مطلوبة"`، البريد مستخدم → `400 "البريد الإلكتروني مستخدم بالفعل"`
- bcrypt hash (cost 12) → `user.create` مع `merchant.create` متداخل `{ shopName, locale: "ar" }`
- `seedDefaultCategories(merchant.id)` → ينشئ 5 فئات رئيسية + الفئات الفرعية الافتراضية
- يرجع `200 { success, user: { email, name } }`
- **GET** → `{ user: session?.user ?? null }`

---

## 7. طبقة الذكاء الاصطناعي (تعمل حالياً بـ Gemini)

### 7.1 src/lib/ai/gemini-rotation.ts — العميل + التدوير
- `GEMINI_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-3.1-pro-preview", "gemini-3-flash-preview"]`
- `AUDIO_FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]`
- `MAX_REQUESTS_PER_MODEL = 20` → بعد 20 طلباً يدور للنموذج التالي (`recordRequest()`)
- `getGeminiClient(modelName, jsonOutput)` — يبني `GenerativeModel`، مع `responseMimeType: "application/json"` عند الحاجة
- مفتاح API من `process.env.GOOGLE_AI_API_KEY`
- يُصدّر: `getCurrentModel`, `recordRequest`, `isGeminiConfigured`, `getGeminiClient`, `getGeminiApiKey`, `getAudioModelCandidates`, `resetRequestCount`, `getRotationStatus`

### 7.2 src/lib/ai/prompt.ts — البرومبتات + المخطط
- `classificationSchema = z.object({ mainCategory: string, subCategory: string, product: string })`
- `MerchantContext`: `{ mainCategories, subCategories, products, reviewCategoryName, singleProduct }`
- `buildSystemPrompt(ctx, formattedProducts, userText)`:
  - قواعد التصنيف (بالعربية): أولوية الشكاوى → الشحن → التأكيد
  - منتج واحد مقابل عدة منتجات (يعتمد على `singleProduct`)
  - منتج غير موجود في قائمة التاجر/عدم تطابق 100% → "رسائل تحتاج مراجعة"
  - "غير محدد" بدل null
  - المخرجات JSON: `{ "mainCategory", "subCategory", "product" }`
- `buildVoiceSystemPrompt(ctx, formattedProducts)`:
  - نفس القواعد + المخرجات: `{ "transcription", "mainCategory", "subCategory", "product" }`
- `matchCategoryId(name, categories)` — تطابق دقيق ثم جزئي (includes)

### 7.3 src/lib/ai/cache.ts — التخزين المؤقت
- **classificationCache** — LRU، `maxSize: 10,000`، TTL **120 دقيقة**، المفتاح `merchantId:normalizedText`
  - التطبيع: lowercase، إزالة رموز، توحيد `أ/إ/آ→ا`، `ة→ه`، `ي/ى→ي`، إزالة التشكيل
- **audioCache** — LRU، `maxSize: 500`، TTL 120 دقيقة، المفتاح `audio:${merchantId}:${filePath}` (المسار وليس الهاش!)
- ⚠️ لا يُمسح أي cache تلقائياً عند تعديل الفئات/المنتجات — فقط عبر `POST /api/cache/clear`

### 7.4 src/lib/ai/transcribe.ts — الصوت → نص
- `transcribeAudio(filePath)` — يفرّغ الصوت بالنص فقط (prompt يطلب الدارجة/العربية/الفرنسية/Franco-Arabic)
- `generateFromVoicePrompt(filePath, prompt)` — صوت + prompt مخصص → `{ raw, json }`
- `generateFromAudio()`:
  1. **Inline base64** أولاً عبر `model.generateContent([{ inlineData }, { text }])`
  2. إن فشل → **رفع الملف** عبر `GoogleAIFileManager` + انتظار PROCESSING (≤ 4 ثوانٍ) ثم generateContent بـ `fileData`، وحذف الملف في `finally`
  3. يجرب كل النماذج (الحالي ثم fallback حيث 2.5/2.0/1.5 flash) × أوضاع JSON
- `normalizeTranscript()` — يزيل backticks واقتباسات، ويتجاهل النصوص التي تبدأ بـ "🎤 رسالة صوتية"

### 7.5 src/lib/ai/classifier.ts — التصنيف (قلب النظام)
- **`classifyMessage(merchantId, messageText)`**:
  1. فحص classificationCache → hit يرجع مباشرة
  2. `loadMerchantContext()` — يقرأ: الفئات، الفئات الفرعية، المنتجات المباعة + keywords، فئة المراجعة، singleProduct
  3. إذا النص هو "🎤 رسالة صوتية" → يرجع فئة المراجعة مباشرة (بدون AI)
  4. وإلا: `getGeminiClient()` + `recordRequest()` + `generateContent(systemPrompt)`
  5. استخراج JSON من الاستجابة (`match(/\{[\s\S]*\}/)`) + `classificationSchema.parse`
  6. **Fallback على كلمات مفتاحية** عند فشل AI: livraison/توصيل/shipping→الشحن، confirm/تأكيد/commande→التأكيد، problème/مشكلة/شكوى/plainte/bug/erreur/خطأ/مكسور/تالف→الشكاوى، وإلا فئة المراجعة
  7. `mapParsedClassification()` → يطابق `mainCategory`/`subCategory` بالمعرّفات، ويعالج `singleProduct`
  8. override خاص بالمرتجعات: `رجع|ارجاع|إرجاع|مرتجع|استبدال|nrj3|return|retour` → فئة "المرتجعات" إن وُجدت
  9. تخزين في cache

- **`classifyVoiceMessage(merchantId, audioFilePath)`**:
  1. فحص audioCache
  2. يحاول التصنيف الصوتي المباشر: `generateFromVoicePrompt` (JSON): `{ transcription, mainCategory, subCategory, product }`
  3. إن نجح: يخزّن في audioCache + classificationCache
  4. إن فشل: `transcribeAudio` → `classifyMessage` (نص) → إن وصلت فئة المراجعة يعود لكلمة-keyword matching النهائي
  5. يخزّن النتيجة دائماً في cache

- **`reviewFallback(merchantId)`** — يعيد فئة المراجعة (بدون AI)

### 7.6 تدفق التصنيف الصوتي الكامل في POST /api/messages
1. `saveAudioFile` → تحقق الحجم ≤ 10MB + الـ MIME
2. `classifyVoiceMessage` (Gemini مباشرة على الصوت)
3. `transcription = voiceResult.transcription || تحديد يدوي || null`
4. إن لم يجد AI transcription وصاحب الطلب أرسل transcription يدوي → `classifyMessage(merchantId, transcriptionManual)`
5. `body = transcription || "🎤 رسالة صوتية"`
6. `detectAdditionalClassifications(merchantId, text, primary)` — تصنيفات ثانوية:
   - كلمات شحن/توصيل/استلام/livraison/shipping → يضيف تصنيف "الشحن والتوصيل"
   - ظهور اسم أي فئة أخرى حرفياً في النص → يضيفها
   - أسئلة منتج (`؟|واش|هل|كيف|شنو|شحال|كم|متى|بغيت|...` + مطابقة منتج بالاسم أو keyword) → يضيف
   - إزالة التكرارات مع الـ primary
7. حفظ Message مع `status: "classified"` + `additionalClassifications` (JSON string أو null) + `classification.create` متداخل

### 7.7 تصنيفات إضافية (Additional Classification) — ملاحظة
تُخزَّن **مزدوجة**: سجلات `AdditionalClassification` في DB + `additionalClassifications` JSON string على الرسالة. الـ GET tree والـ messages يعتمدان على الـ JSON string.

---

## 8. كل الـ API Routes بالتفصيل

> كل الـ routes المحمية تستخدم `requireMerchantId()`. أنماط الخطأ: `UNAUTHORIZED`→401، غير موجود→404، وإلا 500.

### POST /api/cache/clear
- يمسح `classificationCache.clear()` + `audioCache.clear()` → `200 { success, message: "تم مسح الـ cache بنجاح" }`

### GET /api/group-replies
- query اختياري: `mainCategoryId`, `productId`, `subCategoryId`
- `groupReply.findMany` مع include العلاقات → مصفوفة

### POST /api/group-replies
- body: `{ mainCategoryId, productId, subCategoryId, replyText }`
- `mainCategoryId` مطلوب → 400 "التصنيف الرئيسي مطلوب"
- **upsert** على المفتاح المركب `merchantId_mainCategoryId_productId_subCategoryId`
- `productId || null`, `subCategoryId || null`, `replyText || ""`

### DELETE /api/group-replies?id=
- حذف مع scoping بالـ merchant → `{ success: true }`

### GET /api/inbox/tree — شجرة التصنيف (الصفحة الرئيسية للـ inbox)
- 4 استعلامات متوازية:
  1. الفئات الرئيسية + الفئات الفرعية مصفوفة من نوع ما
  2. `productCategoryMapping` (منتجات مباعة)
  3. الرسائل التي لها `classification` (مع include)
  4. `merchantProfile.singleProduct`
- بناء الشجرة: **main → products → subs** أو **main → subs** (حسب singleProduct)
- شكل العقدة: `{ id, label, type: "main"|"product"|"sub", count, mainCategoryId?, productName?, subCategoryId?, children? }`
- عقدة "غير محدد" تُضاف دائماً في وضع المنتج الواحد

### GET /api/main-categories
- كل فئات التاجر مع `subCategories` و `_count.classifications` → مصفوفة

### POST /api/main-categories
- body: `{ name, description }` — name مطلوب
- `sortOrder = count` الحالي (إلحاق في النهاية)
- ⚠️ لا يوجد فحص تكرار الاسم رغم `@@unique` (يظهر كخطأ 500)

### PATCH /api/main-categories?id=
- body: `{ name, description, sortOrder }` — أي منها
- `findFirst` scoping → 404 "غير موجود" إن غاب

### DELETE /api/main-categories?id=
- إن `isSystem` → 400 "لا يمكن حذف هذا التصنيف"
- `getReviewCategory` (ينشئها إن غابت)
- `classification.updateMany` → يعيد توجيه كل تصنيفات الفئة إلى فئة المراجعة + `subCategoryId: null`
- ثم حذف الفئة
- ⚠️ لا يمسح الفئات الفرعية ولا groupReplies ولا الـ caches

### GET/PATCH /api/merchant-settings
- **GET**: `{ id, shopName, locale, singleProduct }` — 404 إن غاب
- **PATCH**: body أي من `{ singleProduct, shopName, locale }` → يعيد السجل كاملاً

### GET /api/messages
- query: `mainCategoryId`, `subCategoryId`, `productName`, `q`
- `q` → OR على `body`/`customerName`/`transcription`
- `mainCategoryId` → OR: `classification.mainCategoryId (مع sub/product)` أو `additionalClassifications` contains
- ⚠️ **Bugs:** عند تمرير `q` + `mainCategoryId` معاً، الـ `OR` الثاني **يكتب فوق الأول** (last-key-wins في JS كائن) → البحث النصي يضيع. يحتاج `merge` صحيح.
- يعيد مصفوفة Messages مع `additionalClassifications` محلّلة من JSON + classification joined

### POST /api/messages — ⭐ نقطة دخول AI
- يقبل **multipart/form-data أو JSON**
- form: `customerName`, `messageType`, `transcription`, `source`, `audio` (صوت), `body` (نص)
- JSON: `customerName`, `body`, `messageType`, `transcription`, `audioPath`, `source`
- مسار الصوت: فحص الملف → `saveAudioFile` → `classifyVoiceMessage` → اختيار classification → حفظ
- مسار النص: validate `body.trim()` → `classifyMessage`
- **$5300ms timeout**: `classifyMessage` محاط بـ `Promise.race` مع مؤقت 8 ثوانٍ → إن تأخر يرجع `reviewFallback`
- نداء `detectAdditionalClassifications`
- حفظ: `message.create` + nested `classification.create` → `201`
- ⚠️ خطأ 500 يكشف `e.message` الخام (قد يتسرب نص خطأ Gemini)

### POST /api/messages/[id]/classify — إعادة تصنيف
- params: `Promise<{ id }>` (Next 16 async params — يجب `await` عليه)
- إن كانت صوتية وملف الصوت موجود: `classifyVoiceMessage` → transcription → classify
- إن لم يوجد: نص = `message.body` → `classifyMessage`
- تحديث `status: "classified"` + upsert Classification

### PATCH /api/messages/[id]/classify — تصحيح تفريغ صوتي
- body: `{ transcription }` — يجب أن تكون الرسالة `messageType: "voice"` (404 وإلا)
- `body = transcription || message.body` → `classifyMessage`
- تحديث `transcription` (يمكن null) + `body: transcription || "🎤 رسالة صوتية"` + upsert
- ⚠️ **Bug:** لا يمسح نتيجة audioCache القديمة للصوت بعد التصحيح

### GET/POST/DELETE /api/product-mappings
- **GET**: كل التعيينات مع include
- **POST**: `{ productId, mainCategoryId, subCategoryId, priority }` — تحقق ملكية المنتج والفئة (404) والفئة الفرعية، ثم `deleteMany` للتعيين القديم + create جديد
- **DELETE**: `?clear=true` (حذف كل التعيينات) أو `?id=` (حذف واحد مع scoping)

### GET/POST/PATCH/DELETE /api/products
- **POST**: `{ officialName, keywords }` — name مطلوب، keywords يتم تحليلها (array أو string بـ parseKeywords) → `JSON.stringify`
- **PATCH**: `{ officialName, keywords, isSold }`
- **DELETE**: حذف مع scoping
- ⚠️ احذر `@@unique([merchantId, officialName])` — التكرار ينتج 500

### GET/POST/PATCH/DELETE /api/subcategories
- **GET**: query اختياري `mainCategoryId`
- **POST**: `{ name, mainCategoryId, description }` — `sortOrder = count`
- **PATCH**: `{ name, description, sortOrder, mainCategoryId }`
- **DELETE**: أولاً `classification.updateMany { subCategoryId: null }` ثم حذف
- ⚠️ لا يمسح `additionalClassifications` التي تذكر الفئة الفرعية ولا الـ caches

---

## 9. الواجهات (Frontend)

### التصميم العام
- كل الصفحات **عربية RTL**، ألوان واتساب: teal `#075E54`، أخضر `#25D366`، خلفية `#f0f2f5`، خلفية الدردشة `#efeae2`
- لا useSWR/React Query — كل الداتا عبر `fetch` داخل `useEffect`/handlers مع `useCallback` وإعادة تحميل كاملة بعد أي تغيير

### / — page.tsx
- Server component: `session` موجود → `redirect("/dashboard/inbox")` وإلا `redirect("/login")`

### /login — page.tsx
- `signIn("credentials", { email, password, redirect: false })` من next-auth/react
- بيانات تجريبية مملوءة مسبقاً: `demo@jawbni.ai` / `demo1234`
- نجاح → `router.push("/dashboard/inbox")` + `router.refresh()`

### /register — page.tsx
- `POST /api/auth/register` `{ name, shopName, email, password }`
- نجاح → `/login`
- يستخدم `Input` من `@/components/ui/button`

### dashboard/layout.tsx
- Server guard: لا session → `redirect("/login")`
- Header: براند → `/dashboard/inbox` + `DashboardNav` + نموذج logout (server action `signOut({ redirectTo: "/login" })`)

### components/dashboard-nav.tsx
- `hidden md:flex` (⚠️ لا يظهر للموبايل!)
- الروابط: "الرسائل" → `/dashboard/inbox`، "الإعدادات" → `/dashboard/settings`
- زر "مسح الـ Cache" → `POST /api/cache/clear` — حالة `clearingCache` + مؤشر "تم ✓" لـ 3 ثوانٍ

### components/inbox/CategoryTree.tsx
- شجرة تصنيفات قابلة للطي: root → products → subs / أو root → subs
- ألوان الأيقونات: main=أخضر (Layers3)، product=أزرق (Package)، sub=كهرماني (Folder)
- `onSelect(node)` للنقر

### components/inbox/MessageList.tsx
- فقاعات بأسلوب واتساب، رأس اسم العميل بنفسجي
- صوتية: أيقونة مايك + تسمية "رسالة صوتية" + `<audio controls>` + transcription أو **نموذج إدخال يدوي** مع زر "حفظ وإعادة تصنيف"
- footer التصنيف: فئة رئيسية teal + `/sub` + `/product` + الخطوط الثانوية
- timestamp عبر `formatTime` (ar-MA)

### components/inbox/MessageComposer.tsx
- وضع النص ↔ الصوت
- تسجيل صوتي: `MediaRecorder` مع إعادة محاولة على الميكروفونات (NotReadableError → enumerateDevices)، اختيار MIME مدعوم، قطع 250ms
- تحويل إلى WAV عبر `blobToWavFile` (فشل التحويل → يرجع الـ blob الأصلي)
- رفع ملف صوتي (accept="audio/*")
- "نسخ يدوي احتياطي" input
- أخطاء عربية مفصّلة (NotAllowedError/SecurityError/NotReadableError/AbortError)
- ⚠️ خط شكلي: `if (!stream!)` في السطر ~61

### components/inbox/InboxLayout.tsx — ⭐ المسؤول الرئيسي للـ inbox
- عمودين: sidebar 280px (تصنيفات + بحث) + منطقة الدردشة
- API calls:
  - `GET /api/inbox/tree`
  - `GET /api/messages?mainCategoryId&subCategoryId&productName&q`
  - `GET /api/products`
  - `GET /api/group-replies?mainCategoryId&productId&subCategoryId`
  - `POST /api/group-replies`
  - `PATCH /api/messages/[id]/classify`
- state: `tree, selected, messages, groupReply, search, saving`
- يختار أول عقدة فيها `count > 0` تلقائياً
- منطق الـ group reply: يرسل `productId` إلا إذا كان الـ bucket هو "غير محدد" (يرسل null)
- ⚠️ **Bug/residual:** `groupReply` و `saveGroupReply` معرّفان لكن **لا يوجد حقل في Composer يعرضهما** — وظيفة القوالب الجاهزة غير مكتملة واجهةً

### dashboard/settings/unified/page.tsx — ⭐ إعدادات موحدة (926 سطر)
- 4 مديرين في صفحة واحدة:
  1. **إعدادات المتجر**: toggle "منتج واحد"/"عدة منتجات" → `PATCH /api/merchant-settings { singleProduct }`
  2. **الأقسام الرئيسية والفرعية**: إضافة/حذف فئات، توسعة لعرض الفرعية
  3. **المنتجات المباعة**: modal إضافة/تعديل (name, keywords، ربط بفئة) + toggle "يباع"/"غير مباع" + حذف
  4. Modals موافق للوصول (`role="dialog"`, `aria-modal`)
- state كبير: `mainCategories, products, subCategories, merchantSettings, productMappings, expandedCategory, ...`
- إضافة منتج → `POST /api/products` ثم إن اختيرت فئة `POST /api/product-mappings`
- تعديل منتج مع تغيير فئة → `DELETE` التعيين القديم + `POST` جديد
- تحليل الكلمات المفتاحية معالج لـ JSON arrays و comma/سطر

### إعدادات أخرى (redirect stubs)
`merchant`, `categories`, `products`, `product-mapping`, `replies` → كلها `redirect("/dashboard/settings/unified")`

---

## 10. النسخة التجريبية (prisma/seed.ts)
- يحذف كل الجداول بترتيب آمن
- `demo@jawbni.ai` / `demo1234` — name "تاجر تجريبي"، shopName "متجر الدمو"
- `seedDefaultCategories` + فئتان: `العروض` (sortOrder 10)، `المرتجعات` (sortOrder 11)
- فئة فرعية: `اللون` تحت "أسئلة عن المنتج"
- 3 منتجات:
  - `كريم الترطيب` — keywords `["krem","crème","krim","كريم","ترطيب"]`
  - `سيرum للوجه` — keywords `["serum","sérum","سيروم","serum"]` (⚠️ فيها خطأ كتابي "سيرum" في البيانات)
  - `عطر فاخر` — keywords `["parfum","عطر","perfume","oud"]`
- لا توجد رسائل أو قوالب رد في الـ seed

---

## 11. إعدادات البيئة (env)

```
DATABASE_URL="file:./dev.db"
AUTH_SECRET="..."
GOOGLE_AI_API_KEY="..."
NEXTAUTH_URL="http://localhost:3000"
```

---

## 12. الأوامر

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | Next dev |
| `npm run build` | `prisma generate && next build` |
| `npm run start` | Next start |
| `npm run lint` | ESLint |
| `npm run db:push` | Prisma db push |
| `npm run db:seed` | tsx prisma/seed.ts |
| `npm run db:setup` | db push + seed |

---

## 13. أخطاء وملاحظات فنية مهمة (Bug list معروفة)

1. **`GET /api/messages`**: عند دمج `q` مع `mainCategoryId`، الـ `OR` الثاني يمحو الأول → البحث النصي يضيع (خطأ في بناء where)
2. **`inbox/tree`**: `filter((t) => t.count > 0 || true)` — بلا معنى (no-op)
3. **`POST /api/messages`**: يرجّع `e.message` الخام في 500 — يكشف تفاصيل داخلية/أخطاء Gemini
4. **`PATCH /api/messages/[id]/classify`**: لا يمسح audioCache بعد تصحيح transcription → إعادة التصنيف عبر POST تستخدم transcription قديم
5. **المسح المؤجل**: تعديل الفئات/المنتجات لا يمسح classificationCache → نتائج قديمة حتى انتهاء TTL (120 دقيقة)
6. **cookie**: `secure: false` حتى في الإنتاج
7. **register**: لا rate limiting ولا سياسة كلمة مرور
8. **حذف فئة رئيسية**: لا ينظّف groupReplies المرتبطة → حذف قد يفشل بـ 500 إن وُجدت ردود مرتبطة
9. **`groupReply` في InboxLayout**: منطق save/load موجود لكن غير مربوط بالواجهة
10. **`MessageComposer`**: `if (!stream!)` — تعبير بلا معنى (Maybe: `if (!stream)`)
11. **audioCache** بمفتاح مسار الملف (لا هاش المحتوى) → نفس الملف بمسار جديد = حساب جديد
12. **seed**: اسم منتج "سيرum للوجه" فيه حروف لاتينية/عربية مختلطة
13. **`dashboard-nav`**: مخفي على الموبايل (`hidden md:flex`) → بلا تنقل في الموبايل من الـ header
14. **التصنيف الصوتي** يعتمد على نموذج Gemini؛ إن فشل inline يحاول File API upload — الاستمرارية تعتمد على مفتاح API

---

## 14. التدفقات الرئيسية التي يجب فهمها قبل أي تعديل

### تدفق الرسالة النصية الجديدة
```
MessageComposer (text) → POST /api/messages (JSON)
  → classifyMessage(merchantId, body)   [cache؟ → Gemini → fallback keywords → mapParsedClassification → cache]
  → detectAdditionalClassifications
  → message.create + classification.create (status="classified")
  → InboxLayout loadTree() + loadMessages()
```

### تدفق الرسالة الصوتية الجديدة
```
MessageComposer (voice) → multipart POST /api/messages
  → saveAudioFile → classifyVoiceMessage
      [audioCache؟ → Gemini صوت مباشر {transcription, mainCategory, subCategory, product}
        → فشل؟ transcribeAudio ثم classifyMessage ثم fallback keywords]
  → body = transcription || "🎤 رسالة صوتية"
  → detectAdditionalClassifications → save
```

### تدفق تصحيح تفريغ صوتي
```
MessageList (updateTranscription) → PATCH /api/messages/[id]/classify { transcription }
  → classifyMessage(body) → تحديث transcription + body + upsert Classification
  → loadTree + loadMessages
```

### تدفق تصنيف الرسائل في GET /api/messages & inbox/tree
```
Classification (primary) + AdditionalClassification / additionalClassifications JSON
تظهر في:
 - CategoryTree (شجرة بالعدد)
 - MessageList (footer الفئة + الفئات الثانوية)
```

---

*نهاية الوصف — المشروع جاهز للفهم الكامل.*