import { prisma } from "@/lib/prisma";
import {
  DEFAULT_MAIN_CATEGORIES,
  DEFAULT_SUB_CATEGORIES,
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
