import { VisitStatsContent } from "@/components/visit-stats/visit-stats-content"

export default function Page() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="flex-1 overflow-auto">
        <VisitStatsContent />
      </main>
    </div>
  )
}
