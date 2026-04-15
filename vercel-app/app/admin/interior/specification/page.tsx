import { redirect } from "next/navigation"

export default async function RedirectInteriorSpecification(props: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const sp = await props.searchParams
  const qs = new URLSearchParams()
  if (sp.projectId) qs.set("projectId", sp.projectId)
  qs.set("tab", "spec")
  redirect(`/admin/interior/specs?${qs}`)
}
