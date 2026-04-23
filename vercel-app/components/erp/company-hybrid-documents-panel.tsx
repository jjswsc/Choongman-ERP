"use client"

import * as React from "react"
import {
  ArrowDownUp,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  FileStack,
  FileUp,
  Link2,
  Pencil,
  Trash2,
  ExternalLink,
  LayoutList,
  FilePlus,
  Tags,
} from "lucide-react"
import { useAuth, type AuthState } from "@/lib/auth-context"
import { useLang, type LangCode } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { isFranchiseeRole, isOfficeRole } from "@/lib/permissions"
import { storeMatches } from "@/lib/admin-employee-store-access"
import type { JwtPayload } from "@/lib/jwt-auth"
import { canAccessStoreForCompanyHybridDocs } from "@/lib/company-hybrid-documents-access"
import {
  useStoreList,
  getCompanyHybridDocuments,
  getCompanyHybridDocumentCategories,
  saveCompanyHybridDocument,
  saveCompanyHybridDocumentCategory,
  deleteCompanyHybridDocument,
  deleteCompanyHybridDocumentCategory,
  presignCompanyHybridDocumentUpload,
  completeCompanyHybridDocumentUpload,
  recordCompanyHybridDocumentView,
  type CompanyHybridDocumentListItem,
  type CompanyHybridDocumentCategory,
} from "@/lib/api-client"
import { putFileToSupabaseSignedUploadUrl } from "@/lib/storage-client-upload"
import { translateApiMessage } from "@/lib/translate-api-message"
import { appAlert, appConfirm } from "@/lib/app-message"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import {
  adminTabsContentCn,
  adminTabsIconCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { cn } from "@/lib/utils"
import {
  COMPANY_HYBRID_DOCS_STORE_ALL,
  COMPANY_HYBRID_RELATED_TYPES,
  isCompanyHybridDocsListAllStoresParam,
  type CompanyHybridRelatedType,
} from "@/lib/company-hybrid-documents"

const RELATED_OPTIONS: { value: CompanyHybridRelatedType; k: string }[] = [
  { value: "none", k: "companyHybridDocRelatedNone" },
  { value: "employee", k: "companyHybridDocRelatedEmployee" },
  { value: "store", k: "companyHybridDocRelatedStore" },
  { value: "interior_project", k: "companyHybridDocRelatedInterior" },
]

const FORM_CAT_NONE = "0"

type CompanyHybridDocumentsStoreFieldProps = {
  labelStore: string
  labelAllStores: string
  canPickStore: boolean
  storeSelectOptions: string[]
  selectedStore: string
  onStoreChange: (v: string) => void
  formatStoreLabel: (code: string) => string
}

function CompanyHybridDocumentsStoreField({
  labelStore,
  labelAllStores,
  canPickStore,
  storeSelectOptions,
  selectedStore,
  onStoreChange,
  formatStoreLabel,
}: CompanyHybridDocumentsStoreFieldProps) {
  return (
    <div className="min-w-[10rem] max-w-[14rem] shrink-0 space-y-1.5">
      <Label>{labelStore}</Label>
      {canPickStore && storeSelectOptions.length > 0 ? (
        <Select value={selectedStore} onValueChange={onStoreChange}>
          <SelectTrigger>
            <SelectValue placeholder="…" />
          </SelectTrigger>
          <SelectContent>
            {storeSelectOptions.map((s) => (
              <SelectItem key={s} value={s}>
                {isCompanyHybridDocsListAllStoresParam(s) ? labelAllStores : formatStoreLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-sm text-muted-foreground">
          {isCompanyHybridDocsListAllStoresParam(selectedStore)
            ? labelAllStores
            : selectedStore
              ? formatStoreLabel(selectedStore)
              : "—"}
        </p>
      )}
    </div>
  )
}

/** 유효 시작일(valid_from)을 목록의「발급 날짜」로 표시 */
function formatHybridDocumentIssueDate(raw: string | null | undefined, lang: LangCode): string {
  if (raw == null || String(raw).trim() === "") return "—"
  const s = String(raw).trim()
  const day = s.length >= 10 ? s.slice(0, 10) : ""
  const parse =
    day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? new Date(`${day}T12:00:00`) : new Date(s)
  if (Number.isNaN(parse.getTime())) return day || "—"
  const locale =
    lang === "ko"
      ? "ko-KR"
      : lang === "th"
        ? "th-TH"
        : lang === "mm"
          ? "my-MM"
          : lang === "la"
            ? "lo-LA"
            : lang === "kh"
              ? "km-KH"
              : lang === "vi"
                ? "vi-VN"
                : lang === "ms"
                  ? "ms-MY"
                  : "en-US"
  try {
    return parse.toLocaleDateString(locale)
  } catch {
    return day || "—"
  }
}

/**
 * 세션 만료(401): 클라이언트에 남은 store/user만 있고 서버는 거부하는 상태를 끊고,
 * 로그인 후 다시 이 화면으로 오도록 redirect를 붙임. (redirect 없이 /admin/login만 가면
 * LoginForm이 auth를 보고 기본 /admin 대시보드로 바로 튕김)
 */
function redirectToAdminLoginIfUnauthorized(
  httpStatus: number,
  setAuth: (auth: AuthState | null) => void
): boolean {
  if (httpStatus !== 401) return false
  if (typeof window === "undefined") return true
  setAuth(null)
  const here = `${window.location.pathname || "/admin"}${window.location.search || ""}`
  const q = new URLSearchParams()
  q.set("redirect", here.startsWith("/") ? here : "/admin/company-documents")
  window.location.assign(`/admin/login?${q.toString()}`)
  return true
}

function authToJwtPayload(auth: {
  store?: string
  user?: string
  role?: string
  allowedStores?: string[]
}): JwtPayload {
  return {
    store: String(auth.store || ""),
    name: String(auth.user || ""),
    role: String(auth.role || ""),
    allowedStores: auth.allowedStores,
  }
}

function relatedLabel(
  t: (k: string) => string,
  row: { related_type: string; related_id: string | null }
) {
  const f = RELATED_OPTIONS.find((o) => o.value === row.related_type)
  const name = f ? t(f.k) : row.related_type
  if (row.related_id) return `${name} · ${row.related_id}`
  return name
}

type MainTab = "list" | "register" | "categories"

export function CompanyHybridDocumentsPanel() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth, initialized, setAuth } = useAuth()
  const { stores, loading: storeLoading, formatStoreLabel, resolveStoreKey } = useStoreList()

  const [mainTab, setMainTab] = React.useState<MainTab>("list")
  const [selectedStore, setSelectedStore] = React.useState("")
  const [relatedType, setRelatedType] = React.useState<CompanyHybridRelatedType>("none")
  const [relatedIdFilter, setRelatedIdFilter] = React.useState("")

  const [listCategoryFilter, setListCategoryFilter] = React.useState("all")
  const [listTitleSearch, setListTitleSearch] = React.useState("")
  /** null = 등록일 최신순(서버 기본), asc/desc = 제목 정렬 */
  const [titleSort, setTitleSort] = React.useState<"asc" | "desc" | null>(null)

  const [list, setList] = React.useState<CompanyHybridDocumentListItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [categories, setCategories] = React.useState<CompanyHybridDocumentCategory[]>([])

  const [driveTitle, setDriveTitle] = React.useState("")
  const [formCategoryId, setFormCategoryId] = React.useState(FORM_CAT_NONE)
  const [externalUrl, setExternalUrl] = React.useState("")
  const [formRelatedType, setFormRelatedType] = React.useState<CompanyHybridRelatedType>("none")
  const [formRelatedId, setFormRelatedId] = React.useState("")
  const [validFrom, setValidFrom] = React.useState("")
  const [validTo, setValidTo] = React.useState("")
  const [note, setNote] = React.useState("")

  const [editing, setEditing] = React.useState<CompanyHybridDocumentListItem | null>(null)
  const [fileBusy, setFileBusy] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const [newCategoryName, setNewCategoryName] = React.useState("")
  const [newCategorySort, setNewCategorySort] = React.useState("0")
  const [editingCategory, setEditingCategory] = React.useState<{
    id: number
    name: string
    sort_order: number
    store: string
  } | null>(null)

  const categoryNameById = React.useMemo(() => {
    const m = new Map<number, string>()
    for (const c of categories) {
      m.set(c.id, c.name)
    }
    return m
  }, [categories])

  const labelForDocumentCategory = React.useCallback(
    (row: CompanyHybridDocumentListItem) => {
      if (row.category_id != null && categoryNameById.has(row.category_id)) {
        return categoryNameById.get(row.category_id) || "—"
      }
      if (row.doc_type) return row.doc_type
      return t("companyHybridDocCategoryFilterUncat")
    },
    [categoryNameById, t]
  )

  const visibleStores = React.useMemo(() => {
    const s = (stores || []).map((x) => resolveStoreKey(x))
    const unique = Array.from(new Set(s.filter(Boolean)))
    if (isOfficeRole(String(auth?.role || ""))) return unique
    if (isFranchiseeRole(String(auth?.role || "")) && auth?.allowedStores?.length) {
      const f = unique.filter((st) => auth.allowedStores!.some((a) => storeMatches(a, st)))
      return f.length > 0 ? f : (auth.allowedStores as string[]).filter(Boolean)
    }
    if (auth?.store) {
      const f = unique.filter((st) => storeMatches(String(auth.store), st))
      return f.length > 0 ? f : [String(auth.store).trim()]
    }
    return unique
  }, [stores, auth, resolveStoreKey])

  const storeSelectOptions = React.useMemo(
    () => [
      COMPANY_HYBRID_DOCS_STORE_ALL,
      ...visibleStores.filter((st) => st && !isCompanyHybridDocsListAllStoresParam(st)),
    ],
    [visibleStores]
  )

  /** 등록·업로드·카테고리 추가 시 사용할 단일 매장(전체 조회 중이면 JWT·목록에서 대표 매장) */
  const writeStoreForMutations = React.useMemo(() => {
    if (selectedStore && !isCompanyHybridDocsListAllStoresParam(selectedStore)) {
      return selectedStore.trim() || null
    }
    const st = String(auth?.store || "").trim()
    if (st) return st
    const first = visibleStores.find((x) => x && !isCompanyHybridDocsListAllStoresParam(x))
    return first || null
  }, [selectedStore, auth?.store, visibleStores])

  const canMutateDocStore = React.useCallback(
    (rowStore: string) => {
      if (!auth) return false
      return canAccessStoreForCompanyHybridDocs(authToJwtPayload(auth), String(rowStore || "").trim())
    },
    [auth]
  )

  React.useEffect(() => {
    if (storeLoading || !initialized) return
    if (selectedStore) return
    setSelectedStore(COMPANY_HYBRID_DOCS_STORE_ALL)
  }, [storeLoading, initialized, selectedStore])

  const loadCategories = React.useCallback(async () => {
    if (!initialized || !auth) {
      setCategories([])
      return
    }
    if (!selectedStore) {
      setCategories([])
      return
    }
    const res = await getCompanyHybridDocumentCategories({ store: selectedStore })
    if (redirectToAdminLoginIfUnauthorized(res.httpStatus, setAuth)) {
      setCategories([])
      return
    }
    if (!res.success) {
      if (res.message) void appAlert(translateApiMessage(String(res.message), (k) => t(k)))
      setCategories([])
      return
    }
    setCategories(res.list || [])
  }, [selectedStore, initialized, auth, t])

  React.useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  const load = React.useCallback(async () => {
    if (!initialized || !auth) return
    if (!selectedStore) return
    setLoading(true)
    try {
      const q: Parameters<typeof getCompanyHybridDocuments>[0] = { store: selectedStore }
      if (relatedType && relatedType !== "none") {
        q.relatedType = relatedType
        if (relatedIdFilter.trim()) {
          q.relatedId = relatedIdFilter.trim()
        }
      }
      q.categoryId = listCategoryFilter
      if (listTitleSearch.trim()) q.searchTitle = listTitleSearch.trim()
      if (titleSort) q.sortTitle = titleSort
      const res = await getCompanyHybridDocuments(q)
      if (redirectToAdminLoginIfUnauthorized(res.httpStatus, setAuth)) {
        setList([])
        return
      }
      if (!res.success) {
        if (res.message) void appAlert(translateApiMessage(String(res.message), (k) => t(k)))
        setList([])
        return
      }
      setList((res.list || []) as CompanyHybridDocumentListItem[])
    } catch (e) {
      void appAlert(e instanceof Error ? e.message : String(e))
      setList([])
    } finally {
      setLoading(false)
    }
  }, [
    selectedStore,
    relatedType,
    relatedIdFilter,
    listCategoryFilter,
    listTitleSearch,
    titleSort,
    t,
    initialized,
    auth,
    setAuth,
  ])

  React.useEffect(() => {
    if (mainTab === "list") {
      void load()
    }
  }, [load, mainTab])

  const resetForm = () => {
    setDriveTitle("")
    setFormCategoryId(FORM_CAT_NONE)
    setExternalUrl("")
    setFormRelatedType("none")
    setFormRelatedId("")
    setValidFrom("")
    setValidTo("")
    setNote("")
    setEditing(null)
  }

  const fillFrom = (row: CompanyHybridDocumentListItem) => {
    setDriveTitle(row.title)
    setFormCategoryId(
      row.category_id != null && row.category_id > 0
        ? String(row.category_id)
        : FORM_CAT_NONE
    )
    setExternalUrl(row.external_url || "")
    setFormRelatedType((row.related_type as CompanyHybridRelatedType) || "none")
    setFormRelatedId(row.related_id || "")
    setValidFrom(row.valid_from ? String(row.valid_from).slice(0, 10) : "")
    setValidTo(row.valid_to ? String(row.valid_to).slice(0, 10) : "")
    setNote(row.note || "")
    setEditing(row)
  }

  const buildCategoryIdPayload = () =>
    formCategoryId !== FORM_CAT_NONE ? Number(formCategoryId) : undefined

  const onSaveDrive = async () => {
    const ws = writeStoreForMutations
    if (!ws) {
      void appAlert(t("companyHybridDocPickStoreForRegister"))
      return
    }
    if (!driveTitle.trim()) {
      void appAlert(t("companyHybridDocTitle"))
      return
    }
    if (!externalUrl.trim()) {
      void appAlert(t("companyHybridDocExternalUrl"))
      return
    }
    const body: Record<string, unknown> = {
      store: ws,
      title: driveTitle.trim(),
      relatedType: formRelatedType,
      relatedId: formRelatedType === "none" ? "" : formRelatedId.trim(),
      source: "drive",
      externalUrl: externalUrl.trim(),
      validFrom: validFrom || undefined,
      validTo: validTo || undefined,
      note: note.trim() || undefined,
      categoryId: buildCategoryIdPayload(),
    }
    if (editing?.id) {
      body.id = editing.id
    }
    const res = await saveCompanyHybridDocument(body)
    if (!res.success) {
      if (redirectToAdminLoginIfUnauthorized(res.httpStatus, setAuth)) return
      void appAlert(translateApiMessage(String(res.message || "Error"), (k) => t(k)))
      return
    }
    resetForm()
    if (mainTab === "list") void load()
    else setMainTab("list")
  }

  const onDelete = async (row: CompanyHybridDocumentListItem) => {
    if (!(await appConfirm(String(row.title) + " — " + t("companyHybridDocDelete") + "?"))) return
    const res = await deleteCompanyHybridDocument({ id: row.id })
    if (!res.success) {
      if (redirectToAdminLoginIfUnauthorized(res.httpStatus, setAuth)) return
      void appAlert(translateApiMessage(String(res.message || "Error"), (k) => t(k)))
      return
    }
    if (editing?.id === row.id) resetForm()
    void load()
  }

  const onOpen = async (row: CompanyHybridDocumentListItem) => {
    const url = row.source === "drive" ? row.external_url : row.public_url
    if (!url) {
      void appAlert(t("companyHybridDocNoUrl"))
      return
    }
    const rec = await recordCompanyHybridDocumentView({ id: row.id })
    if (redirectToAdminLoginIfUnauthorized(rec.httpStatus, setAuth)) return
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const onPickFile: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ""
    const ws = writeStoreForMutations
    if (!f || !ws) return
    setFileBusy(true)
    try {
      if (!driveTitle.trim()) {
        void appAlert(t("companyHybridDocTitle"))
        return
      }
      const p = await presignCompanyHybridDocumentUpload({
        store: ws,
        fileName: f.name,
        contentType: f.type || "application/octet-stream",
        fileSize: f.size,
      })
      if (!p.success || !p.signedUrl || !p.storagePath) {
        if (redirectToAdminLoginIfUnauthorized(p.httpStatus, setAuth)) return
        void appAlert(translateApiMessage(String(p.message || "Error"), (k) => t(k)))
        return
      }
      const fileFor =
        f.type && f.type.length > 0 ? f : new File([f], f.name, { type: "application/octet-stream" })
      const put = await putFileToSupabaseSignedUploadUrl(p.signedUrl, fileFor, { timeoutMs: 600_000 })
      if (!put.ok) {
        const txt = await put.text().catch(() => "")
        void appAlert(txt || `Upload ${put.status}`)
        return
      }
      const mime = f.type && f.type.length > 0 ? f.type : "application/octet-stream"
      const done = await completeCompanyHybridDocumentUpload({
        store: ws,
        title: driveTitle.trim(),
        relatedType: formRelatedType,
        relatedId: formRelatedType === "none" ? "" : formRelatedId.trim(),
        note: note.trim() || undefined,
        validFrom: validFrom || undefined,
        validTo: validTo || undefined,
        fileName: f.name,
        fileSize: f.size,
        storagePath: p.storagePath,
        mime,
        categoryId: buildCategoryIdPayload(),
      })
      if (!done.success) {
        if (redirectToAdminLoginIfUnauthorized(done.httpStatus, setAuth)) return
        void appAlert(translateApiMessage(String(done.message || "Error"), (k) => t(k)))
        return
      }
      resetForm()
      if (mainTab === "list") void load()
      else setMainTab("list")
    } finally {
      setFileBusy(false)
    }
  }

  const onAddCategory = async () => {
    const ws = writeStoreForMutations
    if (!ws) {
      void appAlert(t("companyHybridDocPickStoreForRegister"))
      return
    }
    const name = newCategoryName.trim()
    if (!name) {
      void appAlert(t("companyHybridCategoryName"))
      return
    }
    const sortOrder = Math.floor(Number(newCategorySort) || 0)
    const res = await saveCompanyHybridDocumentCategory({
      store: ws,
      name,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    })
    if (!res.success) {
      if (redirectToAdminLoginIfUnauthorized(res.httpStatus, setAuth)) return
      void appAlert(translateApiMessage(String(res.message || "Error"), (k) => t(k)))
      return
    }
    setNewCategoryName("")
    setNewCategorySort("0")
    void loadCategories()
  }

  const onSaveEditingCategory = async () => {
    if (!editingCategory) return
    const name = editingCategory.name.trim()
    if (!name) {
      void appAlert(t("companyHybridCategoryName"))
      return
    }
    const sortOrder = Math.floor(editingCategory.sort_order)
    const res = await saveCompanyHybridDocumentCategory({
      id: editingCategory.id,
      store: editingCategory.store,
      name,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    })
    if (!res.success) {
      if (redirectToAdminLoginIfUnauthorized(res.httpStatus, setAuth)) return
      void appAlert(translateApiMessage(String(res.message || "Error"), (k) => t(k)))
      return
    }
    setEditingCategory(null)
    void loadCategories()
    if (listCategoryFilter === String(editingCategory.id)) void load()
  }

  const onDeleteCategory = async (row: CompanyHybridDocumentCategory) => {
    if (
      !(await appConfirm(
        String(row.name) + " — " + t("companyHybridCategoryDelete") + "?"
      ))
    ) {
      return
    }
    const res = await deleteCompanyHybridDocumentCategory({ id: row.id })
    if (!res.success) {
      if (redirectToAdminLoginIfUnauthorized(res.httpStatus, setAuth)) return
      void appAlert(translateApiMessage(String(res.message || "Error"), (k) => t(k)))
      return
    }
    if (editingCategory?.id === row.id) setEditingCategory(null)
    if (listCategoryFilter === String(row.id)) setListCategoryFilter("all")
    void loadCategories()
    void load()
  }

  const canPickStore = isOfficeRole(String(auth?.role || "")) || isFranchiseeRole(String(auth?.role || ""))

  return (
    <div className="space-y-4">
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as MainTab)} className={adminTabsRootCn}>
        <AdminTabsBarWithHelp>
          <TabsList className={adminTabsListRowCn}>
            <TabsTrigger value="list" className={adminTabsTriggerCn}>
              <LayoutList className={adminTabsIconCn} aria-hidden />
              {t("companyHybridDocTabList")}
            </TabsTrigger>
            <TabsTrigger value="register" className={adminTabsTriggerCn}>
              <FilePlus className={adminTabsIconCn} aria-hidden />
              {t("companyHybridDocTabRegister")}
            </TabsTrigger>
            <TabsTrigger value="categories" className={adminTabsTriggerCn}>
              <Tags className={adminTabsIconCn} aria-hidden />
              {t("companyHybridDocTabCategories")}
            </TabsTrigger>
          </TabsList>
        </AdminTabsBarWithHelp>

        <div className="mt-1 flex flex-wrap items-end gap-3 border-b border-border/40 pb-3">
          <CompanyHybridDocumentsStoreField
            labelStore={t("companyHybridDocFilterStore")}
            labelAllStores={t("companyHybridDocStoreAll")}
            canPickStore={canPickStore}
            storeSelectOptions={storeSelectOptions}
            selectedStore={selectedStore}
            formatStoreLabel={formatStoreLabel}
            onStoreChange={(v) => {
              setSelectedStore(v)
              setTitleSort(null)
              resetForm()
            }}
          />
        </div>

        <TabsContent value="list" className={cn(adminTabsContentCn, "space-y-4")}>
          <p className="text-sm text-muted-foreground">{t("companyHybridDocListFilterHint")}</p>
          <Card>
            <CardHeader className="py-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[150px] space-y-1.5">
                  <Label>{t("companyHybridDocColCategory")}</Label>
                  <Select value={listCategoryFilter} onValueChange={setListCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("companyHybridDocCategoryFilterAll")}</SelectItem>
                      <SelectItem value="uncategorized">
                        {t("companyHybridDocCategoryFilterUncat")}
                      </SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[200px] flex-1 space-y-1.5">
                  <Label>{t("companyHybridDocSearchTitle")}</Label>
                  <Input
                    value={listTitleSearch}
                    onChange={(e) => setListTitleSearch(e.target.value)}
                    placeholder="…"
                  />
                </div>
                <div className="min-w-[160px] space-y-1.5">
                  <Label>{t("companyHybridDocRelated")}</Label>
                  <Select
                    value={relatedType}
                    onValueChange={(v) => setRelatedType(v as CompanyHybridRelatedType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_HYBRID_RELATED_TYPES.map((rt) => {
                        const opt = RELATED_OPTIONS.find((o) => o.value === rt)
                        return (
                          <SelectItem key={rt} value={rt}>
                            {opt ? t(opt.k) : rt}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
                {relatedType !== "none" && (
                  <div className="min-w-[200px] flex-1 space-y-1.5">
                    <Label>{t("companyHybridDocFilterRelated")}</Label>
                    <Input
                      value={relatedIdFilter}
                      onChange={(e) => setRelatedIdFilter(e.target.value)}
                      placeholder={t("companyHybridDocRelatedIdPh")}
                    />
                  </div>
                )}
                <Button type="button" variant="secondary" onClick={() => void load()} disabled={loading}>
                  {t("stockBtnSearch")}
                </Button>
              </div>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileStack className="h-4 w-4" />
                {t("companyHybridDocListTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground">…</p>
              ) : list.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("companyHybridDocListEmpty")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">{t("companyHybridDocColStore")}</TableHead>
                        <TableHead
                          className="min-w-[8rem]"
                          aria-sort={
                            titleSort === "asc" ? "ascending" : titleSort === "desc" ? "descending" : undefined
                          }
                        >
                          <button
                            type="button"
                            className={cn(
                              "-mx-1 -my-0.5 inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-1 text-left font-medium",
                              "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            )}
                            onClick={() => {
                              setTitleSort((prev) => (prev === "asc" ? "desc" : "asc"))
                            }}
                            title={t("companyHybridDocTitleSortHint")}
                          >
                            <span className="truncate">{t("companyHybridDocColTitle")}</span>
                            {titleSort === "asc" ? (
                              <ArrowUpNarrowWide className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                            ) : titleSort === "desc" ? (
                              <ArrowDownWideNarrow className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                            ) : (
                              <ArrowDownUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-70" aria-hidden />
                            )}
                          </button>
                        </TableHead>
                        <TableHead>{t("companyHybridDocColCategory")}</TableHead>
                        <TableHead>{t("companyHybridDocSource")}</TableHead>
                        <TableHead>{t("companyHybridDocColRelated")}</TableHead>
                        <TableHead className="whitespace-nowrap">{t("companyHybridDocColIssued")}</TableHead>
                        <TableHead>{t("companyHybridDocColCreated")}</TableHead>
                        <TableHead className="text-right">{t("stockColAction")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map((row) => {
                        const canM = canMutateDocStore(row.store)
                        return (
                        <TableRow key={row.id}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatStoreLabel(row.store)}
                          </TableCell>
                          <TableCell className="font-medium">{row.title}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {labelForDocumentCategory(row)}
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "inline-flex rounded-md px-2 py-0.5 text-xs",
                                row.source === "drive" ? "bg-amber-500/15" : "bg-sky-500/15"
                              )}
                            >
                              {row.source === "drive"
                                ? t("companyHybridDocSourceDrive")
                                : t("companyHybridDocSourceStorage")}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {relatedLabel(t, row)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatHybridDocumentIssueDate(row.valid_from, lang)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex flex-wrap justify-end gap-1">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8"
                                onClick={() => void onOpen(row)}
                                title={t("companyHybridDocOpen")}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                              {row.source === "drive" && canM && (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    fillFrom(row)
                                    setMainTab("register")
                                  }}
                                  title={t("companyHybridDocEdit")}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {canM && (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => void onDelete(row)}
                                  title={t("companyHybridDocDelete")}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="register" className={adminTabsContentCn}>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("companyHybridDocRegisterTabHint")}
          </p>
          <Card className="mb-6">
            <CardHeader className="py-4">
              <CardTitle className="text-base">{t("companyHybridDocRegisterMetaTitle")}</CardTitle>
              <CardDescription>{t("companyHybridDocRegisterMetaSub")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>{t("companyHybridDocTitle")}</Label>
                <Input value={driveTitle} onChange={(e) => setDriveTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("companyHybridDocCategorySelect")}</Label>
                <Select
                  value={formCategoryId}
                  onValueChange={setFormCategoryId}
                  disabled={!selectedStore}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FORM_CAT_NONE}>
                      {t("companyHybridDocCategoryFilterUncat")}
                    </SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={`${c.store}-${c.id}`} value={String(c.id)}>
                        {isCompanyHybridDocsListAllStoresParam(selectedStore)
                          ? `${formatStoreLabel(c.store)} · ${c.name}`
                          : c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("companyHybridDocRelated")}</Label>
                  <Select
                    value={formRelatedType}
                    onValueChange={(v) => {
                      setFormRelatedType(v as CompanyHybridRelatedType)
                      if (v === "none") setFormRelatedId("")
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_HYBRID_RELATED_TYPES.map((rt) => {
                        const opt = RELATED_OPTIONS.find((o) => o.value === rt)
                        return (
                          <SelectItem key={rt} value={rt}>
                            {opt ? t(opt.k) : rt}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
                {formRelatedType !== "none" && (
                  <div className="space-y-1.5">
                    <Label>{t("companyHybridDocFilterRelated")}</Label>
                    <Input
                      value={formRelatedId}
                      onChange={(e) => setFormRelatedId(e.target.value)}
                      placeholder={t("companyHybridDocRelatedIdPh")}
                    />
                  </div>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("companyHybridDocValidFrom")}</Label>
                  <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("companyHybridDocValidTo")}</Label>
                  <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t("companyHybridDocNote")}</Label>
                <Input value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Link2 className="h-4 w-4" />
                  {t("companyHybridDocAddDrive")}
                </CardTitle>
                <CardDescription>{t("companyHybridDocExternalUrl")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>{t("companyHybridDocExternalUrl")}</Label>
                  <Input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={() => void onSaveDrive()} disabled={!writeStoreForMutations}>
                    {editing && editing.source === "drive" ? t("companyHybridDocSave") : t("companyHybridDocAddDrive")}
                  </Button>
                  {editing && (
                    <Button type="button" variant="outline" onClick={resetForm}>
                      {t("companyHybridDocCancel")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileUp className="h-4 w-4" />
                  {t("companyHybridDocUpload")}
                </CardTitle>
                <CardDescription>{t("companyHybridDocUploadTypes")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{t("companyHybridDocUploadFormHint")}</p>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx,.csv,.txt"
                  onChange={onPickFile}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!writeStoreForMutations || fileBusy}
                  onClick={() => fileRef.current?.click()}
                >
                  {fileBusy ? t("companyHybridDocUploading") : t("companyHybridDocSelectFile")}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="categories" className={cn(adminTabsContentCn, "space-y-4")}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("companyHybridCategoryManageTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex max-w-2xl flex-col gap-2 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label>{t("companyHybridCategoryNew")}</Label>
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder={t("companyHybridCategoryName")}
                    disabled={!writeStoreForMutations}
                  />
                </div>
                <div className="w-28 space-y-1.5">
                  <Label>{t("companyHybridCategorySort")}</Label>
                  <Input
                    type="number"
                    value={newCategorySort}
                    onChange={(e) => setNewCategorySort(e.target.value)}
                    disabled={!writeStoreForMutations}
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => void onAddCategory()}
                  disabled={!writeStoreForMutations}
                >
                  {t("companyHybridCategoryAdd")}
                </Button>
              </div>

              {editingCategory && (
                <div
                  className="flex max-w-2xl flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-end"
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label>{t("companyHybridCategoryEditing")}</Label>
                    <Input
                      value={editingCategory.name}
                      onChange={(e) =>
                        setEditingCategory((prev) => (prev ? { ...prev, name: e.target.value } : null))
                      }
                    />
                  </div>
                  <div className="w-28 space-y-1.5">
                    <Label>{t("companyHybridCategorySort")}</Label>
                    <Input
                      type="number"
                      value={editingCategory.sort_order}
                      onChange={(e) => {
                        const n = Math.floor(Number(e.target.value) || 0)
                        setEditingCategory((prev) => (prev ? { ...prev, sort_order: n } : null))
                      }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" onClick={() => void onSaveEditingCategory()}>
                      {t("companyHybridCategorySave")}
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setEditingCategory(null)}>
                      {t("companyHybridDocCancel")}
                    </Button>
                  </div>
                </div>
              )}

              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("companyHybridCategoryEmpty")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">{t("companyHybridCategorySort")}</TableHead>
                        <TableHead className="whitespace-nowrap">{t("companyHybridDocColStore")}</TableHead>
                        <TableHead>{t("companyHybridCategoryName")}</TableHead>
                        <TableHead className="text-right">{t("stockColAction")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categories.map((c) => {
                        const canCat = canMutateDocStore(c.store)
                        return (
                        <TableRow key={`${c.store}-${c.id}`}>
                          <TableCell className="text-muted-foreground">{c.sort_order}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatStoreLabel(c.store)}
                          </TableCell>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex flex-wrap justify-end gap-1">
                              {canCat && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setEditingCategory({
                                      id: c.id,
                                      name: c.name,
                                      sort_order: c.sort_order,
                                      store: c.store,
                                    })
                                  }
                                >
                                  {t("companyHybridCategoryEdit")}
                                </Button>
                              )}
                              {canCat && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => void onDeleteCategory(c)}
                                >
                                  {t("companyHybridCategoryDelete")}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
