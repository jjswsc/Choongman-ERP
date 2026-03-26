import { redirect } from "next/navigation"

type PageProps = {
  searchParams: Promise<{ campaignId?: string }>
}

export default async function MarketingDashboardRedirectPage({ searchParams }: PageProps) {
  const p = await searchParams
  const q = new URLSearchParams()
  q.set("tab", "performance")
  const cid = typeof p.campaignId === "string" ? p.campaignId.trim() : ""
  if (cid) q.set("campaignId", cid)
  redirect(`/admin/marketing/report?${q.toString()}`)
}
