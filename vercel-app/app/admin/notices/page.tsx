"use client"

import { NoticeAdminPageHeader, NoticeAdminWorkspace } from "@/components/erp/notice-admin-workspace"

export default function AdminNoticesPage() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <NoticeAdminPageHeader />
        <NoticeAdminWorkspace />
      </div>
    </div>
  )
}
