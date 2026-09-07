import { redirect } from "next/navigation";

export default function MerchantSettingsRedirect() {
  redirect("/dashboard/settings/unified");
}
