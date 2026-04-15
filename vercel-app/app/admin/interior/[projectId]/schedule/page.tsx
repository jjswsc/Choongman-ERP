import { redirect } from "next/navigation"

export default async function LegacyInteriorScheduleRedirect(props: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await props.params
  redirect(`/admin/interior/schedule?projectId=${encodeURIComponent(projectId)}`)
}
