"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";
import { Button, Input } from "@/components/ui/button";

export default function LoginPage() {
  const [email, setEmail] = useState("demo@jawbni.ai");
  const [password, setPassword] = useState("demo1234");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("بيانات الدخول غير صحيحة");
      return;
    }
    if (!res?.ok) {
      setError("تعذر تسجيل الدخول، حاول مرة أخرى");
      return;
    }

    // A full navigation guarantees that the new session cookie is read
    // before the protected dashboard is rendered.
    window.location.assign("/dashboard/inbox");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f0f2f5] p-4" dir="rtl">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg"
      >
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-[#075E54]">jawbni.ai</h1>
          <p className="mt-1 text-sm text-gray-500">تصنيف ذكي لرسائل التجار</p>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <label className="mb-1 block text-sm">البريد الإلكتروني</label>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4"
          required
        />

        <label className="mb-1 block text-sm">كلمة المرور</label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-6"
          required
        />

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "جاري الدخول..." : "تسجيل الدخول"}
        </Button>

        <p className="mt-4 text-center text-sm text-gray-500">
          ليس لديك حساب؟{" "}
          <Link href="/register" className="text-[#075E54] hover:underline">
            إنشاء حساب
          </Link>
        </p>
      </form>
    </div>
  );
}
