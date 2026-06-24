import type { Metadata } from "next"
import { Suspense } from "react"
import { MemberPortalPublicComplaintPage } from "@/components/member-portal/member-portal-public-complaint-page"
import { MemberPortalLangProvider } from "@/lib/member-portal-lang-context"

export const metadata: Metadata = {
  title: "Feedback & complaints",
  description: "Submit feedback without login — Choongman Chicken",
}

export default function MemberPublicComplaintRoutePage() {
  return (
    <MemberPortalLangProvider>
      <Suspense fallback={null}>
        <MemberPortalPublicComplaintPage />
      </Suspense>
    </MemberPortalLangProvider>
  )
}
