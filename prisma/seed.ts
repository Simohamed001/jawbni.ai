import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedDefaultCategories } from "../src/lib/categories";

const prisma = new PrismaClient();

const DEMO_MESSAGES: any[] = [];

async function main() {
  await prisma.classification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.groupReply.deleteMany();
  await prisma.subCategory.deleteMany();
  await prisma.mainCategory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.merchantProfile.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("demo1234", 12);

  const user = await prisma.user.create({
    data: {
      email: "demo@jawbni.ai",
      passwordHash,
      name: "تاجر تجريبي",
      merchant: {
        create: {
          shopName: "متجر الدمو",
          locale: "ar",
        },
      },
    },
    include: { merchant: true },
  });

  const merchantId = user.merchant!.id;
  const mains = await seedDefaultCategories(merchantId);

  // Custom categories
  await prisma.mainCategory.createMany({
    data: [
      { merchantId, name: "العروض", sortOrder: 10 },
      { merchantId, name: "المرتجعات", sortOrder: 11 },
    ],
  });

  const productCategory = mains.find((m) => m.name === "أسئلة عن المنتج")!;
  await prisma.subCategory.create({
    data: {
      merchantId,
      mainCategoryId: productCategory.id,
      name: "اللون",
      sortOrder: 5,
    },
  });

  await prisma.product.createMany({
    data: [
      {
        merchantId,
        officialName: "كريم الترطيب",
        keywords: JSON.stringify(["krem", "crème", "krim", "كريم", "ترطيب"]),
      },
      {
        merchantId,
        officialName: "سيرum للوجه",
        keywords: JSON.stringify(["serum", "sérum", "سيروم", "serum"]),
      },
      {
        merchantId,
        officialName: "عطر فاخر",
        keywords: JSON.stringify(["parfum", "عطر", "perfume", "oud"]),
      },
    ],
  });

  // No demo messages by default

  // No demo group replies by default

  console.log("Seed complete: demo@jawbni.ai / demo1234");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
