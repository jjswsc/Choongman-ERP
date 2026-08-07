"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { stashVendorEditIntent } from "@/lib/expense-payee-vendor-href"
import { ensureErpWorkspaceTab } from "@/lib/erp-workspace-tabs"
import { cn } from "@/lib/utils"

type Props = {
  payeeCode?: string | null
  payeeName?: string | null
  label: string
  title?: string
  className?: string
}

/** Opens Vendor Management with that payee loaded for bank account edit. */
export function ExpensePayeeBankMissingLink({
  payeeCode,
  payeeName,
  label,
  title,
  className,
}: Props) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  const open = React.useCallback(() => {
    const href = stashVendorEditIntent(payeeCode, payeeName)
    ensureErpWorkspaceTab(href)
    setPending(true)
    router.push(href)
    // Same URL re-click: Next may no-op; vendors page also consumes session intent on activate.
    window.setTimeout(() => setPending(false), 800)
  }, [payeeCode, payeeName, router])

  return (
    <button
      type="button"
      className={cn(
        "inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 underline-offset-2 hover:underline dark:bg-amber-950/50 dark:text-amber-200",
        pending && "opacity-70",
        className
      )}
      title={title}
      onClick={open}
      disabled={pending}
    >
      {label}
    </button>
  )
}
