"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { getMembersCursor, type Member } from "@/lib/api-client"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const MEMBER_PAGE_SIZE = 100

type MemberPointsSearchPanelProps = {
  selectedMemberId: number | null
  onSelectMember: (member: Member) => void
}

export function MemberPointsSearchPanel({ selectedMemberId, onSelectMember }: MemberPointsSearchPanelProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [, startTransition] = React.useTransition()

  const [draftQuery, setDraftQuery] = React.useState("")
  const [appliedQuery, setAppliedQuery] = React.useState("")
  const [members, setMembers] = React.useState<Member[]>([])
  const [loading, setLoading] = React.useState(true)
  const [searching, setSearching] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState("")
  const [pageCursors, setPageCursors] = React.useState<(number | undefined)[]>([undefined])
  const [pageIndex, setPageIndex] = React.useState(0)
  const [hasMore, setHasMore] = React.useState(false)

  const appliedQueryRef = React.useRef(appliedQuery)
  const pageCursorsRef = React.useRef(pageCursors)
  const pageIndexRef = React.useRef(pageIndex)
  appliedQueryRef.current = appliedQuery
  pageCursorsRef.current = pageCursors
  pageIndexRef.current = pageIndex

  const loadPage = React.useCallback(
    async (opts?: {
      q?: string
      afterId?: number | undefined
      pageIdx?: number
      cursors?: (number | undefined)[]
      isSearch?: boolean
    }) => {
      const q = opts?.q ?? appliedQueryRef.current
      const cursors = opts?.cursors ?? pageCursorsRef.current
      const pageIdx = opts?.pageIdx ?? pageIndexRef.current
      const afterId = opts?.afterId !== undefined ? opts.afterId : cursors[pageIdx]
      if (opts?.isSearch) setSearching(true)
      setErrorMessage("")
      setLoading(true)
      try {
        const res = await getMembersCursor({ q, afterId, limit: MEMBER_PAGE_SIZE })
        if (!res.success) {
          startTransition(() => {
            setMembers([])
            setHasMore(false)
          })
          setErrorMessage(res.message || t("memberLoadFailed"))
          return
        }
        const rows = res.rows || []
        startTransition(() => {
          setMembers(rows)
          setHasMore(rows.length >= MEMBER_PAGE_SIZE)
        })
      } catch (e) {
        console.error("getMembersCursor:", e)
        startTransition(() => {
          setMembers([])
          setHasMore(false)
        })
        setErrorMessage(t("memberLoadFailed"))
      } finally {
        setLoading(false)
        if (opts?.isSearch) setSearching(false)
      }
    },
    [t]
  )

  const runSearch = React.useCallback(
    (q: string) => {
      const trimmed = q.trim()
      setAppliedQuery(trimmed)
      setPageCursors([undefined])
      setPageIndex(0)
      void loadPage({ q: trimmed, afterId: undefined, pageIdx: 0, cursors: [undefined], isSearch: true })
    },
    [loadPage]
  )

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

  return (
    <Card className="h-full">
      <CardHeader className="space-y-3">
        <CardTitle className="text-base">{t("memberPointsSearchTitle")}</CardTitle>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            placeholder={t("memberSearchPh")}
            value={draftQuery}
            onChange={(e) => setDraftQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch(draftQuery)
            }}
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            className="shrink-0 sm:min-w-[5.5rem]"
            onClick={() => runSearch(draftQuery)}
            disabled={searching || loading}
          >
            {searching ? t("loading") : t("search")}
          </Button>
        </div>
        {errorMessage ? (
          <p className="text-xs text-destructive">{errorMessage}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("memberSearchResult")}: {tr(t, "memberListPageShowing", { count: String(members.length) })}
            {pageIndex > 0 ? ` · ${pageIndex + 1}` : ""}
          </p>
        )}
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
                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                      {t("memberPointsNoSearchResult")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <Button type="button" variant="outline" size="sm" disabled={pageIndex <= 0 || loading} onClick={goPrevPage}>
            {t("memberListPagePrev")}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!hasMore || loading} onClick={goNextPage}>
            {t("memberListPageNext")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
