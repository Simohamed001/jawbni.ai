"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Input } from "@/components/ui/button";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    shopName: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "خطأ في التسجيل");
      return;
    }
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f0f2f5] p-4" dir="rtl">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg"
      >
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-[#075E54]">jawbni.ai</h1>
          <p className="mt-1 text-sm text-gray-500">إنشاء حساب تاجر جديد</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {(["name", "shopName", "email", "password"] as const).map((field) => (
          <div key={field} className="mb-4">
            <label className="mb-1 block text-sm">
              {field === "name"
                ? "الاسم"
                : field === "shopName"
                  ? "اسم المتجر"
                  : field === "email"
                    ? "البريد الإلكتروني"
                    : "كلمة المرور"}
            </label>
            <Input
              type={field === "password" ? "password" : field === "email" ? "email" : "text"}
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              required
            />
          </div>
        ))}

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "جاري التسجيل..." : "إنشاء حساب"}
        </Button>

        <p className="mt-4 text-center text-sm text-gray-500">
          لديك حساب؟{" "}
          <Link href="/login" className="text-[#075E54] hover:underline">
            تسجيل الدخول
          </Link>
        </p>
      </form>
    </div>
  );
}
