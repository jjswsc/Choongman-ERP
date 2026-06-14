import { Suspense } from "react"
import { MemberPortalApp } from "@/components/member-portal/member-portal-app"
import { MemberPortalLangProvider } from "@/lib/member-portal-lang-context"

export default function MemberPortalPage() {
  return (
    <MemberPortalLangProvider>
      <Suspense fallback={null}>
        <MemberPortalApp />
      </Suspense>
    </MemberPortalLangProvider>
  )
}
