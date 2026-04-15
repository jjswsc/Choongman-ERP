import { redirect } from "next/navigation"

export default async function LegacyInteriorSpecificationRedirect(props: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await props.params
  redirect(
    `/admin/interior/specs?projectId=${encodeURIComponent(projectId)}&tab=spec`
  )
}
