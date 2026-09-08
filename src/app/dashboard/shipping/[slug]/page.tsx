"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";

interface DeliveryCity {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

export default function ShippingCityPage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(String(params?.slug ?? ""));

  const [city, setCity] = useState<DeliveryCity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings/cities")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((data: DeliveryCity[]) => {
        if (cancelled) return;
        const found = data.find((c) => c.slug === slug);
        if (found) setCity(found);
        else setError("لم يتم العثور على هذه المدينة.");
      })
      .catch(() => {
        if (!cancelled) setError("فشل تحميل بيانات المدينة.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <Link
          href="/dashboard/inbox"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:underline"
        >
          <ArrowRight className="h-4 w-4" />
          العودة إلى الرسائل
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MapPin className="h-6 w-6 text-[#075E54]" />
          {loading ? "جاري التحميل..." : city?.name ?? "مدينة الشحن"}
        </h1>
        <p className="text-gray-600">صفحة مدينة الشحن — الرسائل المصنّفة إليها</p>
      </div>

      {loading ? (
        <div className="rounded-xl bg-white p-10 text-center text-gray-500 shadow">
          جاري التحميل...
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-50 p-4 text-center text-red-700 shadow">
          {error}
        </div>
      ) : (
        <div className="rounded-xl bg-white p-10 text-center shadow">
          <p className="mb-2 text-lg font-medium">{city?.name}</p>
          <p className="text-sm text-gray-500">
            {city?.isActive
              ? "هذه المدينة مفعّلة للتوصيل."
              : "هذه المدينة معطّلة حالياً."}
          </p>
          <p className="mt-4 text-xs text-gray-400">
            ستُعرض هنا الرسائل المصنّفة إلى هذه المدينة.
          </p>
        </div>
      )}
    </div>
  );
}
