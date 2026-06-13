import { apiFetch } from "@/lib/api/fetch"
import type { Member } from "@/lib/api-client"

export type { Member }

export async function approveReferralViaApi(params: {
  referrerMemberId: number
  referredMemberId: number
  referrerPoints?: number
  referredPoints?: number
}): Promise<boolean> {
  const res = await apiFetch("/api/crm/referrals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  })
  const data = (await res.json()) as { success?: boolean }
  return Boolean(data.success)
}
