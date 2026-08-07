"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bot, ExternalLink } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { AiCenterClient } from "@/components/ai/ai-center-client"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useStoreView } from "@/lib/store-view-context"
import { canAccessAiCenter } from "@/lib/permissions"
import { useAuth } from "@/lib/auth-context"
import { useAiCenterModuleEnabled } from "@/lib/use-ai-center-module"

type Props = {
  triggerClassName?: string
}

export function AiCenterDrawer({ triggerClassName }: Props) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const pathname = usePathname() || "/admin"
  const { viewStore } = useStoreView()
  const [open, setOpen] = React.useState(false)
  const aiModuleEnabled = useAiCenterModuleEnabled()

  if (!auth || !canAccessAiCenter(auth.role || "") || aiModuleEnabled === false) return null

  const prefillQ = t("aiCenterHeaderPrefill").replace(/\{\{path\}\}/g, pathname)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={triggerClassName || "h-8 w-8 text-muted-foreground hover:text-foreground"}
          title={t("aiCenterAskDrawerTitle")}
        >
          <Bot className="h-4 w-4" />
          <span className="sr-only">{t("aiCenter")}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b px-4 py-3 pr-14">
          <div className="flex items-center justify-between gap-2 pr-1">
            <SheetTitle className="text-left text-base">{t("aiCenterAskDrawerTitle")}</SheetTitle>
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" asChild>
              <Link href={`/admin/ai-center?intent=qa&q=${encodeURIComponent(prefillQ)}&store=${encodeURIComponent(viewStore || "")}`}>
                {t("aiCenterOpenFullPage")}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AiCenterDrawerBody key={`${open}-${prefillQ}-${viewStore || ""}`} prefillQ={prefillQ} store={viewStore || ""} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

function AiCenterDrawerBody({ prefillQ, store }: { prefillQ: string; store: string }) {
  React.useEffect(() => {
    try {
      sessionStorage.setItem("ai_center_drawer_prefill_q", prefillQ)
      if (store) sessionStorage.setItem("ai_center_drawer_store", store)
    } catch {
      // ignore
    }
  }, [prefillQ, store])

  return <AiCenterClient compact />
}
