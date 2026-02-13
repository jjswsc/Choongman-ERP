"use client"

import { WorklogPage } from "@/components/erp/worklog-page"

export default function Page() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <WorklogPage />
      </div>
    </div>
  )
}
