import { redirect } from "next/navigation"

export default async function InteriorExpenseRedirectPage(props: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await props.params
  redirect(
    `/admin/interior/costs?projectId=${encodeURIComponent(projectId)}&tab=expense`
  )
}
