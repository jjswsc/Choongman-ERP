import { redirect } from "next/navigation"

export default async function LegacyInteriorKitchenRedirect(props: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await props.params
  redirect(`/admin/interior/kitchen?projectId=${encodeURIComponent(projectId)}`)
}
