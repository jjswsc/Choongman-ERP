import { redirect } from "next/navigation"

export default async function RedirectInteriorEstimates(props: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const sp = await props.searchParams
  const qs = new URLSearchParams()
  if (sp.projectId) qs.set("projectId", sp.projectId)
  qs.set("tab", "files")
  redirect(`/admin/interior/drawings?${qs}`)
}
