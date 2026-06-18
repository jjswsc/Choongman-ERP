import { Suspense } from "react"
import { MemberPortalApp } from "@/components/member-portal/member-portal-app"
import { MemberPortalTierGemRenderProvider } from "@/components/member-portal/member-portal-tier-gem-render-context"
import { MemberPortalLangProvider } from "@/lib/member-portal-lang-context"

export default function MemberPortalPage() {
  return (
    <MemberPortalLangProvider>
      <Suspense fallback={null}>
        <MemberPortalTierGemRenderProvider>
          <MemberPortalApp />
        </MemberPortalTierGemRenderProvider>
      </Suspense>
    </MemberPortalLangProvider>
  )
}
