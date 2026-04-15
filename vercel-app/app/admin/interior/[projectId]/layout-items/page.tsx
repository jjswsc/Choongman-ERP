import { redirect } from "next/navigation"

export default async function LegacyInteriorLayoutItemsRedirect(props: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await props.params
  redirect(
    `/admin/interior/drawings?projectId=${encodeURIComponent(projectId)}&tab=layout`
  )
}
