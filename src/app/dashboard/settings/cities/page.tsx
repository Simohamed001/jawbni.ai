"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Input } from "@/components/ui/button";
import {
  AlertCircle,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";

interface DeliveryCity {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function DeliveryCitiesSettingsPage() {
  const [cities, setCities] = useState<DeliveryCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [newCityName, setNewCityName] = useState("");
  const [addingCity, setAddingCity] = useState(false);
  const [addError, setAddError] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadCities = useCallback(
    async (silent = false) => {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setLoadError("");
      try {
        const res = await fetch("/api/settings/cities");
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        setCities(Array.isArray(data) ? data : []);
      } catch {
        setLoadError("فشل تحميل المدن. حاول مرة أخرى.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadCities();
  }, [loadCities]);

  async function addCity() {
    const name = newCityName.trim();
    if (!name) {
      setAddError("أدخل اسم المدينة أولاً");
      return;
    }
    setAddingCity(true);
    setAddError("");
    try {
      const res = await fetch("/api/settings/cities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "فشل إضافة المدينة");
      }
      setNewCityName("");
      await loadCities(true);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "فشل إضافة المدينة");
    } finally {
      setAddingCity(false);
    }
  }

  async function toggleCity(city: DeliveryCity) {
    setTogglingId(city.id);
    try {
      const res = await fetch(
        `/api/settings/cities?id=${encodeURIComponent(city.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !city.isActive }),
        },
      );
      if (!res.ok) throw new Error("failed");
      const updated = await res.json();
      setCities((prev) =>
        prev.map((c) => (c.id === updated.id ? updated : c)),
      );
    } catch {
      setLoadError("فشل تغيير حالة المدينة. حاول مرة أخرى.");
    } finally {
      setTogglingId(null);
    }
  }

  const activeCount = cities.filter((c) => c.isActive).length;

  return (
    <div className="mx-auto max-w-4xl p-6">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">مدن الشحن</h1>
          <p className="text-gray-600">
            إدارة المدن المتاحة للتوصيل — التفعيل والتعطيل
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => loadCities(true)}
          disabled={refreshing}
        >
          <RefreshCw
            className={`ml-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
          />
          تحديث
        </Button>
      </div>

      {/* Error banner (load / toggle failures) */}
      {loadError && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span className="flex-1">{loadError}</span>
          <button
            onClick={() => setLoadError("")}
            aria-label="إغلاق التنبيه"
            className="rounded p-1 hover:bg-red-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Add city form */}
      <div className="mb-6 rounded-xl bg-white p-6 shadow">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-medium">
          <Plus className="h-5 w-5 text-[#075E54]" />
          إضافة مدينة جديدة
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            addCity();
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <Input
            value={newCityName}
            onChange={(e) => {
              setNewCityName(e.target.value);
              setAddError("");
            }}
            placeholder="اسم المدينة (مثال: الدار البيضاء)"
            disabled={addingCity}
            aria-label="اسم المدينة"
          />
          <Button
            type="submit"
            disabled={addingCity || !newCityName.trim()}
            className="shrink-0"
          >
            {addingCity ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                جاري الإضافة...
              </>
            ) : (
              "إضافة مدينة"
            )}
          </Button>
        </form>
        {addError && (
          <p role="alert" className="mt-2 flex items-center gap-1 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" />
            {addError}
          </p>
        )}
      </div>

      {/* Cities list */}
      <div className="rounded-xl bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-medium">
            <MapPin className="h-5 w-5 text-[#075E54]" />
            المدن المسجلة
          </h2>
          {!loading && cities.length > 0 && (
            <span className="text-sm text-gray-500">
              {activeCount} مفعّلة من أصل {cities.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>جاري التحميل...</span>
          </div>
        ) : cities.length === 0 ? (
          <p className="py-10 text-center text-gray-500">
            لا توجد مدن مسجلة بعد. أضف أول مدينة من النموذج أعلاه.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {cities.map((city) => (
              <li
                key={city.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <MapPin
                    className={`h-5 w-5 shrink-0 ${
                      city.isActive ? "text-[#075E54]" : "text-gray-300"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{city.name}</p>
                    <p className="truncate text-xs text-gray-400">
                      {city.slug}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      city.isActive
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {city.isActive ? "مفعّلة" : "معطّلة"}
                  </span>

                  {/* Toggle switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={city.isActive}
                    aria-label={
                      city.isActive
                        ? `تعطيل مدينة ${city.name}`
                        : `تفعيل مدينة ${city.name}`
                    }
                    disabled={togglingId === city.id}
                    onClick={() => toggleCity(city)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center justify-${
                      city.isActive ? "start" : "end"
                    } rounded-full px-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      city.isActive ? "bg-[#25D366]" : "bg-gray-300"
                    }`}
                  >
                    {togglingId === city.id ? (
                      <Loader2 className="mx-auto h-4 w-4 animate-spin text-white" />
                    ) : (
                      <span className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform" />
                    )}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
