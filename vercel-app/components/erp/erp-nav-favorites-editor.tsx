"use client"

import * as React from "react"
import { ChevronDown, ChevronUp, Search, Star, Trash2 } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT, tOr } from "@/lib/i18n"
import { useErpNavAccess } from "@/lib/use-erp-nav-access"
import { useErpNavFavorites } from "@/lib/erp-nav-favorites-context"
import { buildErpNavItemByHrefMap } from "@/lib/erp-nav-registry"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { appAlert } from "@/lib/app-message"

type ErpNavFavoritesEditorProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ErpNavFavoritesEditor({ open, onOpenChange }: ErpNavFavoritesEditorProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const tr = (key: string, fallback: string) => tOr(t, key, fallback)
  const { accessibleHrefs } = useErpNavAccess()
  const { favoriteHrefs, setFavoriteHrefs, moveFavorite, resetToDefaults, maxFavorites } = useErpNavFavorites()
  const [draft, setDraft] = React.useState<string[]>(favoriteHrefs)
  const [query, setQuery] = React.useState("")
  const itemByHref = React.useMemo(() => buildErpNavItemByHrefMap(), [])

  React.useEffect(() => {
    if (open) {
      setDraft(favoriteHrefs)
      setQuery("")
    }
  }, [favoriteHrefs, open])

  const filteredCandidates = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return accessibleHrefs
      .filter((href) => !draft.includes(href))
      .filter((href) => {
        if (!q) return true
        const item = itemByHref.get(href)
        const label = item ? tr(item.titleKey, item.titleKey) : href
        return label.toLowerCase().includes(q) || href.toLowerCase().includes(q)
      })
      .slice(0, 40)
  }, [accessibleHrefs, draft, itemByHref, query, tr])

  const addHref = (href: string) => {
    if (draft.includes(href)) return
    if (draft.length >= maxFavorites) {
      void appAlert(
        tr("erpNavFavoritesMax", "즐겨찾기는 최대 {max}개까지 추가할 수 있습니다.").replace(
          "{max}",
          String(maxFavorites)
        )
      )
      return
    }
    setDraft((prev) => [...prev, href])
  }

  const removeHref = (href: string) => {
    setDraft((prev) => prev.filter((h) => h !== href))
  }

  const save = () => {
    setFavoriteHrefs(draft)
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-border/60 px-5 py-4 pr-12 text-left">
          <SheetTitle>{tr("erpNavFavoritesEditTitle", "바로가기 편집")}</SheetTitle>
          <SheetDescription>
            {tr(
              "erpNavFavoritesEditHint",
              "순서 앞쪽 6개가 대시보드 카드로, 전체가 사이드바 즐겨찾기에 표시됩니다."
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">{tr("erpNavFavorites", "즐겨찾기")}</h3>
              <span className="text-xs text-muted-foreground">
                {draft.length}/{maxFavorites}
              </span>
            </div>
            {draft.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-4 text-xs text-muted-foreground">
                {tr("erpNavFavoritesEmpty", "아래 목록에서 메뉴를 추가하거나 사이드바 별 아이콘을 눌러 주세요.")}
              </p>
            ) : (
              <ul className="space-y-1">
                {draft.map((href, index) => {
                  const item = itemByHref.get(href)
                  const Icon = item?.icon
                  const label = item ? tr(item.titleKey, item.titleKey) : href
                  return (
                    <li
                      key={href}
                      className="flex items-center gap-2 rounded-lg border bg-card px-2 py-2 text-sm"
                    >
                      {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={index === 0}
                          aria-label={tr("moveUp", "위로")}
                          onClick={() => setDraft((prev) => {
                            const next = [...prev]
                            const [row] = next.splice(index, 1)
                            next.splice(index - 1, 0, row)
                            return next
                          })}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          disabled={index === draft.length - 1}
                          aria-label={tr("moveDown", "아래로")}
                          onClick={() => setDraft((prev) => {
                            const next = [...prev]
                            const [row] = next.splice(index, 1)
                            next.splice(index + 1, 0, row)
                            return next
                          })}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          aria-label={tr("remove", "제거")}
                          onClick={() => removeHref(href)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-sm font-semibold">{tr("erpNavFavoritesAddMenu", "메뉴 추가")}</h3>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tr("erpNavFavoritesSearch", "메뉴 검색")}
                className="pl-9"
              />
            </div>
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {filteredCandidates.map((href) => {
                const item = itemByHref.get(href)
                const Icon = item?.icon
                const label = item ? tr(item.titleKey, item.titleKey) : href
                return (
                  <li key={href}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted/60"
                      onClick={() => addHref(href)}
                    >
                      {Icon ? <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      <Star className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        </div>

        <SheetFooter className="flex-row flex-wrap gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={resetToDefaults}>
            {tr("erpNavFavoritesReset", "기본값으로")}
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {tr("cancel", "취소")}
            </Button>
            <Button type="button" onClick={save}>
              {tr("save", "저장")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
