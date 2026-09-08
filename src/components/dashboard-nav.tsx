"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Settings, Inbox, Trash2, Truck, MapPin } from "lucide-react";

interface ShippingCity {
  id: string;
  name: string;
  slug: string;
}

export function DashboardNav() {
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);

  // قسم الشحن والتوصيل: المدن المفعلة المرتبطة برسالة واحدة على الأقل
  const [shippingCities, setShippingCities] = useState<ShippingCity[]>([]);
  const [shippingOpen, setShippingOpen] = useState(false);
  const shippingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/cities?withMessages=true")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setShippingCities(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // إغلاق القائمة الفرعية عند الضغط خارجها
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (shippingRef.current && !shippingRef.current.contains(e.target as Node)) {
        setShippingOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function clearCache() {
    setClearingCache(true);
    setCacheCleared(false);
    try {
      const res = await fetch("/api/cache/clear", { method: "POST" });
      if (res.ok) {
        setCacheCleared(true);
        setTimeout(() => setCacheCleared(false), 3000);
      }
    } catch (error) {
      console.error("Failed to clear cache:", error);
    } finally {
      setClearingCache(false);
    }
  }

  return (
    <nav className="flex min-w-0 items-center gap-2 overflow-x-auto text-xs sm:gap-3 sm:text-sm">
      <Link href="/dashboard/inbox" className="flex items-center gap-1 hover:underline">
        <Inbox className="h-4 w-4" />
        الرسائل
      </Link>
      {/* قسم الشحن والتوصيل */}
      <div ref={shippingRef} className="relative flex items-center">
        <button
          type="button"
          onClick={() => setShippingOpen((v) => !v)}
          aria-expanded={shippingOpen}
          aria-haspopup="true"
          className="flex items-center gap-1 hover:underline"
        >
          <Truck className="h-4 w-4" />
          الشحن والتوصيل
        </button>
        {shippingOpen && (
          <div className="absolute right-0 top-full z-50 mt-2 min-w-40 rounded-lg border border-gray-200 bg-white p-2 text-sm shadow-lg">
            {shippingCities.length === 0 ? (
              <p className="px-2 py-1 text-xs text-gray-400">
                لا توجد مدن مرتبطة برسائل بعد
              </p>
            ) : (
              <ul className="max-h-72 overflow-y-auto">
                {shippingCities.map((city) => (
                  <li key={city.id}>
                    <Link
                      href={`/dashboard/shipping/${encodeURIComponent(city.slug)}`}
                      onClick={() => setShippingOpen(false)}
                      className="flex items-center gap-1 rounded px-2 py-1.5 text-gray-800 hover:bg-gray-100"
                    >
                      <MapPin className="h-4 w-4 text-[#075E54]" />
                      {city.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      <Link href="/dashboard/settings" className="flex items-center gap-1 hover:underline">
        <Settings className="h-4 w-4" />
        الإعدادات
      </Link>
      <button
        onClick={clearCache}
        disabled={clearingCache}
        className={`flex items-center gap-1 hover:underline ${
          cacheCleared ? "text-green-300" : ""
        }`}
        title="مسح ذاكرة التخزين المؤقت"
      >
        <Trash2 className="h-4 w-4" />
        {clearingCache ? "جاري..." : cacheCleared ? "تم ✓" : "مسح الـ Cache"}
      </button>
    </nav>
  );
}
