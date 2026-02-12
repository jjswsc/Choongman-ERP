import { Card, CardContent } from "@/components/ui/card"
import { Construction } from "lucide-react"

interface PlaceholderTabProps {
  title: string
}

export function PlaceholderTab({ title }: PlaceholderTabProps) {
  return (
    <div className="flex flex-col gap-4 p-4">
      <Card className="shadow-sm">
        <CardContent className="flex flex-col items-center py-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Construction className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">준비 중입니다</p>
        </CardContent>
      </Card>
    </div>
  )
}
