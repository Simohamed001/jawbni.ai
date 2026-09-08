import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  badRequest,
  requireMerchantId,
  unauthorizedResponse,
} from "@/lib/api-auth";

/**
 * توليد slug آمن من اسم المدينة (يدعم الأحرف العربية)
 */
function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    // eslint-disable-next-line no-control-regex
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "city";
}

/**
 * القائمة الافتراضية للمدن المغربية — تُزرع تلقائياً عند أول استخدام
 * (عندما يكون جدول DeliveryCity فارغاً)
 */
const DEFAULT_DELIVERY_CITIES = [
  "الدار البيضاء",
  "الرباط",
  "سلا",
  "تمارة",
  "المحمدية",
  "الجديدة",
  "سطات",
  "برشيد",
  "طنجة",
  "تطوان",
  "القنيطرة",
  "العرائش",
  "القصر الكبير",
  "الحسيمة",
  "فاس",
  "مكناس",
  "وجدة",
  "الناظور",
  "تازة",
  "بركان",
  "مراكش",
  "أسفي",
  "بني ملال",
  "خريبكة",
  "خنيفرة",
  "أكادير",
  "تارودانت",
  "تيزنيت",
  "كلميم",
  "العيون",
  "الداخلة",
] as const;

/**
 * توليد slug فريد: يضيف لاحقة رقمية عند التكرار
 */
async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  let suffix = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.deliveryCity.findUnique({
      where: { slug },
    });
    if (!existing) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
  }
}

/**
 * GET /api/settings/cities
 * جلب جميع المدن المسجلة.
 * إذا كان الجدول فارغاً (أول استخدام)، تُزرع القائمة الافتراضية
 * للمدن المغربية تلقائياً (مفعّلة isActive: true) ثم تُعاد للمستخدم.
 */
export async function GET(request: Request) {
  try {
    await requireMerchantId();

    const { searchParams } = new URL(request.url);
    const withMessages = searchParams.get("withMessages") === "true";

    const count = await prisma.deliveryCity.count();
    if (count === 0) {
      await prisma.deliveryCity.createMany({
        data: DEFAULT_DELIVERY_CITIES.map((name) => ({
          name,
          slug: slugify(name),
          isActive: true,
        })),
        skipDuplicates: true,
      });
    }

    // withMessages=true: المدن المفعلة فقط والتي ترتبط برسالة واحدة على الأقل
    const cities = await prisma.deliveryCity.findMany({
      where: withMessages
        ? { isActive: true, messages: { some: {} } }
        : undefined,
      orderBy: { name: "asc" },
    });
    return NextResponse.json(cities);
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}

/**
 * POST /api/settings/cities
 * إضافة مدينة جديدة (توليد الـ slug تلقائياً من الاسم)
 * Body: { name: string }
 */
export async function POST(request: Request) {
  try {
    await requireMerchantId();
    const { name } = await request.json();
    if (!name?.trim()) return badRequest("اسم المدينة مطلوب");

    const slug = await generateUniqueSlug(name);
    const city = await prisma.deliveryCity.create({
      data: {
        name: name.trim(),
        slug,
      },
    });
    return NextResponse.json(city, { status: 201 });
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}

/**
 * PATCH /api/settings/cities?id=...
 * تعديل حالة المدينة (تفعيل / تعطيل) أو تعديل الاسم
 * Body: { name?: string, isActive?: boolean }
 */
export async function PATCH(request: Request) {
  try {
    await requireMerchantId();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const body = await request.json();

    if (!id) return badRequest("المعرف مطلوب");
    if (body.name !== undefined && !body.name?.trim())
      return badRequest("اسم المدينة مطلوب");
    if (body.isActive !== undefined && typeof body.isActive !== "boolean")
      return badRequest("قيمة isActive غير صحيحة");
    if (body.name === undefined && body.isActive === undefined)
      return badRequest("لا توجد حقول للتعديل");

    const existing = await prisma.deliveryCity.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "غير موجودة" }, { status: 404 });
    }

    // عند تعديل الاسم نعيد توليد الـ slug ليبقى متطابقاً معه
    const slug =
      body.name !== undefined && body.name.trim() !== existing.name
        ? await generateUniqueSlug(body.name)
        : undefined;

    const updated = await prisma.deliveryCity.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(slug !== undefined ? { slug } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}
