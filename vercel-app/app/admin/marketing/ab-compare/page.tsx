import { redirect } from "next/navigation"

/** 이전 단독 메뉴 URL 호환 — 캠페인 허브 탭으로 이동 */
export default function MarketingAbCompareRedirectPage() {
  redirect("/admin/marketing/campaigns?view=compare")
}
