"use client"

import { Tags } from "lucide-react"
import { ItemForm } from "@/components/erp/item-form"
import { ItemTable } from "@/components/erp/item-table"

export default function ItemsPage() {
  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Page Title */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Tags className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              품목 관리
            </h1>
            <p className="text-xs text-muted-foreground">
              품목을 등록하고 관리합니다.
            </p>
          </div>
        </div>

        {/* Two column: Form + Table */}
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <ItemForm />
          <ItemTable />
        </div>
      </div>
    </div>
  )
}
