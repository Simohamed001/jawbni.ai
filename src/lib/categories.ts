import { prisma } from "@/lib/prisma";
import {
  DEFAULT_MAIN_CATEGORIES,
  DEFAULT_SUB_CATEGORIES,
  OTHER_QUESTIONS_SUBCATEGORY,
  PRODUCT_QUESTIONS_CATEGORY,
} from "@/lib/utils";

export async function seedDefaultCategories(merchantId: string) {
  const createdMain = await Promise.all(
    DEFAULT_MAIN_CATEGORIES.map((cat, index) =>
      prisma.mainCategory.create({
        data: {
          merchantId,
          name: cat.name,
          isSystem: cat.isSystem,
          sortOrder: index,
        },
      }),
    ),
  );

  for (const main of createdMain) {
    const subs = DEFAULT_SUB_CATEGORIES[main.name];
    if (!subs) continue;
    await Promise.all(
      subs.map((name, index) =>
        prisma.subCategory.create({
          data: {
            merchantId,
            mainCategoryId: main.id,
            name,
            sortOrder: index,
          },
        }),
      ),
    );
  }

  return createdMain;
}

export async function ensureOtherProductQuestions(merchantId: string) {
  const main = await prisma.mainCategory.findFirst({
    where: { merchantId, name: PRODUCT_QUESTIONS_CATEGORY },
    select: { id: true },
  });
  if (!main) return null;

  return prisma.subCategory.upsert({
    where: {
      merchantId_name_mainCategoryId: {
        merchantId,
        name: OTHER_QUESTIONS_SUBCATEGORY,
        mainCategoryId: main.id,
      },
    },
    update: {},
    create: {
      merchantId,
      mainCategoryId: main.id,
      name: OTHER_QUESTIONS_SUBCATEGORY,
      sortOrder: 100,
    },
  });
}

export async function getReviewCategory(merchantId: string) {
  let review = await prisma.mainCategory.findFirst({
    where: { merchantId, isSystem: true },
  });

  if (!review) {
    review = await prisma.mainCategory.create({
      data: {
        merchantId,
        name: "رسائل تحتاج مراجعة",
        isSystem: true,
        sortOrder: 999,
      },
    });
  }

  return review;
}
