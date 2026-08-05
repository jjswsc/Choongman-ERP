"use client"

import * as React from "react"
import { AlertTriangle, ChevronDown, FilePlus, FileStack, LayoutList, Mail, Tags } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { isFranchiseeRole, isOfficeRole } from "@/lib/permissions"
import { storeMatches } from "@/lib/admin-employee-store-access"
import { canAccessStoreForCompanyHybridDocs } from "@/lib/company-hybrid-documents-access"
import {
  useStoreList,
  getCompanyHybridDocuments,
  getCompanyHybridDocumentCategories,
  getCompanyHybridDocumentsSummary,
  saveCompanyHybridDocument,
  deleteCompanyHybridDocument,
  presignCompanyHybridDocumentUpload,
  completeCompanyHybridDocumentUpload,
  recordCompanyHybridDocumentView,
  type CompanyHybridDocumentListItem,
  type CompanyHybridDocumentCategory,
  type CompanyHybridDocumentsSummary,
} from "@/lib/api-client"
import { putFileToSupabaseSignedUploadUrl } from "@/lib/storage-client-upload"
import { translateApiMessage } from "@/lib/translate-api-message"
import { appAlert, appConfirm } from "@/lib/app-message"
import {
  COMPANY_HYBRID_DOCS_STORE_ALL,
  COMPANY_HYBRID_DOC_CATEGORY_GLOBAL_STORE,
  companyHybridDocVisibilityFromDocType,
  isCompanyHybridDocTypePermissionMeta,
  isCompanyHybridDocsListAllStoresParam,
  pickCompanyHybridDocCategoriesForPicker,
  sortCompanyHybridDocCategoriesTree,
  formatCompanyHybridDocDateForInput,
  parseCompanyHybridDocDate,
  type CompanyHybridDocVisibility,
} from "@/lib/company-hybrid-documents"
import type { CompanyHybridRelatedType } from "@/lib/company-hybrid-documents"
import {
  documentHasCorrespondence,
  getCorrespondenceFromMetadata,
} from "@/lib/company-hybrid-correspondence"
import { labelCompanyHybridRelatedType } from "@/lib/company-hybrid-documents-related"
import {
  buildCompanyHybridDocumentsCsv,
  downloadCompanyHybridDocumentsCsv,
} from "@/lib/company-hybrid-documents-export"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
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
import { CompanyHybridDocumentKpiCards } from "@/components/erp/company-hybrid-documents/document-kpi-cards"
import {
  CompanyHybridDocumentFilterChips,
  type ActiveFilterChip,
} from "@/components/erp/company-hybrid-documents/document-filter-chips"
import { CompanyHybridDocumentListSkeleton } from "@/components/erp/company-hybrid-documents/document-list-skeleton"
import { CompanyHybridDocumentListTable } from "@/components/erp/company-hybrid-documents/document-list-table"
import { CompanyHybridDocumentDetailSheet } from "@/components/erp/company-hybrid-documents/document-detail-sheet"
import { CompanyHybridDocumentWatermarkDialog } from "@/components/erp/company-hybrid-documents/document-watermark-dialog"
import {
  CompanyHybridDocumentRegisterSheet,
  type RegisterFormState,
} from "@/components/erp/company-hybrid-documents/document-register-sheet"
import type { CorrespondenceFormState } from "@/components/erp/company-hybrid-documents/document-correspondence-fields"
import { CompanyHybridDocumentCategoryTab } from "@/components/erp/company-hybrid-documents/document-category-tab"
import {
  authToJwtPayload,
  COMPANY_HYBRID_DOC_FILTER_STORAGE_KEY,
  COMPANY_HYBRID_DOC_PAGE_SIZE,
  FORM_CAT_NONE,
  LIST_CORR_SELECT_NONE,
  redirectToAdminLoginIfUnauthorized,
  type CorrespondencePresence,
  type MainTab,
} from "@/components/erp/company-hybrid-documents/shared"

type ExpiryFilter = "all" | "expiring_soon" | "expired" | "no_expiry"
type SourceFilter = "all" | "drive" | "supabase"
type VisibilityFilter = "all" | "office" | "store_admin"

type StoredListFilters = {
  listCategoryFilter?: string
  listTitleSearch?: string
  listExpiryFilter?: ExpiryFilter
  listSourceFilter?: SourceFilter
  listVisibilityFilter?: VisibilityFilter
  listCorrPresence?: CorrespondencePresence
  listCorrDirection?: "" | "outbound" | "inbound"
  listCorrStatus?: "" | "draft" | "sent" | "filed" | "replied"
  listCorrCounterpartySearch?: string
}

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

function defaultCorrespondenceForm(): CorrespondenceFormState {
  return {
    direction: "",
    counterparty: "",
    officialRef: "",
    status: "",
    replyDue: "",
    channel: "",
  }
}

function defaultRegisterForm(store: string): RegisterFormState {
  return {
    title: "",
    categoryId: FORM_CAT_NONE,
    externalUrl: "",
    visibility: "all",
    validFrom: "",
    validTo: "",
    note: "",
    relatedType: "none",
    relatedId: "",
    store,
    correspondence: defaultCorrespondenceForm(),
    showCorrFields: false,
  }
}

function buildCorrespondenceApiBody(corr: CorrespondenceFormState): Record<string, unknown> | null {
  const o: Record<string, unknown> = {}
  if (corr.direction === "outbound" || corr.direction === "inbound") o.direction = corr.direction
  const cp = corr.counterparty.trim()
  if (cp) o.counterparty = cp
  const ref = corr.officialRef.trim()
  if (ref) o.officialRef = ref
  if (corr.status === "draft" || corr.status === "sent" || corr.status === "filed" || corr.status === "replied") {
    o.status = corr.status
  }
  const rd = corr.replyDue.trim().slice(0, 10)
  if (rd && /^\d{4}-\d{2}-\d{2}$/.test(rd)) o.replyDue = rd
  if (corr.channel === "mail" || corr.channel === "email" || corr.channel === "visit" || corr.channel === "other") {
    o.channel = corr.channel
  }
  return Object.keys(o).length > 0 ? o : null
}

export function CompanyHybridDocumentsPanel() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth, initialized, setAuth } = useAuth()
  const { posStores: stores, loading: storeLoading, formatStoreLabel, resolveStoreKey } = useStoreList()

  const [mainTab, setMainTab] = React.useState<MainTab>("list")
  const [selectedStore, setSelectedStore] = React.useState("")
  const [filtersRestored, setFiltersRestored] = React.useState(false)

  const [listCategoryFilter, setListCategoryFilter] = React.useState("all")
  const [listTitleSearch, setListTitleSearch] = React.useState("")
  const [listExpiryFilter, setListExpiryFilter] = React.useState<ExpiryFilter>("all")
  const [listSourceFilter, setListSourceFilter] = React.useState<SourceFilter>("all")
  const [listVisibilityFilter, setListVisibilityFilter] = React.useState<VisibilityFilter>("all")
  const [titleSort, setTitleSort] = React.useState<"asc" | "desc" | null>(null)

  const [listCorrPresence, setListCorrPresence] = React.useState<CorrespondencePresence>("all")
  const [listCorrDirection, setListCorrDirection] = React.useState<"" | "outbound" | "inbound">("")
  const [listCorrStatus, setListCorrStatus] = React.useState<"" | "draft" | "sent" | "filed" | "replied">("")
  const [listCorrCounterpartySearch, setListCorrCounterpartySearch] = React.useState("")

  const [list, setList] = React.useState<CompanyHybridDocumentListItem[]>([])
  const [listTotal, setListTotal] = React.useState(0)
  const [listOffset, setListOffset] = React.useState(0)
  const [listTruncated, setListTruncated] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  /** false면 목록·KPI 미조회 — 검색 버튼으로만 로드 */
  const [hasSearched, setHasSearched] = React.useState(false)
  const [summary, setSummary] = React.useState<CompanyHybridDocumentsSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = React.useState(false)
  const [categories, setCategories] = React.useState<CompanyHybridDocumentCategory[]>([])

  const [registerOpen, setRegisterOpen] = React.useState(false)
  const [detailOpen, setDetailOpen] = React.useState(false)
  const [detailRow, setDetailRow] = React.useState<CompanyHybridDocumentListItem | null>(null)
  const [watermarkOpen, setWatermarkOpen] = React.useState(false)
  const [watermarkRow, setWatermarkRow] = React.useState<CompanyHybridDocumentListItem | null>(null)
  const [detailEventsRefreshKey, setDetailEventsRefreshKey] = React.useState(0)
  const [editing, setEditing] = React.useState<CompanyHybridDocumentListItem | null>(null)
  const [registerForm, setRegisterForm] = React.useState<RegisterFormState>(() => defaultRegisterForm(""))
  const [fileBusy, setFileBusy] = React.useState(false)
  const [uploadProgress, setUploadProgress] = React.useState(0)
  const [exportBusy, setExportBusy] = React.useState(false)

  const [listCorrFiltersOpen, setListCorrFiltersOpen] = React.useState(false)

  const onUnauthorized = React.useCallback(
    (httpStatus: number) => redirectToAdminLoginIfUnauthorized(httpStatus, setAuth),
    [setAuth]
  )

  const categoryLabelById = React.useMemo(() => {
    const byId = new Map<number, CompanyHybridDocumentCategory>()
    for (const c of categories) byId.set(c.id, c)
    const visiting = new Set<number>()
    const cache = new Map<number, string>()
    const build = (id: number): string => {
      if (cache.has(id)) return String(cache.get(id))
      const row = byId.get(id)
      if (!row) return "—"
      if (visiting.has(id)) return row.name
      visiting.add(id)
      const parentId =
        row.parent_category_id != null && Number(row.parent_category_id) > 0 ? Number(row.parent_category_id) : null
      const label = parentId && byId.has(parentId) ? `${build(parentId)} > ${row.name}` : row.name
      visiting.delete(id)
      cache.set(id, label)
      return label
    }
    for (const c of categories) cache.set(c.id, build(c.id))
    return cache
  }, [categories])

  const categoriesForPicker = React.useMemo(() => {
    const base = pickCompanyHybridDocCategoriesForPicker(categories)
    if (editing?.category_id != null && editing.category_id > 0) {
      const cur = categories.find((c) => c.id === editing.category_id)
      if (cur && !base.some((c) => c.id === cur.id)) return [...base, cur]
    }
    return base
  }, [categories, editing?.category_id])

  const { ordered: orderedCategoriesForPicker } = React.useMemo(
    () => sortCompanyHybridDocCategoriesTree(categoriesForPicker),
    [categoriesForPicker]
  )

  const labelCategoryOption = React.useCallback(
    (c: CompanyHybridDocumentCategory) => categoryLabelById.get(c.id) || c.name,
    [categoryLabelById]
  )

  const labelForDocumentCategory = React.useCallback(
    (row: CompanyHybridDocumentListItem) => {
      if (row.category_id != null && categoryLabelById.has(row.category_id)) {
        return categoryLabelById.get(row.category_id) || "—"
      }
      if (row.doc_type && !isCompanyHybridDocTypePermissionMeta(row.doc_type)) return row.doc_type
      return t("companyHybridDocCategoryFilterUncat")
    },
    [categoryLabelById, t]
  )

  const labelForVisibility = React.useCallback(
    (row: CompanyHybridDocumentListItem) => {
      const vis = companyHybridDocVisibilityFromDocType(row.doc_type)
      if (vis === "office") return t("companyHybridDocPermissionOffice")
      if (vis === "store_admin") return t("companyHybridDocPermissionStoreAdmin")
      return t("companyHybridDocPermissionAll")
    },
    [t]
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

  const writeStoreForMutations = React.useMemo(() => {
    if (selectedStore && !isCompanyHybridDocsListAllStoresParam(selectedStore)) {
      return selectedStore.trim() || null
    }
    const st = String(auth?.store || "").trim()
    if (st) return st
    const first = visibleStores.find((x) => x && !isCompanyHybridDocsListAllStoresParam(x))
    return first || null
  }, [selectedStore, auth?.store, visibleStores])

  const registerStoreSelectOptions = React.useMemo(
    () => visibleStores.filter((st) => st && !isCompanyHybridDocsListAllStoresParam(st)),
    [visibleStores]
  )

  const canMutateDocStore = React.useCallback(
    (rowStore: string) => {
      if (!auth) return false
      return canAccessStoreForCompanyHybridDocs(authToJwtPayload(auth), String(rowStore || "").trim())
    },
    [auth]
  )

  const documentSaveStore = React.useMemo(() => {
    if (editing?.id) {
      return registerForm.store.trim() || String(editing.store || "").trim() || writeStoreForMutations
    }
    return registerForm.store.trim() || writeStoreForMutations
  }, [editing, registerForm.store, writeStoreForMutations])

  const canSaveDocument = React.useMemo(() => {
    const ws = documentSaveStore
    if (!ws || !canMutateDocStore(ws)) return false
    if (editing?.id) {
      const oldSt = String(editing.store || "").trim()
      if (oldSt && oldSt !== ws && !canMutateDocStore(oldSt)) return false
    }
    return true
  }, [documentSaveStore, editing, canMutateDocStore])

  const canPickStore = isOfficeRole(String(auth?.role || "")) || isFranchiseeRole(String(auth?.role || ""))

  const canManageCategories = React.useMemo(
    () => (auth ? canMutateDocStore(COMPANY_HYBRID_DOC_CATEGORY_GLOBAL_STORE) : false),
    [auth, canMutateDocStore]
  )

  const listShowStoreColumn = isCompanyHybridDocsListAllStoresParam(selectedStore)

  const showComplianceSection =
    isCompanyHybridDocsListAllStoresParam(selectedStore) &&
    (summary?.stores?.length ?? 0) > 1

  const showExpiringBanner = (summary?.expiring_soon ?? 0) > 0 || (summary?.expired ?? 0) > 0

  const totalPages = Math.max(1, Math.ceil(listTotal / COMPANY_HYBRID_DOC_PAGE_SIZE))
  const currentPage = Math.floor(listOffset / COMPANY_HYBRID_DOC_PAGE_SIZE) + 1

  const hasActiveCorrFilters =
    listCorrPresence !== "all" ||
    !!listCorrDirection ||
    !!listCorrStatus ||
    !!listCorrCounterpartySearch.trim()

  React.useEffect(() => {
    if (hasActiveCorrFilters) setListCorrFiltersOpen(true)
  }, [hasActiveCorrFilters])

  React.useEffect(() => {
    if (storeLoading || !initialized) return
    if (selectedStore) return
    setSelectedStore(COMPANY_HYBRID_DOCS_STORE_ALL)
  }, [storeLoading, initialized, selectedStore])

  React.useEffect(() => {
    if (filtersRestored || typeof window === "undefined") return
    try {
      const raw = window.localStorage.getItem(COMPANY_HYBRID_DOC_FILTER_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as StoredListFilters
        if (parsed.listCategoryFilter) setListCategoryFilter(parsed.listCategoryFilter)
        if (parsed.listTitleSearch != null) setListTitleSearch(parsed.listTitleSearch)
        if (parsed.listExpiryFilter) setListExpiryFilter(parsed.listExpiryFilter)
        if (parsed.listSourceFilter) setListSourceFilter(parsed.listSourceFilter)
        if (parsed.listVisibilityFilter) setListVisibilityFilter(parsed.listVisibilityFilter)
        if (parsed.listCorrPresence) setListCorrPresence(parsed.listCorrPresence)
        if (parsed.listCorrDirection != null) setListCorrDirection(parsed.listCorrDirection)
        if (parsed.listCorrStatus != null) setListCorrStatus(parsed.listCorrStatus)
        if (parsed.listCorrCounterpartySearch != null) {
          setListCorrCounterpartySearch(parsed.listCorrCounterpartySearch)
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
    setFiltersRestored(true)
  }, [filtersRestored])

  React.useEffect(() => {
    if (!filtersRestored || typeof window === "undefined") return
    const payload: StoredListFilters = {
      listCategoryFilter,
      listTitleSearch,
      listExpiryFilter,
      listSourceFilter,
      listVisibilityFilter,
      listCorrPresence,
      listCorrDirection,
      listCorrStatus,
      listCorrCounterpartySearch,
    }
    try {
      window.localStorage.setItem(COMPANY_HYBRID_DOC_FILTER_STORAGE_KEY, JSON.stringify(payload))
    } catch {
      /* quota / private mode */
    }
  }, [
    filtersRestored,
    listCategoryFilter,
    listTitleSearch,
    listExpiryFilter,
    listSourceFilter,
    listVisibilityFilter,
    listCorrPresence,
    listCorrDirection,
    listCorrStatus,
    listCorrCounterpartySearch,
  ])

  const loadCategories = React.useCallback(async () => {
    if (!initialized || !auth) {
      setCategories([])
      return
    }
    const res = await getCompanyHybridDocumentCategories({ store: COMPANY_HYBRID_DOCS_STORE_ALL })
    if (onUnauthorized(res.httpStatus)) {
      setCategories([])
      return
    }
    if (!res.success) {
      if (res.message) void appAlert(translateApiMessage(String(res.message), (k) => t(k)))
      setCategories([])
      return
    }
    setCategories(res.list || [])
  }, [initialized, auth, t, onUnauthorized])

  React.useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  const buildListQuery = React.useCallback(
    (offset: number) => {
      const q: Parameters<typeof getCompanyHybridDocuments>[0] = {
        store: selectedStore,
        categoryId: listCategoryFilter,
        offset,
        limit: COMPANY_HYBRID_DOC_PAGE_SIZE,
      }
      if (listTitleSearch.trim()) q.searchTitle = listTitleSearch.trim()
      if (titleSort) q.sortTitle = titleSort
      if (listCorrPresence !== "all") q.corrPresence = listCorrPresence
      if (listCorrDirection) q.corrDirection = listCorrDirection
      if (listCorrStatus) q.corrStatus = listCorrStatus
      if (listCorrCounterpartySearch.trim()) q.corrCounterpartySearch = listCorrCounterpartySearch.trim()
      if (listSourceFilter !== "all") q.sourceFilter = listSourceFilter
      if (listVisibilityFilter !== "all") q.visibilityFilter = listVisibilityFilter
      if (listExpiryFilter !== "all") q.expiryFilter = listExpiryFilter
      return q
    },
    [
      selectedStore,
      listCategoryFilter,
      listTitleSearch,
      titleSort,
      listCorrPresence,
      listCorrDirection,
      listCorrStatus,
      listCorrCounterpartySearch,
      listSourceFilter,
      listVisibilityFilter,
      listExpiryFilter,
    ]
  )

  const loadSummary = React.useCallback(async () => {
    if (!initialized || !auth || !selectedStore) return
    setSummaryLoading(true)
    try {
      const res = await getCompanyHybridDocumentsSummary({ store: selectedStore })
      if (onUnauthorized(res.httpStatus)) {
        setSummary(null)
        return
      }
      if (!res.success) {
        setSummary(null)
        return
      }
      setSummary(res.summary ?? null)
    } finally {
      setSummaryLoading(false)
    }
  }, [initialized, auth, selectedStore, onUnauthorized])

  const loadList = React.useCallback(
    async (offset: number, opts?: { sortTitle?: "asc" | "desc" | null }) => {
      if (!initialized || !auth || !selectedStore) return
      setLoading(true)
      try {
        const q = buildListQuery(offset)
        const sort = opts?.sortTitle !== undefined ? opts.sortTitle : titleSort
        if (sort) q.sortTitle = sort
        const res = await getCompanyHybridDocuments(q)
        if (onUnauthorized(res.httpStatus)) {
          setList([])
          setListTotal(0)
          return
        }
        if (!res.success) {
          if (res.message) void appAlert(translateApiMessage(String(res.message), (k) => t(k)))
          setList([])
          setListTotal(0)
          return
        }
        setList((res.list || []) as CompanyHybridDocumentListItem[])
        setListTotal(res.total ?? res.list?.length ?? 0)
        setListOffset(res.offset ?? offset)
        setListTruncated(Boolean(res.truncated))
      } catch (e) {
        void appAlert(e instanceof Error ? e.message : String(e))
        setList([])
        setListTotal(0)
      } finally {
        setLoading(false)
      }
    },
    [initialized, auth, selectedStore, buildListQuery, titleSort, onUnauthorized, t]
  )

  const invalidateListSearch = React.useCallback(() => {
    setHasSearched(false)
    setList([])
    setListTotal(0)
    setListOffset(0)
    setListTruncated(false)
    setSummary(null)
    setTitleSort(null)
  }, [])

  const handleListSearch = React.useCallback(() => {
    setHasSearched(true)
    setListOffset(0)
    void loadList(0)
    void loadSummary()
  }, [loadList, loadSummary])

  const reloadListFromStart = React.useCallback(() => {
    setHasSearched(true)
    setListOffset(0)
    void loadList(0)
    void loadSummary()
  }, [loadList, loadSummary])

  const resetRegisterForm = React.useCallback(() => {
    const ws = writeStoreForMutations || ""
    setRegisterForm(defaultRegisterForm(ws))
    setEditing(null)
    setUploadProgress(0)
  }, [writeStoreForMutations])

  const openNewRegister = React.useCallback(() => {
    resetRegisterForm()
    setRegisterOpen(true)
    setDetailOpen(false)
  }, [resetRegisterForm])

  const fillRegisterFrom = React.useCallback((row: CompanyHybridDocumentListItem) => {
    const c = getCorrespondenceFromMetadata(row.metadata)
    const relatedType: CompanyHybridRelatedType =
      row.related_type === "employee" ||
      row.related_type === "store" ||
      row.related_type === "interior_project"
        ? row.related_type
        : "none"
    setRegisterForm({
      title: row.title,
      categoryId:
        row.category_id != null && row.category_id > 0 ? String(row.category_id) : FORM_CAT_NONE,
      externalUrl: String(row.external_url || row.public_url || "").trim(),
      visibility: companyHybridDocVisibilityFromDocType(row.doc_type),
      validFrom: formatCompanyHybridDocDateForInput(row.valid_from),
      validTo: formatCompanyHybridDocDateForInput(row.valid_to),
      note: row.note || "",
      relatedType,
      relatedId: row.related_id || "",
      store: String(row.store || "").trim() || writeStoreForMutations || "",
      correspondence: {
        direction: c?.direction === "inbound" || c?.direction === "outbound" ? c.direction : "",
        counterparty: c?.counterparty || "",
        officialRef: c?.officialRef || "",
        status:
          c?.status === "draft" || c?.status === "sent" || c?.status === "filed" || c?.status === "replied"
            ? c.status
            : "",
        replyDue: formatCompanyHybridDocDateForInput(c?.replyDue),
        channel:
          c?.channel === "mail" || c?.channel === "email" || c?.channel === "visit" || c?.channel === "other"
            ? c.channel
            : "",
      },
      showCorrFields: documentHasCorrespondence(row.metadata),
    })
    setEditing(row)
  }, [writeStoreForMutations])

  const openEditRegister = React.useCallback(
    (row: CompanyHybridDocumentListItem) => {
      fillRegisterFrom(row)
      setRegisterOpen(true)
      setDetailOpen(false)
    },
    [fillRegisterFrom]
  )

  const applyCorrespondenceToSaveBody = React.useCallback(
    (body: Record<string, unknown>) => {
      if (registerForm.showCorrFields) {
        body.correspondence = buildCorrespondenceApiBody(registerForm.correspondence)
      }
    },
    [registerForm.showCorrFields, registerForm.correspondence]
  )

  const applyRelatedToSaveBody = React.useCallback(
    (body: Record<string, unknown>) => {
      body.relatedType = registerForm.relatedType
      if (registerForm.relatedType !== "none" && registerForm.relatedId.trim()) {
        body.relatedId = registerForm.relatedId.trim()
      }
    },
    [registerForm.relatedType, registerForm.relatedId]
  )

  const buildCategoryIdPayload = () =>
    registerForm.categoryId !== FORM_CAT_NONE ? Number(registerForm.categoryId) : undefined

  const onSaveUploadedDocMeta = async () => {
    if (!editing?.id || editing.source === "drive") return
    const ws = documentSaveStore
    if (!ws) {
      void appAlert(t("companyHybridDocPickStoreForRegister"))
      return
    }
    if (!registerForm.title.trim()) {
      void appAlert(t("companyHybridDocTitle"))
      return
    }
    const body: Record<string, unknown> = {
      id: editing.id,
      store: ws,
      title: registerForm.title.trim(),
      visibility: registerForm.visibility,
      validFrom: parseCompanyHybridDocDate(registerForm.validFrom) || undefined,
      validTo: parseCompanyHybridDocDate(registerForm.validTo) || undefined,
      note: registerForm.note.trim() || undefined,
      categoryId: buildCategoryIdPayload(),
    }
    applyRelatedToSaveBody(body)
    applyCorrespondenceToSaveBody(body)
    const res = await saveCompanyHybridDocument(body)
    if (!res.success) {
      if (onUnauthorized(res.httpStatus)) return
      void appAlert(translateApiMessage(String(res.message || "Error"), (k) => t(k)))
      return
    }
    setRegisterOpen(false)
    resetRegisterForm()
    reloadListFromStart()
    void loadSummary()
  }

  const onSaveDrive = async () => {
    const ws = documentSaveStore
    if (!ws) {
      void appAlert(t("companyHybridDocPickStoreForRegister"))
      return
    }
    if (!registerForm.title.trim()) {
      void appAlert(t("companyHybridDocTitle"))
      return
    }
    if (!registerForm.externalUrl.trim()) {
      void appAlert(t("companyHybridDocExternalUrl"))
      return
    }
    const body: Record<string, unknown> = {
      store: ws,
      title: registerForm.title.trim(),
      visibility: registerForm.visibility,
      source: "drive",
      externalUrl: registerForm.externalUrl.trim(),
      validFrom: parseCompanyHybridDocDate(registerForm.validFrom) || undefined,
      validTo: parseCompanyHybridDocDate(registerForm.validTo) || undefined,
      note: registerForm.note.trim() || undefined,
      categoryId: buildCategoryIdPayload(),
    }
    applyRelatedToSaveBody(body)
    applyCorrespondenceToSaveBody(body)
    if (editing?.id) body.id = editing.id
    const res = await saveCompanyHybridDocument(body)
    if (!res.success) {
      if (onUnauthorized(res.httpStatus)) return
      void appAlert(translateApiMessage(String(res.message || "Error"), (k) => t(k)))
      return
    }
    setRegisterOpen(false)
    resetRegisterForm()
    reloadListFromStart()
    void loadSummary()
  }

  const onDelete = async (row: CompanyHybridDocumentListItem) => {
    if (!(await appConfirm(String(row.title) + " — " + t("companyHybridDocDelete") + "?"))) return
    const res = await deleteCompanyHybridDocument({ id: row.id })
    if (!res.success) {
      if (onUnauthorized(res.httpStatus)) return
      void appAlert(translateApiMessage(String(res.message || "Error"), (k) => t(k)))
      return
    }
    if (editing?.id === row.id) {
      setRegisterOpen(false)
      resetRegisterForm()
    }
    if (detailRow?.id === row.id) {
      setDetailOpen(false)
      setDetailRow(null)
    }
    reloadListFromStart()
    void loadSummary()
  }

  const onOpen = async (row: CompanyHybridDocumentListItem) => {
    const url = row.source === "drive" ? row.external_url : row.public_url
    if (!url) {
      void appAlert(t("companyHybridDocNoUrl"))
      return
    }
    const rec = await recordCompanyHybridDocumentView({ id: row.id })
    if (onUnauthorized(rec.httpStatus)) return
    window.open(url, "_blank", "noopener,noreferrer")
  }

  const onPickFile = async (file: File) => {
    const ws = documentSaveStore || writeStoreForMutations
    if (!ws) return
    setFileBusy(true)
    setUploadProgress(0)
    try {
      if (!registerForm.title.trim()) {
        void appAlert(t("companyHybridDocTitle"))
        return
      }
      const p = await presignCompanyHybridDocumentUpload({
        store: ws,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        fileSize: file.size,
      })
      if (!p.success || !p.signedUrl || !p.storagePath) {
        if (onUnauthorized(p.httpStatus)) return
        void appAlert(translateApiMessage(String(p.message || "Error"), (k) => t(k)))
        return
      }
      const fileFor =
        file.type && file.type.length > 0
          ? file
          : new File([file], file.name, { type: "application/octet-stream" })
      const put = await putFileToSupabaseSignedUploadUrl(p.signedUrl, fileFor, {
        timeoutMs: 600_000,
        onProgress: setUploadProgress,
      })
      if (!put.ok) {
        const txt = await put.text().catch(() => "")
        void appAlert(txt || `Upload ${put.status}`)
        return
      }
      const mime = file.type && file.type.length > 0 ? file.type : "application/octet-stream"
      const uploadBody: Record<string, unknown> = {
        store: ws,
        title: registerForm.title.trim(),
        visibility: registerForm.visibility,
        note: registerForm.note.trim() || undefined,
        validFrom: parseCompanyHybridDocDate(registerForm.validFrom) || undefined,
        validTo: parseCompanyHybridDocDate(registerForm.validTo) || undefined,
        fileName: file.name,
        fileSize: file.size,
        storagePath: p.storagePath,
        mime,
        categoryId: buildCategoryIdPayload(),
      }
      applyRelatedToSaveBody(uploadBody)
      applyCorrespondenceToSaveBody(uploadBody)
      const done = await completeCompanyHybridDocumentUpload(uploadBody)
      if (!done.success) {
        if (onUnauthorized(done.httpStatus)) return
        void appAlert(translateApiMessage(String(done.message || "Error"), (k) => t(k)))
        return
      }
      setRegisterOpen(false)
      resetRegisterForm()
      reloadListFromStart()
      void loadSummary()
    } finally {
      setFileBusy(false)
      setUploadProgress(0)
    }
  }

  const labelCorrDirectionCell = React.useCallback(
    (d: string | undefined) => {
      if (d === "outbound") return t("companyHybridCorrDirectionOutbound")
      if (d === "inbound") return t("companyHybridCorrDirectionInbound")
      return "—"
    },
    [t]
  )

  const labelCorrStatusCell = React.useCallback(
    (s: string | undefined) => {
      if (s === "draft") return t("companyHybridCorrStatusDraft")
      if (s === "sent") return t("companyHybridCorrStatusSent")
      if (s === "filed") return t("companyHybridCorrStatusFiled")
      if (s === "replied") return t("companyHybridCorrStatusReplied")
      return "—"
    },
    [t]
  )

  const formatCorrRowHint = React.useCallback(
    (corr: ReturnType<typeof getCorrespondenceFromMetadata>) => {
      if (!corr) return ""
      const parts: string[] = []
      if (corr.direction) parts.push(labelCorrDirectionCell(corr.direction))
      if (corr.counterparty) parts.push(corr.counterparty)
      if (corr.officialRef) parts.push(corr.officialRef)
      if (corr.status) parts.push(labelCorrStatusCell(corr.status))
      if (corr.replyDue) parts.push(formatCompanyHybridDocDateForInput(corr.replyDue))
      return parts.join(" · ")
    },
    [labelCorrDirectionCell, labelCorrStatusCell]
  )

  const expiryFilterLabel = React.useCallback(
    (v: ExpiryFilter) => {
      if (v === "expiring_soon") return t("companyHybridDocExpiryFilterExpiringSoon")
      if (v === "expired") return t("companyHybridDocExpiryFilterExpired")
      if (v === "no_expiry") return t("companyHybridDocExpiryFilterNoExpiry")
      return t("companyHybridDocExpiryFilterAll")
    },
    [t]
  )

  const activeFilterChips = React.useMemo((): ActiveFilterChip[] => {
    const chips: ActiveFilterChip[] = []
    if (!isCompanyHybridDocsListAllStoresParam(selectedStore)) {
      chips.push({ id: "store", label: `${t("companyHybridDocFilterStore")}: ${formatStoreLabel(selectedStore)}` })
    }
    if (listCategoryFilter !== "all") {
      const catRow = orderedCategoriesForPicker.find((c) => String(c.id) === listCategoryFilter)
      const catLabel =
        listCategoryFilter === "uncategorized"
          ? t("companyHybridDocCategoryFilterUncat")
          : catRow
            ? labelCategoryOption(catRow)
            : listCategoryFilter
      chips.push({ id: "category", label: `${t("companyHybridDocColCategory")}: ${catLabel}` })
    }
    if (listTitleSearch.trim()) {
      chips.push({ id: "title", label: `${t("companyHybridDocSearchTitle")}: ${listTitleSearch.trim()}` })
    }
    if (listExpiryFilter !== "all") {
      chips.push({ id: "expiry", label: `${t("companyHybridDocValidTo")}: ${expiryFilterLabel(listExpiryFilter)}` })
    }
    if (listSourceFilter !== "all") {
      chips.push({
        id: "source",
        label: `${t("companyHybridDocSource")}: ${
          listSourceFilter === "drive" ? t("companyHybridDocSourceDrive") : t("companyHybridDocSourceStorage")
        }`,
      })
    }
    if (listVisibilityFilter !== "all") {
      chips.push({
        id: "visibility",
        label: `${t("companyHybridDocPermission")}: ${
          listVisibilityFilter === "office"
            ? t("companyHybridDocPermissionOffice")
            : t("companyHybridDocPermissionStoreAdmin")
        }`,
      })
    }
    if (listCorrPresence !== "all") {
      chips.push({
        id: "corrPresence",
        label: `${t("companyHybridCorrTab")}: ${
          listCorrPresence === "yes" ? t("companyHybridCorrPresenceYes") : t("companyHybridCorrPresenceNo")
        }`,
      })
    }
    if (listCorrDirection) {
      chips.push({
        id: "corrDirection",
        label: `${t("companyHybridCorrDirection")}: ${labelCorrDirectionCell(listCorrDirection)}`,
      })
    }
    if (listCorrStatus) {
      chips.push({
        id: "corrStatus",
        label: `${t("companyHybridCorrStatus")}: ${labelCorrStatusCell(listCorrStatus)}`,
      })
    }
    if (listCorrCounterpartySearch.trim()) {
      chips.push({
        id: "corrCounterparty",
        label: `${t("companyHybridCorrCounterpartySearch")}: ${listCorrCounterpartySearch.trim()}`,
      })
    }
    return chips
  }, [
    selectedStore,
    listCategoryFilter,
    listTitleSearch,
    listExpiryFilter,
    listSourceFilter,
    listVisibilityFilter,
    listCorrPresence,
    listCorrDirection,
    listCorrStatus,
    listCorrCounterpartySearch,
    t,
    formatStoreLabel,
    orderedCategoriesForPicker,
    labelCategoryOption,
    expiryFilterLabel,
    labelCorrDirectionCell,
    labelCorrStatusCell,
  ])

  const clearAllFilters = React.useCallback(() => {
    setListCategoryFilter("all")
    setListTitleSearch("")
    setListExpiryFilter("all")
    setListSourceFilter("all")
    setListVisibilityFilter("all")
    setListCorrPresence("all")
    setListCorrDirection("")
    setListCorrStatus("")
    setListCorrCounterpartySearch("")
    invalidateListSearch()
  }, [invalidateListSearch])

  const removeFilterChip = React.useCallback(
    (id: string) => {
      if (id === "store") return
      if (id === "category") setListCategoryFilter("all")
      if (id === "title") setListTitleSearch("")
      if (id === "expiry") setListExpiryFilter("all")
      if (id === "source") setListSourceFilter("all")
      if (id === "visibility") setListVisibilityFilter("all")
      if (id === "corrPresence") setListCorrPresence("all")
      if (id === "corrDirection") setListCorrDirection("")
      if (id === "corrStatus") setListCorrStatus("")
      if (id === "corrCounterparty") setListCorrCounterpartySearch("")
      invalidateListSearch()
    },
    [invalidateListSearch]
  )

  const onExportCsv = async () => {
    if (!selectedStore || exportBusy) return
    setExportBusy(true)
    try {
      const allRows: CompanyHybridDocumentListItem[] = []
      let offset = 0
      const pageSize = 200
      let total = 0
      do {
        const res = await getCompanyHybridDocuments({ ...buildListQuery(offset), limit: pageSize, offset })
        if (onUnauthorized(res.httpStatus)) return
        if (!res.success) {
          if (res.message) void appAlert(translateApiMessage(String(res.message), (k) => t(k)))
          return
        }
        const batch = res.list || []
        allRows.push(...batch)
        total = res.total ?? allRows.length
        offset += pageSize
        if (batch.length === 0) break
      } while (allRows.length < total)

      const csv = buildCompanyHybridDocumentsCsv(
        allRows,
        {
          store: t("companyHybridDocFilterStore"),
          title: t("companyHybridDocColTitle"),
          category: t("companyHybridDocColCategory"),
          source: t("companyHybridDocSource"),
          validFrom: t("companyHybridDocValidFrom"),
          validTo: t("companyHybridDocValidTo"),
          note: t("companyHybridDocNote"),
          createdAt: t("companyHybridDocColCreated"),
          createdBy: t("companyHybridDocColCreatedBy"),
          relatedType: t("companyHybridDocRelated"),
          relatedId: t("companyHybridDocFilterRelated"),
          corrDirection: t("companyHybridCorrDirection"),
          corrCounterparty: t("companyHybridCorrColCounterparty"),
          corrStatus: t("companyHybridCorrStatus"),
          corrReplyDue: t("companyHybridCorrReplyDue"),
        },
        {
          labelCategory: labelForDocumentCategory,
          labelStore: formatStoreLabel,
          labelRelatedType: (type) => labelCompanyHybridRelatedType(type, t),
          labelCorrDirection: labelCorrDirectionCell,
          labelCorrStatus: labelCorrStatusCell,
        }
      )
      const stamp = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" })
      downloadCompanyHybridDocumentsCsv(csv, `company-documents-${stamp}.csv`)
    } finally {
      setExportBusy(false)
    }
  }

  const applyListStoreFilterChange = React.useCallback(
    (v: string) => {
      setSelectedStore(v)
      invalidateListSearch()
      if (registerOpen && !editing) {
        resetRegisterForm()
      }
    },
    [registerOpen, editing, resetRegisterForm, invalidateListSearch]
  )

  return (
    <div className="space-y-4">
      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as MainTab)} className={adminTabsRootCn}>
        <AdminTabsBarWithHelp>
          <TabsList className={adminTabsListRowCn}>
            <TabsTrigger value="list" className={adminTabsTriggerCn}>
              <LayoutList className={adminTabsIconCn} aria-hidden />
              {t("companyHybridDocTabList")}
            </TabsTrigger>
            <TabsTrigger value="categories" className={adminTabsTriggerCn}>
              <Tags className={adminTabsIconCn} aria-hidden />
              {t("companyHybridDocTabCategories")}
            </TabsTrigger>
          </TabsList>
        </AdminTabsBarWithHelp>

        <TabsContent value="list" className={cn(adminTabsContentCn, "space-y-4")}>
          <p className="text-sm text-muted-foreground">{t("companyHybridDocListFilterHint")}</p>

          {hasSearched ? (
            <CompanyHybridDocumentKpiCards
              summary={summary}
              loading={summaryLoading}
              labels={{
                total: t("companyHybridDocKpiTotal"),
                expiringSoon: t("companyHybridDocKpiExpiringSoon"),
                expired: t("companyHybridDocKpiExpired"),
                corrOverdue: t("companyHybridDocKpiCorrOverdue"),
              }}
            />
          ) : null}

          {hasSearched && showExpiringBanner ? (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>{t("companyHybridDocExpiringBanner")}</p>
            </div>
          ) : null}

          <Card>
            <CardHeader className="py-3">
              <div className="flex flex-wrap items-end gap-3">
                <CompanyHybridDocumentsStoreField
                  labelStore={t("companyHybridDocFilterStore")}
                  labelAllStores={t("companyHybridDocStoreAll")}
                  canPickStore={canPickStore}
                  storeSelectOptions={storeSelectOptions}
                  selectedStore={selectedStore}
                  formatStoreLabel={formatStoreLabel}
                  onStoreChange={applyListStoreFilterChange}
                />
                <div className="min-w-[150px] space-y-1.5">
                  <Label>{t("companyHybridDocColCategory")}</Label>
                  <Select
                    value={listCategoryFilter}
                    onValueChange={(v) => {
                      setListCategoryFilter(v)
                      invalidateListSearch()
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("companyHybridDocCategoryFilterAll")}</SelectItem>
                      <SelectItem value="uncategorized">{t("companyHybridDocCategoryFilterUncat")}</SelectItem>
                      {orderedCategoriesForPicker.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {labelCategoryOption(c)}
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        handleListSearch()
                      }
                    }}
                    placeholder="…"
                  />
                </div>
                <div className="min-w-[10rem] space-y-1.5">
                  <Label>{t("companyHybridDocValidTo")}</Label>
                  <Select
                    value={listExpiryFilter}
                    onValueChange={(v) => {
                      setListExpiryFilter(v as ExpiryFilter)
                      invalidateListSearch()
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("companyHybridDocExpiryFilterAll")}</SelectItem>
                      <SelectItem value="expiring_soon">{t("companyHybridDocExpiryFilterExpiringSoon")}</SelectItem>
                      <SelectItem value="expired">{t("companyHybridDocExpiryFilterExpired")}</SelectItem>
                      <SelectItem value="no_expiry">{t("companyHybridDocExpiryFilterNoExpiry")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[9rem] space-y-1.5">
                  <Label>{t("companyHybridDocSource")}</Label>
                  <Select
                    value={listSourceFilter}
                    onValueChange={(v) => {
                      setListSourceFilter(v as SourceFilter)
                      invalidateListSearch()
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("companyHybridDocSourceFilterAll")}</SelectItem>
                      <SelectItem value="drive">{t("companyHybridDocSourceDrive")}</SelectItem>
                      <SelectItem value="supabase">{t("companyHybridDocSourceStorage")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[9rem] space-y-1.5">
                  <Label>{t("companyHybridDocPermission")}</Label>
                  <Select
                    value={listVisibilityFilter}
                    onValueChange={(v) => {
                      setListVisibilityFilter(v as VisibilityFilter)
                      invalidateListSearch()
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("companyHybridDocVisibilityFilterAll")}</SelectItem>
                      <SelectItem value="office">{t("companyHybridDocPermissionOffice")}</SelectItem>
                      <SelectItem value="store_admin">{t("companyHybridDocPermissionStoreAdmin")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="secondary" onClick={handleListSearch} disabled={loading || !selectedStore}>
                  {t("stockBtnSearch")}
                </Button>
              </div>

              <Collapsible
                open={listCorrFiltersOpen}
                onOpenChange={setListCorrFiltersOpen}
                className="mt-3 border-t border-border pt-3"
              >
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="-ml-2 mb-1 h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
                  >
                    <Mail className="h-3.5 w-3.5" aria-hidden />
                    <span className="text-xs font-medium">{t("companyHybridCorrListFiltersLabel")}</span>
                    {hasActiveCorrFilters ? (
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                        ON
                      </Badge>
                    ) : null}
                    <ChevronDown
                      className={cn("h-3.5 w-3.5 transition-transform", listCorrFiltersOpen && "rotate-180")}
                      aria-hidden
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
                  <div className="min-w-[10rem] space-y-1.5">
                    <Label className="text-xs">{t("companyHybridCorrTab")}</Label>
                    <Select
                      value={listCorrPresence}
                      onValueChange={(v) => {
                        setListCorrPresence(v as CorrespondencePresence)
                        invalidateListSearch()
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("companyHybridCorrPresenceAll")}</SelectItem>
                        <SelectItem value="yes">{t("companyHybridCorrPresenceYes")}</SelectItem>
                        <SelectItem value="no">{t("companyHybridCorrPresenceNo")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[9rem] space-y-1.5">
                    <Label className="text-xs">{t("companyHybridCorrDirection")}</Label>
                    <Select
                      value={listCorrDirection || LIST_CORR_SELECT_NONE}
                      onValueChange={(v) => {
                        setListCorrDirection(
                          v === LIST_CORR_SELECT_NONE ? "" : (v as "outbound" | "inbound")
                        )
                        invalidateListSearch()
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("companyHybridCorrDirectionPh")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={LIST_CORR_SELECT_NONE}>{t("companyHybridCorrDirectionPh")}</SelectItem>
                        <SelectItem value="outbound">{t("companyHybridCorrDirectionOutbound")}</SelectItem>
                        <SelectItem value="inbound">{t("companyHybridCorrDirectionInbound")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[9rem] space-y-1.5">
                    <Label className="text-xs">{t("companyHybridCorrStatus")}</Label>
                    <Select
                      value={listCorrStatus || LIST_CORR_SELECT_NONE}
                      onValueChange={(v) => {
                        setListCorrStatus(
                          v === LIST_CORR_SELECT_NONE ? "" : (v as "draft" | "sent" | "filed" | "replied")
                        )
                        invalidateListSearch()
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("companyHybridCorrStatusPh")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={LIST_CORR_SELECT_NONE}>{t("companyHybridCorrStatusPh")}</SelectItem>
                        <SelectItem value="draft">{t("companyHybridCorrStatusDraft")}</SelectItem>
                        <SelectItem value="sent">{t("companyHybridCorrStatusSent")}</SelectItem>
                        <SelectItem value="filed">{t("companyHybridCorrStatusFiled")}</SelectItem>
                        <SelectItem value="replied">{t("companyHybridCorrStatusReplied")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="min-w-[12rem] flex-1 space-y-1.5">
                    <Label className="text-xs">{t("companyHybridCorrCounterpartySearch")}</Label>
                    <Input
                      value={listCorrCounterpartySearch}
                      onChange={(e) => setListCorrCounterpartySearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          handleListSearch()
                        }
                      }}
                      placeholder="…"
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </CardHeader>
          </Card>

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <CompanyHybridDocumentFilterChips
              chips={activeFilterChips}
              onRemove={removeFilterChip}
              onClearAll={clearAllFilters}
              clearLabel={t("companyHybridDocFilterClear")}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={exportBusy || !selectedStore} onClick={() => void onExportCsv()}>
                {t("companyHybridDocExportCsv")}
              </Button>
              <Button type="button" className="gap-1.5" onClick={openNewRegister}>
                <FilePlus className="h-4 w-4" aria-hidden />
                {t("companyHybridDocNewRegister")}
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileStack className="h-4 w-4" />
                {t("companyHybridDocListTitle")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <CompanyHybridDocumentListSkeleton />
              ) : !hasSearched ? (
                <p className="text-sm text-muted-foreground">{t("msg_click_query")}</p>
              ) : list.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("companyHybridDocListEmpty")}</p>
              ) : (
                <CompanyHybridDocumentListTable
                  list={list}
                  showStoreColumn={listShowStoreColumn}
                  titleSort={titleSort}
                  onTitleSort={() => {
                    const next = titleSort === "asc" ? "desc" : "asc"
                    setTitleSort(next)
                    if (hasSearched) {
                      setListOffset(0)
                      void loadList(0, { sortTitle: next })
                    }
                  }}
                  t={t}
                  formatStoreLabel={formatStoreLabel}
                  labelCategory={labelForDocumentCategory}
                  labelVisibility={labelForVisibility}
                  labelCorrDirection={labelCorrDirectionCell}
                  labelCorrStatus={labelCorrStatusCell}
                  formatCorrHint={formatCorrRowHint}
                  canMutateDocStore={canMutateDocStore}
                  onRowClick={(row) => {
                    setDetailRow(row)
                    setDetailOpen(true)
                  }}
                  onOpen={(row) => void onOpen(row)}
                  onEdit={(row) => openEditRegister(row)}
                  onDelete={(row) => void onDelete(row)}
                />
              )}

              {hasSearched && !loading && listTotal > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
                  <p className="text-muted-foreground">
                    {t("companyHybridDocPaginationTotal").replace("{total}", String(listTotal))}
                    {" · "}
                    {t("companyHybridDocPaginationPage")
                      .replace("{page}", String(currentPage))
                      .replace("{totalPages}", String(totalPages))}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={listOffset <= 0 || loading}
                      onClick={() => {
                        const next = Math.max(0, listOffset - COMPANY_HYBRID_DOC_PAGE_SIZE)
                        setListOffset(next)
                        void loadList(next)
                      }}
                    >
                      {t("companyHybridDocPaginationPrev")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={listOffset + COMPANY_HYBRID_DOC_PAGE_SIZE >= listTotal || loading}
                      onClick={() => {
                        const next = listOffset + COMPANY_HYBRID_DOC_PAGE_SIZE
                        setListOffset(next)
                        void loadList(next)
                      }}
                    >
                      {t("companyHybridDocPaginationNext")}
                    </Button>
                  </div>
                </div>
              ) : null}

              {listTruncated ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">{t("companyHybridDocTruncatedHint")}</p>
              ) : null}
            </CardContent>
          </Card>

          {hasSearched && showComplianceSection && summary?.stores ? (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-base">{t("companyHybridDocComplianceTitle")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("companyHybridDocFilterStore")}</TableHead>
                        <TableHead className="text-right">{t("companyHybridDocKpiTotal")}</TableHead>
                        <TableHead className="text-right">{t("companyHybridDocKpiExpiringSoon")}</TableHead>
                        <TableHead className="text-right">{t("companyHybridDocKpiExpired")}</TableHead>
                        <TableHead className="text-right">{t("companyHybridDocComplianceTitle")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.stores.map((row) => (
                        <TableRow key={row.store}>
                          <TableCell>{formatStoreLabel(row.store)}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.total}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.expiring_soon}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.expired}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {t("companyHybridDocCompliancePct").replace("{pct}", String(row.compliance_pct))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="categories" className={cn(adminTabsContentCn, "space-y-4")}>
          <CompanyHybridDocumentCategoryTab
            categories={categories}
            onReloadCategories={loadCategories}
            canManageCategories={canManageCategories}
            listCategoryFilter={listCategoryFilter}
            onListCategoryFilterChange={setListCategoryFilter}
            onReloadList={reloadListFromStart}
            onUnauthorized={onUnauthorized}
            t={t}
          />
        </TabsContent>
      </Tabs>

      <CompanyHybridDocumentDetailSheet
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open)
          if (!open) setDetailRow(null)
        }}
        row={detailRow}
        t={t}
        labelCategory={labelForDocumentCategory}
        labelVisibility={labelForVisibility}
        labelStore={formatStoreLabel}
        labelCorrDirection={labelCorrDirectionCell}
        labelCorrStatus={labelCorrStatusCell}
        canMutate={detailRow ? canMutateDocStore(detailRow.store) : false}
        onOpenUrl={(row) => void onOpen(row)}
        onIssueWatermark={(row) => {
          setWatermarkRow(row)
          setWatermarkOpen(true)
        }}
        onEdit={(row) => openEditRegister(row)}
        onDelete={(row) => void onDelete(row)}
        onUnauthorized={onUnauthorized}
        eventsRefreshKey={detailEventsRefreshKey}
      />

      <CompanyHybridDocumentWatermarkDialog
        open={watermarkOpen}
        onOpenChange={(open) => {
          setWatermarkOpen(open)
          if (!open) setWatermarkRow(null)
        }}
        row={watermarkRow}
        t={t}
        onUnauthorized={onUnauthorized}
        onIssued={() => {
          if (watermarkRow?.id && detailRow?.id === watermarkRow.id) {
            setDetailEventsRefreshKey((k) => k + 1)
          }
        }}
      />

      <CompanyHybridDocumentRegisterSheet
        open={registerOpen}
        onOpenChange={(open) => {
          setRegisterOpen(open)
          if (!open) resetRegisterForm()
        }}
        editing={editing}
        form={registerForm}
        onFormChange={(patch) => setRegisterForm((prev) => ({ ...prev, ...patch }))}
        onCorrChange={(patch) =>
          setRegisterForm((prev) => ({
            ...prev,
            correspondence: { ...prev.correspondence, ...patch },
          }))
        }
        categories={orderedCategoriesForPicker}
        labelCategoryOption={labelCategoryOption}
        storeOptions={registerStoreSelectOptions}
        canPickStore={canPickStore}
        canSave={canSaveDocument}
        fileBusy={fileBusy}
        uploadProgress={uploadProgress}
        t={t}
        formatStoreLabel={formatStoreLabel}
        onSaveDrive={() => void onSaveDrive()}
        onSaveUploadedMeta={() => void onSaveUploadedDocMeta()}
        onPickFile={(file) => void onPickFile(file)}
        onCancel={() => {
          setRegisterOpen(false)
          resetRegisterForm()
        }}
      />
    </div>
  )
}
