"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

/** POS 전용 레이아웃 - 풀스크린, 태블릿 터치 UI */
export default function PosLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 flex flex-col bg-slate-950">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-4">
        <Link
          href="/admin"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Admin
        </Link>
        <span className="text-sm font-bold text-white">POS</span>
        <div className="w-16" />
      </header>
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  )
}
