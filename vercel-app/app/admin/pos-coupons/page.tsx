import { redirect } from "next/navigation"

export default function PosCouponsRedirectPage() {
  redirect("/admin/crm/coupons?tab=definitions")
}
