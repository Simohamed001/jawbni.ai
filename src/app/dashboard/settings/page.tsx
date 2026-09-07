import Link from "next/link";
import { ArrowLeft, LayoutTemplate } from "lucide-react";

export default function SettingsPage() {
  const settingsOptions = [
    {
      title: "إدارة الإعدادات",
      description: "إدارة متكاملة لإعدادات المتجر والتصنيفات والمنتجات والأقسام الفرعية",
      icon: <LayoutTemplate className="h-6 w-6" />,
      href: "/dashboard/settings/unified",
      color: "bg-gradient-to-r from-blue-500 to-green-500",
    },
  ];

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6">
        <Link 
          href="/dashboard/inbox" 
          className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          العودة للرسائل
        </Link>
        <h1 className="text-2xl font-bold">الإعدادات</h1>
        <p className="text-gray-600">إدارة إعدادات نظام التصنيف والمنتجات</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {settingsOptions.map((option) => (
          <Link
            key={option.href}
            href={option.href}
            className="group rounded-xl bg-white p-6 shadow transition-all hover:shadow-lg"
          >
            <div className="flex items-start gap-4">
              <div className={`${option.color} rounded-lg p-3 text-white`}>
                {option.icon}
              </div>
              <div className="flex-1">
                <h3 className="mb-1 font-semibold text-lg group-hover:text-blue-600">
                  {option.title}
                </h3>
                <p className="text-sm text-gray-600">{option.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-8 rounded-xl bg-blue-50 p-4">
        <h3 className="mb-2 font-semibold text-blue-900">معلومات مهمة:</h3>
        <ul className="list-inside list-disc space-y-1 text-sm text-blue-800">
          <li>التصنيفات والمنتجات تستخدم لتحسين دقة التصنيف التلقائي</li>
          <li>الكلمات المفتاحية تساعد في التعرف على المنتجات في الرسائل</li>
          <li>الربط بين المنتجات والأقسام يسهل تنظيم الردود</li>
          <li>الردود الجماعية توفر الوقت في الرد على الرسائل المتشابهة</li>
        </ul>
      </div>
    </div>
  );
}