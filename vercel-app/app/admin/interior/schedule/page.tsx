"use client"

import * as React from "react"
import { Suspense } from "react"
import { Calendar } from "lucide-react"
import { InteriorProjectToolShell } from "@/components/interior/interior-project-tool-shell"
import { InteriorSchedulePanel } from "@/components/interior/panels/interior-schedule-panel"
import { INTERIOR_ADMIN } from "@/lib/interior-admin-nav"

function InteriorSchedulePageInner() {
  return (
    <InteriorProjectToolShell
      toolBasePath={INTERIOR_ADMIN.schedule}
      titleKey="interiorSchedule"
      icon={Calendar}
      allowMultiProject
    >
      {(projectId) => <InteriorSchedulePanel projectId={projectId} />}
    </InteriorProjectToolShell>
  )
}

export default function InteriorScheduleRoutePage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">…</div>}>
      <InteriorSchedulePageInner />
    </Suspense>
  )
}
