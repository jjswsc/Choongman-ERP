import { redirect } from "next/navigation"

/** 예전 경로 호환: 홍보물 페이지 사은품 탭으로 이동 */
export default async function MarketingMaterialGiftsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ campaignId?: string }>
}) {
  const p = await searchParams
  const q = new URLSearchParams()
  q.set("tab", "gifts")
  const c = p.campaignId?.trim()
  if (c) q.set("campaignId", c)
  redirect(`/admin/marketing/materials?${q.toString()}`)
}
