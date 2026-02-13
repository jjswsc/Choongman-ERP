"use client"

import * as React from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import type { AdminItem } from "@/lib/api-client"

interface ItemPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: AdminItem[]
  onSelect: (item: AdminItem) => void
}

export function ItemPickerDialog({
  open,
  onOpenChange,
  items,
  onSelect,
}: ItemPickerDialogProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [search, setSearch] = React.useState("")

  const filtered = React.useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(
      (i) =>
        i.code.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q)
    )
  }, [items, search])

  const handleSelect = (item: AdminItem) => {
    onSelect(item)
    onOpenChange(false)
    setSearch("")
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] rounded-xl border bg-card shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b">
          <h3 className="text-sm font-bold mb-3">{t("inFindItem") || "품목 찾기"}</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("itemsSearchPh") || "코드, 품목명"}
              className="pl-9"
            />
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-2 w-20">{t("itemsColCode")}</th>
                <th className="text-left py-2 px-2">{t("itemsColName")}</th>
                <th className="text-left py-2 px-2 w-16">{t("spec")}</th>
                <th className="w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    {t("itemsNoResults") || "조회된 품목이 없습니다."}
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr
                    key={item.code}
                    className={cn(
                      "border-b cursor-pointer hover:bg-muted/50",
                      "transition-colors"
                    )}
                    onClick={() => handleSelect(item)}
                  >
                    <td className="py-2 px-2">
                      <span className="font-mono text-xs bg-primary/10 px-1.5 py-0.5 rounded">
                        {item.code}
                      </span>
                    </td>
                    <td className="py-2 px-2 font-medium">{item.name}</td>
                    <td className="py-2 px-2 text-muted-foreground text-xs">{item.spec || "-"}</td>
                    <td className="py-2 px-2">
                      <Button size="sm" variant="ghost" className="h-7 text-xs">
                        {t("addCart") || "담기"}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="p-4 border-t flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
        </div>
      </div>
    </div>
  )
}
