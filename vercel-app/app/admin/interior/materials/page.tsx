import { redirect } from "next/navigation"

export default async function RedirectInteriorMaterials(props: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const sp = await props.searchParams
  const qs = new URLSearchParams()
  if (sp.projectId) qs.set("projectId", sp.projectId)
  qs.set("tab", "materials")
  redirect(`/admin/interior/specs?${qs}`)
}
