"use client"

import { AdminNoticeSection } from "@/components/admin/admin-notice-section"

export default function AdminNoticesPage() {
  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-slate-900">공지사항 관리</h1>
      <AdminNoticeSection />
    </div>
  )
}
