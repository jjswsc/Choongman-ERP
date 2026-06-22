"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { searchMembersPoints, type Member } from "@/lib/api-client"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const MEMBER_PAGE_SIZE = 100

const TIER_OPTIONS = ["", "BRONZE", "SILVER", "GOLD", "DIAMOND"] as const
const STATUS_OPTIONS = ["", "active", "inactive"] as const

export type MemberPointsSearchFilters = {
  q: string
  tierCode: string
  status: string
  pointBalanceMin: string
  pointBalanceMax: string
  tierPointsMin: string
  tierPointsMax: string
}

const EMPTY_FILTERS: MemberPointsSearchFilters = {
  q: "",
  tierCode: "",
  status: "",
  pointBalanceMin: "",
  pointBalanceMax: "",
  tierPointsMin: "",
  tierPointsMax: "",
}

function hasCriteria(filters: MemberPointsSearchFilters): boolean {
  return Boolean(
    filters.q.trim() ||
      filters.tierCode.trim() ||
      filters.status.trim() ||
      filters.pointBalanceMin.trim() ||
      filters.pointBalanceMax.trim() ||
      filters.tierPointsMin.trim() ||
      filters.tierPointsMax.trim()
  )
}

type MemberPointsSearchPanelProps = {
  selectedMemberId: number | null
  onSelectMember: (member: Member) => void
  /** 다른 화면 링크(memberId) — 검색 없이 해당 회원만 선택 */
  initialMemberId?: number | null
}

export function MemberPointsSearchPanel({
  selectedMemberId,
  onSelectMember,
  initialMemberId,
}: MemberPointsSearchPanelProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [, startTransition] = React.useTransition()

  const [draft, setDraft] = React.useState<MemberPointsSearchFilters>(EMPTY_FILTERS)
  const [applied, setApplied] = React.useState<MemberPointsSearchFilters>(EMPTY_FILTERS)
  const [members, setMembers] = React.useState<Member[]>([])
  const [loading, setLoading] = React.useState(false)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState("")
  const [pageCursors, setPageCursors] = React.useState<(number | undefined)[]>([undefined])
  const [pageIndex, setPageIndex] = React.useState(0)
  const [hasMore, setHasMore] = React.useState(false)

  const appliedRef = React.useRef(applied)
  const pageCursorsRef = React.useRef(pageCursors)
  const pageIndexRef = React.useRef(pageIndex)
  appliedRef.current = applied
  pageCursorsRef.current = pageCursors
  pageIndexRef.current = pageIndex

  const patchDraft = React.useCallback((patch: Partial<MemberPointsSearchFilters>) => {
    setDraft((prev) => ({ ...prev, ...patch }))
  }, [])

  const loadPage = React.useCallback(
    async (opts?: {
      filters?: MemberPointsSearchFilters
      afterId?: number | undefined
      pageIdx?: number
      cursors?: (number | undefined)[]
    }) => {
      const filters = opts?.filters ?? appliedRef.current
      const cursors = opts?.cursors ?? pageCursorsRef.current
      const pageIdx = opts?.pageIdx ?? pageIndexRef.current
      const afterId = opts?.afterId !== undefined ? opts.afterId : cursors[pageIdx]

      if (!hasCriteria(filters)) {
        setErrorMessage(t("memberPointsSearchNeedsCriteria"))
        return
      }

      setErrorMessage("")
      setLoading(true)
      try {
        const res = await searchMembersPoints({
          q: filters.q.trim(),
          tierCode: filters.tierCode.trim(),
          status: filters.status.trim(),
          pointBalanceMin: filters.pointBalanceMin.trim() || undefined,
          pointBalanceMax: filters.pointBalanceMax.trim() || undefined,
          tierPointsMin: filters.tierPointsMin.trim() || undefined,
          tierPointsMax: filters.tierPointsMax.trim() || undefined,
          afterId,
          limit: MEMBER_PAGE_SIZE,
        })
        if (!res.success) {
          startTransition(() => {
            setMembers([])
            setHasMore(false)
          })
          setErrorMessage(res.message || t("memberLoadFailed"))
          setHasSearched(true)
          return
        }
        const rows = res.rows || []
        startTransition(() => {
          setMembers(rows)
          setHasMore(rows.length >= MEMBER_PAGE_SIZE)
        })
        setHasSearched(true)
      } catch (e) {
        console.error("searchMembersPoints:", e)
        startTransition(() => {
          setMembers([])
          setHasMore(false)
        })
        setErrorMessage(t("memberLoadFailed"))
        setHasSearched(true)
      } finally {
        setLoading(false)
      }
    },
    [t]
  )

  const runSearch = React.useCallback(() => {
    if (!hasCriteria(draft)) {
      setErrorMessage(t("memberPointsSearchNeedsCriteria"))
      return
    }
    setApplied(draft)
    setPageCursors([undefined])
    setPageIndex(0)
    void loadPage({ filters: draft, afterId: undefined, pageIdx: 0, cursors: [undefined] })
  }, [draft, loadPage, t])

  const resetFilters = React.useCallback(() => {
    setDraft(EMPTY_FILTERS)
    setApplied(EMPTY_FILTERS)
    setMembers([])
    setHasSearched(false)
    setErrorMessage("")
    setPageCursors([undefined])
    setPageIndex(0)
    setHasMore(false)
  }, [])

  const goNextPage = React.useCallback(() => {
    if (!hasMore || members.length === 0) return
    const nextAfterId = members[members.length - 1].id
    const nextCursors = [...pageCursors.slice(0, pageIndex + 1), nextAfterId]
    const nextIndex = pageIndex + 1
    setPageCursors(nextCursors)
    setPageIndex(nextIndex)
    void loadPage({ afterId: nextAfterId, pageIdx: nextIndex, cursors: nextCursors })
  }, [hasMore, members, pageCursors, pageIndex, loadPage])

  const goPrevPage = React.useCallback(() => {
    if (pageIndex <= 0) return
    const prevIndex = pageIndex - 1
    setPageIndex(prevIndex)
    void loadPage({ afterId: pageCursors[prevIndex], pageIdx: prevIndex, cursors: pageCursors })
  }, [pageCursors, pageIndex, loadPage])

  const initialLoadedRef = React.useRef(false)
  React.useEffect(() => {
    const id = Number(initialMemberId || 0)
    if (!id || initialLoadedRef.current) return
    initialLoadedRef.current = true
    const filters = { ...EMPTY_FILTERS, q: String(id) }
    setDraft(filters)
    setApplied(filters)
    void (async () => {
      setErrorMessage("")
      setLoading(true)
      try {
        const res = await searchMembersPoints({
          q: String(id),
          limit: MEMBER_PAGE_SIZE,
        })
        if (!res.success) {
          setErrorMessage(res.message || t("memberLoadFailed"))
          setHasSearched(true)
          return
        }
        const rows = res.rows || []
        setMembers(rows)
        setHasMore(rows.length >= MEMBER_PAGE_SIZE)
        setHasSearched(true)
        const pick = rows.find((m) => m.id === id) || rows[0]
        if (pick) onSelectMember(pick)
      } catch {
        setErrorMessage(t("memberLoadFailed"))
        setHasSearched(true)
      } finally {
        setLoading(false)
      }
    })()
  }, [initialMemberId, onSelectMember, t])

  const emptyMessage = hasSearched ? t("memberPointsNoSearchResult") : t("memberPointsSearchIdleHint")

  return (
    <Card className="h-full">
      <CardHeader className="space-y-3">
        <CardTitle className="text-base">{t("memberPointsSearchTitle")}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("memberPointsSearchFilterHint")}</p>

        <div className="space-y-1.5">
          <Label className="text-xs">{t("memberPointsSearchText")}</Label>
          <Input
            placeholder={t("memberPointsSearchTextPh")}
            value={draft.q}
            onChange={(e) => patchDraft({ q: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch()
            }}
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("memberTier")}</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.tierCode}
              onChange={(e) => patchDraft({ tierCode: e.target.value })}
            >
              <option value="">{t("memberPointsFilterAll")}</option>
              {TIER_OPTIONS.filter(Boolean).map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("status")}</Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.status}
              onChange={(e) => patchDraft({ status: e.target.value })}
            >
              <option value="">{t("memberPointsFilterAll")}</option>
              {STATUS_OPTIONS.filter(Boolean).map((code) => (
                <option key={code} value={code}>
                  {code === "active" ? t("memberStatusActive") : t("memberStatusInactive")}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("memberPointsBalanceMin")}</Label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="0"
              value={draft.pointBalanceMin}
              onChange={(e) => patchDraft({ pointBalanceMin: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("memberPointsBalanceMax")}</Label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="—"
              value={draft.pointBalanceMax}
              onChange={(e) => patchDraft({ pointBalanceMax: e.target.value })}
            />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">{t("memberPointsTierMin")}</Label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="0"
              value={draft.tierPointsMin}
              onChange={(e) => patchDraft({ tierPointsMin: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("memberPointsTierMax")}</Label>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="—"
              value={draft.tierPointsMax}
              onChange={(e) => patchDraft({ tierPointsMax: e.target.value })}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={runSearch} disabled={loading}>
            {loading ? t("loading") : t("search")}
          </Button>
          <Button type="button" variant="outline" onClick={resetFilters} disabled={loading}>
            {t("memberPointsSearchReset")}
          </Button>
        </div>

        {errorMessage ? (
          <p className="text-xs text-destructive">{errorMessage}</p>
        ) : hasSearched ? (
          <p className="text-xs text-muted-foreground">
            {t("memberSearchResult")}: {tr(t, "memberListPageShowing", { count: String(members.length) })}
            {pageIndex > 0 ? ` · ${pageIndex + 1}` : ""}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : (
          <div className="overflow-auto rounded-md border max-h-[min(70vh,640px)]">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 sticky top-0 z-10">
                <tr>
                  <th className="p-2 text-left">{t("name")}</th>
                  <th className="p-2 text-left">{t("memberNo")}</th>
                  <th className="p-2 text-left">{t("memberTier")}</th>
                  <th className="p-2 text-right">{t("memberPointsBalance")}</th>
                  <th className="p-2 text-right">{t("memberPointsTierCumulative")}</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr
                    key={m.id}
                    className={cn(
                      "cursor-pointer border-t hover:bg-muted/20",
                      selectedMemberId === m.id && "bg-primary/10 hover:bg-primary/15"
                    )}
                    onClick={() => onSelectMember(m)}
                  >
                    <td className="p-2">{m.name || "—"}</td>
                    <td className="p-2">{m.memberNo || "—"}</td>
                    <td className="p-2">{m.tierCode || "—"}</td>
                    <td className="p-2 text-right tabular-nums">
                      {Number(m.pointBalance || 0).toLocaleString()}
                    </td>
                    <td className="p-2 text-right tabular-nums">
                      {Number(m.tierPoints || 0).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {!members.length && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-muted-foreground">
                      {emptyMessage}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pageIndex <= 0 || loading || !hasSearched} onClick={goPrevPage}>
            {t("memberListPagePrev")}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!hasMore || loading || !hasSearched} onClick={goNextPage}>
            {t("memberListPageNext")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
