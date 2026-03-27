"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { Search, Plus, Camera, Download, Pencil, Save, Trash2 } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import {
  getPettyCashOptions,
  getPettyCashList,
  getPettyCashMonthDetail,
  addPettyCashTransaction,
  updatePettyCashTransaction,
  deletePettyCashTransaction,
  translateTexts,
  getAccountSubjects,
  type PettyCashItem,
  type AccountSubjectItem,
} from "@/lib/api-client"
import { compressImageForUpload } from "@/lib/utils"
import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"
import { ListPaginationBar } from "@/components/list-pagination-bar"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

const typeKeys: Record<string, string> = {
  receive: "pettyTypeReceive",
  expense: "pettyTypeExpense",
  replenish: "pettyTypeReplenish",
  settle: "pettyTypeSettle",
}

export function PettyCashTab({ showAccountSubjectEmptyFilter = false }: { showAccountSubjectEmptyFilter?: boolean } = {}) {
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
  const [monthlyYm, setMonthlyYm] = useState(() => {
    const n = new Date()
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0")
  })
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
  const [addSaving, setAddSaving] = useState(false)
  const [receiptModalUrl, setReceiptModalUrl] = useState<string | null>(null)
  const [memoTransMap, setMemoTransMap] = useState<Record<string, string>>({})
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
  const [editSaving, setEditSaving] = useState(false)
  const [deletingMonthlyId, setDeletingMonthlyId] = useState<number | null>(null)
  const editReceiptFileInputRef = useRef<HTMLInputElement>(null)
  const editReceiptCameraInputRef = useRef<HTMLInputElement>(null)

  const canSearchAll = isOfficeRole(auth?.role || "")
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

  // 내용(memo) 로그인 언어로 번역
  useEffect(() => {
    const items = [...listData, ...monthlyData]
    const memos = [...new Set(items.map((r) => (r.memo || "").trim()).filter(Boolean))]
    if (memos.length === 0) {
      setMemoTransMap({})
      return
    }
    let cancelled = false
    translateTexts(memos, lang)
      .then((translated) => {
        if (cancelled) return
        const map: Record<string, string> = {}
        memos.forEach((m, i) => {
          map[m] = translated[i] ?? m
        })
        setMemoTransMap(map)
      })
      .catch(() => setMemoTransMap({}))
    return () => { cancelled = true }
  }, [listData, monthlyData, lang])

  const getMemo = (memo: string) => (memo && memoTransMap[memo]) || memo || "-"
  const filteredListData = filterAccountSubjectEmpty
    ? listData.filter((r) => (r.accountSubjectId ?? r.account_subject_id) == null || (r.accountSubjectId ?? r.account_subject_id) === 0)
    : listData
  const filteredMonthlyData = filterAccountSubjectEmpty
    ? monthlyData.filter((r) => (r.accountSubjectId ?? r.account_subject_id) == null || (r.accountSubjectId ?? r.account_subject_id) === 0)
    : monthlyData
  const formatStoreLabel = (store: string) =>
    store.startsWith("Office-") ? `${t("pettyScopeOffice") || "본사"} (${store.slice(7)})` : store

  const loadList = (page?: number) => {
    if (!auth?.store) return
    const p = page ?? listPage
    setListLoading(true)
    getPettyCashList({
      startStr: listStart,
      endStr: listEnd,
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

  const loadMonthly = () => {
    if (!auth?.store) return
    setMonthlyLoading(true)
    getPettyCashMonthDetail({
      yearMonth: monthlyYm,
      startStr: monthlySearchMode === "period" ? monthlyPeriodStart : undefined,
      endStr: monthlySearchMode === "period" ? monthlyPeriodEnd : undefined,
      scopeFilter: canSearchAll ? monthlyScope : undefined,
      storeFilter: monthlyScope === "store" && monthlyStore !== "All" ? monthlyStore : undefined,
      departmentFilter: monthlyScope === "office" && monthlyDepartment !== "All" ? monthlyDepartment : undefined,
      userStore: auth.store,
      userRole: auth.role,
    })
      .then((data) => {
        setMonthlyData(data)
        setPendingAccountSubjectByRowId({})
      })
      .catch(() => setMonthlyData([]))
      .finally(() => setMonthlyLoading(false))
  }

  const monthlyYmOptions = Array.from({ length: 24 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    return { value: y + "-" + String(m).padStart(2, "0"), label: y + "년 " + m + "월" }
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
      await appAlert(addTargetType === "office" ? (t("pettySelectDepartment") || "부서를 선택하세요.") : t("pettyAlertStore"))
      return
    }
    const amt = parseInt(addAmount, 10) || 0
    if (amt <= 0) {
      await appAlert(t("pettyAlertAmount"))
      return
    }
    setAddSaving(true)
    let receiptUrl: string | undefined
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
    const res = await addPettyCashTransaction({
      store,
      transDate: addDate,
      transType: addType,
      amount: amt,
      memo: addMemo,
      receiptUrl,
      accountSubjectId: addAccountSubjectId ? Number(addAccountSubjectId) : null,
      userName: auth.user,
      userStore: auth.store,
      userRole: auth.role,
    })
    setAddSaving(false)
    if (res.success) {
      setAddAmount("")
      setAddMemo("")
      setAddAccountSubjectId("")
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
        await appAlert(translateApiMessage(res.message, t) || t("msg_modify_fail") || "수정 실패")
      }
    } catch {
      await appAlert(t("msg_modify_fail") || "수정 실패")
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
    const res = await updatePettyCashTransaction({
      id: editModalItem.id,
      transDate: editDate,
      transType: editType,
      amount: amt,
      memo: editMemo,
      receiptUrl: receiptUrl,
      accountSubjectId: editAccountSubjectId ? Number(editAccountSubjectId) : null,
      userStore: auth.store,
      userRole: auth.role,
    })
    setEditSaving(false)
    if (res.success) {
      loadMonthly()
      loadList()
      closeEditModal()
      await appAlert(t("msg_updated") || "수정되었습니다.")
    } else {
      await appAlert(translateApiMessage(res.message, t) || t("msg_modify_fail") || "수정 실패")
    }
  }

  const handleDeleteMonthlyRow = async (r: PettyCashItem) => {
    if (!auth?.store) return
    const ok = await appConfirm(t("pettyDeleteConfirm") || "이 내역을 삭제하시겠습니까?")
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
        await appAlert(t("pettyDeleted") || t("delete") || "삭제되었습니다.")
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || t("processFail") || "실패")
      }
    } catch {
      await appAlert(t("processFail") || "실패")
    } finally {
      setDeletingMonthlyId(null)
    }
  }

  const fmt = (n: number) => (n || 0).toLocaleString()

  const downloadMonthlyExcel = () => {
    if (monthlyData.length === 0) return
    const escapeXml = (s: string) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
    const cols = [
      t("pettyColDate") || "날짜",
      t("store") || "매장",
      t("pettyColType") || "유형",
      t("pettyColAmount") || "금액",
      t("pettyColBalance") || "잔액",
      t("accountSubject") || "계정과목",
      t("pettyColMemo") || "내용",
      t("pettyColUser") || "등록자",
    ]
    const storeLabel = monthlyScope === "office"
      ? (monthlyDepartment === "All" ? `${t("pettyScopeOffice") || "본사"} ${t("all") || "전체"}` : `${t("pettyScopeOffice") || "본사"} (${monthlyDepartment})`)
      : (monthlyStore === "All" ? t("all") || "전체" : monthlyStore)
    const rows: string[][] = [
      [t("pettyTabMonthly") || "월별 현황", "", "", "", "", "", "", ""],
      [t("pettyYearMonth") || "기간", monthlyYm, "", "", "", "", "", ""],
      [t("store") || "매장", storeLabel, "", "", "", "", "", ""],
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
      <Card className="shadow-sm">
        <CardContent className="pt-6">
          <Tabs defaultValue="list" className="w-full">
            <div className={adminTabsBarCn}>
              <div className={adminTabsScrollCn}>
                <TabsList className={adminTabsListRowCn}>
                  <TabsTrigger value="list" className={adminTabsTriggerCn}>
                    {t("pettyTabList")}
                  </TabsTrigger>
                  <TabsTrigger value="monthly" className={adminTabsTriggerCn}>
                    {t("pettyTabMonthly")}
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            <TabsContent value="list" className={cn("space-y-3", adminTabsContentFlushCn)}>
              <div className="flex flex-nowrap items-center gap-1.5 sm:flex-wrap sm:gap-2">
                {canSearchAll && (
                  <Select value={listScope} onValueChange={(v) => { setListScope(v as "store" | "office"); setListStore("All"); setListDepartment("All"); }}>
                    <SelectTrigger className="h-9 min-w-0 flex-1 shrink text-xs sm:min-w-[70px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="store">{t("pettyScopeStore") || "매장"}</SelectItem>
                      <SelectItem value="office">{t("pettyScopeOffice") || "본사"}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {listScope === "store" ? (
                  <Select value={listStore} onValueChange={setListStore}>
                    <SelectTrigger className="h-9 min-w-0 flex-1 shrink text-xs sm:min-w-[80px]">
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
                    <SelectTrigger className="h-9 min-w-0 flex-1 shrink text-xs sm:min-w-[80px]">
                      <SelectValue placeholder={t("pettySelectDepartment")} />
                    </SelectTrigger>
                    <SelectContent>
                      {officeDepartments.map((d) => (
                        <SelectItem key={d} value={d}>{d === "All" ? (t("all") || "전체") : d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Input type="date" value={listStart} onChange={(e) => setListStart(e.target.value)} className="date-input-compact date-input-mobile-shrink h-9 min-w-0 flex-1 text-xs sm:min-w-[90px]" />
                <Input type="date" value={listEnd} onChange={(e) => setListEnd(e.target.value)} className="date-input-compact date-input-mobile-shrink h-9 min-w-0 flex-1 text-xs sm:min-w-[90px]" />
                {showAccountSubjectEmptyFilter && (
                  <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                    <input type="checkbox" checked={filterAccountSubjectEmpty} onChange={(e) => setFilterAccountSubjectEmpty(e.target.checked)} className="rounded" />
                    <span className="text-xs whitespace-nowrap">{t("bankFilterAccountSubjectEmpty") || "계정과목 미입력만"}</span>
                  </label>
                )}
                <Button size="sm" className="h-9 shrink-0 px-2.5 text-xs sm:px-3" onClick={() => loadList(1)} disabled={listLoading}>
                  <Search className="mr-1 h-3.5 w-3.5" />
                  {listLoading ? (t("loading") || "불러오는 중") : (t("search") || "검색")}
                </Button>
              </div>
              <div className="rounded-lg border border-border/60 max-h-[240px] overflow-x-auto overflow-y-auto">
                {filteredListData.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">{listData.length === 0 ? (t("pettyNoData") || "데이터가 없습니다") : (t("bankNoMatchFilter") || "조건에 맞는 데이터가 없습니다.")}</p>
                ) : (
                  <table className={cn("w-full text-xs table-fixed", canSearchAll ? "min-w-[420px]" : "min-w-[360px]")}>
                    <colgroup>
                      <col style={{ width: "92px" }} />
                      {canSearchAll && <col style={{ width: "88px" }} />}
                      <col style={{ width: "42px" }} />
                      <col style={{ width: "64px" }} />
                      <col />
                      <col style={{ width: "100px" }} />
                      <col style={{ width: "36px" }} />
                    </colgroup>
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="p-2 text-center">{t("pettyColDate") || "날짜"}</th>
                        {canSearchAll && <th className="p-2 text-center">{t("store") || "매장"}</th>}
                        <th className="p-2 text-center">{t("pettyColType") || "유형"}</th>
                        <th className="p-2 text-center">{t("pettyColAmount") || "금액"}</th>
                        <th className="p-2 text-center">{t("pettyColMemo") || "내용"}</th>
                        <th className="p-2 text-center">{t("pettyColUser") || "등록자"}</th>
                        <th className="p-2 text-center whitespace-nowrap">{t("pettyColReceipt") || "영수증"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredListData.map((r) => (
                        <tr key={r.id} className="border-t border-border/40">
                          <td className="p-2 text-center">{r.trans_date}</td>
                          {canSearchAll && <td className="p-2 text-center truncate text-xs">{formatStoreLabel(r.store)}</td>}
                          <td className="p-2 text-center truncate">{t(typeKeys[r.trans_type] || r.trans_type) || r.trans_type}</td>
                          <td className={`p-2 text-center ${r.amount < 0 ? "text-destructive" : "text-green-600"}`}>
                            {r.amount >= 0 ? "" : "-"}
                            {fmt(Math.abs(r.amount))}
                          </td>
                          <td className="p-2 text-center truncate" title={getMemo(r.memo || "")}>{getMemo(r.memo || "")}</td>
                          <td className="p-2 text-center text-xs text-muted-foreground truncate" title={r.user_name || "-"}>{r.user_name || "-"}</td>
                          <td className="p-2 text-center w-9">
                            {r.receipt_url ? (
                              <button
                                type="button"
                                className="h-6 w-6 shrink-0 rounded border border-border bg-muted/50 hover:bg-muted text-[10px] flex items-center justify-center mx-auto"
                                onClick={() => setReceiptModalUrl(r.receipt_url!)}
                                title={t("pettyColReceipt") || "영수증"}
                              >
                                📷
                              </button>
                            ) : (
                              "-"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <ListPaginationBar
                className="mt-2"
                page={listPage}
                pageSize={listPageSize}
                total={listTotal}
                onPageChange={(pg) => loadList(pg)}
                disabled={listLoading}
              />

              <div className="border-t pt-3 mt-3">
                <p className="text-sm font-medium mb-2">{t("pettyAddTitle") || "등록"}</p>
                <div className="flex flex-col gap-2">
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
                  <Button className="h-10 w-full font-medium" onClick={handleAdd} disabled={addSaving}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    {addSaving ? (t("loading") || "저장중...") : (t("btnSave") || "저장")}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="monthly" className={cn("space-y-3", adminTabsContentFlushCn)}>
              <div className="flex flex-nowrap items-center gap-1.5 sm:flex-wrap sm:gap-2">
                {canSearchAll && (
                  <Select value={monthlyScope} onValueChange={(v) => { setMonthlyScope(v as "store" | "office"); setMonthlyStore("All"); setMonthlyDepartment("All"); }}>
                    <SelectTrigger className="h-9 min-w-0 flex-1 shrink text-xs sm:min-w-[70px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="store">{t("pettyScopeStore") || "매장"}</SelectItem>
                      <SelectItem value="office">{t("pettyScopeOffice") || "본사"}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {monthlyScope === "store" ? (
                  <Select value={monthlyStore} onValueChange={setMonthlyStore}>
                    <SelectTrigger className="h-9 min-w-0 flex-1 shrink text-xs sm:min-w-[80px]">
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
                    <SelectTrigger className="h-9 min-w-0 flex-1 shrink text-xs sm:min-w-[80px]">
                      <SelectValue placeholder={t("pettySelectDepartment")} />
                    </SelectTrigger>
                    <SelectContent>
                      {officeDepartments.map((d) => (
                        <SelectItem key={d} value={d}>{d === "All" ? (t("all") || "전체") : d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Select value={monthlySearchMode} onValueChange={(v) => setMonthlySearchMode(v as "month" | "period")}>
                  <SelectTrigger className="h-9 min-w-0 flex-1 shrink text-xs sm:min-w-[70px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">{t("pettySearchByMonth") || "월별"}</SelectItem>
                    <SelectItem value="period">{t("pettySearchByPeriod") || "기간별"}</SelectItem>
                  </SelectContent>
                </Select>
                {monthlySearchMode === "month" ? (
                  <Select value={monthlyYm} onValueChange={setMonthlyYm}>
                    <SelectTrigger className="h-9 min-w-0 flex-1 shrink text-xs sm:min-w-[100px]">
                      <SelectValue placeholder={t("pettyYearMonth") || "연월"} />
                    </SelectTrigger>
                    <SelectContent>
                      {monthlyYmOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <>
                    <Input type="date" value={monthlyPeriodStart} onChange={(e) => setMonthlyPeriodStart(e.target.value)} className="date-input-compact h-9 min-w-0 flex-1 text-xs sm:min-w-[90px]" />
                    <span className="text-xs text-muted-foreground shrink-0">~</span>
                    <Input type="date" value={monthlyPeriodEnd} onChange={(e) => setMonthlyPeriodEnd(e.target.value)} className="date-input-compact h-9 min-w-0 flex-1 text-xs sm:min-w-[90px]" />
                  </>
                )}
                {showAccountSubjectEmptyFilter && (
                  <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                    <input type="checkbox" checked={filterAccountSubjectEmpty} onChange={(e) => setFilterAccountSubjectEmpty(e.target.checked)} className="rounded" />
                    <span className="text-xs whitespace-nowrap">{t("bankFilterAccountSubjectEmpty") || "계정과목 미입력만"}</span>
                  </label>
                )}
                <Button size="sm" className="h-9 shrink-0 px-2.5 text-xs sm:px-3" onClick={loadMonthly} disabled={monthlyLoading}>
                  <Search className="mr-1 h-3.5 w-3.5" />
                  {monthlyLoading ? (t("loading") || "불러오는 중") : (t("search") || "검색")}
                </Button>
                <Button size="sm" variant="outline" className="h-9 shrink-0 px-2.5 text-xs sm:px-3" onClick={downloadMonthlyExcel} disabled={filteredMonthlyData.length === 0} title={t("pettyExcelHint") || ""}>
                  <Download className="mr-1 h-3.5 w-3.5" />
                  {t("excelBtn") || "Excel"}
                </Button>
              </div>
              <div className="rounded-lg border border-border/60 max-h-[320px] overflow-x-auto overflow-y-auto">
                {filteredMonthlyData.length === 0 ? (
                  <p className="py-6 text-center text-xs text-muted-foreground">{monthlyData.length === 0 ? (t("pettyNoData") || "데이터가 없습니다") : (t("bankNoMatchFilter") || "조건에 맞는 데이터가 없습니다.")}</p>
                ) : (
                  <table className="w-full text-xs table-fixed min-w-[620px]">
                    <colgroup>
                      <col style={{ width: "92px" }} />
                      <col style={{ width: "88px" }} />
                      <col style={{ width: "42px" }} />
                      <col style={{ width: "64px" }} />
                      <col style={{ width: "72px" }} />
                      <col style={{ width: "100px" }} />
                      <col />
                      <col style={{ width: "100px" }} />
                      <col style={{ width: "36px" }} />
                      <col style={{ width: "72px" }} />
                    </colgroup>
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="p-2 text-center">{t("pettyColDate") || "날짜"}</th>
                        <th className="p-2 text-center">{t("store") || "매장"}</th>
                        <th className="p-2 text-center">{t("pettyColType") || "유형"}</th>
                        <th className="p-2 text-center">{t("pettyColAmount") || "금액"}</th>
                        <th className="p-2 text-center font-medium">{t("pettyColBalance") || "잔액"}</th>
                        <th className="p-2 text-center">{t("accountSubject") || "계정과목"}</th>
                        <th className="p-2 text-center">{t("pettyColMemo") || "내용"}</th>
                        <th className="p-2 text-center">{t("pettyColUser") || "등록자"}</th>
                        <th className="p-2 text-center whitespace-nowrap">{t("pettyColReceipt") || "영수증"}</th>
                        <th className="p-2 text-center whitespace-nowrap">{t("pettyColActions") || "수정·삭제"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMonthlyData.map((r) => (
                        <tr key={r.id} className="border-t border-border/40">
                          <td className="p-2 text-center">{r.trans_date}</td>
                          <td className="p-2 text-center truncate">{formatStoreLabel(r.store)}</td>
                          <td className="p-2 text-center truncate">{t(typeKeys[r.trans_type] || r.trans_type) || r.trans_type}</td>
                          <td className={`p-2 text-center ${r.amount < 0 ? "text-destructive" : "text-green-600"}`}>
                            {r.amount >= 0 ? "" : "-"}
                            {fmt(Math.abs(r.amount))}
                          </td>
                          <td className="p-2 text-center font-medium">{fmt(r.balance_after ?? 0)}</td>
                          <td className="p-2" onClick={(e) => e.stopPropagation()}>
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
                          <td className="p-2 text-center truncate" title={getMemo(r.memo || "")}>{getMemo(r.memo || "")}</td>
                          <td className="p-2 text-center text-xs text-muted-foreground truncate" title={r.user_name || "-"}>{r.user_name || "-"}</td>
                          <td className="p-2 text-center w-9">
                            {r.receipt_url ? (
                              <button
                                type="button"
                                className="h-6 w-6 shrink-0 rounded border border-border bg-muted/50 hover:bg-muted text-[10px] flex items-center justify-center mx-auto"
                                onClick={() => setReceiptModalUrl(r.receipt_url!)}
                                title={t("pettyColReceipt") || "영수증"}
                              >
                                📷
                              </button>
                            ) : (
                              "-"
                            )}
                          </td>
                          <td className="p-2 text-center">
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
            >
              ✕
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
