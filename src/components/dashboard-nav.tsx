"use client";

import { useState } from "react";
import Link from "next/link";
import { Settings, Inbox, Trash2 } from "lucide-react";

export function DashboardNav() {
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheCleared, setCacheCleared] = useState(false);

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
