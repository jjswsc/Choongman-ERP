"use client"

import { MapPin } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { VisitStatsContent } from "@/components/visit-stats/visit-stats-content"
import { VisitListTab } from "@/components/visit-stats/visit-list-tab"

export default function Page() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <MapPin className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t("adminStoreVisit")}</h1>
            <p className="text-xs text-muted-foreground">{t("visit_page_title")}</p>
          </div>
        </div>

        <Tabs defaultValue="stats" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-4">
            <TabsTrigger value="list" className="text-sm font-medium">{t("tab_visit_list")}</TabsTrigger>
            <TabsTrigger value="stats" className="text-sm font-medium">{t("tab_visit_stats")}</TabsTrigger>
          </TabsList>
          <TabsContent value="list" className="mt-0 space-y-4">
            <VisitListTab />
          </TabsContent>
          <TabsContent value="stats" className="mt-0 space-y-4">
            <VisitStatsContent />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
