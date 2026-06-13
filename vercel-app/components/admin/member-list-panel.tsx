"use client"

import * as React from "react"
import { appAlert, appConfirm } from "@/lib/app-message"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getMembersCursor,
  importLineCrmFile,
  resetLineMemberList,
  type Member,
} from "@/lib/api-client"
import { downloadCsv } from "@/lib/crm-export"
import { useLang } from "@/lib/lang-context"
import { useT, tr } from "@/lib/i18n"

const MEMBER_PAGE_SIZE = 100

const MemberCrmHint = React.memo(function MemberCrmHint({ text }: { text: string }) {
  return <p className="text-[11px] text-muted-foreground">{text}</p>
})

const MemberSearchBar = React.memo(function MemberSearchBar({
  searching,
  searchLabel,
  loadingLabel,
  searchPh,
  onSearch,
}: {
  searching: boolean
  searchLabel: string
  loadingLabel: string
  searchPh: string
  onSearch: (q: string) => void
}) {
  const [draft, setDraft] = React.useState("")

  return (
    <>
      <Input
        placeholder={searchPh}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSearch(draft)
        }}
      />
      <Button variant="outline" onClick={() => onSearch(draft)} disabled={searching}>
        {searching ? loadingLabel : searchLabel}
      </Button>
    </>
  )
})

function calcMemberAge(birthDate?: string): string {
  const b = String(birthDate || "").trim()
  if (!b) return "-"
  const d = new Date(b)
  if (Number.isNaN(d.getTime())) return "-"
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1
  return age >= 0 ? String(age) : "-"
}

const MemberListTable = React.memo(function MemberListTable({
  members,
  loading,
  loadingLabel,
  onSelect,
  joinStoreLabels,
  selectedMemberId,
  t,
}: {
  members: Member[]
  loading: boolean
  loadingLabel: string
  onSelect: (m: Member) => void
  joinStoreLabels: Record<string, string>
  selectedMemberId?: number | null
  t: ReturnType<typeof useT>
}) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">{loadingLabel}</p>
  }

  return (
    <div className="overflow-auto rounded-md border max-h-[min(70vh,720px)]">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 sticky top-0 z-10">
          <tr>
            <th className="p-2 text-left">{t("name")}</th>
            <th className="p-2 text-left">{t("memberPhone")}</th>
            <th className="p-2 text-left">{t("memberFullName")}</th>
            <th className="p-2 text-left">{t("birthDate")}</th>
            <th className="p-2 text-left">{t("memberNationality")}</th>
            <th className="p-2 text-left">{t("age")}</th>
            <th className="p-2 text-left">{t("memberNo")}</th>
            <th className="p-2 text-left">{t("memberJoinStore")}</th>
            <th className="p-2 text-left">{t("memberTier")}</th>
            <th className="p-2 text-left">{t("status")}</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr
              key={m.id}
              className={`cursor-pointer border-t hover:bg-muted/20 ${selectedMemberId === m.id ? "bg-primary/5 ring-1 ring-inset ring-primary/20" : ""}`}
              onClick={() => onSelect(m)}
            >
              <td className="p-2">{m.name || "—"}</td>
              <td className="p-2">{m.phone || "—"}</td>
              <td className="p-2">{m.fullName || "-"}</td>
              <td className="p-2">{m.birthDate || "-"}</td>
              <td className="p-2">{m.nationality || "-"}</td>
              <td className="p-2">{calcMemberAge(m.birthDate)}</td>
              <td className="p-2">{m.memberNo || "-"}</td>
              <td className="p-2">
                {m.joinStoreCode
                  ? joinStoreLabels[m.joinStoreCode] || m.joinStoreCode
                  : joinStoreLabels.__unset__ || "—"}
              </td>
              <td className="p-2">{m.tierCode || "-"}</td>
              <td className="p-2">{m.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})

export type MemberListPanelHandle = {
  reload: () => void
}

type MemberListPanelProps = {
  onSelectMember: (member: Member) => void
  selectedMemberId?: number | null
}

export const MemberListPanel = React.memo(
  React.forwardRef<MemberListPanelHandle, MemberListPanelProps>(function MemberListPanel(
    { onSelectMember, selectedMemberId },
    ref
  ) {
    const { lang } = useLang()
    const t = useT(lang)
    const [, startTransition] = React.useTransition()

    const [members, setMembers] = React.useState<Member[]>([])
    const [loading, setLoading] = React.useState(true)
    const [searching, setSearching] = React.useState(false)
    const [importing, setImporting] = React.useState(false)
    const [resettingLine, setResettingLine] = React.useState(false)
    const [errorMessage, setErrorMessage] = React.useState("")
    const [appliedQuery, setAppliedQuery] = React.useState("")
    const [pageCursors, setPageCursors] = React.useState<(number | undefined)[]>([undefined])
    const [pageIndex, setPageIndex] = React.useState(0)
    const [hasMore, setHasMore] = React.useState(false)
    const [actionMessage, setActionMessage] = React.useState("")
    const [selectedImportFileName, setSelectedImportFileName] = React.useState("")
    const [filterTier, setFilterTier] = React.useState("all")
    const [filterStatus, setFilterStatus] = React.useState("all")
    const importFileRef = React.useRef<HTMLInputElement | null>(null)
    const [joinStoreLabels, setJoinStoreLabels] = React.useState<Record<string, string>>({
      office: t("mpAdmin_signupStoreStatsOffice"),
      __unset__: t("mpAdmin_signupStoreStatsUnset"),
    })

    React.useEffect(() => {
      fetch(`/api/member-portal/signup-stores?lang=${encodeURIComponent(lang)}`)
        .then((r) => r.json())
        .then((data: { success?: boolean; stores?: Array<{ storeCode: string; displayName: string }>; officeStoreCode?: string }) => {
          if (!data.success) return
          const next: Record<string, string> = {
            __unset__: t("mpAdmin_signupStoreStatsUnset"),
          }
          const officeCode = String(data.officeStoreCode || "office")
          next[officeCode] = t("mpAdmin_signupStoreStatsOffice")
          for (const row of data.stores || []) {
            if (row.storeCode) next[row.storeCode] = row.displayName || row.storeCode
          }
          setJoinStoreLabels(next)
        })
        .catch(() => {})
    }, [lang, t])

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

    const loadPageRef = React.useRef(loadPage)
    loadPageRef.current = loadPage
    React.useEffect(() => {
      void loadPageRef.current({ q: "", afterId: undefined, pageIdx: 0, cursors: [undefined] })
    }, [])

    React.useImperativeHandle(
      ref,
      () => ({
        reload: () => {
          void loadPage({ q: appliedQueryRef.current, isSearch: true })
        },
      }),
      [loadPage]
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
      const prevAfterId = pageCursors[prevIndex]
      setPageIndex(prevIndex)
      void loadPage({ afterId: prevAfterId, pageIdx: prevIndex, cursors: pageCursors })
    }, [pageCursors, pageIndex, loadPage])

    const crmHintText = t("memberCrmColumnHint")

    const filteredMembers = React.useMemo(() => {
      return members.filter((m) => {
        if (filterTier !== "all" && String(m.tierCode || "").toUpperCase() !== filterTier.toUpperCase()) return false
        if (filterStatus !== "all" && String(m.status || "active") !== filterStatus) return false
        return true
      })
    }, [members, filterTier, filterStatus])

    const exportMembersCsv = () => {
      downloadCsv(
        "members.csv",
        [t("name"), t("memberPhone"), t("memberNo"), t("memberTier"), t("status")],
        filteredMembers.map((m) => [
          m.name || "",
          m.phone || "",
          m.memberNo || "",
          m.tierCode || "",
          m.status || "",
        ])
      )
    }

    return (
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">{t("memberListMasterTitle")}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <MemberSearchBar
              searching={searching}
              searchLabel={t("search")}
              loadingLabel={t("loading")}
              searchPh={t("memberSearchPh")}
              onSearch={runSearch}
            />
            <Select value={filterTier} onValueChange={setFilterTier}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder={t("crmMemberFilterTier")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("crmMemberFilterAll")}</SelectItem>
                {Array.from(new Set(members.map((m) => String(m.tierCode || "").toUpperCase()).filter(Boolean))).map(
                  (code) => (
                    <SelectItem key={code} value={code}>
                      {code}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[110px]">
                <SelectValue placeholder={t("crmMemberFilterStatus")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("crmMemberFilterAll")}</SelectItem>
                <SelectItem value="active">{t("crmMemberStatusActive")}</SelectItem>
                <SelectItem value="inactive">{t("crmMemberStatusInactive")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportMembersCsv} disabled={!filteredMembers.length}>
              {t("crmMemberExportCsv")}
            </Button>
            <input
              ref={importFileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                setSelectedImportFileName(file ? file.name : "")
              }}
            />
            <Button variant="outline" disabled={importing} onClick={() => importFileRef.current?.click()}>
              {t("memberFileSelect")}
            </Button>
            <Button
              variant="outline"
              disabled={importing}
              onClick={async () => {
                const file = importFileRef.current?.files?.[0]
                if (!file) {
                  await appAlert(t("memberCrmFileSelectFirst"))
                  return
                }
                setImporting(true)
                try {
                  const res = await importLineCrmFile({ file })
                  if (!res.success) {
                    await appAlert(res.message || t("memberCrmImportFail"))
                    return
                  }
                  setActionMessage(
                    `${t("memberCrmImportDone")}: ${t("memberTotal")} ${Number(res.rowCount || 0).toLocaleString()}${t("posCount")} / ${t("memberSuccess")} ${Number(
                      res.successCount || 0
                    ).toLocaleString()}${t("posCount")} / ${t("memberFail")} ${Number(res.failedCount || 0).toLocaleString()}${t("posCount")}`
                  )
                  if (importFileRef.current) importFileRef.current.value = ""
                  setSelectedImportFileName("")
                  setPageCursors([undefined])
                  setPageIndex(0)
                  await loadPage({ q: appliedQueryRef.current, afterId: undefined, pageIdx: 0, cursors: [undefined], isSearch: true })
                } finally {
                  setImporting(false)
                }
              }}
            >
              {importing ? t("memberImporting") : t("memberCrmImportBtn")}
            </Button>
            <Button
              variant="outline"
              disabled={resettingLine}
              onClick={async () => {
                const ok = await appConfirm(t("memberLineResetConfirm"))
                if (!ok) return
                setResettingLine(true)
                try {
                  const res = await resetLineMemberList()
                  if (!res.success) {
                    await appAlert(res.message || t("memberLineResetFail"))
                    return
                  }
                  setActionMessage(
                    `${t("memberLineResetDone")}: identity ${Number(res.deactivatedLineIdentities || 0).toLocaleString()} / members ${Number(res.deactivatedLineMembers || 0).toLocaleString()} / importRows ${Number(res.deletedImportRows || 0).toLocaleString()} / importJobs ${Number(res.deletedImportJobs || 0).toLocaleString()}`
                  )
                  setPageCursors([undefined])
                  setPageIndex(0)
                  await loadPage({ q: appliedQueryRef.current, afterId: undefined, pageIdx: 0, cursors: [undefined], isSearch: true })
                } finally {
                  setResettingLine(false)
                }
              }}
            >
              {resettingLine ? t("loading") : t("memberLineResetBtn")}
            </Button>
          </div>
          {errorMessage ? (
            <p className="text-xs text-destructive">{errorMessage}</p>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {t("memberSearchResult")}: {tr(t, "memberListPageShowing", { count: String(filteredMembers.length) })}
                {pageIndex > 0 ? ` · ${pageIndex + 1}` : ""}
              </p>
              {!!selectedImportFileName && (
                <p className="text-xs text-muted-foreground">
                  {t("memberSelectedFile")}: {selectedImportFileName}
                </p>
              )}
              <MemberCrmHint text={crmHintText} />
              {!!actionMessage && <p className="text-xs text-emerald-700">{actionMessage}</p>}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <MemberListTable
            members={filteredMembers}
            loading={loading}
            loadingLabel={t("loading")}
            onSelect={onSelectMember}
            joinStoreLabels={joinStoreLabels}
            selectedMemberId={selectedMemberId}
            t={t}
          />
          {!loading && (
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" disabled={pageIndex <= 0} onClick={goPrevPage}>
                {t("memberListPagePrev")}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={!hasMore} onClick={goNextPage}>
                {t("memberListPageNext")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    )
  })
)

MemberListPanel.displayName = "MemberListPanel"
