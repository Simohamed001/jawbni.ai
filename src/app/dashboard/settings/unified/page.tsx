"use client";

import { useEffect, useState } from "react";
import { Button, Input, Textarea } from "@/components/ui/button";
import {
  Plus,
  Trash2,
  Layers,
  Package,
  Store,
  Settings2,
  ToggleLeft,
  ToggleRight,
  RefreshCw,
  Info,
  FolderKanban,
  Hash,
  X,
} from "lucide-react";

interface MainCategory {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  sortOrder: number;
}

interface Product {
  id: string;
  officialName: string;
  keywords: string;
  isSold: boolean;
}

interface SubCategory {
  id: string;
  name: string;
  description?: string;
  mainCategoryId?: string | null;
  sortOrder: number;
}

interface MerchantSettings {
  id: string;
  shopName: string;
  locale: string;
  singleProduct: boolean;
}

interface ProductMapping {
  id: string;
  productId: string;
  mainCategoryId: string;
  subCategoryId?: string | null;
}

function parseKeywordsArray(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {}
  return String(raw)
    .split(/[,،\n]/)
    .map(k => k.trim())
    .filter(Boolean);
}

export default function UnifiedSettingsPage() {
  const [mainCategories, setMainCategories] = useState<MainCategory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [subCategories, setSubCategories] = useState<SubCategory[]>([]);
  const [merchantSettings, setMerchantSettings] = useState<MerchantSettings | null>(null);
  const [productMappings, setProductMappings] = useState<ProductMapping[]>([]);
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [addingProduct, setAddingProduct] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductKeywords, setNewProductKeywords] = useState("");
  const [newProductMainCategoryId, setNewProductMainCategoryId] = useState("");
  const [productError, setProductError] = useState("");
  const [editProductForm, setEditProductForm] = useState({
    officialName: "",
    keywords: "",
    mainCategoryId: ""
  });

  // Forms
  const [mainCategoryForm, setMainCategoryForm] = useState({ name: "", description: "" });
  const [subCategoryForms, setSubCategoryForms] = useState<Record<string, { name: string; description: string }>>({});

  async function loadData() {
    setLoading(true);
    try {
      const [mainRes, productRes, subRes, settingsRes, mapRes] = await Promise.all([
        fetch("/api/main-categories"),
        fetch("/api/products"),
        fetch("/api/subcategories"),
        fetch("/api/merchant-settings"),
        fetch("/api/product-mappings"),
      ]);
      const mains = await mainRes.json();
      const prods = await productRes.json();
      const subs = await subRes.json();
      setMainCategories(mains);
      setProducts(prods);
      setSubCategories(subs);
      setMerchantSettings(await settingsRes.json());
      setProductMappings(await mapRes.json());

      // Initialize sub form state for each main category
      const initSubForms: Record<string, { name: string; description: string }> = {};
      mains.forEach((m: MainCategory) => {
        initSubForms[m.id] = { name: "", description: "" };
      });
      setSubCategoryForms(initSubForms);
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // --- Main Category Functions ---
  async function addMainCategory() {
    if (!mainCategoryForm.name.trim()) return;
    const res = await fetch("/api/main-categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mainCategoryForm),
    });
    const created = await res.json();
    setSubCategoryForms(prev => ({ ...prev, [created.id]: { name: "", description: "" } }));
    setMainCategoryForm({ name: "", description: "" });
    loadData();
  }

  async function deleteMainCategory(id: string) {
    if (!confirm("حذف هذا القسم؟ سيتم حذف الأقسام الفرعية والمنتجات المرتبطة به أيضاً.")) return;
    await fetch(`/api/main-categories?id=${id}`, { method: "DELETE" });
    loadData();
  }

  // --- Product Functions ---
  async function addSimpleProduct(name: string, keywords: string, mainCategoryId: string) {
    try {
      const productRes = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          officialName: name,
          keywords: parseKeywordsArray(keywords),
        }),
      });
      if (!productRes.ok) {
        const data = await productRes.json().catch(() => null);
        throw new Error(data?.error || "حدث خطأ أثناء إضافة المنتج");
      }
      const product = await productRes.json();
      if (mainCategoryId) {
        const mappingRes = await fetch("/api/product-mappings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            productId: product.id,
            mainCategoryId,
            subCategoryId: null,
          }),
        });
        if (!mappingRes.ok) {
          const data = await mappingRes.json().catch(() => null);
          throw new Error(data?.error || "تمت إضافة المنتج دون ربطه بالقسم");
        }
      }
      loadData();
      setAddingProduct(false);
      setNewProductName("");
      setNewProductKeywords("");
      setNewProductMainCategoryId("");
    } catch (error) {
      console.error("Error adding product:", error);
      setProductError(error instanceof Error ? error.message : "حدث خطأ أثناء إضافة المنتج");
    }
  }

  function openAddProductModal() {
    setProductError("");
    setNewProductName("");
    setNewProductKeywords("");
    setNewProductMainCategoryId("");
    setAddingProduct(true);
  }

  function closeAddProductModal() {
    setAddingProduct(false);
    setNewProductName("");
    setNewProductKeywords("");
    setNewProductMainCategoryId("");
    setProductError("");
  }

  async function submitNewProduct() {
    const name = newProductName.trim();
    if (!name) {
      setProductError("أدخل اسم المنتج أولاً");
      return;
    }
    setProductError("");
    await addSimpleProduct(name, newProductKeywords, newProductMainCategoryId);
  }

  function openEditProductModal(product: Product) {
    const mainCat = getMainCategoryForProduct(product.id);
    setEditingProduct(product);
    setEditProductForm({
      officialName: product.officialName,
      keywords: parseKeywordsArray(product.keywords).join(", "),
      mainCategoryId: mainCat?.id || ""
    });
  }

  function closeEditProductModal() {
    setEditingProduct(null);
    setEditProductForm({ officialName: "", keywords: "", mainCategoryId: "" });
  }

  async function saveProductEdit() {
    if (!editingProduct) return;

    try {
      // Update product name and keywords
      await fetch(`/api/products?id=${editingProduct.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          officialName: editProductForm.officialName,
          keywords: editProductForm.keywords.split(",").map(k => k.trim()).filter(Boolean),
        }),
      });

      // Update category if changed
      const currentMapping = productMappings.find(m => m.productId === editingProduct.id);
      const currentMainCatId = currentMapping?.mainCategoryId;
      
      if (currentMainCatId !== editProductForm.mainCategoryId) {
        if (currentMapping) {
          await fetch(`/api/product-mappings?id=${currentMapping.id}`, { method: "DELETE" });
        }
        if (editProductForm.mainCategoryId) {
          await fetch("/api/product-mappings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productId: editingProduct.id,
              mainCategoryId: editProductForm.mainCategoryId,
              subCategoryId: null,
            }),
          });
        }
      }

      closeEditProductModal();
      loadData();
    } catch (error) {
      console.error("Error saving product:", error);
      alert("حدث خطأ أثناء حفظ التغييرات");
    }
  }

  async function deleteProduct(id: string) {
    if (!confirm("حذف هذا المنتج؟")) return;
    await fetch(`/api/products?id=${id}`, { method: "DELETE" });
    loadData();
  }

  async function toggleProductSold(productId: string, isSold: boolean) {
    try {
      await fetch(`/api/products?id=${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSold }),
      });

      setProducts(products.map(p =>
        p.id === productId ? { ...p, isSold } : p
      ));
    } catch (error) {
      console.error("Error updating product:", error);
      alert("حدث خطأ أثناء تحديث المنتج");
    }
  }

  // --- Sub Category Functions ---
  async function addSubCategoryForMain(mainCategoryId: string) {
    const form = subCategoryForms[mainCategoryId] || { name: "", description: "" };
    if (!form.name.trim()) return;
    await fetch("/api/subcategories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description,
        mainCategoryId,
      }),
    });
    setSubCategoryForms(prev => ({
      ...prev,
      [mainCategoryId]: { name: "", description: "" },
    }));
    loadData();
  }

  async function deleteSubCategory(id: string) {
    if (!confirm("حذف هذا القسم الفرعي؟")) return;
    await fetch(`/api/subcategories?id=${id}`, { method: "DELETE" });
    loadData();
  }

  // --- Merchant Settings Functions ---
  async function toggleSingleProduct() {
    if (!merchantSettings) return;

    setSaving(true);
    try {
      await fetch("/api/merchant-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          singleProduct: !merchantSettings.singleProduct,
        }),
      });

      setMerchantSettings({ ...merchantSettings, singleProduct: !merchantSettings.singleProduct });
    } catch (error) {
      console.error("Error updating settings:", error);
      alert("حدث خطأ أثناء تحديث الإعدادات");
    } finally {
      setSaving(false);
    }
  }

  // --- Helpers ---
  const getSubCategoriesForMain = (mainId: string) =>
    subCategories.filter(sub => sub.mainCategoryId === mainId);

  const getMainCategoryForProduct = (productId: string): MainCategory | null => {
    const mapping = productMappings.find(m => m.productId === productId);
    if (!mapping) return null;
    return mainCategories.find(c => c.id === mapping.mainCategoryId) || null;
  };

  const countInheritedSubCategories = (productId: string) => {
    const mainCat = getMainCategoryForProduct(productId);
    if (!mainCat) return 0;
    return getSubCategoriesForMain(mainCat.id).length;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-500" />
        <span className="mr-2">جاري التحميل...</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">إدارة الإعدادات</h1>
          <p className="text-gray-600">إدارة إعدادات المتجر والتصنيفات والمنتجات والأقسام الفرعية</p>
        </div>
        <Button onClick={loadData} variant="outline">
          <RefreshCw className="ml-2 h-4 w-4" />
          تحديث
        </Button>
      </div>

      {/* Store Settings Section */}
      <div className="mb-8 rounded-xl bg-white p-6 shadow">
        <div className="mb-4 flex items-center gap-3">
          <Store className="h-6 w-6 text-[#075E54]" />
          <h2 className="text-xl font-semibold">إعدادات المتجر</h2>
        </div>

        {merchantSettings && (
          <div className="mb-6">
            <h3 className="mb-3 text-lg font-medium">نوع المتجر</h3>
            <div className="flex items-center justify-between rounded-lg bg-gray-50 p-4">
              <div className="flex-1">
                <div className="mb-2 flex items-center gap-2">
                  {merchantSettings.singleProduct ? (
                    <Package className="h-5 w-5 text-green-600" />
                  ) : (
                    <Settings2 className="h-5 w-5 text-blue-600" />
                  )}
                  <span className="font-semibold">
                    {merchantSettings.singleProduct ? "منتج واحد" : "عدة منتجات"}
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  {merchantSettings.singleProduct
                    ? "التصنيف: أسئلة عن المنتج → الأقسام الفرعية فقط"
                    : "التصنيف: أسئلة عن المنتج → المنتجات → الأقسام الفرعية"
                  }
                </p>
              </div>

              <button
                onClick={toggleSingleProduct}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-[#075E54] px-4 py-2 text-white hover:bg-[#055e4d] disabled:opacity-50"
              >
                {merchantSettings.singleProduct ? (
                  <>
                    <ToggleLeft className="h-5 w-5" />
                    التبديل لعدة منتجات
                  </>
                ) : (
                  <>
                    <ToggleRight className="h-5 w-5" />
                    التبديل لمنتج واحد
                  </>
                )}
              </button>
            </div>
          </div>
        )}



        {merchantSettings && merchantSettings.singleProduct && (
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Package className="h-5 w-5 text-[#075E54]" />
              <h3 className="text-lg font-medium">وضع منتج واحد</h3>
            </div>

            <div className="rounded-lg bg-green-50 p-4">
              <div className="flex items-start gap-2">
                <Info className="h-5 w-5 text-green-600 mt-0.5" />
                <div className="text-sm text-green-800">
                  <p className="font-semibold">وضع منتج واحد:</p>
                  <p>سيتم إخفاء أقسام المنتجات تحت "أسئلة عن المنتج" وعرض الأقسام الفرعية مباشرة.</p>
                </div>
              </div>
            </div>

            {products.length > 0 && (
              <div className="mt-4">
                <p className="text-sm text-gray-600 mb-2">المنتج الحالي:</p>
                <div className="rounded-lg bg-gray-50 p-3">
                  <span className="font-semibold">{products[0].officialName}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {merchantSettings && (
          <div className="mt-6 rounded-xl bg-purple-50 p-4">
            <h3 className="mb-2 font-semibold text-purple-900">ملخص ترتيب التصنيف:</h3>
            <div className="space-y-2 text-sm text-purple-800">
              {merchantSettings.singleProduct ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">أسئلة عن المنتج</span>
                  <span className="text-gray-500">→</span>
                  <span>الأقسام الفرعية (الثمن، التوفر، اللون...)</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">أسئلة عن المنتج</span>
                  <span className="text-gray-500">→</span>
                  <span>المنتج 1، المنتج 2، المنتج 3...</span>
                  <span className="text-gray-500">→</span>
                  <span>الأقسام الفرعية الموروثة من القسم الرئيسي للمنتج</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Categories Section with embedded Sub-Categories */}
      <div className="mb-8 rounded-xl bg-white p-6 shadow">
        <div className="mb-4 flex items-center gap-2">
          <Layers className="h-5 w-5 text-blue-600" />
          <h2 className="text-xl font-semibold">الأقسام الرئيسية والأقسام الفرعية التابعة لها</h2>
        </div>

        <div className="mb-4 space-y-2">
          <Input
            placeholder="اسم القسم الرئيسي"
            value={mainCategoryForm.name}
            onChange={(e) => setMainCategoryForm({ ...mainCategoryForm, name: e.target.value })}
          />
          <Textarea
            placeholder="وصف القسم (اختياري)"
            value={mainCategoryForm.description}
            onChange={(e) => setMainCategoryForm({ ...mainCategoryForm, description: e.target.value })}
            rows={2}
          />
          <Button onClick={addMainCategory} className="w-full">
            <Plus className="ml-2 h-4 w-4" />
            إضافة قسم رئيسي
          </Button>
        </div>

        <div className="space-y-3">
          {mainCategories.map((category) => {
            const subCats = getSubCategoriesForMain(category.id);
            const subForm = subCategoryForms[category.id] || { name: "", description: "" };
            const isExpanded = expandedCategory === category.id;
            const prodCount = productMappings.filter(m => m.mainCategoryId === category.id).length;

            return (
              <div key={category.id} className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{category.name}</span>
                    {category.isSystem && (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                        نظام
                      </span>
                    )}
                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700">
                      {subCats.length} أقسام فرعية
                    </span>
                    {prodCount > 0 && (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">
                        {prodCount} منتج
                      </span>
                    )}
                  </div>
                  {category.description && (
                    <p className="mt-1 text-sm text-gray-500">{category.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setExpandedCategory(isExpanded ? null : category.id)}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    {isExpanded ? "إخفاء" : "عرض الأقسام الفرعية"}
                  </button>
                  {!category.isSystem && (
                    <button
                      onClick={() => deleteMainCategory(category.id)}
                      className="text-red-500 hover:text-red-700"
                      title="حذف القسم الرئيسي"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Embedded Sub-Categories Form for Selected Main Category */}
        {expandedCategory && (() => {
          const category = mainCategories.find(c => c.id === expandedCategory);
          if (!category) return null;
          const subCats = getSubCategoriesForMain(category.id);
          const subForm = subCategoryForms[category.id] || { name: "", description: "" };

          return (
            <div className="mt-4 rounded-lg border bg-gray-50 p-4">
              <div className="mb-3 font-semibold text-gray-700">
                الأقسام الفرعية لـ "{category.name}"
              </div>

              {/* Add Sub-Category Form */}
              <div className="mb-4 space-y-2 rounded-lg border border-dashed border-gray-300 bg-white p-4">
                <div className="mb-2 flex items-center gap-2">
                  <FolderKanban className="h-4 w-4 text-indigo-600" />
                  <span className="text-sm font-medium text-gray-700">
                    إضافة قسم فرعي جديد
                  </span>
                </div>
                <Input
                  placeholder="اسم القسم الفرعي (مثل: الثمن، التوفر، اللون...)"
                  value={subForm.name}
                  onChange={(e) =>
                    setSubCategoryForms(prev => ({
                      ...prev,
                      [category.id]: { ...subForm, name: e.target.value },
                    }))
                  }
                />
                <Textarea
                  placeholder="وصف القسم الفرعي (اختياري)"
                  value={subForm.description}
                  onChange={(e) =>
                    setSubCategoryForms(prev => ({
                      ...prev,
                      [category.id]: { ...subForm, description: e.target.value },
                    }))
                  }
                  rows={2}
                />
                <Button onClick={() => addSubCategoryForMain(category.id)} className="w-full">
                  <Plus className="ml-2 h-4 w-4" />
                  إضافة قسم فرعي
                </Button>
              </div>

              {/* Sub-Categories List */}
              {subCats.length === 0 ? (
                <div className="rounded-lg bg-white p-6 text-center text-sm text-gray-500 border border-dashed">
                  لا توجد أقسام فرعية لهذا القسم الرئيسي بعد.
                </div>
              ) : (
                <div className="space-y-2">
                  {subCats.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex items-center justify-between rounded-lg border bg-white p-3"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{sub.name}</span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                            موروث من {category.name}
                          </span>
                        </div>
                        {sub.description && (
                          <p className="mt-1 text-xs text-gray-600">{sub.description}</p>
                        )}
                      </div>
                      <button
                        onClick={() => deleteSubCategory(sub.id)}
                        className="text-red-500 hover:text-red-700 p-1"
                        title="حذف القسم الفرعي"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Products Section */}
      <div className="rounded-xl bg-white p-6 shadow">
        <div className="mb-4 flex items-center gap-2">
          <Package className="h-5 w-5 text-green-600" />
          <h2 className="text-xl font-semibold">المنتجات المباعة</h2>
        </div>

        <div className="mb-4 rounded-lg bg-green-50 p-4">
          <div className="flex items-start gap-2">
            <Info className="h-5 w-5 text-green-600 mt-0.5" />
            <div className="text-sm text-green-800">
              <p className="font-semibold">وضع عدة منتجات:</p>
              <p>كل منتج ينتمي إلى قسم رئيسي ويرث تلقائياً كل الأقسام الفرعية الخاصة بهذا القسم.</p>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <Button onClick={openAddProductModal} className="w-full">
            <Plus className="ml-2 h-4 w-4" />
            إضافة منتج جديد
          </Button>
        </div>

        {/* Products List */}
        <div className="space-y-3">
          {products.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-gray-500">
              لا توجد منتجات حالياً.
            </div>
          ) : (
            products.map((product) => {
              const mainCat = getMainCategoryForProduct(product.id);
              const inheritedSubs = mainCat ? getSubCategoriesForMain(mainCat.id) : [];
              const kws = parseKeywordsArray(product.keywords);

              return (
                <div
                  key={product.id}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{product.officialName}</span>
                      {mainCat ? (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                          {mainCat.name}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                          غير مربوط بقسم
                        </span>
                      )}
                      <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700">
                        {inheritedSubs.length} قسم فرعي موروث
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      {kws.length === 0 ? (
                        "لا توجد كلمات مفتاحية"
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {kws.map((kw, i) => (
                            <span key={i} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                              <Hash className="inline h-2.5 w-2.5 ml-0.5 -mt-0.5 text-blue-500" />
                              {kw}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditProductModal(product)}
                      className="text-blue-600 hover:text-blue-800 text-sm"
                      title="تعديل المنتج"
                    >
                      تعديل
                    </button>
                    <button
                      onClick={() => toggleProductSold(product.id, !product.isSold)}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                        product.isSold
                          ? "bg-green-100 text-green-700 hover:bg-green-200"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {product.isSold ? "يباع" : "غير مباع"}
                    </button>
                    <button
                      onClick={() => deleteProduct(product.id)}
                      className="text-red-500 hover:text-red-700"
                      title="حذف المنتج"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {addingProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAddProductModal();
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-product-title"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-600">منتج جديد</p>
                <h3 id="add-product-title" className="mt-1 text-xl font-semibold text-gray-900">
                  أضف منتجاً لمتجرك
                </h3>
              </div>
              <button
                type="button"
                onClick={closeAddProductModal}
                className="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label htmlFor="new-product-name" className="mb-2 block text-sm font-medium text-gray-700">
              اسم المنتج
            </label>
            <Input
              id="new-product-name"
              autoFocus
              value={newProductName}
              onChange={(event) => setNewProductName(event.target.value)}
              placeholder="مثال: كريم الترطيب"
            />

            <label htmlFor="new-product-keywords" className="mb-2 mt-4 block text-sm font-medium text-gray-700">
              الكلمات المفتاحية
            </label>
            <Input
              id="new-product-keywords"
              value={newProductKeywords}
              onChange={(event) => setNewProductKeywords(event.target.value)}
              placeholder="عطر, perfume, parfum"
            />
            <p className="mt-1 text-xs text-gray-500">افصل بين الكلمات بفاصلة</p>

            <label htmlFor="new-product-category" className="mb-2 mt-4 block text-sm font-medium text-gray-700">
              القسم الرئيسي
            </label>
            <select
              id="new-product-category"
              value={newProductMainCategoryId}
              onChange={(event) => setNewProductMainCategoryId(event.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#25D366]"
            >
              <option value="">بدون قسم</option>
              {mainCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            {productError && (
              <p className="mt-2 text-sm text-red-600" role="alert">{productError}</p>
            )}

            <div className="mt-6 flex gap-2">
              <Button type="button" onClick={submitNewProduct} className="flex-1">
                إضافة المنتج
              </Button>
              <Button type="button" onClick={closeAddProductModal} variant="outline" className="flex-1">
                إلغاء
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold">تعديل المنتج</h3>
              <button
                onClick={closeEditProductModal}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  اسم المنتج
                </label>
                <Input
                  value={editProductForm.officialName}
                  onChange={(e) => setEditProductForm({ ...editProductForm, officialName: e.target.value })}
                  placeholder="اسم المنتج"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  الكلمات المفتاحية (افصل بينها بفاصلة)
                </label>
                <Input
                  value={editProductForm.keywords}
                  onChange={(e) => setEditProductForm({ ...editProductForm, keywords: e.target.value })}
                  placeholder="عطر, perfume, parfum"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  القسم الرئيسي
                </label>
                <select
                  value={editProductForm.mainCategoryId}
                  onChange={(e) => setEditProductForm({ ...editProductForm, mainCategoryId: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#25D366]"
                >
                  <option value="">بدون قسم</option>
                  {mainCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2 pt-4">
                <Button
                  onClick={saveProductEdit}
                  className="flex-1"
                >
                  حفظ التغييرات
                </Button>
                <Button
                  onClick={closeEditProductModal}
                  variant="outline"
                  className="flex-1"
                >
                  إلغاء
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
