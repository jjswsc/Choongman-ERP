import { redirect } from "next/navigation"

export default function MemberCouponsRedirectPage() {
  redirect("/admin/crm/coupons?tab=issue")
}
