import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireMerchantId,
  unauthorizedResponse,
} from "@/lib/api-auth";
import { UNDEFINED_LABEL } from "@/lib/utils";

export async function GET() {
  try {
    const { merchantId } = await requireMerchantId();

    const [mainCategories, productMappings, messages, merchant] = await Promise.all([
      prisma.mainCategory.findMany({
        where: { merchantId },
        include: {
          subCategories: { orderBy: { sortOrder: "asc" } },
        },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.productCategoryMapping.findMany({
        where: {
          product: { merchantId, isSold: true },
        },
        select: {
          productId: true,
          mainCategoryId: true,
          product: { select: { officialName: true } },
        },
      }),
      prisma.message.findMany({
        where: { merchantId, classification: { isNot: null } },
        include: {
          classification: {
            include: { mainCategory: true, subCategory: true },
          },
        },
      }),
      prisma.merchantProfile.findUnique({
        where: { id: merchantId },
        select: { singleProduct: true },
      }),
    ]);

    type TreeNode = {
      id: string;
      label: string;
      type: "main" | "product" | "sub";
      count: number;
      mainCategoryId?: string;
      productName?: string;
      subCategoryId?: string;
      children?: TreeNode[];
    };

    const tree: TreeNode[] = mainCategories.map((main) => {
      const mainMessages = messages.filter(
        (m) => getMessageClassifications(m).some((item) => item.mainCategoryId === main.id),
      );

      const configuredProductNames = new Set(
        productMappings
          .filter((mapping) => mapping.mainCategoryId === main.id)
          .map((mapping) => mapping.product.officialName),
      );

      // Check if merchant is in single product mode
      const isSingleProduct = merchant?.singleProduct || false;
      const showProducts = !isSingleProduct && configuredProductNames.size > 0;

      const children: TreeNode[] = [];

      if (showProducts) {
        const allProducts = Array.from(configuredProductNames);
        const uniqueProducts = [...new Set(allProducts)];

        for (const productName of uniqueProducts) {
          const productMessages = mainMessages.filter(
            (m) => getMessageClassifications(m).some((item) =>
              item.mainCategoryId === main.id && item.productName === productName),
          );

          const subNodes: TreeNode[] = main.subCategories.map((sub) => ({
            id: `${main.id}-${productName}-${sub.id}`,
            label: sub.name,
            type: "sub" as const,
              count: productMessages.filter(
                (m) => getMessageClassifications(m).some((item) => item.subCategoryId === sub.id),
              ).length,
            mainCategoryId: main.id,
            productName,
            subCategoryId: sub.id,
          }));

          const undefinedSubCount = productMessages.filter(
            (m) => getMessageClassifications(m).some((item) => !item.subCategoryId),
          ).length;

          if (undefinedSubCount > 0 || subNodes.length === 0) {
            subNodes.push({
              id: `${main.id}-${productName}-undefined`,
              label: UNDEFINED_LABEL,
              type: "sub",
              count: undefinedSubCount,
              mainCategoryId: main.id,
              productName,
            });
          }

          children.push({
            id: `${main.id}-${productName}`,
            label: productName,
            type: "product",
            count: productMessages.length,
            mainCategoryId: main.id,
            productName,
            children: subNodes,
          });
        }

        const undefinedProductCount = mainMessages.filter(
          (m) => getMessageClassifications(m).some((item) =>
            item.mainCategoryId === main.id && item.productName === UNDEFINED_LABEL),
        ).length;

        if (undefinedProductCount > 0) {
          children.push({
            id: `${main.id}-undefined-product`,
            label: UNDEFINED_LABEL,
            type: "product",
            count: undefinedProductCount,
            mainCategoryId: main.id,
            productName: UNDEFINED_LABEL,
            children: [
              {
                id: `${main.id}-undefined-sub`,
                label: UNDEFINED_LABEL,
                type: "sub",
                count: undefinedProductCount,
                mainCategoryId: main.id,
                productName: UNDEFINED_LABEL,
              },
            ],
          });
        }
      } else {
        // Single product mode or no products - show subcategories directly
        const subNodes: TreeNode[] = main.subCategories.map((sub) => ({
          id: `${main.id}-sub-${sub.id}`,
          label: sub.name,
          type: "sub" as const,
            count: mainMessages.filter(
              (m) => getMessageClassifications(m).some((item) => item.subCategoryId === sub.id),
            ).length,
          mainCategoryId: main.id,
          productName: UNDEFINED_LABEL,
          subCategoryId: sub.id,
        }));

        const undefinedCount = mainMessages.filter(
          (m) => getMessageClassifications(m).some((item) => !item.subCategoryId),
        ).length;

        subNodes.push({
          id: `${main.id}-sub-undefined`,
          label: UNDEFINED_LABEL,
          type: "sub",
          count: undefinedCount,
          mainCategoryId: main.id,
          productName: UNDEFINED_LABEL,
        });

        children.push(...subNodes);
      }

      return {
        id: main.id,
        label: main.name,
        type: "main" as const,
        count: mainMessages.length,
        mainCategoryId: main.id,
        children,
      };
    });

    return NextResponse.json(tree.filter((t) => t.count > 0 || true));
  } catch (e) {
    if ((e as Error).message === "UNAUTHORIZED") return unauthorizedResponse();
    return NextResponse.json({ error: "خطأ" }, { status: 500 });
  }
}

function getMessageClassifications(message: {
  body: string;
  transcription: string | null;
  classification: { mainCategoryId: string; subCategoryId: string | null; productName: string } | null;
  additionalClassifications: string | null;
}) {
  const primary = message.classification ? [message.classification] : [];
  try {
    const parsed = JSON.parse(message.additionalClassifications || "[]");
    const additional = Array.isArray(parsed)
      ? parsed.filter((item) => item && item.inferredByAi === true)
      : [];
    return primary.concat(additional);
  } catch {
    return primary;
  }
}
