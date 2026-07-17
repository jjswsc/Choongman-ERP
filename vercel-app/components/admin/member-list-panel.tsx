"use client"

import * as React from "react"
import { appAlert, appConfirm } from "@/lib/app-message"
import { ChevronDown, Download, RotateCcw, Search, Upload, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getMemberTiers,
  getMembersCursor,
  importLineCrmFile,
  resetLineMemberList,
  type Member,
} from "@/lib/api-client"
import { downloadCsv } from "@/lib/crm-export"
import { CrmActionBar, CrmOutlineButton } from "@/components/crm/crm-shared-ui"
import {
  emptyMemberSearchFieldDraft,
  formatMemberSearchFieldsSummary,
  hasMemberSearchFields,
  listFilledMemberSearchFields,
  type MemberSearchFieldDraft,
  type MemberSearchFieldKey,
} from "@/lib/member-search-filter"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT, tr } from "@/lib/i18n"
import { isOfficeRole } from "@/lib/permissions"
import { cn } from "@/lib/utils"

const MEMBER_PAGE_SIZE = 100

const MemberCrmHint = React.memo(function MemberCrmHint({ text }: { text: string }) {
  return <p className="text-[11px] text-muted-foreground">{text}</p>
})

const SEARCH_FIELD_LABEL_KEYS: Record<MemberSearchFieldKey, string> = {
  name: "name",
  phone: "memberPhone",
  memberNo: "memberNo",
  email: "email",
  birthDate: "birthDate",
  joinFrom: "memberJoinDateFrom",
  joinTo: "memberJoinDateTo",
}

const MemberSearchPanel = React.memo(function MemberSearchPanel({
  searching,
  searchLabel,
  loadingLabel,
  resetLabel,
  andHint,
  activeFieldLabel,
  keywordPh,
  t,
  onSearch,
  onReset,
}: {
  searching: boolean
  searchLabel: string
  loadingLabel: string
  resetLabel: string
  andHint: string
  activeFieldLabel: string
  keywordPh: string
  t: ReturnType<typeof useT>
  onSearch: (params: { q: string; fields: MemberSearchFieldDraft }) => void
  onReset: () => void
}) {
  const [keyword, setKeyword] = React.useState("")
  const [draft, setDraft] = React.useState<MemberSearchFieldDraft>({ ...emptyMemberSearchFieldDraft })
  const [showAdvanced, setShowAdvanced] = React.useState(false)
  const filledKeys = listFilledMemberSearchFields(draft)
  const filledCount = filledKeys.length

  const patch = (key: MemberSearchFieldKey, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const clearField = (key: MemberSearchFieldKey) => {
    setDraft((prev) => ({ ...prev, [key]: "" }))
  }

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault()
    onSearch({ q: keyword, fields: draft })
  }

  return (
    <form
      className="rounded-xl border border-blue-200/70 bg-gradient-to-br from-blue-50/80 to-slate-50/50 p-3 sm:p-4 space-y-3"
      onSubmit={submit}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-800/80">{t("memberSearchSectionTitle")}</p>
        {filledCount > 1 ? (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800">{andHint}</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t("search")}</Label>
          <Input
            placeholder={keywordPh}
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="bg-background"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={searching} className="min-w-[96px]">
            <Search className="size-4" />
            {searching ? loadingLabel : searchLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setKeyword("")
              setDraft({ ...emptyMemberSearchFieldDraft })
              onReset()
            }}
            disabled={searching}
          >
            <RotateCcw className="size-4" />
            {resetLabel}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? t("memberSearchHideAdvanced") : t("memberSearchShowAdvanced")}
          </Button>
        </div>
      </div>

      {showAdvanced ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("name")}</Label>
            <Input
              placeholder={t("memberSearchNamePh")}
              value={draft.name}
              onChange={(e) => patch("name", e.target.value)}
              className="bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("memberPhone")}</Label>
            <Input
              placeholder={t("memberSearchPhonePh")}
              value={draft.phone}
              onChange={(e) => patch("phone", e.target.value)}
              className="bg-background"
              inputMode="tel"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("memberNo")}</Label>
            <Input
              placeholder={t("memberSearchMemberNoPh")}
              value={draft.memberNo}
              onChange={(e) => patch("memberNo", e.target.value)}
              className="bg-background"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("email")}</Label>
            <Input
              placeholder={t("memberSearchEmailPh")}
              value={draft.email}
              onChange={(e) => patch("email", e.target.value)}
              className="bg-background"
              type="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("birthDate")}</Label>
            <Input
              placeholder={t("memberSearchBirthPh")}
              value={draft.birthDate}
              onChange={(e) => patch("birthDate", e.target.value)}
              className="bg-background"
              type="date"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("memberJoinDateFrom")}</Label>
            <Input
              value={draft.joinFrom}
              onChange={(e) => patch("joinFrom", e.target.value)}
              className="bg-background"
              type="date"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t("memberJoinDateTo")}</Label>
            <Input
              value={draft.joinTo}
              onChange={(e) => patch("joinTo", e.target.value)}
              className="bg-background"
              type="date"
            />
          </div>
        </div>
      ) : null}

      {filledCount > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{activeFieldLabel}:</span>
          {filledKeys.map((key) => (
            <span
              key={key}
              className="inline-flex max-w-[220px] items-center gap-1 rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-xs text-primary"
            >
              <span className="truncate">
                {t(SEARCH_FIELD_LABEL_KEYS[key])}: {draft[key]}
              </span>
              <button
                type="button"
                className="shrink-0 rounded p-0.5 hover:bg-primary/10"
                aria-label={resetLabel}
                onClick={() => clearField(key)}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </form>
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

/** 가입일시 표시 — DB 방콕 시각 문자열을 그대로 보여 줌 */
function formatMemberJoinedAt(value?: string): string {
  const s = String(value || "").trim()
  if (!s) return "—"
  return s.slice(0, 19).replace("T", " ")
}

const MemberListTable = React.memo(function MemberListTable({
  members,
  loading,
  loadingLabel,
  onSelect,
  joinStoreLabels,
  selectedMemberId,
  onResetSearch,
  t,
}: {
  members: Member[]
  loading: boolean
  loadingLabel: string
  onSelect: (m: Member) => void
  joinStoreLabels: Record<string, string>
  selectedMemberId?: number | null
  onResetSearch?: () => void
  t: ReturnType<typeof useT>
}) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">{loadingLabel}</p>
  }

  if (!members.length) {
    return (
      <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-10 text-center space-y-3">
        <p className="text-sm text-muted-foreground">{t("memberEmptyListHint")}</p>
        {onResetSearch ? (
          <Button type="button" size="sm" variant="outline" onClick={onResetSearch}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            {t("memberSearchReset")}
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="overflow-auto rounded-md border max-h-[min(70vh,720px)]">
      <table className="w-full min-w-[920px] text-sm">
        <thead className="bg-muted/40 sticky top-0 z-10">
          <tr>
            <th className="whitespace-nowrap p-2 text-left">{t("name")}</th>
            <th className="whitespace-nowrap p-2 text-left">{t("memberPhone")}</th>
            <th className="whitespace-nowrap p-2 text-left">{t("memberNo")}</th>
            <th className="whitespace-nowrap p-2 text-left">{t("memberJoinStore")}</th>
            <th className="whitespace-nowrap p-2 text-left">{t("memberJoinAt")}</th>
            <th className="whitespace-nowrap p-2 text-left">{t("memberTier")}</th>
            <th className="whitespace-nowrap p-2 text-right">{t("memberPointsBalance")}</th>
            <th className="whitespace-nowrap p-2 text-left">{t("status")}</th>
            <th className="hidden whitespace-nowrap p-2 text-left lg:table-cell">{t("birthDate")}</th>
            <th className="hidden whitespace-nowrap p-2 text-left xl:table-cell">{t("age")}</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const selected = selectedMemberId === m.id
            const active = String(m.status || "active") !== "inactive"
            return (
              <tr
                key={m.id}
                className={cn(
                  "cursor-pointer border-t transition-colors hover:bg-muted/30",
                  selected && "bg-primary/10 ring-1 ring-inset ring-primary/30"
                )}
                onClick={() => onSelect(m)}
              >
                <td className="whitespace-nowrap p-2 font-medium">{m.name || "—"}</td>
                <td className="whitespace-nowrap p-2">{m.phone || "—"}</td>
                <td className="whitespace-nowrap p-2 text-xs tabular-nums">{m.memberNo || "—"}</td>
                <td className="whitespace-nowrap p-2 text-xs">
                  {m.joinStoreCode
                    ? joinStoreLabels[m.joinStoreCode] || m.joinStoreCode
                    : joinStoreLabels.__unset__ || "—"}
                </td>
                <td className="whitespace-nowrap p-2 text-xs tabular-nums">
                  {formatMemberJoinedAt(m.createdAt)}
                </td>
                <td className="whitespace-nowrap p-2">
                  <Badge variant="outline">{m.tierCode || "—"}</Badge>
                </td>
                <td className="whitespace-nowrap p-2 text-right tabular-nums font-medium">
                  {Number(m.pointBalance || 0).toLocaleString()}
                </td>
                <td className="whitespace-nowrap p-2">
                  <Badge variant={active ? "default" : "secondary"}>
                    {active ? t("crmMemberStatusActive") : t("crmMemberStatusInactive")}
                  </Badge>
                </td>
                <td className="hidden whitespace-nowrap p-2 text-xs lg:table-cell">{m.birthDate || "—"}</td>
                <td className="hidden whitespace-nowrap p-2 text-xs xl:table-cell">{calcMemberAge(m.birthDate)}</td>
              </tr>
            )
          })}
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
    const { auth } = useAuth()
    const canUseCrmDangerTools = isOfficeRole(auth?.role || "")
    const [, startTransition] = React.useTransition()

    const [members, setMembers] = React.useState<Member[]>([])
    const [loading, setLoading] = React.useState(true)
    const [searching, setSearching] = React.useState(false)
    const [importing, setImporting] = React.useState(false)
    const [resettingLine, setResettingLine] = React.useState(false)
    const [errorMessage, setErrorMessage] = React.useState("")
    const [appliedFields, setAppliedFields] = React.useState<MemberSearchFieldDraft>({
      ...emptyMemberSearchFieldDraft,
    })
    const [appliedQ, setAppliedQ] = React.useState("")
    const [pageCursors, setPageCursors] = React.useState<(number | undefined)[]>([undefined])
    const [pageIndex, setPageIndex] = React.useState(0)
    const [hasMore, setHasMore] = React.useState(false)
    const [actionMessage, setActionMessage] = React.useState("")
    const [selectedImportFileName, setSelectedImportFileName] = React.useState("")
    const [filterTier, setFilterTier] = React.useState("all")
    const [filterStatus, setFilterStatus] = React.useState("active")
    const [tierOptions, setTierOptions] = React.useState<string[]>([])
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

    React.useEffect(() => {
      void getMemberTiers()
        .then((rows) => {
          const list = Array.isArray(rows) ? rows : []
          const codes = list
            .map((row) => String(row.code || "").toUpperCase())
            .filter(Boolean)
          setTierOptions(codes.length ? codes : ["BRONZE", "SILVER", "GOLD"])
        })
        .catch(() => {
          setTierOptions(["BRONZE", "SILVER", "GOLD"])
        })
    }, [])

    const appliedFieldsRef = React.useRef(appliedFields)
    const appliedQRef = React.useRef(appliedQ)
    const pageCursorsRef = React.useRef(pageCursors)
    const pageIndexRef = React.useRef(pageIndex)
    const filterStatusRef = React.useRef(filterStatus)
    const filterTierRef = React.useRef(filterTier)
    appliedFieldsRef.current = appliedFields
    appliedQRef.current = appliedQ
    pageCursorsRef.current = pageCursors
    pageIndexRef.current = pageIndex
    filterStatusRef.current = filterStatus
    filterTierRef.current = filterTier

    const loadPage = React.useCallback(
      async (opts?: {
        q?: string
        fields?: MemberSearchFieldDraft
        afterId?: number | undefined
        pageIdx?: number
        cursors?: (number | undefined)[]
        isSearch?: boolean
      }) => {
        const fields = opts?.fields ?? appliedFieldsRef.current
        const q = opts?.q !== undefined ? opts.q : appliedQRef.current
        const cursors = opts?.cursors ?? pageCursorsRef.current
        const pageIdx = opts?.pageIdx ?? pageIndexRef.current
        const afterId = opts?.afterId !== undefined ? opts.afterId : cursors[pageIdx]
        if (opts?.isSearch) setSearching(true)
        setErrorMessage("")
        setLoading(true)
        try {
          const tier = filterTierRef.current || "all"
          const res = await getMembersCursor({
            q,
            name: fields.name,
            phone: fields.phone,
            memberNo: fields.memberNo,
            email: fields.email,
            birthDate: fields.birthDate,
            joinFrom: fields.joinFrom,
            joinTo: fields.joinTo,
            afterId,
            limit: MEMBER_PAGE_SIZE,
            status: filterStatusRef.current || "active",
            tierCode: tier !== "all" ? tier : undefined,
          })
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
      void loadPageRef.current()
    }, [])

    const listFilterBootRef = React.useRef(true)
    React.useEffect(() => {
      if (listFilterBootRef.current) {
        listFilterBootRef.current = false
        return
      }
      setPageCursors([undefined])
      setPageIndex(0)
      void loadPageRef.current({
        afterId: undefined,
        pageIdx: 0,
        cursors: [undefined],
        isSearch: true,
      })
    }, [filterStatus, filterTier])

    React.useImperativeHandle(
      ref,
      () => ({
        reload: () => {
          void loadPage({
            q: appliedQRef.current,
            fields: appliedFieldsRef.current,
            isSearch: true,
          })
        },
      }),
      [loadPage]
    )

    const runSearch = React.useCallback(
      async (params: { q: string; fields: MemberSearchFieldDraft }) => {
        const nextFields = {
          name: params.fields.name.trim(),
          phone: params.fields.phone.trim(),
          memberNo: params.fields.memberNo.trim(),
          email: params.fields.email.trim(),
          birthDate: params.fields.birthDate.trim(),
          joinFrom: params.fields.joinFrom.trim(),
          joinTo: params.fields.joinTo.trim(),
        }
        const nextQ = params.q.trim()
        if (!nextQ && !hasMemberSearchFields(nextFields)) {
          await appAlert(t("memberSearchNeedsCriteria"))
          return
        }
        setAppliedQ(nextQ)
        setAppliedFields(nextFields)
        setPageCursors([undefined])
        setPageIndex(0)
        void loadPage({
          q: nextQ,
          fields: nextFields,
          afterId: undefined,
          pageIdx: 0,
          cursors: [undefined],
          isSearch: true,
        })
      },
      [loadPage, t]
    )

    const resetSearch = React.useCallback(() => {
      const empty = { ...emptyMemberSearchFieldDraft }
      setAppliedQ("")
      setAppliedFields(empty)
      setPageCursors([undefined])
      setPageIndex(0)
      void loadPage({
        q: "",
        fields: empty,
        afterId: undefined,
        pageIdx: 0,
        cursors: [undefined],
        isSearch: true,
      })
    }, [loadPage])

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

    /** 등급·상태는 서버에서 이미 필터됨 */
    const filteredMembers = members

    const exportMembersCsv = () => {
      downloadCsv(
        "members.csv",
        [
          t("name"),
          t("memberPhone"),
          t("memberNo"),
          t("memberJoinAt"),
          t("memberTier"),
          t("memberPointsBalance"),
          t("memberPointsTierCumulative"),
          t("status"),
        ],
        filteredMembers.map((m) => [
          m.name || "",
          m.phone || "",
          m.memberNo || "",
          formatMemberJoinedAt(m.createdAt),
          m.tierCode || "",
          String(Number(m.pointBalance || 0)),
          String(Number(m.tierPoints || 0)),
          m.status || "",
        ])
      )
    }

    const [dangerOpen, setDangerOpen] = React.useState(false)
    const hasImportFile = Boolean(selectedImportFileName)

    return (
      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">{t("memberListMasterTitle")}</CardTitle>

          <MemberSearchPanel
            searching={searching}
            searchLabel={t("search")}
            loadingLabel={t("loading")}
            resetLabel={t("memberSearchReset")}
            andHint={t("memberSearchPriorityHint")}
            activeFieldLabel={t("memberSearchActiveField")}
            keywordPh={t("memberSearchPh")}
            t={t}
            onSearch={runSearch}
            onReset={resetSearch}
          />

          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">{t("crmMemberFilterTier")}</span>
            <Select value={filterTier} onValueChange={setFilterTier}>
              <SelectTrigger className="h-8 w-[120px] bg-background">
                <SelectValue placeholder={t("crmMemberFilterTier")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("crmMemberFilterAll")}</SelectItem>
                {tierOptions.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-xs font-medium text-muted-foreground">{t("crmMemberFilterStatus")}</span>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 w-[110px] bg-background">
                <SelectValue placeholder={t("crmMemberFilterStatus")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("crmMemberFilterAll")}</SelectItem>
                <SelectItem value="active">{t("crmMemberStatusActive")}</SelectItem>
                <SelectItem value="inactive">{t("crmMemberStatusInactive")}</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-[11px] text-muted-foreground">{t("memberTierFilterHint")}</span>
          </div>

          <div className="space-y-2 rounded-xl border bg-card p-3">
            <p className="text-xs font-semibold text-muted-foreground">{t("memberDataToolsTitle")}</p>
            <CrmActionBar>
              <CrmOutlineButton onClick={exportMembersCsv} disabled={!filteredMembers.length}>
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {t("crmMemberExportCsv")}
              </CrmOutlineButton>
              {canUseCrmDangerTools ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 border-destructive/30 text-[11px] text-destructive/90 hover:bg-destructive/5 hover:text-destructive"
                    onClick={() => setDangerOpen((v) => !v)}
                    aria-expanded={dangerOpen}
                  >
                    {t("memberDangerTools")}
                    <ChevronDown
                      className={cn("ml-1.5 h-3.5 w-3.5 transition-transform", dangerOpen && "rotate-180")}
                    />
                  </Button>
                  {dangerOpen ? (
                    <>
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
                      <CrmOutlineButton disabled={importing} onClick={() => importFileRef.current?.click()}>
                        <Upload className="mr-1.5 h-3.5 w-3.5" />
                        {t("memberFileSelect")}
                      </CrmOutlineButton>
                      {hasImportFile ? (
                        <span className="max-w-[200px] truncate rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                          {selectedImportFileName}
                        </span>
                      ) : null}
                      <Button
                        size="sm"
                        variant={hasImportFile ? "default" : "outline"}
                        disabled={importing || !hasImportFile}
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
                            await loadPage({
                              fields: appliedFieldsRef.current,
                              afterId: undefined,
                              pageIdx: 0,
                              cursors: [undefined],
                              isSearch: true,
                            })
                          } finally {
                            setImporting(false)
                          }
                        }}
                      >
                        {importing ? t("memberImporting") : t("memberCrmImportBtn")}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={resettingLine}
                        title={t("memberLineResetSectionHint")}
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
                            await loadPage({
                              fields: appliedFieldsRef.current,
                              afterId: undefined,
                              pageIdx: 0,
                              cursors: [undefined],
                              isSearch: true,
                            })
                          } finally {
                            setResettingLine(false)
                          }
                        }}
                      >
                        {resettingLine ? t("loading") : t("memberLineResetBtn")}
                      </Button>
                    </>
                  ) : null}
                </>
              ) : null}
            </CrmActionBar>
            {canUseCrmDangerTools && dangerOpen ? <MemberCrmHint text={crmHintText} /> : null}
          </div>

          {errorMessage ? (
            <p className="text-xs text-destructive">{errorMessage}</p>
          ) : (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                {t("memberSearchResult")}: {tr(t, "memberListPageShowing", { count: String(filteredMembers.length) })}
                {appliedQ ? ` · ${t("search")}: ${appliedQ}` : ""}
                {hasMemberSearchFields(appliedFields)
                  ? ` · ${formatMemberSearchFieldsSummary(appliedFields, {
                      name: t("name"),
                      phone: t("memberPhone"),
                      memberNo: t("memberNo"),
                      email: t("email"),
                      birthDate: t("birthDate"),
                      joinFrom: t("memberJoinDateFrom"),
                      joinTo: t("memberJoinDateTo"),
                    })}`
                  : ""}
                {pageIndex > 0 ? ` · ${pageIndex + 1}` : ""}
              </p>
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
            onResetSearch={resetSearch}
            t={t}
          />
          {!loading && (
            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" disabled={pageIndex <= 0} onClick={goPrevPage}>
                {t("memberListPagePrev")}
              </Button>
              <span className={cn("text-xs tabular-nums text-muted-foreground", pageIndex <= 0 && !hasMore && "hidden")}>
                {pageIndex + 1}
              </span>
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
