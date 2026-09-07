import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth";
import { DashboardNav } from "@/components/dashboard-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col" dir="rtl">
      <header className="flex items-center justify-between bg-[#075E54] px-4 py-3 text-white">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/inbox" className="text-lg font-bold">
            jawbni.ai
          </Link>
          <DashboardNav />
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button type="submit" className="text-sm hover:underline">
            خروج ({session.user.email})
          </button>
        </form>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
