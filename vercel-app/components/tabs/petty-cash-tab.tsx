"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert, appConfirm } from "@/lib/app-message"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { parsePurchaseDrillNav } from "@/lib/income-statement-purchase-drill-nav"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  adminTabsBarCn,
  adminTabsContentFlushCn,
  adminTabsListRowCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Search, Plus, Camera, Download, Pencil, Save, Trash2, X } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { cn } from "@/lib/utils"
import { getBangkokRecentYearMonths, getBangkokMonthRange } from "@/lib/bangkok-time"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import {
  getPettyCashOptions,
  getPettyCashList,
  getPettyCashMonthDetail,
  getPettyCashSummary,
  addPettyCashTransaction,
  updatePettyCashTransaction,
  deletePettyCashTransaction,
  updatePettyCashTransactionInvoice,
  getAccountSubjects,
  getAdminEmployeeList,
  type PettyCashItem,
  type PettyCashSummaryResult,
  type AccountSubjectItem,
} from "@/lib/api-client"
import { compressImageForUpload } from "@/lib/utils"
import {
  accountingResultTableCn,
  accountingResultTbodyRowCn,
  accountingResultTheadRowCn,
} from "@/lib/accounting-result-ui"
import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"
import { ListPaginationBar } from "@/components/list-pagination-bar"
import { findStaffForScheduleSlotName, type StaffRowForScheduleMatch } from "@/lib/employee-display-name"
import {
  applyPettyCashClientFilters,
  aggregatePettyCashByAccount,
  aggregatePettyCashByDay,
  computePettyCashPeriodSummary,
  resolvePettyPeriodPresetRange,
  type PettyAdminViewMode,
  type PettyCashPeriodSummary,
  type PettyInvoiceFilter,
  type PettyPeriodPreset,
} from "@/lib/petty-cash-search"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

const typeKeys: Record<string, string> = {
  receive: "pettyTypeReceive",
  expense: "pettyTypeExpense",
  replenish: "pettyTypeReplenish",
  settle: "pettyTypeSettle",
}

export function PettyCashTab({
  showAccountSubjectEmptyFilter = false,
  adminEnhancedSearch = false,
}: {
  showAccountSubjectEmptyFilter?: boolean
  adminEnhancedSearch?: boolean
} = {}) {
  const searchParams = useSearchParams()
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const asDisplayName = (a: AccountSubjectItem) => (lang === "ko" ? a.name : (a.nameEn || a.name))

  const [stores, setStores] = useState<string[]>([])
  const [officeDepartments, setOfficeDepartments] = useState<string[]>([])
  const [listScope, setListScope] = useState<"store" | "office">("store")
  const [listStore, setListStore] = useState("All")
  const [listDepartment, setListDepartment] = useState("All")
  const [filterAccountSubjectEmpty, setFilterAccountSubjectEmpty] = useState(false)
  const [filterAccountSubjectId, setFilterAccountSubjectId] = useState("")
  const [filterPettyTransType, setFilterPettyTransType] = useState("")
  const [filterMemoKeyword, setFilterMemoKeyword] = useState("")
  const [filterInvoiceStatus, setFilterInvoiceStatus] = useState<PettyInvoiceFilter>("")
  const [filterPp30VatOnly, setFilterPp30VatOnly] = useState(false)
  const [listPeriodPreset, setListPeriodPreset] = useState<PettyPeriodPreset>("custom")
  const [monthlyPeriodPreset, setMonthlyPeriodPreset] = useState<PettyPeriodPreset>("custom")
  const [adminViewMode, setAdminViewMode] = useState<PettyAdminViewMode>("detail")
  const [listSummaryRpc, setListSummaryRpc] = useState<PettyCashSummaryResult | null>(null)
  const [monthlySummaryRpc, setMonthlySummaryRpc] = useState<PettyCashSummaryResult | null>(null)
  const [adminListFullRows, setAdminListFullRows] = useState<PettyCashItem[]>([])
  const [plDrillFetchPending, setPlDrillFetchPending] = useState(false)
  const [listStart, setListStart] = useState(todayStr)
  const [listEnd, setListEnd] = useState(todayStr)
  const [listData, setListData] = useState<PettyCashItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const listPageSize = 25
  const [listPage, setListPage] = useState(1)
  const [listTotal, setListTotal] = useState(0)

  const [monthlyScope, setMonthlyScope] = useState<"store" | "office">("store")
  const [monthlyStore, setMonthlyStore] = useState("All")
  const [monthlyDepartment, setMonthlyDepartment] = useState("All")
  const [monthlyYm, setMonthlyYm] = useState(() => getBangkokRecentYearMonths(1)[0])
  const [monthlyData, setMonthlyData] = useState<PettyCashItem[]>([])
  const [monthlyLoading, setMonthlyLoading] = useState(false)

  const [addTargetType, setAddTargetType] = useState<"store" | "office">("store")
  const [addStore, setAddStore] = useState("")
  const [addDepartment, setAddDepartment] = useState("")
  const [addDate, setAddDate] = useState(todayStr)
  const [addType, setAddType] = useState("expense")
  const [addAmount, setAddAmount] = useState("")
  const [addMemo, setAddMemo] = useState("")
  const [addAccountSubjectId, setAddAccountSubjectId] = useState("")
  const [addReceiptFile, setAddReceiptFile] = useState<File | null>(null)
  const [addReceiptPreview, setAddReceiptPreview] = useState<string | null>(null)
  const [addInvoiceReceived, setAddInvoiceReceived] = useState(false)
  const [addInvoiceNo, setAddInvoiceNo] = useState("")
  const [addVatAmount, setAddVatAmount] = useState("")
  const [addInvoicePhotoFile, setAddInvoicePhotoFile] = useState<File | null>(null)
  const [addSaving, setAddSaving] = useState(false)
  const [updatingInvoiceId, setUpdatingInvoiceId] = useState<number | null>(null)
  const [receiptModalUrl, setReceiptModalUrl] = useState<string | null>(null)
  const [accountSubjectOptions, setAccountSubjectOptions] = useState<AccountSubjectItem[]>([])
  const [inlineSavingId, setInlineSavingId] = useState<number | null>(null)
  const [pendingAccountSubjectByRowId, setPendingAccountSubjectByRowId] = useState<Record<number, string>>({})
  const [monthlySearchMode, setMonthlySearchMode] = useState<"month" | "period">("month")
  const [monthlyPeriodStart, setMonthlyPeriodStart] = useState(() => {
    const n = new Date()
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-01"
  })
  const [monthlyPeriodEnd, setMonthlyPeriodEnd] = useState(todayStr)
  const receiptFileInputRef = useRef<HTMLInputElement>(null)
  const receiptCameraInputRef = useRef<HTMLInputElement>(null)

  const [editModalItem, setEditModalItem] = useState<PettyCashItem | null>(null)
  const [editDate, setEditDate] = useState(todayStr)
  const [editType, setEditType] = useState("expense")
  const [editAmount, setEditAmount] = useState("")
  const [editMemo, setEditMemo] = useState("")
  const [editAccountSubjectId, setEditAccountSubjectId] = useState("")
  const [editReceiptFile, setEditReceiptFile] = useState<File | null>(null)
  const [editReceiptPreview, setEditReceiptPreview] = useState<string | null>(null)
  const [editInvoiceReceived, setEditInvoiceReceived] = useState(false)
  const [editInvoiceNo, setEditInvoiceNo] = useState("")
  const [editVatAmount, setEditVatAmount] = useState("")
  const [editInvoicePhotoFile, setEditInvoicePhotoFile] = useState<File | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [deletingMonthlyId, setDeletingMonthlyId] = useState<number | null>(null)
  const editReceiptFileInputRef = useRef<HTMLInputElement>(null)
  const editReceiptCameraInputRef = useRef<HTMLInputElement>(null)

  const canSearchAll = isOfficeRole(auth?.role || "")
  /** petty_cash.user_name 은 로그인 시점 문자열이라 직원 마스터 name 과 1:1이 아닐 수 있음 — 스케줄과 동일한 매칭 사용 */
  const [staffForNickMatch, setStaffForNickMatch] = useState<StaffRowForScheduleMatch[]>([])

  useEffect(() => {
    const nav = parsePurchaseDrillNav(searchParams)
    if (!nav.fromPlDrill) return
    if (nav.startStr && /^\d{4}-\d{2}-\d{2}$/.test(nav.startStr)) setListStart(nav.startStr)
    if (nav.endStr && /^\d{4}-\d{2}-\d{2}$/.test(nav.endStr)) setListEnd(nav.endStr)
    if (nav.store && canSearchAll) setListStore(nav.store)
    if (nav.filterAccountSubjectId) setFilterAccountSubjectId(nav.filterAccountSubjectId)
    if (nav.filterAccountSubjectUnclassified) setFilterAccountSubjectEmpty(true)
    if (nav.filterPettyTransType) setFilterPettyTransType(nav.filterPettyTransType)
    setPlDrillFetchPending(true)
  }, [searchParams, canSearchAll])

  useEffect(() => {
    if (!auth?.store) return
    getAdminEmployeeList({ userStore: auth.store, userRole: auth.role || "" })
      .then(({ list }) => {
        const rows: StaffRowForScheduleMatch[] = []
        for (const e of list || []) {
          const name = String(e.name || "").trim()
          const nick = String(e.nick || "").trim()
          if (name) rows.push({ name, nick })
        }
        setStaffForNickMatch(rows)
      })
      .catch(() => setStaffForNickMatch([]))
  }, [auth?.store, auth?.role])

  const displayUser = (userName: string) => {
    const u = String(userName || "").trim()
    if (!u) return "-"
    const hit = findStaffForScheduleSlotName(staffForNickMatch, u)
    if (hit) {
      const nick = String(hit.nick || "").trim()
      if (nick) return nick
    }
    return u
  }

  useEffect(() => {
    if (!showAccountSubjectEmptyFilter) setFilterAccountSubjectEmpty(false)
  }, [showAccountSubjectEmptyFilter])

  useEffect(() => {
    if (!auth?.store) return
    getPettyCashOptions().then((opts) => {
      if (canSearchAll) {
        setStores(opts.stores?.length ? ["All", ...opts.stores] : ["All"])
        setOfficeDepartments(opts.officeDepartments?.length ? ["All", ...opts.officeDepartments] : ["All"])
        setListStore("All")
        setListDepartment("All")
        setMonthlyStore("All")
        setMonthlyDepartment("All")
        setAddStore(opts.stores?.[0] || auth.store || "")
        setAddDepartment(opts.officeDepartments?.[0] || "")
      } else {
        const st = opts.stores?.includes(auth.store!) ? [auth.store!] : (opts.stores?.length ? opts.stores : [auth.store!])
        setStores(st)
        setListStore(auth.store!)
        setMonthlyStore(auth.store!)
        setAddStore(auth.store!)
      }
    }).catch(() => {
      if (auth?.store) {
        setStores([auth.store])
        setListStore(auth.store)
        setMonthlyStore(auth.store)
        setAddStore(auth.store)
      }
    })
  }, [auth?.store, auth?.role, canSearchAll])

  useEffect(() => {
    Promise.all([
      getAccountSubjects({ forExpense: true, excludeHeaders: true }),
      getAccountSubjects({ forCost: true, excludeHeaders: true }),
    ]).then(([expense, cost]) => {
      setAccountSubjectOptions([...(cost || []), ...(expense || [])])
    }).catch(() => setAccountSubjectOptions([]))
  }, [])

  /** 저장된 원문 그대로 표시(관리자·모바일 동일, 브라우저 검색·대사 가능) */
  const formatMemo = (memo: string) => String(memo || "").trim() || "-"

  const clientFilterOpts = useMemo(
    () => ({
      filterAccountSubjectEmpty: showAccountSubjectEmptyFilter ? filterAccountSubjectEmpty : false,
      filterAccountSubjectId,
      filterPettyTransType,
      filterMemoKeyword: adminEnhancedSearch ? filterMemoKeyword : "",
      filterInvoiceStatus: adminEnhancedSearch ? filterInvoiceStatus : ("" as PettyInvoiceFilter),
      filterPp30VatOnly: adminEnhancedSearch ? filterPp30VatOnly : false,
    }),
    [
      showAccountSubjectEmptyFilter,
      filterAccountSubjectEmpty,
      filterAccountSubjectId,
      filterPettyTransType,
      filterMemoKeyword,
      filterInvoiceStatus,
      filterPp30VatOnly,
      adminEnhancedSearch,
    ]
  )

  const accountLabelForId = useMemo(() => {
    return (id: number | null) => {
      if (id == null) return t("optional") ? `— ${t("optional")}` : "—"
      const a = accountSubjectOptions.find((x) => x.id === id)
      return a ? `${a.code} ${asDisplayName(a)}` : `#${id}`
    }
  }, [accountSubjectOptions, lang, t, asDisplayName])

  const filteredListAll = useMemo(
    () => applyPettyCashClientFilters(adminEnhancedSearch ? adminListFullRows : listData, clientFilterOpts),
    [adminEnhancedSearch, adminListFullRows, listData, clientFilterOpts]
  )
  const filteredListData = useMemo(() => {
    if (!adminEnhancedSearch) return filteredListAll
    const start = (listPage - 1) * listPageSize
    return filteredListAll.slice(start, start + listPageSize)
  }, [adminEnhancedSearch, filteredListAll, listPage, listPageSize])
  const listTotalForBar = adminEnhancedSearch ? filteredListAll.length : listTotal

  const filteredMonthlyData = useMemo(
    () => applyPettyCashClientFilters(monthlyData, clientFilterOpts),
    [monthlyData, clientFilterOpts]
  )

  const listPeriodSummary = useMemo(() => {
    if (!adminEnhancedSearch) return null
    if (listSummaryRpc) {
      return {
        expenseTotal: listSummaryRpc.expenseTotal,
        inflowTotal: listSummaryRpc.inflowTotal,
        netChange: listSummaryRpc.netChange,
        vatTotal: listSummaryRpc.vatTotal,
        vatPendingTotal: listSummaryRpc.vatPendingTotal,
        vatPendingCount: listSummaryRpc.vatPendingCount,
        rowCount: listSummaryRpc.rowCount,
      } satisfies PettyCashPeriodSummary
    }
    if (adminListFullRows.length === 0) return null
    return computePettyCashPeriodSummary(filteredListAll)
  }, [adminEnhancedSearch, listSummaryRpc, adminListFullRows.length, filteredListAll])

  const monthlyPeriodSummary = useMemo(() => {
    if (!adminEnhancedSearch) return null
    if (monthlySummaryRpc) {
      return {
        expenseTotal: monthlySummaryRpc.expenseTotal,
        inflowTotal: monthlySummaryRpc.inflowTotal,
        netChange: monthlySummaryRpc.netChange,
        vatTotal: monthlySummaryRpc.vatTotal,
        vatPendingTotal: monthlySummaryRpc.vatPendingTotal,
        vatPendingCount: monthlySummaryRpc.vatPendingCount,
        rowCount: monthlySummaryRpc.rowCount,
      } satisfies PettyCashPeriodSummary
    }
    if (monthlyData.length === 0) return null
    return computePettyCashPeriodSummary(filteredMonthlyData)
  }, [adminEnhancedSearch, monthlySummaryRpc, monthlyData.length, filteredMonthlyData])

  const listDayAggregates = useMemo(
    () => (adminEnhancedSearch ? aggregatePettyCashByDay(filteredListAll) : []),
    [adminEnhancedSearch, filteredListAll]
  )
  const listAccountAggregates = useMemo(
    () =>
      adminEnhancedSearch ? aggregatePettyCashByAccount(filteredListAll, accountLabelForId) : [],
    [adminEnhancedSearch, filteredListAll, accountLabelForId]
  )
  const monthlyDayAggregates = useMemo(
    () => (adminEnhancedSearch ? aggregatePettyCashByDay(filteredMonthlyData) : []),
    [adminEnhancedSearch, filteredMonthlyData]
  )
  const monthlyAccountAggregates = useMemo(
    () =>
      adminEnhancedSearch
        ? aggregatePettyCashByAccount(filteredMonthlyData, accountLabelForId)
        : [],
    [adminEnhancedSearch, filteredMonthlyData, accountLabelForId]
  )

  useEffect(() => {
    if (adminEnhancedSearch) setListPage(1)
  }, [
    adminEnhancedSearch,
    filterMemoKeyword,
    filterInvoiceStatus,
    filterPettyTransType,
    filterAccountSubjectId,
    filterAccountSubjectEmpty,
    filterPp30VatOnly,
  ])
  const formatStoreLabel = (store: string) =>
    store.startsWith("Office-") ? `${t("pettyScopeOffice") || "Office"} (${store.slice(7)})` : store

  const listScopeParams = useMemo(
    () => ({
      scopeFilter: canSearchAll ? listScope : undefined,
      storeFilter: listScope === "store" && listStore !== "All" ? listStore : undefined,
      departmentFilter: listScope === "office" && listDepartment !== "All" ? listDepartment : undefined,
    }),
    [canSearchAll, listScope, listStore, listDepartment]
  )

  const monthlyScopeParams = useMemo(
    () => ({
      scopeFilter: canSearchAll ? monthlyScope : undefined,
      storeFilter: monthlyScope === "store" && monthlyStore !== "All" ? monthlyStore : undefined,
      departmentFilter: monthlyScope === "office" && monthlyDepartment !== "All" ? monthlyDepartment : undefined,
    }),
    [canSearchAll, monthlyScope, monthlyStore, monthlyDepartment]
  )

  const summaryFilterParams = useMemo(
    () => ({
      filterTransType: filterPettyTransType,
      filterAccountSubjectId,
      filterAccountSubjectEmpty: showAccountSubjectEmptyFilter ? filterAccountSubjectEmpty : false,
      filterMemoKeyword,
      filterInvoiceStatus,
      filterPp30VatOnly,
    }),
    [
      filterPettyTransType,
      filterAccountSubjectId,
      showAccountSubjectEmptyFilter,
      filterAccountSubjectEmpty,
      filterMemoKeyword,
      filterInvoiceStatus,
      filterPp30VatOnly,
    ]
  )

  const getMonthlyQueryRange = useCallback(() => {
    if (monthlySearchMode === "period") {
      return { startStr: monthlyPeriodStart, endStr: monthlyPeriodEnd }
    }
    return getBangkokMonthRange(monthlyYm)
  }, [monthlySearchMode, monthlyPeriodStart, monthlyPeriodEnd, monthlyYm])

  const fetchPettySummaryRpc = useCallback(
    async (
      startStr: string,
      endStr: string,
      scope: { scopeFilter?: string; storeFilter?: string; departmentFilter?: string }
    ) => {
      if (!adminEnhancedSearch || !/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
        return null
      }
      try {
        return await getPettyCashSummary({
          startStr,
          endStr,
          ...scope,
          ...summaryFilterParams,
        })
      } catch {
        return null
      }
    },
    [adminEnhancedSearch, summaryFilterParams]
  )

  useEffect(() => {
    if (!adminEnhancedSearch || !auth?.store) return
    if (adminListFullRows.length > 0) {
      void fetchPettySummaryRpc(listStart, listEnd, listScopeParams).then(setListSummaryRpc)
    }
    if (monthlyData.length > 0) {
      const r = getMonthlyQueryRange()
      void fetchPettySummaryRpc(r.startStr, r.endStr, monthlyScopeParams).then(setMonthlySummaryRpc)
    }
  }, [
    adminEnhancedSearch,
    auth?.store,
    fetchPettySummaryRpc,
    listStart,
    listEnd,
    listScopeParams,
    monthlyScopeParams,
    getMonthlyQueryRange,
    adminListFullRows.length,
    monthlyData.length,
    summaryFilterParams,
  ])

  const loadList = (page?: number, range?: { startStr: string; endStr: string }) => {
    if (!auth?.store) return
    const p = page ?? listPage
    const startStr = range?.startStr ?? listStart
    const endStr = range?.endStr ?? listEnd
    setListLoading(true)
    if (adminEnhancedSearch) {
      getPettyCashMonthDetail({
        yearMonth: startStr.slice(0, 7),
        startStr,
        endStr,
        scopeFilter: canSearchAll ? listScope : undefined,
        storeFilter: listScope === "store" && listStore !== "All" ? listStore : undefined,
        departmentFilter: listScope === "office" && listDepartment !== "All" ? listDepartment : undefined,
        userStore: auth.store,
        userRole: auth.role,
      })
        .then((data) => {
          setAdminListFullRows(data)
          setListData([])
          setListTotal(data.length)
          setListPage(p)
          void fetchPettySummaryRpc(startStr, endStr, listScopeParams).then(setListSummaryRpc)
        })
        .catch(() => {
          setAdminListFullRows([])
          setListData([])
          setListTotal(0)
          setListSummaryRpc(null)
        })
        .finally(() => setListLoading(false))
      return
    }
    getPettyCashList({
      startStr,
      endStr,
      scopeFilter: canSearchAll ? listScope : undefined,
      storeFilter: listScope === "store" && listStore !== "All" ? listStore : undefined,
      departmentFilter: listScope === "office" && listDepartment !== "All" ? listDepartment : undefined,
      userStore: auth.store,
      userRole: auth.role,
      page: p,
      pageSize: listPageSize,
    })
      .then((res) => {
        setListData(res.items)
        setListTotal(res.total)
        setListPage(res.page)
      })
      .catch(() => {
        setListData([])
        setListTotal(0)
      })
      .finally(() => setListLoading(false))
  }

  useEffect(() => {
    if (!plDrillFetchPending || !auth?.store) return
    setPlDrillFetchPending(false)
    loadList(1)
  }, [plDrillFetchPending, auth?.store, listStart, listEnd, listStore, listScope, listDepartment])

  const loadMonthly = (range?: {
    startStr: string
    endStr: string
    yearMonth: string
    searchMode?: "month" | "period"
  }) => {
    if (!auth?.store) return
    const searchMode = range?.searchMode ?? monthlySearchMode
    const startStr = range?.startStr ?? (searchMode === "period" ? monthlyPeriodStart : undefined)
    const endStr = range?.endStr ?? (searchMode === "period" ? monthlyPeriodEnd : undefined)
    const ym = range?.yearMonth ?? monthlyYm
    setMonthlyLoading(true)
    getPettyCashMonthDetail({
      yearMonth: ym,
      startStr: searchMode === "period" ? startStr : undefined,
      endStr: searchMode === "period" ? endStr : undefined,
      scopeFilter: canSearchAll ? monthlyScope : undefined,
      storeFilter: monthlyScope === "store" && monthlyStore !== "All" ? monthlyStore : undefined,
      departmentFilter: monthlyScope === "office" && monthlyDepartment !== "All" ? monthlyDepartment : undefined,
      userStore: auth.store,
      userRole: auth.role,
    })
      .then((data) => {
        setMonthlyData(data)
        setPendingAccountSubjectByRowId({})
        const r =
          range?.startStr && range?.endStr
            ? { startStr: range.startStr, endStr: range.endStr }
            : searchMode === "period" && startStr && endStr
              ? { startStr, endStr }
              : getBangkokMonthRange(ym)
        void fetchPettySummaryRpc(r.startStr, r.endStr, monthlyScopeParams).then(setMonthlySummaryRpc)
      })
      .catch(() => {
        setMonthlyData([])
        setMonthlySummaryRpc(null)
      })
      .finally(() => setMonthlyLoading(false))
  }

  const applyListPeriodPreset = (preset: PettyPeriodPreset) => {
    setListPeriodPreset(preset)
    if (preset === "custom") return
    const range = resolvePettyPeriodPresetRange(preset)
    setListStart(range.startStr)
    setListEnd(range.endStr)
    loadList(1, { startStr: range.startStr, endStr: range.endStr })
  }

  const applyMonthlyPeriodPreset = (preset: PettyPeriodPreset) => {
    setMonthlyPeriodPreset(preset)
    if (preset === "custom") return
    const range = resolvePettyPeriodPresetRange(preset)
    setMonthlyYm(range.yearMonth)
    setMonthlySearchMode("period")
    setMonthlyPeriodStart(range.startStr)
    setMonthlyPeriodEnd(range.endStr)
    loadMonthly({
      startStr: range.startStr,
      endStr: range.endStr,
      yearMonth: range.yearMonth,
      searchMode: "period",
    })
  }

  const applyPp30PendingQuickFilter = () => {
    setFilterPettyTransType("expense")
    setFilterInvoiceStatus("pending")
    setFilterPp30VatOnly(true)
  }

  const monthlyYmOptions = getBangkokRecentYearMonths(24).map((value) => {
    const [y, m] = value.split("-").map(Number)
    return { value, label: `${y}년 ${m}월` }
  })

  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith("image/")) {
      setAddReceiptFile(file)
      const url = URL.createObjectURL(file)
      setAddReceiptPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return url
      })
    } else {
      setAddReceiptFile(null)
      setAddReceiptPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
    e.target.value = ""
  }

  const handleAdd = async () => {
    if (!auth?.store || !auth?.user) return
    const store = addTargetType === "office"
      ? (addDepartment ? "Office-" + addDepartment : null)
      : (addStore || (stores.includes("All") ? stores.find((s) => s !== "All") : stores[0]))
    if (!store || store === "All") {
      await appAlert(addTargetType === "office" ? (t("pettySelectDepartment") || "Please select department.") : t("pettyAlertStore"))
      return
    }
    const amt = parseInt(addAmount, 10) || 0
    if (amt <= 0) {
      await appAlert(t("pettyAlertAmount"))
      return
    }
    setAddSaving(true)
    let receiptUrl: string | undefined
    let invoicePhotoUrl: string | undefined
    if (addReceiptFile) {
      try {
        receiptUrl = await compressImageForUpload(addReceiptFile)
      } catch (err) {
        console.error("compressImage:", err)
        await appAlert(t("pettySaveFail"))
        setAddSaving(false)
        return
      }
    }
    if (addType === "expense" && addInvoicePhotoFile) {
      try {
        invoicePhotoUrl = await compressImageForUpload(addInvoicePhotoFile, 1024, 0.7)
      } catch (err) {
        console.error("compressInvoice:", err)
      }
    }
    const vatV = addType === "expense" ? Math.max(0, Number(String(addVatAmount).replace(/,/g, "")) || 0) : 0
    const res = await addPettyCashTransaction({
      store,
      transDate: addDate,
      transType: addType,
      amount: amt,
      memo: addMemo,
      receiptUrl,
      accountSubjectId: addAccountSubjectId ? Number(addAccountSubjectId) : null,
      ...(addType === "expense"
        ? {
            invoiceReceived: addInvoiceReceived,
            invoiceNo: addInvoiceNo.trim() || undefined,
            invoicePhotoUrl,
            ...(vatV > 0 ? { vatAmount: vatV } : {}),
          }
        : {}),
      userName: auth.user,
      userStore: auth.store,
      userRole: auth.role,
    })
    setAddSaving(false)
    if (res.success) {
      setAddAmount("")
      setAddMemo("")
      setAddAccountSubjectId("")
      setAddInvoiceReceived(false)
      setAddInvoiceNo("")
      setAddVatAmount("")
      setAddInvoicePhotoFile(null)
      setAddReceiptFile(null)
      setAddReceiptPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      loadList()
      await appAlert(t("pettySaved"))
    } else {
      await appAlert(translateApiMessage(res.message, t) || t("pettyAddFail"))
    }
  }

  const openEditModal = (r: PettyCashItem) => {
    setEditModalItem(r)
    setEditDate(r.trans_date)
    setEditType(r.trans_type)
    setEditAmount(String(Math.abs(r.amount)))
    setEditMemo(r.memo || "")
    setEditAccountSubjectId((r.accountSubjectId ?? r.account_subject_id) ? String(r.accountSubjectId ?? r.account_subject_id) : "")
    setEditInvoiceReceived(Boolean(r.invoiceReceived))
    setEditInvoiceNo(r.invoiceNo || "")
    setEditVatAmount(r.vatAmount && r.vatAmount > 0 ? String(r.vatAmount) : "")
    setEditInvoicePhotoFile(null)
    setEditReceiptFile(null)
    setEditReceiptPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null })
  }

  const closeEditModal = () => {
    setEditModalItem(null)
    setEditReceiptPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null })
  }

  const handleInlineAccountSubjectChange = async (r: PettyCashItem, newAccountSubjectId: string | number | null) => {
    if (!auth?.store) return
    const asId = newAccountSubjectId === "" || newAccountSubjectId === "__none__" ? null : Number(newAccountSubjectId)
    if (asId !== null && isNaN(asId)) return
    setInlineSavingId(r.id)
    setPendingAccountSubjectByRowId((prev) => {
      const next = { ...prev }
      delete next[r.id]
      return next
    })
    try {
      const res = await updatePettyCashTransaction({
        id: r.id,
        transDate: r.trans_date,
        transType: r.trans_type,
        amount: Math.abs(r.amount),
        memo: r.memo ?? "",
        accountSubjectId: asId,
        userStore: auth.store,
        userRole: auth.role,
      })
      if (res.success) {
        loadMonthly()
        loadList()
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("msg_modify_fail") || "Update failed")
      }
    } catch {
      await appAlert(t("msg_modify_fail") || "Update failed")
    } finally {
      setInlineSavingId(null)
    }
  }

  const handleEditReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith("image/")) {
      setEditReceiptFile(file)
      const url = URL.createObjectURL(file)
      setEditReceiptPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return url })
    } else {
      setEditReceiptFile(null)
      setEditReceiptPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null })
    }
    e.target.value = ""
  }

  const handleEditSave = async () => {
    if (!editModalItem || !auth?.store || !auth?.user) return
    const amt = parseInt(editAmount, 10) || 0
    if (amt <= 0) {
      await appAlert(t("pettyAlertAmount"))
      return
    }
    setEditSaving(true)
    let receiptUrl: string | null | undefined = undefined
    let invoicePhotoUrl: string | null | undefined = undefined
    if (editReceiptFile) {
      try {
        receiptUrl = await compressImageForUpload(editReceiptFile)
      } catch (err) {
        console.error("compressImage:", err)
        await appAlert(t("pettySaveFail"))
        setEditSaving(false)
        return
      }
    }
    if (editType === "expense" && editInvoicePhotoFile) {
      try {
        invoicePhotoUrl = await compressImageForUpload(editInvoicePhotoFile, 1024, 0.7)
      } catch (err) {
        console.error("compressInvoice:", err)
      }
    }
    const vatV = editType === "expense" ? Math.max(0, Number(String(editVatAmount).replace(/,/g, "")) || 0) : 0
    const res = await updatePettyCashTransaction({
      id: editModalItem.id,
      transDate: editDate,
      transType: editType,
      amount: amt,
      memo: editMemo,
      receiptUrl: receiptUrl,
      accountSubjectId: editAccountSubjectId ? Number(editAccountSubjectId) : null,
      ...(editType === "expense"
        ? {
            invoiceReceived: editInvoiceReceived,
            invoiceNo: editInvoiceNo.trim() || undefined,
            invoicePhotoUrl: invoicePhotoUrl !== undefined ? invoicePhotoUrl : undefined,
            vatAmount: vatV,
          }
        : {}),
      userStore: auth.store,
      userRole: auth.role,
    })
    setEditSaving(false)
    if (res.success) {
      loadMonthly()
      loadList()
      closeEditModal()
      await appAlert(t("msg_updated") || "Updated.")
    } else {
      await appAlert(translateApiMessage(res.message, t) || t("msg_modify_fail") || "Update failed")
    }
  }

  const handlePettyInvoiceCheckChange = async (r: PettyCashItem, checked: boolean) => {
    if (!r.id || r.trans_type !== "expense") return
    setUpdatingInvoiceId(r.id)
    try {
      const res = await updatePettyCashTransactionInvoice({
        pettyCashId: r.id,
        invoiceReceived: checked,
      })
      if (res.success) {
        const patch = { invoiceReceived: checked }
        setListData((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))
        setMonthlyData((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("processFail"))
      }
    } catch (e) {
      await appAlert(t("processFail") + ": " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setUpdatingInvoiceId(null)
    }
  }

  const renderPettyInvoiceCell = (r: PettyCashItem) => {
    if (r.trans_type !== "expense") return <td className="px-3 py-2.5 text-center align-top text-muted-foreground">—</td>
    return (
      <td className="px-3 py-2.5 text-center align-top">
        <div className="flex flex-col items-center gap-0.5">
          <Checkbox
            checked={Boolean(r.invoiceReceived)}
            onCheckedChange={(c) => handlePettyInvoiceCheckChange(r, c === true)}
            disabled={updatingInvoiceId === r.id}
            title={t("poInvoiceReceived") || "Invoice Received"}
            className="data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600"
          />
          {r.invoiceNo ? (
            <span className="text-[10px] text-muted-foreground max-w-[4.5rem] truncate" title={r.invoiceNo}>{r.invoiceNo}</span>
          ) : null}
        </div>
      </td>
    )
  }

  const handleDeleteMonthlyRow = async (r: PettyCashItem) => {
    if (!auth?.store) return
    const ok = await appConfirm(t("pettyDeleteConfirm") || "Delete this entry?")
    if (!ok) return
    setDeletingMonthlyId(r.id)
    try {
      const res = await deletePettyCashTransaction({
        id: r.id,
        userStore: auth.store,
        userRole: auth.role,
      })
      if (res.success) {
        if (editModalItem?.id === r.id) closeEditModal()
        setPendingAccountSubjectByRowId((prev) => {
          const next = { ...prev }
          delete next[r.id]
          return next
        })
        loadMonthly()
        loadList()
        await appAlert(t("pettyDeleted") || t("delete") || "Deleted.")
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail") || "Failed")
      }
    } catch {
      await appAlert(t("processFail") || "Failed")
    } finally {
      setDeletingMonthlyId(null)
    }
  }

  const fmt = (n: number) => (n || 0).toLocaleString()

  const renderPettySummaryCards = (
    summary: PettyCashPeriodSummary | null,
    meta?: { rpc: PettyCashSummaryResult | null; loadedRowCount: number }
  ) => {
    if (!adminEnhancedSearch || !summary) return null
    const rowsPartial =
      meta?.rpc != null && meta.loadedRowCount > 0 && meta.rpc.rowCount > meta.loadedRowCount
    const fallbackCap = Boolean(meta?.rpc?.truncated)
    const cards = [
      { label: t("pettySummaryExpenseTotal"), value: fmt(summary.expenseTotal), tone: "text-destructive" },
      { label: t("pettySummaryInflowTotal"), value: fmt(summary.inflowTotal), tone: "text-green-600" },
      {
        label: t("pettySummaryNetChange"),
        value: `${summary.netChange >= 0 ? "+" : "-"}${fmt(Math.abs(summary.netChange))}`,
        tone: summary.netChange >= 0 ? "text-green-600" : "text-destructive",
      },
      { label: t("pettySummaryVatTotal"), value: fmt(summary.vatTotal), tone: "text-foreground" },
      {
        label: t("pettySummaryVatPending"),
        value: `${fmt(summary.vatPendingTotal)}${summary.vatPendingCount > 0 ? ` (${summary.vatPendingCount})` : ""}`,
        tone: summary.vatPendingTotal > 0 ? "text-amber-600" : "text-muted-foreground",
      },
    ]
    return (
      <section
        className="rounded-xl border border-border/60 bg-card p-3 shadow-sm ring-1 ring-border/20 sm:p-4"
        aria-label={t("pettySummaryTitle")}
      >
        <h3 className="mb-3 text-sm font-semibold tracking-tight text-foreground">{t("pettySummaryTitle")}</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {cards.map((c) => (
            <div key={c.label} className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2.5">
              <p className="text-[11px] leading-snug text-muted-foreground">{c.label}</p>
              <p className={cn("mt-0.5 text-base font-semibold tabular-nums sm:text-lg", c.tone)}>{c.value}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {(t("pettySummaryRows") || "{n}건").replace("{n}", String(summary.rowCount))}
          {meta?.rpc?.source === "rpc" ? ` · ${t("pettySummaryDbAgg")}` : ""}
        </p>
        {(rowsPartial || fallbackCap) && (
          <p className="mt-1 text-[11px] text-amber-600">
            {rowsPartial
              ? (t("pettySummaryListPartial") || "").replace("{loaded}", String(meta?.loadedRowCount ?? 0)).replace("{total}", String(summary.rowCount))
              : t("pettySummaryFallbackCap")}
          </p>
        )}
      </section>
    )
  }

  const renderAdminClientFilters = () => {
    if (!adminEnhancedSearch) return null
    return (
      <div className="mt-3 flex w-full flex-wrap items-end gap-x-2 gap-y-2 border-t border-border/40 pt-3 sm:gap-x-3">
        <div className="min-w-0 w-full min-[480px]:w-auto min-[480px]:min-w-[8.5rem] min-[480px]:max-w-[11rem]">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("pettyColType")}</span>
          <Select
            value={filterPettyTransType || "__all__"}
            onValueChange={(v) => setFilterPettyTransType(v === "__all__" ? "" : v)}
          >
            <SelectTrigger className="h-10 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("pettyFilterTransTypeAll")}</SelectItem>
              <SelectItem value="expense">{t("pettyTypeExpense")}</SelectItem>
              <SelectItem value="receive">{t("pettyTypeReceive")}</SelectItem>
              <SelectItem value="replenish">{t("pettyTypeReplenish")}</SelectItem>
              <SelectItem value="settle">{t("pettyTypeSettle")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 w-full min-[480px]:w-auto min-[480px]:min-w-[10rem] min-[480px]:max-w-[14rem]">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("accountSubject")}</span>
          <Select
            value={filterAccountSubjectId || "__all__"}
            onValueChange={(v) => setFilterAccountSubjectId(v === "__all__" ? "" : v)}
          >
            <SelectTrigger className="h-10 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("all") || "전체"}</SelectItem>
              {accountSubjectOptions.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.code} {asDisplayName(a)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 w-full min-[480px]:w-auto min-[480px]:min-w-[10rem] min-[480px]:max-w-xs flex-1">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("pettyColMemo")}</span>
          <Input
            value={filterMemoKeyword}
            onChange={(e) => setFilterMemoKeyword(e.target.value)}
            placeholder={t("pettyFilterMemoPlaceholder")}
            className="h-10 text-sm"
          />
        </div>
        <div className="min-w-0 w-full min-[480px]:w-auto min-[480px]:min-w-[9rem] min-[480px]:max-w-[12rem]">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("poInvoice")}</span>
          <Select
            value={filterInvoiceStatus || "__all__"}
            onValueChange={(v) => setFilterInvoiceStatus(v === "__all__" ? "" : (v as PettyInvoiceFilter))}
          >
            <SelectTrigger className="h-10 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("pettyFilterInvoiceAll")}</SelectItem>
              <SelectItem value="received">{t("pettyFilterInvoiceReceived")}</SelectItem>
              <SelectItem value="pending">{t("pettyFilterInvoicePending")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="flex h-10 w-full min-[480px]:w-auto cursor-pointer items-center gap-2 rounded-lg border border-border/50 bg-background/80 px-2.5">
          <Checkbox checked={filterPp30VatOnly} onCheckedChange={(c) => setFilterPp30VatOnly(c === true)} />
          <span className="text-xs leading-snug text-foreground">{t("pettyFilterPp30VatOnly")}</span>
        </label>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-10"
          onClick={applyPp30PendingQuickFilter}
        >
          {t("pettyQuickPp30Pending")}
        </Button>
      </div>
    )
  }

  const renderPeriodPresets = (
    preset: PettyPeriodPreset,
    onPreset: (p: PettyPeriodPreset) => void
  ) => {
    if (!adminEnhancedSearch) return null
    const presets: { id: PettyPeriodPreset; label: string }[] = [
      { id: "today", label: t("pettyPresetToday") || t("today") || "오늘" },
      { id: "thisMonth", label: t("pettyPresetThisMonth") || "이번 달" },
      { id: "taxMonth", label: t("pettyPresetTaxMonth") || t("accCompLabelTaxMonth") || "과세월" },
      { id: "custom", label: t("pettyPresetCustom") || "기간 지정" },
    ]
    return (
      <div className="mb-3 flex flex-wrap gap-2">
        {presets.map((p) => (
          <Button
            key={p.id}
            type="button"
            size="sm"
            variant={preset === p.id ? "default" : "outline"}
            className="h-8"
            onClick={() => onPreset(p.id)}
          >
            {p.label}
          </Button>
        ))}
      </div>
    )
  }

  const renderAdminViewToolbar = () => {
    if (!adminEnhancedSearch) return null
    const modes: { id: PettyAdminViewMode; label: string }[] = [
      { id: "detail", label: t("pettyViewDetail") || "상세" },
      { id: "by_day", label: t("pettyViewByDay") || "일별" },
      { id: "by_account", label: t("pettyViewByAccount") || "계정과목별" },
    ]
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t("pettyViewModeLabel") || "보기"}</span>
        {modes.map((m) => (
          <Button
            key={m.id}
            type="button"
            size="sm"
            variant={adminViewMode === m.id ? "default" : "outline"}
            className="h-8"
            onClick={() => setAdminViewMode(m.id)}
          >
            {m.label}
          </Button>
        ))}
      </div>
    )
  }

  const renderAdminAggregationTable = (
    mode: "by_day" | "by_account",
    dayRows: ReturnType<typeof aggregatePettyCashByDay>,
    accountRows: ReturnType<typeof aggregatePettyCashByAccount>,
    emptySourceLen: number
  ) => {
    if (mode === "by_day") {
      if (dayRows.length === 0) {
        return (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">
            {emptySourceLen === 0 ? (t("pettyNoData") || "데이터가 없습니다") : (t("bankNoMatchFilter") || "조건에 맞는 데이터가 없습니다.")}
          </p>
        )
      }
      return (
        <table className="w-full text-xs min-w-[640px]">
          <thead className="sticky top-0 z-[1] border-b border-border/60 bg-muted/60 backdrop-blur-sm">
            <tr>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-muted-foreground">{t("pettyAggDate") || "일자"}</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-muted-foreground">{t("pettySummaryExpenseTotal")}</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-muted-foreground">{t("pettySummaryInflowTotal")}</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-muted-foreground">{t("pettySummaryNetChange")}</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-muted-foreground">{t("pettySummaryVatTotal")}</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-muted-foreground">{t("pettySummaryVatPending")}</th>
              <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-muted-foreground">{t("pettyAggCount") || "건수"}</th>
            </tr>
          </thead>
          <tbody>
            {dayRows.map((r) => (
              <tr key={r.date} className="border-t border-border/40 hover:bg-muted/20">
                <td className="px-3 py-2.5 text-center whitespace-nowrap text-sm">{r.date}</td>
                <td className="px-3 py-2.5 text-center tabular-nums text-sm text-destructive">{fmt(r.expenseTotal)}</td>
                <td className="px-3 py-2.5 text-center tabular-nums text-sm text-green-600">{fmt(r.inflowTotal)}</td>
                <td className={`px-3 py-2.5 text-center tabular-nums text-sm ${r.netChange >= 0 ? "text-green-600" : "text-destructive"}`}>
                  {r.netChange >= 0 ? "+" : "-"}
                  {fmt(Math.abs(r.netChange))}
                </td>
                <td className="px-3 py-2.5 text-center tabular-nums text-sm">{fmt(r.vatTotal)}</td>
                <td className="px-3 py-2.5 text-center tabular-nums text-sm text-amber-600">{fmt(r.vatPendingTotal)}</td>
                <td className="px-3 py-2.5 text-center tabular-nums text-sm text-muted-foreground">{r.rowCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    }
    if (accountRows.length === 0) {
      return (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          {emptySourceLen === 0 ? (t("pettyNoData") || "데이터가 없습니다") : (t("bankNoMatchFilter") || "조건에 맞는 데이터가 없습니다.")}
        </p>
      )
    }
    return (
      <table className="w-full text-xs min-w-[520px]">
        <thead className="sticky top-0 z-[1] border-b border-border/60 bg-muted/60 backdrop-blur-sm">
          <tr>
            <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground">{t("accountSubject")}</th>
            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-muted-foreground">{t("pettySummaryExpenseTotal")}</th>
            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-muted-foreground">{t("pettySummaryVatTotal")}</th>
            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-muted-foreground">{t("pettySummaryVatPending")}</th>
            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-muted-foreground">{t("pettyAggCount") || "건수"}</th>
          </tr>
        </thead>
        <tbody>
          {accountRows.map((r) => (
            <tr key={String(r.accountSubjectId ?? "none") + r.accountLabel} className="border-t border-border/40 hover:bg-muted/20">
              <td className="px-3 py-2.5 text-left text-sm">{r.accountLabel}</td>
              <td className="px-3 py-2.5 text-center tabular-nums text-sm text-destructive">{fmt(r.expenseTotal)}</td>
              <td className="px-3 py-2.5 text-center tabular-nums text-sm">{fmt(r.vatTotal)}</td>
              <td className="px-3 py-2.5 text-center tabular-nums text-sm text-amber-600">{fmt(r.vatPendingTotal)}</td>
              <td className="px-3 py-2.5 text-center tabular-nums text-sm text-muted-foreground">{r.rowCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  const downloadMonthlyExcel = () => {
    if (monthlyData.length === 0) return
    const escapeXml = (s: string) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
    const cols = [
      t("pettyColDate") || "Date",
      t("store") || "Store",
      t("pettyColType") || "Type",
      t("pettyColAmount") || "Amount",
      t("pettyColBalance") || "Balance",
      t("accountSubject") || "Account Subject",
      t("pettyColMemo") || "Memo",
      t("pettyColUser") || "User",
    ]
    const storeLabel = monthlyScope === "office"
      ? (monthlyDepartment === "All" ? `${t("pettyScopeOffice") || "Office"} ${t("all") || "All"}` : `${t("pettyScopeOffice") || "Office"} (${monthlyDepartment})`)
      : (monthlyStore === "All" ? t("all") || "All" : monthlyStore)
    const rows: string[][] = [
      [t("pettyTabMonthly") || "Monthly Status", "", "", "", "", "", "", ""],
      [t("pettyYearMonth") || "Period", monthlyYm, "", "", "", "", "", ""],
      [t("store") || "Store", storeLabel, "", "", "", "", "", ""],
      [],
      cols,
    ]
    const getAccountSubjectName = (id: number | null | undefined) => {
      if (id == null) return ""
      const a = accountSubjectOptions.find((x) => x.id === id)
      return a ? `${a.code} ${asDisplayName(a)}` : ""
    }
    for (const r of filteredMonthlyData) {
      rows.push([
        r.trans_date,
        r.store,
        t(typeKeys[r.trans_type] || r.trans_type) || r.trans_type,
        String(r.amount),
        String(r.balance_after ?? 0),
        getAccountSubjectName(r.accountSubjectId ?? r.account_subject_id ?? null),
        r.memo || "",
        r.user_name || "",
      ])
    }
    const pxPerChar = 8
    const minW = 60
    const colWidths = cols.map((_, c) => {
      let maxLen = (cols[c] || "").length
      for (const row of rows) {
        const cell = row[c]
        const len = String(cell ?? "").length
        if (len > maxLen) maxLen = len
      }
      return Math.max(minW, Math.min(maxLen * pxPerChar + 16, 280))
    })
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="utf-8"/><style>td{border:1px solid #ccc;padding:4px 8px;font-size:11px}.head{font-weight:bold;background:#f0f0f0}table{border-collapse:collapse}</style></head>
<body>
<table>
<colgroup>${colWidths.map((w) => `<col width="${w}"/>`).join("")}</colgroup>
${rows.map((row, ri) => {
  const isHead = ri < 4 || ri === 4
  return `<tr${isHead ? ' class="head"' : ""}>${row.map((c) => `<td>${escapeXml(String(c ?? ""))}</td>`).join("")}</tr>`
}).join("")}
</table>
</body>
</html>`
    const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `petty_monthly_${monthlyStore === "All" ? "all" : monthlyStore}_${monthlyYm}.xls`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="shadow-md ring-1 ring-border/40">
        <CardContent className="pt-5 sm:pt-6">
          <Tabs defaultValue="list" className="w-full">
            <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
                  <TabsTrigger value="list" className={adminTabsTriggerCn}>
                    {t("pettyTabList")}
                  </TabsTrigger>
                  <TabsTrigger value="monthly" className={adminTabsTriggerCn}>
                    {t("pettyTabMonthly")}
                  </TabsTrigger>
                </TabsList>
          </AdminTabsBarWithHelp>

            <TabsContent value="list" className={cn("space-y-5 px-3 pb-6 pt-1 sm:px-5 sm:pb-8 sm:pt-2", adminTabsContentFlushCn)}>
              <section
                className="rounded-xl border border-border/60 bg-gradient-to-b from-muted/35 to-muted/10 p-3 shadow-sm ring-1 ring-border/20 sm:p-4"
                aria-label={t("outWhFilterBy")}
              >
                <h3 className="mb-2 border-b border-border/50 pb-2 text-sm font-semibold tracking-tight text-foreground">
                  {t("outWhFilterBy")}
                </h3>
                {renderPeriodPresets(listPeriodPreset, applyListPeriodPreset)}
                <div className="flex flex-wrap items-end gap-x-2 gap-y-2 sm:gap-x-3">
                  {canSearchAll && (
                    <div className="min-w-0 w-full min-[480px]:w-auto min-[480px]:min-w-[7.5rem] min-[480px]:max-w-[10rem]">
                      <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("pettyScopeStore")} / {t("pettyScopeOffice")}</span>
                      <Select value={listScope} onValueChange={(v) => { setListScope(v as "store" | "office"); setListStore("All"); setListDepartment("All"); }}>
                        <SelectTrigger className="h-10 w-full text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="store">{t("pettyScopeStore") || "매장"}</SelectItem>
                          <SelectItem value="office">{t("pettyScopeOffice") || "본사"}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="min-w-0 w-full min-[480px]:w-auto min-[480px]:min-w-[9rem] min-[480px]:max-w-[14rem]">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">
                      {listScope === "store" ? (t("store") || "매장") : (t("pettySelectDepartment") || "부서")}
                    </span>
                    {listScope === "store" ? (
                      <Select value={listStore} onValueChange={setListStore}>
                        <SelectTrigger className="h-10 w-full text-sm">
                          <SelectValue placeholder={t("store")} />
                        </SelectTrigger>
                        <SelectContent>
                          {stores.map((st) => (
                            <SelectItem key={st} value={st}>{st === "All" ? (t("all") || "전체") : st}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select value={listDepartment} onValueChange={setListDepartment}>
                        <SelectTrigger className="h-10 w-full text-sm">
                          <SelectValue placeholder={t("pettySelectDepartment")} />
                        </SelectTrigger>
                        <SelectContent>
                          {officeDepartments.map((d) => (
                            <SelectItem key={d} value={d}>{d === "All" ? (t("all") || "전체") : d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="min-w-0 w-full min-[520px]:w-auto min-[520px]:min-w-[17.5rem] min-[520px]:max-w-xl flex-1">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("searchPeriod")}</span>
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <Input type="date" value={listStart} onChange={(e) => { setListPeriodPreset("custom"); setListStart(e.target.value) }} className="date-input-compact date-input-mobile-shrink h-10 w-[min(100%,10.5rem)] min-w-[9rem] text-sm" />
                      <span className="shrink-0 text-sm text-muted-foreground">~</span>
                      <Input type="date" value={listEnd} onChange={(e) => { setListPeriodPreset("custom"); setListEnd(e.target.value) }} className="date-input-compact date-input-mobile-shrink h-10 w-[min(100%,10.5rem)] min-w-[9rem] text-sm" />
                    </div>
                  </div>
                  {showAccountSubjectEmptyFilter && (
                    <label className="flex h-10 w-full min-[640px]:w-auto cursor-pointer items-center gap-2 rounded-lg border border-border/50 bg-background/80 px-2.5">
                      <input type="checkbox" checked={filterAccountSubjectEmpty} onChange={(e) => setFilterAccountSubjectEmpty(e.target.checked)} className="rounded" />
                      <span className="text-xs leading-snug text-foreground sm:text-sm">{t("bankFilterAccountSubjectEmpty") || "계정과목 미입력만"}</span>
                    </label>
                  )}
                  <Button size="default" className="h-10 w-full shrink-0 gap-1.5 px-5 min-[520px]:w-auto" onClick={() => loadList(1)} disabled={listLoading}>
                    <Search className="h-4 w-4" />
                    {listLoading ? (t("loading") || "불러오는 중") : (t("search") || "검색")}
                  </Button>
                </div>
                {renderAdminClientFilters()}
              </section>
              {renderPettySummaryCards(listPeriodSummary, {
                rpc: listSummaryRpc,
                loadedRowCount: adminListFullRows.length,
              })}
              {renderAdminViewToolbar()}
              <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
              <div className="max-h-[min(70vh,_420px)] overflow-x-auto overflow-y-auto sm:max-h-[min(60vh,_480px)]">
                {adminEnhancedSearch && adminViewMode !== "detail" ? (
                  renderAdminAggregationTable(
                    adminViewMode,
                    listDayAggregates,
                    listAccountAggregates,
                    adminListFullRows.length
                  )
                ) : filteredListData.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">{(adminEnhancedSearch ? adminListFullRows.length : listData.length) === 0 ? (t("pettyNoData") || "데이터가 없습니다") : (t("bankNoMatchFilter") || "조건에 맞는 데이터가 없습니다.")}</p>
                ) : (
                  <table className={cn("w-full text-xs", canSearchAll ? "min-w-[520px]" : "min-w-[460px]")}>
                    <thead className="sticky top-0 z-[1] border-b border-border/60 bg-muted/60 backdrop-blur-sm">
                      <tr>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-muted-foreground sm:py-3 sm:text-xs">{t("pettyColDate") || "날짜"}</th>
                        {canSearchAll && <th className="px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-muted-foreground sm:py-3 sm:text-xs">{t("store") || "매장"}</th>}
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-muted-foreground sm:py-3 sm:text-xs">{t("pettyColType") || "유형"}</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-muted-foreground sm:py-3 sm:text-xs">{t("pettyColAmount") || "금액"}</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-muted-foreground sm:py-3 sm:text-xs min-w-[12rem]">{t("pettyColMemo") || "내용"}</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-muted-foreground sm:py-3 sm:text-xs">{t("pettyColUser") || "등록자"}</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-muted-foreground sm:py-3 sm:text-xs">{t("pettyColReceipt") || "영수증"}</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-muted-foreground sm:py-3 sm:text-xs min-w-[4.5rem]" title={t("poInvoice") || "Invoice"}>{t("poInvoice") || "Invoice"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredListData.map((r) => (
                        <tr key={r.id} className="border-t border-border/40 transition-colors hover:bg-muted/20">
                          <td className="px-3 py-2.5 text-center align-top whitespace-nowrap text-sm">{r.trans_date}</td>
                          {canSearchAll && <td className="px-3 py-2.5 text-center align-top truncate text-xs max-w-[6rem]">{formatStoreLabel(r.store)}</td>}
                          <td className="px-3 py-2.5 text-center align-top whitespace-nowrap text-sm">{t(typeKeys[r.trans_type] || r.trans_type) || r.trans_type}</td>
                          <td className={`px-3 py-2.5 text-center align-top whitespace-nowrap tabular-nums text-sm ${r.amount < 0 ? "text-destructive" : "text-green-600"}`}>
                            {r.amount >= 0 ? "" : "-"}
                            {fmt(Math.abs(r.amount))}
                          </td>
                          <td className="px-3 py-2.5 align-top text-left text-sm whitespace-normal break-words min-w-[12rem] max-w-[min(85vw,_22rem)]">{formatMemo(r.memo || "")}</td>
                          <td className="px-3 py-2.5 text-center align-top text-xs text-muted-foreground max-w-[5.5rem] break-words" title={displayUser(r.user_name)}>{displayUser(r.user_name)}</td>
                          <td className="px-3 py-2.5 text-center align-top w-9">
                            {r.receipt_url ? (
                              <button
                                type="button"
                                className="h-6 w-6 shrink-0 rounded border border-border bg-muted/50 hover:bg-muted flex items-center justify-center mx-auto text-muted-foreground"
                                onClick={() => setReceiptModalUrl(r.receipt_url!)}
                                title={t("pettyColReceipt") || "영수증"}
                                aria-label={t("pettyColReceipt") || "영수증"}
                              >
                                <Camera className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              "-"
                            )}
                          </td>
                          {renderPettyInvoiceCell(r)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              </div>
              {(adminEnhancedSearch ? adminViewMode === "detail" : true) && (
              <ListPaginationBar
                className="mt-1 sm:mt-2"
                page={listPage}
                pageSize={listPageSize}
                total={listTotalForBar}
                onPageChange={(pg) => {
                  if (adminEnhancedSearch) setListPage(pg)
                  else loadList(pg)
                }}
                disabled={listLoading}
              />
              )}

              <div className="mt-2 rounded-xl border border-border/50 bg-muted/10 p-4 sm:mt-3 sm:p-5">
                <p className="mb-4 text-sm font-semibold text-foreground">{t("pettyAddTitle") || "등록"}</p>
                <div className="flex flex-col gap-3">
                  {canSearchAll && (
                    <Select value={addTargetType} onValueChange={(v) => { setAddTargetType(v as "store" | "office"); setAddStore(stores.find((s) => s !== "All") || ""); setAddDepartment(officeDepartments.find((d) => d !== "All") || ""); }}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="store">{t("pettyScopeStore") || "매장"}</SelectItem>
                        <SelectItem value="office">{t("pettyScopeOffice") || "본사"}</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  {addTargetType === "store" ? (
                    <Select value={addStore} onValueChange={setAddStore}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder={t("store")} />
                      </SelectTrigger>
                      <SelectContent>
                        {stores.filter((s) => s !== "All").map((st) => (
                          <SelectItem key={st} value={st}>{st}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Select value={addDepartment} onValueChange={setAddDepartment}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder={t("pettySelectDepartment")} />
                      </SelectTrigger>
                      <SelectContent>
                        {officeDepartments.filter((d) => d !== "All").map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className="h-9 text-xs" />
                  <Select value={addType} onValueChange={setAddType}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="receive">{t("pettyTypeReceive")}</SelectItem>
                      <SelectItem value="expense">{t("pettyTypeExpense")}</SelectItem>
                      <SelectItem value="replenish">{t("pettyTypeReplenish")}</SelectItem>
                      <SelectItem value="settle">{t("pettyTypeSettle")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" placeholder={t("pettyAmountPh") || "금액"} value={addAmount} onChange={(e) => setAddAmount(e.target.value)} className="h-9 text-xs" min={0} />
                  <Input type="text" placeholder={t("pettyMemoPh") || "내용"} value={addMemo} onChange={(e) => setAddMemo(e.target.value)} className="h-9 text-xs" />
                  <div>
                    <label className="text-xs text-muted-foreground">{t("accountSubject") || "계정과목"} <span className="text-muted-foreground">({t("optional")})</span></label>
                    <Select value={addAccountSubjectId || "__none__"} onValueChange={(v) => setAddAccountSubjectId(v === "__none__" ? "" : v)}>
                      <SelectTrigger className="h-9 mt-1 text-xs">
                        <SelectValue placeholder={t("accountSubject") || "계정과목"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— {t("optional") || "선택안함"}</SelectItem>
                        {accountSubjectOptions.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <Camera className="h-3.5 w-3.5" />
                      {t("pettyReceiptPhoto")} <span className="text-muted-foreground">({t("optional")})</span>
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={receiptCameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleReceiptChange}
                        className="sr-only"
                      />
                      <input
                        ref={receiptFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleReceiptChange}
                        className="sr-only"
                      />
                      <button
                        type="button"
                        onClick={() => receiptCameraInputRef.current?.click()}
                        className="rounded border border-input bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                      >
                        {t("pettyReceiptTakePhoto")}
                      </button>
                      <button
                        type="button"
                        onClick={() => receiptFileInputRef.current?.click()}
                        className="rounded border border-input bg-muted/50 px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        {t("chooseFile")}
                      </button>
                      {addReceiptFile && (
                        <span className="text-xs text-muted-foreground truncate max-w-[120px]">{addReceiptFile.name}</span>
                      )}
                      {addReceiptPreview && (
                        <div className="relative shrink-0">
                          <img src={addReceiptPreview} alt={t("pettyReceiptPreview")} className="h-12 w-12 object-cover rounded border" />
                          <button
                            type="button"
                            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center"
                            onClick={() => {
                              setAddReceiptFile(null)
                              setAddReceiptPreview((p) => { if (p) URL.revokeObjectURL(p); return null })
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {addType === "expense" ? (
                    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/15 p-3">
                      <p className="text-xs font-medium">{t("poInvoice") || "Invoice"} · {t("expenseAccrualVat") || "VAT"} (PP30)</p>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="w-[100px]">
                          <Label className="text-xs text-muted-foreground">{t("expenseAccrualVat") || "VAT"}</Label>
                          <Input
                            value={addVatAmount}
                            onChange={(e) => setAddVatAmount(e.target.value.replace(/[^\d.,]/g, "").replace(/,/g, ""))}
                            className="h-9 mt-1 text-xs"
                            placeholder="0"
                          />
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer pb-1">
                          <Checkbox checked={addInvoiceReceived} onCheckedChange={(c) => setAddInvoiceReceived(c === true)} />
                          <span className="text-xs">{t("poInvoiceReceived") || "Invoice Received"}</span>
                        </label>
                        <div className="w-[120px]">
                          <Label className="text-xs text-muted-foreground">{t("wm_invoiceNoLabel") || "Invoice No."}</Label>
                          <Input value={addInvoiceNo} onChange={(e) => setAddInvoiceNo(e.target.value)} className="h-9 mt-1 text-xs" />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">{t("bankInvoicePhotoUpload") || "Invoice Image"}</Label>
                          <Input
                            type="file"
                            accept="image/*"
                            className="h-9 mt-1 text-xs max-w-[180px]"
                            onChange={(e) => setAddInvoicePhotoFile(e.target.files?.[0] || null)}
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <Button className="h-10 w-full font-medium" onClick={handleAdd} disabled={addSaving}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {addSaving ? (t("loading") || "저장중...") : (t("btnSave") || "저장")}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="monthly" className={cn("space-y-4 px-3 pb-6 pt-1 sm:px-5 sm:pb-8 sm:pt-2", adminTabsContentFlushCn)}>
              <section
                className="rounded-xl border border-border/60 bg-gradient-to-b from-muted/35 to-muted/10 p-3 shadow-sm ring-1 ring-border/20 sm:p-4"
                aria-label={t("outWhFilterBy")}
              >
                <h3 className="mb-2 border-b border-border/50 pb-2 text-sm font-semibold tracking-tight text-foreground">
                  {t("outWhFilterBy")}
                </h3>
                {renderPeriodPresets(monthlyPeriodPreset, applyMonthlyPeriodPreset)}
                <div className="flex flex-wrap items-end gap-x-2 gap-y-2 sm:gap-x-3">
                  {canSearchAll && (
                    <div className="min-w-0 w-full min-[480px]:w-auto min-[480px]:min-w-[7.5rem] min-[480px]:max-w-[10rem]">
                      <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("pettyScopeStore")} / {t("pettyScopeOffice")}</span>
                      <Select value={monthlyScope} onValueChange={(v) => { setMonthlyScope(v as "store" | "office"); setMonthlyStore("All"); setMonthlyDepartment("All"); }}>
                        <SelectTrigger className="h-10 w-full text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="store">{t("pettyScopeStore") || "매장"}</SelectItem>
                          <SelectItem value="office">{t("pettyScopeOffice") || "본사"}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="min-w-0 w-full min-[480px]:w-auto min-[480px]:min-w-[9rem] min-[480px]:max-w-[14rem]">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">
                      {monthlyScope === "store" ? (t("store") || "매장") : (t("pettySelectDepartment") || "부서")}
                    </span>
                    {monthlyScope === "store" ? (
                      <Select value={monthlyStore} onValueChange={setMonthlyStore}>
                        <SelectTrigger className="h-10 w-full text-sm">
                          <SelectValue placeholder={t("store")} />
                        </SelectTrigger>
                        <SelectContent>
                          {stores.map((st) => (
                            <SelectItem key={st} value={st}>{st === "All" ? (t("all") || "전체") : st}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select value={monthlyDepartment} onValueChange={setMonthlyDepartment}>
                        <SelectTrigger className="h-10 w-full text-sm">
                          <SelectValue placeholder={t("pettySelectDepartment")} />
                        </SelectTrigger>
                        <SelectContent>
                          {officeDepartments.map((d) => (
                            <SelectItem key={d} value={d}>{d === "All" ? (t("all") || "전체") : d}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="min-w-[7.5rem] w-full min-[480px]:w-auto">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("pettySearchByMonth")} / {t("pettySearchByPeriod")}</span>
                    <Select value={monthlySearchMode} onValueChange={(v) => { setMonthlyPeriodPreset("custom"); setMonthlySearchMode(v as "month" | "period") }}>
                      <SelectTrigger className="h-10 w-full text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="month">{t("pettySearchByMonth") || "월별"}</SelectItem>
                        <SelectItem value="period">{t("pettySearchByPeriod") || "기간별"}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {monthlySearchMode === "month" ? (
                    <div className="min-w-0 w-full min-[480px]:w-44 min-[480px]:max-w-xs">
                      <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("pettyYearMonth") || "연월"}</span>
                      <Select value={monthlyYm} onValueChange={(v) => { setMonthlyPeriodPreset("custom"); setMonthlyYm(v) }}>
                        <SelectTrigger className="h-10 w-full text-sm">
                          <SelectValue placeholder={t("pettyYearMonth") || "연월"} />
                        </SelectTrigger>
                        <SelectContent>
                          {monthlyYmOptions.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="min-w-0 w-full min-[520px]:w-auto min-[520px]:min-w-[17.5rem] min-[520px]:max-w-xl flex-1">
                      <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("searchPeriod")}</span>
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <Input type="date" value={monthlyPeriodStart} onChange={(e) => { setMonthlyPeriodPreset("custom"); setMonthlyPeriodStart(e.target.value) }} className="date-input-compact h-10 w-[min(100%,10.5rem)] min-w-[9rem] text-sm" />
                        <span className="shrink-0 text-sm text-muted-foreground">~</span>
                        <Input type="date" value={monthlyPeriodEnd} onChange={(e) => { setMonthlyPeriodPreset("custom"); setMonthlyPeriodEnd(e.target.value) }} className="date-input-compact h-10 w-[min(100%,10.5rem)] min-w-[9rem] text-sm" />
                      </div>
                    </div>
                  )}
                  {showAccountSubjectEmptyFilter && (
                    <label className="flex h-10 w-full min-[640px]:w-auto cursor-pointer items-center gap-2 rounded-lg border border-border/50 bg-background/80 px-2.5">
                      <input type="checkbox" checked={filterAccountSubjectEmpty} onChange={(e) => setFilterAccountSubjectEmpty(e.target.checked)} className="rounded" />
                      <span className="text-xs leading-snug text-foreground sm:text-sm">{t("bankFilterAccountSubjectEmpty") || "계정과목 미입력만"}</span>
                    </label>
                  )}
                  <div className="flex w-full flex-wrap gap-2 min-[520px]:ml-auto min-[520px]:w-auto">
                    <Button size="default" className="h-10 flex-1 gap-1.5 px-5 min-[400px]:flex-initial" onClick={() => loadMonthly()} disabled={monthlyLoading}>
                      <Search className="h-4 w-4" />
                      {monthlyLoading ? (t("loading") || "불러오는 중") : (t("search") || "검색")}
                    </Button>
                    <Button size="default" variant="outline" className="h-10 flex-1 gap-1.5 px-5 min-[400px]:flex-initial" onClick={downloadMonthlyExcel} disabled={filteredMonthlyData.length === 0} title={t("pettyExcelHint") || ""}>
                      <Download className="h-4 w-4" />
                      {t("excelBtn") || "Excel"}
                    </Button>
                  </div>
                </div>
                {renderAdminClientFilters()}
              </section>
              {renderPettySummaryCards(monthlyPeriodSummary, {
                rpc: monthlySummaryRpc,
                loadedRowCount: monthlyData.length,
              })}
              {renderAdminViewToolbar()}
              <div className="overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
              <div className="max-h-[min(78vh,_560px)] overflow-x-auto overflow-y-auto sm:max-h-[min(72vh,_620px)]">
                {adminEnhancedSearch && adminViewMode !== "detail" ? (
                  renderAdminAggregationTable(
                    adminViewMode,
                    monthlyDayAggregates,
                    monthlyAccountAggregates,
                    monthlyData.length
                  )
                ) : filteredMonthlyData.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">{monthlyData.length === 0 ? (t("pettyNoData") || "데이터가 없습니다") : (t("bankNoMatchFilter") || "조건에 맞는 데이터가 없습니다.")}</p>
                ) : (
                  <table className={cn(accountingResultTableCn, "text-xs min-w-[720px]")}>
                    <thead className="sticky top-0 z-[1] bg-muted/60 backdrop-blur-sm">
                      <tr className={accountingResultTheadRowCn}>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-muted-foreground sm:py-3 sm:text-xs whitespace-nowrap">{t("pettyColDate") || "날짜"}</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-muted-foreground sm:py-3 sm:text-xs whitespace-nowrap">{t("store") || "매장"}</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-muted-foreground sm:py-3 sm:text-xs whitespace-nowrap">{t("pettyColType") || "유형"}</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-muted-foreground sm:py-3 sm:text-xs whitespace-nowrap">{t("pettyColAmount") || "금액"}</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-foreground sm:py-3 sm:text-xs whitespace-nowrap">{t("pettyColBalance") || "잔액"}</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-muted-foreground sm:py-3 sm:text-xs whitespace-nowrap min-w-[7rem]">{t("accountSubject") || "계정과목"}</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-muted-foreground sm:py-3 sm:text-xs min-w-[12rem]">{t("pettyColMemo") || "내용"}</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-muted-foreground sm:py-3 sm:text-xs whitespace-nowrap">{t("pettyColUser") || "등록자"}</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-muted-foreground sm:py-3 sm:text-xs whitespace-nowrap">{t("pettyColReceipt") || "영수증"}</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-muted-foreground sm:py-3 sm:text-xs whitespace-nowrap min-w-[4.5rem]" title={t("poInvoice") || "Invoice"}>{t("poInvoice") || "Invoice"}</th>
                        <th className="px-3 py-2.5 text-center text-[11px] font-semibold tracking-wide text-muted-foreground sm:py-3 sm:text-xs whitespace-nowrap">{t("pettyColActions") || "수정·삭제"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMonthlyData.map((r) => (
                        <tr key={r.id} className={accountingResultTbodyRowCn}>
                          <td className="px-3 py-2.5 text-center align-top whitespace-nowrap text-sm">{r.trans_date}</td>
                          <td className="px-3 py-2.5 text-center align-top truncate text-sm max-w-[5.5rem]">{formatStoreLabel(r.store)}</td>
                          <td className="px-3 py-2.5 text-center align-top whitespace-nowrap text-sm">{t(typeKeys[r.trans_type] || r.trans_type) || r.trans_type}</td>
                          <td className={`px-3 py-2.5 text-center align-top whitespace-nowrap tabular-nums text-sm ${r.amount < 0 ? "text-destructive" : "text-green-600"}`}>
                            {r.amount >= 0 ? "" : "-"}
                            {fmt(Math.abs(r.amount))}
                          </td>
                          <td className="px-3 py-2.5 text-center align-top font-medium whitespace-nowrap tabular-nums text-sm">{fmt(r.balance_after ?? 0)}</td>
                          <td className="px-3 py-2.5 align-top" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              <Select
                                value={pendingAccountSubjectByRowId[r.id] ?? ((r.accountSubjectId ?? r.account_subject_id) ? String(r.accountSubjectId ?? r.account_subject_id) : "__none__")}
                                onValueChange={(v) => {
                                  const current = (r.accountSubjectId ?? r.account_subject_id) ? String(r.accountSubjectId ?? r.account_subject_id) : "__none__"
                                  setPendingAccountSubjectByRowId((prev) => {
                                    if (v === current) { const n = { ...prev }; delete n[r.id]; return n }
                                    return { ...prev, [r.id]: v }
                                  })
                                }}
                                disabled={inlineSavingId === r.id}
                              >
                                <SelectTrigger className="h-8 min-w-0 flex-1 text-[10px] border-dashed">
                                  <SelectValue placeholder={inlineSavingId === r.id ? (t("loading") || "...") : (t("accountSubject") || "계정과목")} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">—</SelectItem>
                                  {accountSubjectOptions.map((a) => (
                                    <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {pendingAccountSubjectByRowId[r.id] !== undefined && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0 text-primary hover:bg-primary/10"
                                  onClick={() => handleInlineAccountSubjectChange(r, pendingAccountSubjectByRowId[r.id])}
                                  disabled={inlineSavingId === r.id}
                                  title={t("btnSave") || "저장"}
                                >
                                  <Save className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 align-top text-left text-sm whitespace-normal break-words min-w-[12rem] max-w-[min(85vw,_22rem)]">{formatMemo(r.memo || "")}</td>
                          <td className="px-3 py-2.5 text-center align-top text-xs text-muted-foreground max-w-[5.5rem] break-words" title={displayUser(r.user_name)}>{displayUser(r.user_name)}</td>
                          <td className="px-3 py-2.5 text-center w-9">
                            {r.receipt_url ? (
                              <button
                                type="button"
                                className="h-6 w-6 shrink-0 rounded border border-border bg-muted/50 hover:bg-muted flex items-center justify-center mx-auto text-muted-foreground"
                                onClick={() => setReceiptModalUrl(r.receipt_url!)}
                                title={t("pettyColReceipt") || "영수증"}
                                aria-label={t("pettyColReceipt") || "영수증"}
                              >
                                <Camera className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              "-"
                            )}
                          </td>
                          {renderPettyInvoiceCell(r)}
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex items-center justify-center gap-0.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-primary hover:bg-primary/10"
                                onClick={() => openEditModal(r)}
                                disabled={deletingMonthlyId === r.id || inlineSavingId === r.id}
                                title={t("emp_edit") || "수정"}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                onClick={() => void handleDeleteMonthlyRow(r)}
                                disabled={deletingMonthlyId === r.id || inlineSavingId === r.id}
                                title={t("delete") || "삭제"}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              </div>
            </TabsContent>
          </Tabs>

          {/* 수정 모달 - 월별 현황 조회 후 수정 */}
          <Dialog open={!!editModalItem} onOpenChange={(open) => !open && closeEditModal()}>
            <DialogContent className="max-w-sm sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t("emp_edit") || "수정"}</DialogTitle>
              </DialogHeader>
              {editModalItem && (
                <div className="flex flex-col gap-3 py-2">
                  <div>
                    <label className="text-xs text-muted-foreground">{t("pettyColDate") || "날짜"}</label>
                    <Input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="h-9 mt-1 text-xs" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("pettyColType") || "유형"}</label>
                    <Select value={editType} onValueChange={setEditType}>
                      <SelectTrigger className="h-9 mt-1 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="receive">{t("pettyTypeReceive")}</SelectItem>
                        <SelectItem value="expense">{t("pettyTypeExpense")}</SelectItem>
                        <SelectItem value="replenish">{t("pettyTypeReplenish")}</SelectItem>
                        <SelectItem value="settle">{t("pettyTypeSettle")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("pettyColAmount") || "금액"}</label>
                    <Input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} className="h-9 mt-1 text-xs" min={1} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("pettyColMemo") || "내용"}</label>
                    <Input type="text" value={editMemo} onChange={(e) => setEditMemo(e.target.value)} className="h-9 mt-1 text-xs" placeholder={t("pettyMemoPh") || "내용"} />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t("accountSubject") || "계정과목"} <span className="text-muted-foreground">({t("optional")})</span></label>
                    <Select value={editAccountSubjectId || "__none__"} onValueChange={(v) => setEditAccountSubjectId(v === "__none__" ? "" : v)}>
                      <SelectTrigger className="h-9 mt-1 text-xs">
                        <SelectValue placeholder={t("accountSubject") || "계정과목"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— {t("optional") || "선택안함"}</SelectItem>
                        {accountSubjectOptions.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.code} {asDisplayName(a)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-xs font-medium">
                      <Camera className="h-3.5 w-3.5" />
                      {t("pettyReceiptPhoto")} <span className="text-muted-foreground">({t("optional")})</span>
                    </label>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <input
                        ref={editReceiptCameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handleEditReceiptChange}
                        className="sr-only"
                      />
                      <input
                        ref={editReceiptFileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleEditReceiptChange}
                        className="sr-only"
                      />
                      <button
                        type="button"
                        onClick={() => editReceiptCameraInputRef.current?.click()}
                        className="rounded border border-input bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20"
                      >
                        {t("pettyReceiptTakePhoto")}
                      </button>
                      <button
                        type="button"
                        onClick={() => editReceiptFileInputRef.current?.click()}
                        className="rounded border border-input bg-muted/50 px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        {t("chooseFile")}
                      </button>
                      {editModalItem.receipt_url && !editReceiptFile && (
                        <span className="text-xs text-muted-foreground">{t("pettyColReceipt") || "영수증"} ✓</span>
                      )}
                      {editReceiptFile && (
                        <span className="text-xs text-muted-foreground truncate max-w-[120px]">{editReceiptFile.name}</span>
                      )}
                      {editReceiptPreview && (
                        <div className="relative shrink-0">
                          <img src={editReceiptPreview} alt="" className="h-10 w-10 object-cover rounded border" />
                        </div>
                      )}
                    </div>
                  </div>
                  {editType === "expense" ? (
                    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-3">
                      <p className="text-xs font-medium">{t("poInvoice") || "Invoice"} · PP30</p>
                      <div className="w-[100px]">
                        <Label className="text-xs text-muted-foreground">{t("expenseAccrualVat") || "VAT"}</Label>
                        <Input value={editVatAmount} onChange={(e) => setEditVatAmount(e.target.value.replace(/[^\d.,]/g, "").replace(/,/g, ""))} className="h-9 mt-1 text-xs" />
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox checked={editInvoiceReceived} onCheckedChange={(c) => setEditInvoiceReceived(c === true)} />
                        <span className="text-xs">{t("poInvoiceReceived") || "Invoice Received"}</span>
                      </label>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("wm_invoiceNoLabel") || "Invoice No."}</Label>
                        <Input value={editInvoiceNo} onChange={(e) => setEditInvoiceNo(e.target.value)} className="h-9 mt-1 text-xs" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">{t("bankInvoicePhotoUpload") || "Invoice Image"}</Label>
                        <Input type="file" accept="image/*" className="h-9 mt-1 text-xs" onChange={(e) => setEditInvoicePhotoFile(e.target.files?.[0] || null)} />
                        {editModalItem.invoicePhotoUrl && !editInvoicePhotoFile ? (
                          <span className="text-xs text-muted-foreground mt-1 block">{t("poInvoice") || "Invoice"} ✓</span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={closeEditModal}>
                  {t("cancel")}
                </Button>
                <Button size="sm" onClick={handleEditSave} disabled={editSaving}>
                  {editSaving ? (t("loading") || "저장중...") : (t("btnSave") || "저장")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* 영수증 사진 모달 - 출고 관리 order-tab imageModal과 동일한 구조 */}
      {receiptModalUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setReceiptModalUrl(null)}
        >
          <div className="relative max-w-[90vw] max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <ImageViewerWithRotate
              src={receiptModalUrl}
              alt={t("pettyColReceipt")}
              imgClassName="max-w-full max-h-[80vh] rounded-lg object-contain"
              rotateLeftLabel={t("imageRotateLeft") || "반시계"}
              rotateRightLabel={t("imageRotateRight") || "시계"}
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute -top-2 -right-2 rounded-full bg-black/50 text-white hover:bg-black/70"
              onClick={() => setReceiptModalUrl(null)}
              aria-label={t("cancel")}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
