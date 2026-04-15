import { redirect } from "next/navigation"

export default async function LegacyInteriorVendorsRedirect(props: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await props.params
  redirect(`/admin/interior/vendors?projectId=${encodeURIComponent(projectId)}`)
}
