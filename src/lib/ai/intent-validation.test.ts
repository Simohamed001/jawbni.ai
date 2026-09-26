import assert from "node:assert/strict";
import test from "node:test";
import { UNDEFINED_LABEL } from "@/lib/utils";
import type { MerchantContext } from "@/lib/ai/prompt";
import {
  COMPLAINTS_CATEGORY,
  CONFIRMATION_CATEGORY,
  OTHER_QUESTIONS_SUBCATEGORY,
  PRODUCT_QUESTIONS_CATEGORY,
  SHIPPING_CATEGORY,
  validateIntentSemantics,
  type RawIntent,
} from "@/lib/ai/intent-validation";

const REVIEW = "رسائل تحتاج مراجعة";

function ctx(overrides: Partial<MerchantContext> = {}): MerchantContext {
  const productMain = { id: "main-product", name: PRODUCT_QUESTIONS_CATEGORY };
  const confirmationMain = { id: "main-confirm", name: CONFIRMATION_CATEGORY };
  const shippingMain = { id: "main-ship", name: SHIPPING_CATEGORY };
  const complaintMain = { id: "main-complaint", name: COMPLAINTS_CATEGORY };
  const reviewMain = { id: "main-review", name: REVIEW };

  return {
    mainCategories: [
      productMain,
      confirmationMain,
      shippingMain,
      complaintMain,
      reviewMain,
    ],
    subCategories: [
      {
        id: "sub-price",
        name: "الثمن",
        mainCategoryId: productMain.id,
        mainCategoryName: productMain.name,
      },
      {
        id: "sub-other",
        name: OTHER_QUESTIONS_SUBCATEGORY,
        mainCategoryId: productMain.id,
        mainCategoryName: productMain.name,
      },
    ],
    products: [{ officialName: "polo", keywords: [] }],
    categoryProductsMap: new Map(),
    deliveryCities: [
      { id: "city-agadir", name: "أكادير" },
      { id: "city-casa", name: "الدار البيضاء" },
    ],
    reviewCategoryName: REVIEW,
    singleProduct: false,
    ...overrides,
  };
}

function summary(intents: RawIntent[]) {
  return intents.map((intent) => ({
    main: intent.mainCategory,
    sub: intent.subCategory,
    product: intent.product,
    city: intent.deliveryCity,
  }));
}

test("Test A — unregistered product purchase becomes review only", () => {
  const intents = validateIntentSemantics(
    [
      {
        mainCategory: CONFIRMATION_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: "mairi",
        deliveryCity: UNDEFINED_LABEL,
      },
    ],
    ctx(),
    "bghit 2 mn mairi",
    REVIEW,
  );
  assert.deepEqual(summary(intents), [
    { main: REVIEW, sub: UNDEFINED_LABEL, product: UNDEFINED_LABEL, city: UNDEFINED_LABEL },
  ]);
});

test("Test B — unregistered purchase plus city does not keep shipping", () => {
  const intents = validateIntentSemantics(
    [
      {
        mainCategory: CONFIRMATION_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
        deliveryCity: UNDEFINED_LABEL,
      },
      {
        mainCategory: SHIPPING_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
        deliveryCity: "أكادير",
      },
    ],
    ctx(),
    "bghit 2 mn mairi w twsil l agadir",
    REVIEW,
  );
  assert.equal(intents.length, 1);
  assert.equal(intents[0].mainCategory, REVIEW);
  assert.equal(intents[0].deliveryCity, UNDEFINED_LABEL);
  assert.ok(!intents.some((intent) => intent.mainCategory === SHIPPING_CATEGORY));
});

test("Test C — registered plus unregistered keeps confirmation and one review", () => {
  const intents = validateIntentSemantics(
    [
      {
        mainCategory: CONFIRMATION_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
        deliveryCity: UNDEFINED_LABEL,
      },
    ],
    ctx(),
    "bghit 2 mn polo o wahd mairi",
    REVIEW,
  );
  assert.deepEqual(summary(intents), [
    {
      main: CONFIRMATION_CATEGORY,
      sub: UNDEFINED_LABEL,
      product: "polo",
      city: UNDEFINED_LABEL,
    },
    { main: REVIEW, sub: UNDEFINED_LABEL, product: UNDEFINED_LABEL, city: UNDEFINED_LABEL },
  ]);
});

test("Test D — mixed purchase plus independent shipping", () => {
  const intents = validateIntentSemantics(
    [
      {
        mainCategory: CONFIRMATION_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: "polo",
        deliveryCity: UNDEFINED_LABEL,
      },
      {
        mainCategory: SHIPPING_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
        deliveryCity: "الدار البيضاء",
      },
    ],
    ctx(),
    "bghit polo o mairi w x7l twsil l casa",
    REVIEW,
  );
  assert.deepEqual(summary(intents), [
    {
      main: CONFIRMATION_CATEGORY,
      sub: UNDEFINED_LABEL,
      product: "polo",
      city: UNDEFINED_LABEL,
    },
    { main: REVIEW, sub: UNDEFINED_LABEL, product: UNDEFINED_LABEL, city: UNDEFINED_LABEL },
    {
      main: SHIPPING_CATEGORY,
      sub: UNDEFINED_LABEL,
      product: UNDEFINED_LABEL,
      city: "الدار البيضاء",
    },
  ]);
});

test("Test E — several unregistered products collapse to one review", () => {
  const intents = validateIntentSemantics(
    [
      {
        mainCategory: CONFIRMATION_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: "mairi",
        deliveryCity: UNDEFINED_LABEL,
      },
      {
        mainCategory: CONFIRMATION_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: "trico",
        deliveryCity: UNDEFINED_LABEL,
      },
    ],
    ctx(),
    "bghit 2 mn mairi o wahd trico",
    REVIEW,
  );
  assert.equal(intents.length, 1);
  assert.equal(intents[0].mainCategory, REVIEW);
});

test("Test F — question about unregistered product is review", () => {
  const intents = validateIntentSemantics(
    [
      {
        mainCategory: PRODUCT_QUESTIONS_CATEGORY,
        subCategory: OTHER_QUESTIONS_SUBCATEGORY,
        product: UNDEFINED_LABEL,
        deliveryCity: UNDEFINED_LABEL,
      },
    ],
    ctx(),
    "wach 3andkom pantalon noir?",
    REVIEW,
  );
  assert.deepEqual(summary(intents), [
    { main: REVIEW, sub: UNDEFINED_LABEL, product: UNDEFINED_LABEL, city: UNDEFINED_LABEL },
  ]);
});

test("Test G — complaint about unregistered product keeps complaints", () => {
  const intents = validateIntentSemantics(
    [
      {
        mainCategory: COMPLAINTS_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: "trico",
        deliveryCity: UNDEFINED_LABEL,
      },
    ],
    ctx(),
    "trico li siftou fih mochkil",
    REVIEW,
  );
  assert.deepEqual(summary(intents), [
    {
      main: COMPLAINTS_CATEGORY,
      sub: UNDEFINED_LABEL,
      product: UNDEFINED_LABEL,
      city: UNDEFINED_LABEL,
    },
  ]);
});

test("Test H — general product question maps to other questions", () => {
  const intents = validateIntentSemantics(
    [
      {
        mainCategory: PRODUCT_QUESTIONS_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
        deliveryCity: UNDEFINED_LABEL,
      },
    ],
    ctx(),
    "chno kayn 3ndkom?",
    REVIEW,
  );
  assert.deepEqual(summary(intents), [
    {
      main: PRODUCT_QUESTIONS_CATEGORY,
      sub: OTHER_QUESTIONS_SUBCATEGORY,
      product: UNDEFINED_LABEL,
      city: UNDEFINED_LABEL,
    },
  ]);
});

test("Test I — unregistered product mentioned inside another question is review", () => {
  const intents = validateIntentSemantics(
    [
      {
        mainCategory: SHIPPING_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
        deliveryCity: "الدار البيضاء",
      },
    ],
    ctx(),
    "wach livraison l casa? ana chft trico f page",
    REVIEW,
  );
  assert.equal(intents.length, 1);
  assert.equal(intents[0].mainCategory, REVIEW);
});

test("original example — unregistered purchase plus shipping is review only", () => {
  const intents = validateIntentSemantics(
    [
      {
        mainCategory: CONFIRMATION_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
        deliveryCity: UNDEFINED_LABEL,
      },
      {
        mainCategory: SHIPPING_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
        deliveryCity: "أكادير",
      },
    ],
    ctx(),
    "bghit 2 mn mairi o wahd trico w x7l twsil l agadir",
    REVIEW,
  );
  assert.equal(intents.length, 1);
  assert.equal(intents[0].mainCategory, REVIEW);
  assert.equal(intents[0].deliveryCity, UNDEFINED_LABEL);
});

test("singleProduct mode is left unchanged", () => {
  const original: RawIntent[] = [
    {
      mainCategory: CONFIRMATION_CATEGORY,
      subCategory: UNDEFINED_LABEL,
      product: UNDEFINED_LABEL,
      deliveryCity: "أكادير",
    },
  ];
  const intents = validateIntentSemantics(
    original,
    ctx({ singleProduct: true }),
    "bghit 2 mn mairi",
    REVIEW,
  );
  assert.deepEqual(intents, original);
});

test("Test 1 — independent shipping question keeps shipping with city", () => {
  const intents = validateIntentSemantics(
    [
      {
        mainCategory: SHIPPING_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
        deliveryCity: "طنجة",
      },
    ],
    ctx({ deliveryCities: [{ id: "city-tanger", name: "طنجة" }] }),
    "x7al tawsil l tanga",
    REVIEW,
  );
  assert.deepEqual(summary(intents), [
    { main: SHIPPING_CATEGORY, sub: UNDEFINED_LABEL, product: UNDEFINED_LABEL, city: "طنجة" },
  ]);
});

test("Test 2 — shipping first, unregistered purchase after it is review only", () => {
  const intents = validateIntentSemantics(
    [
      {
        mainCategory: SHIPPING_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
        deliveryCity: "مراكش",
      },
      {
        mainCategory: REVIEW,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
        deliveryCity: UNDEFINED_LABEL,
      },
    ],
    ctx({ deliveryCities: [{ id: "city-marrakech", name: "مراكش" }] }),
    "x7l twsil l marakech bghit 2 cremes",
    REVIEW,
  );
  assert.deepEqual(summary(intents), [
    { main: REVIEW, sub: UNDEFINED_LABEL, product: UNDEFINED_LABEL, city: UNDEFINED_LABEL },
  ]);
});

test("Test 3 — two unregistered products plus shipping is review only", () => {
  const intents = validateIntentSemantics(
    [
      {
        mainCategory: REVIEW,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
        deliveryCity: UNDEFINED_LABEL,
      },
      {
        mainCategory: SHIPPING_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
        deliveryCity: "طنجة",
      },
    ],
    ctx({ deliveryCities: [{ id: "city-tanger", name: "طنجة" }] }),
    "bghit wahd mairi o 2 tricoyat x7l twsil l tanga",
    REVIEW,
  );
  assert.deepEqual(summary(intents), [
    { main: REVIEW, sub: UNDEFINED_LABEL, product: UNDEFINED_LABEL, city: UNDEFINED_LABEL },
  ]);
});

test("Test 4 — review primary plus Gemini shipping intent drops the shipping", () => {
  const intents = validateIntentSemantics(
    [
      {
        mainCategory: REVIEW,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
        deliveryCity: UNDEFINED_LABEL,
      },
      {
        mainCategory: SHIPPING_CATEGORY,
        subCategory: UNDEFINED_LABEL,
        product: UNDEFINED_LABEL,
        deliveryCity: "أكادير",
      },
    ],
    ctx(),
    "bghit 2 mn mairi o wahd trico w x7l twsil l agadir",
    REVIEW,
  );
  assert.deepEqual(summary(intents), [
    { main: REVIEW, sub: UNDEFINED_LABEL, product: UNDEFINED_LABEL, city: UNDEFINED_LABEL },
  ]);
});
