import { redirect } from "next/navigation"

export default async function InteriorFilesRedirectPage(props: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await props.params
  redirect(
    `/admin/interior/drawings?projectId=${encodeURIComponent(projectId)}&tab=files`
  )
}
