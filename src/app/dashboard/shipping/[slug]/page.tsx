"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import {
  MessageList,
  type CityOption,
  type MessageItem,
} from "@/components/inbox/MessageList";

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
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const [citiesRes, messagesRes] = await Promise.all([
        fetch("/api/settings/cities"),
        fetch(`/api/messages?citySlug=${encodeURIComponent(slug)}`),
      ]);
      const allCities: DeliveryCity[] = await citiesRes.json();
      const list = await messagesRes.json();
      if (!Array.isArray(allCities) || !Array.isArray(list)) {
        throw new Error("bad response");
      }
      setCity(allCities.find((c) => c.slug === slug) ?? null);
      setMessages(list);
      setCities(
        allCities
          .filter((c) => c.isActive)
          .map((c) => ({ id: c.id, name: c.name })),
      );
    } catch {
      setError("تعذر تحميل بيانات المدينة");
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  // تعديل استثنائي: ربط الرسالة بمدينة أخرى أو إلغاء ربطها
  async function assignCity(id: string, cityId: string | null) {
    const res = await fetch(`/api/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cityId }),
    });
    if (res.ok) load();
  }

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">
        جارٍ التحميل...
      </div>
    );
  }

  if (error || !city) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600">{error || "المدينة غير موجودة"}</p>
        <Link
          href="/dashboard/inbox"
          className="mt-4 inline-block text-[#075E54] hover:underline"
        >
          العودة إلى صندوق الوارد
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden">
      {/* رأس الصفحة */}
      <div className="flex items-center justify-between border-b bg-[#f0f2f5] px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-300 font-bold text-gray-600">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{city.name}</h3>
            <p className="text-xs text-gray-500">
              {messages.length} رسالة مصنّفة إلى هذه المدينة
              {!city.isActive && " — المدينة غير مفعّلة"}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/settings/cities"
          className="flex items-center gap-1 text-sm text-[#075E54] hover:underline"
        >
          إدارة المدن
          <ArrowRight className="h-4 w-4 rotate-180" />
        </Link>
      </div>

      {/* الرسائل مع محدد المدينة كخيار تعديل استثنائي */}
      <div className="min-h-0 flex-1 bg-[#efeae2]">
        {messages.length > 0 ? (
          <MessageList
            messages={messages}
            cities={cities}
            onAssignCity={assignCity}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-500">
            لا توجد رسائل مصنّفة إلى {city.name} حالياً
          </div>
        )}
      </div>
    </div>
  );
}
