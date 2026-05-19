import { redirect } from "next/navigation"
import { INTERIOR_ADMIN } from "@/lib/interior-admin-nav"

/** 레거시 URL → 통합 업체 메뉴(업체 목록 탭) */
export default async function Page(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await props.searchParams
  const params = new URLSearchParams()
  params.set("tab", "directory")
  for (const [key, value] of Object.entries(sp)) {
    if (key === "tab" || value == null) continue
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v))
    else params.set(key, value)
  }
  const q = params.toString()
  redirect(q ? `${INTERIOR_ADMIN.vendors}?${q}` : `${INTERIOR_ADMIN.vendors}?tab=directory`)
}
