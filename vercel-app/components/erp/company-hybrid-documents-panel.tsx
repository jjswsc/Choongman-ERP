"use client"

import * as React from "react"
import {
  ArrowDownUp,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronDown,
  CircleHelp,
  FileStack,
  FileUp,
  Link2,
  Mail,
  Pencil,
  Trash2,
  ExternalLink,
  LayoutList,
  FilePlus,
  Tags,
  Search,
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
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
  COMPANY_HYBRID_DOC_CATEGORY_GLOBAL_STORE,
  companyHybridDocVisibilityFromDocType,
  isCompanyHybridDocTypePermissionMeta,
  isCompanyHybridDocCategoryRoot,
  isCompanyHybridDocCategoryGlobalStore,
  pickCompanyHybridDocCategoriesForPicker,
  sortCompanyHybridDocCategoriesTree,
  type CompanyHybridDocVisibility,
  isCompanyHybridDocsListAllStoresParam,
} from "@/lib/company-hybrid-documents"
import {
  documentHasCorrespondence,
  getCorrespondenceFromMetadata,
} from "@/lib/company-hybrid-correspondence"

const FORM_CAT_NONE = "0"
/** 목록 공문 필터 Select — 빈 값(전체)용 (Radix value="" 지양) */
const LIST_CORR_SELECT_NONE = "__none__"

type CorrespondencePresence = "all" | "yes" | "no"

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

type MainTab = "list" | "register" | "categories" | "correspondence"

export function CompanyHybridDocumentsPanel() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth, initialized, setAuth } = useAuth()
  const { stores, loading: storeLoading, formatStoreLabel, resolveStoreKey } = useStoreList()

  const [mainTab, setMainTab] = React.useState<MainTab>("list")
  const [selectedStore, setSelectedStore] = React.useState("")

  const [listCategoryFilter, setListCategoryFilter] = React.useState("all")
  const [listTitleSearch, setListTitleSearch] = React.useState("")
  /** null = 등록일 최신순(서버 기본), asc/desc = 제목 정렬 */
  const [titleSort, setTitleSort] = React.useState<"asc" | "desc" | null>(null)

  const [listCorrPresence, setListCorrPresence] = React.useState<CorrespondencePresence>("all")
  const [listCorrDirection, setListCorrDirection] = React.useState<"" | "outbound" | "inbound">("")
  const [listCorrStatus, setListCorrStatus] = React.useState<"" | "draft" | "sent" | "filed" | "replied">("")
  const [listCorrCounterpartySearch, setListCorrCounterpartySearch] = React.useState("")

  const [list, setList] = React.useState<CompanyHybridDocumentListItem[]>([])
  const [loading, setLoading] = React.useState(false)
  /** 목록 API는 검색 버튼(또는 조회 후 제목 정렬)으로만 호출 */
  const [hasSearched, setHasSearched] = React.useState(false)
  const [categories, setCategories] = React.useState<CompanyHybridDocumentCategory[]>([])

  const [driveTitle, setDriveTitle] = React.useState("")
  const [formCategoryId, setFormCategoryId] = React.useState(FORM_CAT_NONE)
  const [externalUrl, setExternalUrl] = React.useState("")
  const [formVisibility, setFormVisibility] = React.useState<CompanyHybridDocVisibility>("all")
  const [validFrom, setValidFrom] = React.useState("")
  const [validTo, setValidTo] = React.useState("")
  const [note, setNote] = React.useState("")

  const [corrDirection, setCorrDirection] = React.useState<"" | "outbound" | "inbound">("")
  const [corrCounterparty, setCorrCounterparty] = React.useState("")
  const [corrOfficialRef, setCorrOfficialRef] = React.useState("")
  const [corrStatus, setCorrStatus] = React.useState<"" | "draft" | "sent" | "filed" | "replied">("")
  const [corrReplyDue, setCorrReplyDue] = React.useState("")
  const [corrChannel, setCorrChannel] = React.useState<"" | "mail" | "email" | "visit" | "other">("")
  /** 등록 탭 — 공문 필드 블록 표시(기존 공문 문서 편집·「공문 정보 추가」) */
  const [showCorrFields, setShowCorrFields] = React.useState(false)

  const [editing, setEditing] = React.useState<CompanyHybridDocumentListItem | null>(null)
  /** 수정 중 문서 매장(목록 필터 selectedStore 와 분리 — 상단 매장 변경 시 resetForm 방지) */
  const [editDocStore, setEditDocStore] = React.useState("")
  const [fileBusy, setFileBusy] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  const [newCategoryName, setNewCategoryName] = React.useState("")
  const [newCategorySort, setNewCategorySort] = React.useState("0")
  const [newCategoryParentId, setNewCategoryParentId] = React.useState(FORM_CAT_NONE)
  const [editingCategory, setEditingCategory] = React.useState<{
    id: number
    name: string
    sort_order: number
    store: string
    parent_category_id: number | null
  } | null>(null)
  const [categoryManageSearchInput, setCategoryManageSearchInput] = React.useState("")
  const [categoryManageSearchApplied, setCategoryManageSearchApplied] = React.useState("")
  const [hasCategoryListQueried, setHasCategoryListQueried] = React.useState(false)
  const [categoriesLoading, setCategoriesLoading] = React.useState(false)
  const [categoryDetailId, setCategoryDetailId] = React.useState<number | null>(null)
  const categoryDetailRef = React.useRef<HTMLDivElement>(null)
  const categoryEditRef = React.useRef<HTMLDivElement>(null)

  const buildCorrespondenceApiBody = React.useCallback((): Record<string, unknown> | null => {
    const o: Record<string, unknown> = {}
    if (corrDirection === "outbound" || corrDirection === "inbound") o.direction = corrDirection
    const cp = corrCounterparty.trim()
    if (cp) o.counterparty = cp
    const ref = corrOfficialRef.trim()
    if (ref) o.officialRef = ref
    if (corrStatus === "draft" || corrStatus === "sent" || corrStatus === "filed" || corrStatus === "replied") {
      o.status = corrStatus
    }
    const rd = corrReplyDue.trim().slice(0, 10)
    if (rd && /^\d{4}-\d{2}-\d{2}$/.test(rd)) o.replyDue = rd
    if (corrChannel === "mail" || corrChannel === "email" || corrChannel === "visit" || corrChannel === "other") {
      o.channel = corrChannel
    }
    return Object.keys(o).length > 0 ? o : null
  }, [corrDirection, corrCounterparty, corrOfficialRef, corrStatus, corrReplyDue, corrChannel])

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

  const categoryById = React.useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const categoriesForPicker = React.useMemo(() => {
    const base = pickCompanyHybridDocCategoriesForPicker(categories)
    if (editing?.category_id != null && editing.category_id > 0) {
      const cur = categories.find((c) => c.id === editing.category_id)
      if (cur && !base.some((c) => c.id === cur.id)) return [...base, cur]
    }
    return base
  }, [categories, editing?.category_id])

  const { ordered: orderedCategoriesForPicker, depthById: categoryDepthById } = React.useMemo(
    () => sortCompanyHybridDocCategoriesTree(categoriesForPicker),
    [categoriesForPicker]
  )

  /** 카테고리 탭 — 추가·수정 폼(전사 공통 `__company__`만) */
  const categoriesForManageTab = React.useMemo(
    () => categories.filter((c) => isCompanyHybridDocCategoryGlobalStore(c.store)),
    [categories]
  )

  /** 카테고리 탭 — 조회 목록(공통 우선, 없으면 매장별 레거시 포함) */
  const categoriesForManageTabList = React.useMemo(
    () => pickCompanyHybridDocCategoriesForPicker(categories),
    [categories]
  )

  const { ordered: orderedManageCategories, depthById: manageCategoryDepthById } = React.useMemo(
    () => sortCompanyHybridDocCategoriesTree(categoriesForManageTabList),
    [categoriesForManageTabList]
  )

  const filteredManageCategories = React.useMemo(() => {
    const q = categoryManageSearchApplied.trim().toLowerCase()
    if (!q) return orderedManageCategories
    return orderedManageCategories.filter((c) => {
      const path = (categoryLabelById.get(c.id) || c.name).toLowerCase()
      const parentId =
        c.parent_category_id != null && Number(c.parent_category_id) > 0 ? Number(c.parent_category_id) : null
      const parentName = ((parentId ? categoryById.get(parentId)?.name : "") || "").toLowerCase()
      return (
        path.includes(q) ||
        c.name.toLowerCase().includes(q) ||
        parentName.includes(q) ||
        String(c.sort_order).includes(q)
      )
    })
  }, [orderedManageCategories, categoryManageSearchApplied, categoryLabelById, categoryById])

  const categoryDetailRow = React.useMemo(
    () =>
      categoryDetailId != null
        ? categoriesForManageTabList.find((c) => c.id === categoryDetailId) ?? null
        : null,
    [categoryDetailId, categoriesForManageTabList]
  )

  const categoryListSearchActive = categoryManageSearchApplied.trim().length > 0

  const startEditCategory = React.useCallback((c: CompanyHybridDocumentCategory) => {
    setCategoryDetailId(c.id)
    setEditingCategory({
      id: c.id,
      name: c.name,
      sort_order: c.sort_order,
      store: c.store,
      parent_category_id: c.parent_category_id ?? null,
    })
    requestAnimationFrame(() => {
      categoryEditRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
    })
  }, [])

  React.useEffect(() => {
    if (categoryDetailId == null) return
    categoryDetailRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [categoryDetailId])

  React.useEffect(() => {
    if (mainTab !== "categories") {
      setCategoryDetailId(null)
      setCategoryManageSearchInput("")
      setCategoryManageSearchApplied("")
      setHasCategoryListQueried(false)
    }
  }, [mainTab])

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

  const registerStoreSelectOptions = React.useMemo(
    () => visibleStores.filter((st) => st && !isCompanyHybridDocsListAllStoresParam(st)),
    [visibleStores]
  )

  const rootCategoriesForManage = React.useMemo(
    () =>
      categoriesForManageTab
        .filter((c) => isCompanyHybridDocCategoryRoot(c))
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    [categoriesForManageTab]
  )

  const categoryStoreKey = React.useCallback((store: string | null | undefined) => {
    const s = String(store ?? "").trim()
    return s || COMPANY_HYBRID_DOC_CATEGORY_GLOBAL_STORE
  }, [])

  const rootCategoriesForEditing = React.useMemo(() => {
    if (!editingCategory) return rootCategoriesForManage
    const key = categoryStoreKey(editingCategory.store)
    return categories
      .filter(
        (c) =>
          categoryStoreKey(c.store) === key &&
          isCompanyHybridDocCategoryRoot(c) &&
          c.id !== editingCategory.id
      )
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
  }, [editingCategory, categories, rootCategoriesForManage, categoryStoreKey])

  const canMutateDocStore = React.useCallback(
    (rowStore: string) => {
      if (!auth) return false
      return canAccessStoreForCompanyHybridDocs(authToJwtPayload(auth), String(rowStore || "").trim())
    },
    [auth]
  )

  const documentSaveStore = React.useMemo(() => {
    if (editing?.id) {
      return editDocStore.trim() || String(editing.store || "").trim() || writeStoreForMutations
    }
    return writeStoreForMutations
  }, [editing, editDocStore, writeStoreForMutations])

  const canSaveDocument = React.useMemo(() => {
    const ws = documentSaveStore
    if (!ws || !canMutateDocStore(ws)) return false
    if (editing?.id) {
      const oldSt = String(editing.store || "").trim()
      if (oldSt && oldSt !== ws && !canMutateDocStore(oldSt)) return false
    }
    return true
  }, [documentSaveStore, editing, canMutateDocStore])

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
    const res = await getCompanyHybridDocumentCategories({ store: COMPANY_HYBRID_DOCS_STORE_ALL })
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
  }, [initialized, auth, t, setAuth])

  React.useEffect(() => {
    void loadCategories()
  }, [loadCategories])

  const handleCategoryListSearch = React.useCallback(async () => {
    setHasCategoryListQueried(true)
    setCategoryManageSearchApplied(categoryManageSearchInput.trim())
    setCategoriesLoading(true)
    try {
      await loadCategories()
    } finally {
      setCategoriesLoading(false)
    }
  }, [categoryManageSearchInput, loadCategories])

  type ListFetchOverrides = {
    sortTitle?: "asc" | "desc" | null
    categoryId?: string
    searchTitle?: string
    corrPresence?: CorrespondencePresence
    corrDirection?: "" | "outbound" | "inbound"
    corrStatus?: "" | "draft" | "sent" | "filed" | "replied"
    corrCounterpartySearch?: string
  }

  const load = React.useCallback(async (overrides?: ListFetchOverrides) => {
    if (!initialized || !auth) return
    if (!selectedStore) return
    const sortTitle = overrides?.sortTitle !== undefined ? overrides.sortTitle : titleSort
    const categoryId = overrides?.categoryId ?? listCategoryFilter
    const searchTitle = overrides?.searchTitle ?? listTitleSearch
    const corrPresence = overrides?.corrPresence ?? listCorrPresence
    const corrDirection = overrides?.corrDirection ?? listCorrDirection
    const corrStatus = overrides?.corrStatus ?? listCorrStatus
    const corrCounterpartySearch =
      overrides?.corrCounterpartySearch ?? listCorrCounterpartySearch
    setLoading(true)
    try {
      const q: Parameters<typeof getCompanyHybridDocuments>[0] = { store: selectedStore }
      q.categoryId = categoryId
      if (searchTitle.trim()) q.searchTitle = searchTitle.trim()
      if (sortTitle) q.sortTitle = sortTitle
      if (corrPresence !== "all") q.corrPresence = corrPresence
      if (corrDirection) q.corrDirection = corrDirection
      if (corrStatus) q.corrStatus = corrStatus
      if (corrCounterpartySearch.trim()) q.corrCounterpartySearch = corrCounterpartySearch.trim()
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
    listCategoryFilter,
    listTitleSearch,
    titleSort,
    listCorrPresence,
    listCorrDirection,
    listCorrStatus,
    listCorrCounterpartySearch,
    t,
    initialized,
    auth,
    setAuth,
  ])

  const handleListSearch = React.useCallback(() => {
    setHasSearched(true)
    void load()
  }, [load])

  const invalidateListSearch = React.useCallback(() => {
    setHasSearched(false)
    setList([])
    setTitleSort(null)
  }, [])

  const onListDropdownFilterChange = React.useCallback(() => {
    setHasSearched(false)
    setList([])
    setTitleSort(null)
  }, [])

  const resetForm = () => {
    setDriveTitle("")
    setFormCategoryId(FORM_CAT_NONE)
    setExternalUrl("")
    setFormVisibility("all")
    setValidFrom("")
    setValidTo("")
    setNote("")
    setCorrDirection("")
    setCorrCounterparty("")
    setCorrOfficialRef("")
    setCorrStatus("")
    setCorrReplyDue("")
    setCorrChannel("")
    setShowCorrFields(false)
    setEditing(null)
    setEditDocStore("")
  }

  const applyListStoreFilterChange = React.useCallback(
    (v: string) => {
      setSelectedStore(v)
      if (editing) return
      setListCorrPresence("all")
      setListCorrDirection("")
      setListCorrStatus("")
      setListCorrCounterpartySearch("")
      invalidateListSearch()
      resetForm()
    },
    [editing, invalidateListSearch]
  )

  const fillFrom = (row: CompanyHybridDocumentListItem) => {
    setDriveTitle(row.title)
    setFormCategoryId(
      row.category_id != null && row.category_id > 0
        ? String(row.category_id)
        : FORM_CAT_NONE
    )
    // Drive: external_url. 업로드(supabase): public_url만 채워지므로 수정 화면에서도 링크가 보이게 한다.
    setExternalUrl(String(row.external_url || row.public_url || "").trim())
    setFormVisibility(companyHybridDocVisibilityFromDocType(row.doc_type))
    setValidFrom(row.valid_from ? String(row.valid_from).slice(0, 10) : "")
    setValidTo(row.valid_to ? String(row.valid_to).slice(0, 10) : "")
    setNote(row.note || "")
    const c = getCorrespondenceFromMetadata(row.metadata)
    setCorrDirection(c?.direction === "inbound" || c?.direction === "outbound" ? c.direction : "")
    setCorrCounterparty(c?.counterparty || "")
    setCorrOfficialRef(c?.officialRef || "")
    setCorrStatus(
      c?.status === "draft" || c?.status === "sent" || c?.status === "filed" || c?.status === "replied"
        ? c.status
        : ""
    )
    setCorrReplyDue(c?.replyDue ? String(c.replyDue).slice(0, 10) : "")
    setCorrChannel(
      c?.channel === "mail" || c?.channel === "email" || c?.channel === "visit" || c?.channel === "other"
        ? c.channel
        : ""
    )
    setShowCorrFields(documentHasCorrespondence(row.metadata))
    const rowStore = String(row.store || "").trim()
    setEditDocStore(rowStore)
    setEditing(row)
  }

  const applyCorrespondenceToSaveBody = React.useCallback(
    (body: Record<string, unknown>) => {
      if (showCorrFields) {
        body.correspondence = buildCorrespondenceApiBody()
      }
    },
    [showCorrFields, buildCorrespondenceApiBody]
  )

  const buildCategoryIdPayload = () =>
    formCategoryId !== FORM_CAT_NONE ? Number(formCategoryId) : undefined

  const storeForDocumentMutation = (): string | null => documentSaveStore

  const onSaveUploadedDocMeta = async () => {
    if (!editing?.id || editing.source === "drive") return
    const ws = storeForDocumentMutation()
    if (!ws) {
      void appAlert(t("companyHybridDocPickStoreForRegister"))
      return
    }
    if (!driveTitle.trim()) {
      void appAlert(t("companyHybridDocTitle"))
      return
    }
    const body: Record<string, unknown> = {
      id: editing.id,
      store: ws,
      title: driveTitle.trim(),
      visibility: formVisibility,
      validFrom: validFrom || undefined,
      validTo: validTo || undefined,
      note: note.trim() || undefined,
      categoryId: buildCategoryIdPayload(),
    }
    applyCorrespondenceToSaveBody(body)
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

  const onSaveDrive = async () => {
    const ws = storeForDocumentMutation()
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
      visibility: formVisibility,
      source: "drive",
      externalUrl: externalUrl.trim(),
      validFrom: validFrom || undefined,
      validTo: validTo || undefined,
      note: note.trim() || undefined,
      categoryId: buildCategoryIdPayload(),
    }
    applyCorrespondenceToSaveBody(body)
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
      const uploadBody: Record<string, unknown> = {
        store: ws,
        title: driveTitle.trim(),
        visibility: formVisibility,
        note: note.trim() || undefined,
        validFrom: validFrom || undefined,
        validTo: validTo || undefined,
        fileName: f.name,
        fileSize: f.size,
        storagePath: p.storagePath,
        mime,
        categoryId: buildCategoryIdPayload(),
      }
      applyCorrespondenceToSaveBody(uploadBody)
      const done = await completeCompanyHybridDocumentUpload(uploadBody)
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
    const ws = COMPANY_HYBRID_DOC_CATEGORY_GLOBAL_STORE
    const name = newCategoryName.trim()
    if (!name) {
      void appAlert(t("companyHybridCategoryName"))
      return
    }
    const sortOrder = Math.floor(Number(newCategorySort) || 0)
    const parentCategoryId =
      newCategoryParentId !== FORM_CAT_NONE ? Math.floor(Number(newCategoryParentId) || 0) : null
    const res = await saveCompanyHybridDocumentCategory({
      store: ws,
      name,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      parentCategoryId: parentCategoryId && parentCategoryId > 0 ? parentCategoryId : null,
    })
    if (!res.success) {
      if (redirectToAdminLoginIfUnauthorized(res.httpStatus, setAuth)) return
      void appAlert(translateApiMessage(String(res.message || "Error"), (k) => t(k)))
      return
    }
    setNewCategoryName("")
    setNewCategorySort("0")
    setNewCategoryParentId(FORM_CAT_NONE)
    await loadCategories()
    if (hasCategoryListQueried) void handleCategoryListSearch()
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
      store:
        String(editingCategory.store || "").trim() || COMPANY_HYBRID_DOC_CATEGORY_GLOBAL_STORE,
      name,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      parentCategoryId: editingCategory.parent_category_id,
    })
    if (!res.success) {
      if (redirectToAdminLoginIfUnauthorized(res.httpStatus, setAuth)) return
      void appAlert(translateApiMessage(String(res.message || "Error"), (k) => t(k)))
      return
    }
    setEditingCategory(null)
    await loadCategories()
    if (hasCategoryListQueried) void handleCategoryListSearch()
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
    await loadCategories()
    if (hasCategoryListQueried) void handleCategoryListSearch()
    void load()
  }

  const canPickStore = isOfficeRole(String(auth?.role || "")) || isFranchiseeRole(String(auth?.role || ""))

  const canManageCategories = React.useMemo(
    () => (auth ? canMutateDocStore(COMPANY_HYBRID_DOC_CATEGORY_GLOBAL_STORE) : false),
    [auth, canMutateDocStore]
  )

  const hasLegacyPerStoreCategories = React.useMemo(
    () => categories.some((c) => !isCompanyHybridDocCategoryGlobalStore(c.store)),
    [categories]
  )

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

  const listShowStoreColumn = isCompanyHybridDocsListAllStoresParam(selectedStore)

  const hasActiveCorrFilters =
    listCorrPresence !== "all" ||
    !!listCorrDirection ||
    !!listCorrStatus ||
    !!listCorrCounterpartySearch.trim()

  const [listCorrFiltersOpen, setListCorrFiltersOpen] = React.useState(false)

  React.useEffect(() => {
    if (hasActiveCorrFilters) setListCorrFiltersOpen(true)
  }, [hasActiveCorrFilters])

  const formatCorrRowHint = React.useCallback(
    (corr: ReturnType<typeof getCorrespondenceFromMetadata>) => {
      if (!corr) return ""
      const parts: string[] = []
      if (corr.direction) parts.push(labelCorrDirectionCell(corr.direction))
      if (corr.counterparty) parts.push(corr.counterparty)
      if (corr.officialRef) parts.push(corr.officialRef)
      if (corr.status) parts.push(labelCorrStatusCell(corr.status))
      if (corr.replyDue) parts.push(formatHybridDocumentIssueDate(corr.replyDue, lang))
      return parts.join(" · ")
    },
    [labelCorrDirectionCell, labelCorrStatusCell, lang]
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
            <TabsTrigger value="register" className={adminTabsTriggerCn}>
              <FilePlus className={adminTabsIconCn} aria-hidden />
              {t("companyHybridDocTabRegister")}
            </TabsTrigger>
            <TabsTrigger value="categories" className={adminTabsTriggerCn}>
              <Tags className={adminTabsIconCn} aria-hidden />
              {t("companyHybridDocTabCategories")}
            </TabsTrigger>
            <TabsTrigger value="correspondence" className={adminTabsTriggerCn}>
              <Mail className={adminTabsIconCn} aria-hidden />
              {t("companyHybridCorrTab")}
            </TabsTrigger>
          </TabsList>
        </AdminTabsBarWithHelp>

        <TabsContent value="list" className={cn(adminTabsContentCn, "space-y-4")}>
          <p className="text-sm text-muted-foreground">{t("companyHybridDocListFilterHint")}</p>
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
                      onListDropdownFilterChange()
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("companyHybridDocCategoryFilterAll")}</SelectItem>
                      <SelectItem value="uncategorized">
                        {t("companyHybridDocCategoryFilterUncat")}
                      </SelectItem>
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
                <Button type="button" variant="secondary" onClick={handleListSearch} disabled={loading}>
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
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        listCorrFiltersOpen && "rotate-180"
                      )}
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
                      onListDropdownFilterChange()
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
                      onListDropdownFilterChange()
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
                      onListDropdownFilterChange()
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
              ) : !hasSearched ? (
                <p className="text-sm text-muted-foreground">{t("msg_click_query")}</p>
              ) : list.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("companyHybridDocListEmpty")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {listShowStoreColumn ? (
                          <TableHead className="whitespace-nowrap">{t("companyHybridDocColStore")}</TableHead>
                        ) : null}
                        <TableHead
                          className="min-w-[10rem]"
                          aria-sort={
                            titleSort === "asc" ? "ascending" : titleSort === "desc" ? "descending" : undefined
                          }
                        >
                          <button
                            type="button"
                            className={cn(
                              "-mx-1 -my-0.5 inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-1 font-medium",
                              "hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            )}
                            onClick={() => {
                              const next = titleSort === "asc" ? "desc" : "asc"
                              setTitleSort(next)
                              if (hasSearched) void load({ sortTitle: next })
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
                        <TableHead className="min-w-[5rem] max-w-[9rem]">
                          {t("companyHybridDocColCategory")}
                        </TableHead>
                        <TableHead className="hidden whitespace-nowrap md:table-cell">
                          {t("companyHybridDocColValidity")}
                        </TableHead>
                        <TableHead className="w-12 text-center">{t("companyHybridDocColType")}</TableHead>
                        <TableHead className="w-[7.5rem] text-right">{t("stockColAction")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {list.map((row) => {
                        const canM = canMutateDocStore(row.store)
                        const hasCorr = documentHasCorrespondence(row.metadata)
                        const corr = hasCorr ? getCorrespondenceFromMetadata(row.metadata) : null
                        const showVisibilityBadge =
                          companyHybridDocVisibilityFromDocType(row.doc_type) !== "all"
                        return (
                        <TableRow key={row.id}>
                          {listShowStoreColumn ? (
                            <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                              {formatStoreLabel(row.store)}
                            </TableCell>
                          ) : null}
                          <TableCell>
                            <div className="font-medium leading-snug">{row.title}</div>
                            {(showVisibilityBadge || hasCorr) && (
                              <div className="mt-1 flex flex-wrap items-center gap-1">
                                {showVisibilityBadge ? (
                                  <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                                    {labelForVisibility(row)}
                                  </Badge>
                                ) : null}
                                {hasCorr && corr ? (
                                  <span
                                    className="inline-flex items-center gap-1 text-muted-foreground"
                                    title={formatCorrRowHint(corr)}
                                  >
                                    <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <span className="max-w-[14rem] truncate text-[11px]">
                                      {formatCorrRowHint(corr)}
                                    </span>
                                    <span className="sr-only">{t("companyHybridCorrTab")}</span>
                                  </span>
                                ) : null}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[9rem] truncate text-sm text-muted-foreground">
                            {labelForDocumentCategory(row)}
                          </TableCell>
                          <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground md:table-cell">
                            {!row.valid_from && !row.valid_to ? (
                              "—"
                            ) : (
                              <>
                                <div>{formatHybridDocumentIssueDate(row.valid_from, lang)}</div>
                                {row.valid_to ? (
                                  <div className="text-[11px] text-muted-foreground/80">
                                    ~ {formatHybridDocumentIssueDate(row.valid_to, lang)}
                                  </div>
                                ) : null}
                              </>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <span
                              className={cn(
                                "inline-flex h-8 w-8 items-center justify-center rounded-md",
                                row.source === "drive" ? "bg-amber-500/15 text-amber-800 dark:text-amber-200" : "bg-sky-500/15 text-sky-800 dark:text-sky-200"
                              )}
                              title={
                                row.source === "drive"
                                  ? t("companyHybridDocSourceDrive")
                                  : t("companyHybridDocSourceStorage")
                              }
                            >
                              {row.source === "drive" ? (
                                <Link2 className="h-4 w-4" aria-hidden />
                              ) : (
                                <FileUp className="h-4 w-4" aria-hidden />
                              )}
                            </span>
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
                              {canM && (
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    fillFrom(row)
                                    const rs = String(row.store || "").trim()
                                    if (rs) setSelectedStore(rs)
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
          {!editing ? (
            <Card className="mb-4">
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
                </div>
              </CardHeader>
            </Card>
          ) : null}
          <Card className="mb-6">
            <CardHeader className="py-4">
              <CardTitle className="text-base">{t("companyHybridDocRegisterMetaTitle")}</CardTitle>
              <CardDescription className="whitespace-pre-line">
                {editing
                  ? `${t("companyHybridDocEdit")}: ${editing.title}\n${t("companyHybridDocEditStoreHint")}`
                  : t("companyHybridDocRegisterMetaSub")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {editing ? (
                <CompanyHybridDocumentsStoreField
                  labelStore={t("companyHybridDocEditStoreLabel")}
                  labelAllStores={t("companyHybridDocStoreAll")}
                  canPickStore={canPickStore}
                  storeSelectOptions={registerStoreSelectOptions}
                  selectedStore={editDocStore}
                  formatStoreLabel={formatStoreLabel}
                  onStoreChange={(v) => {
                    if (v && !isCompanyHybridDocsListAllStoresParam(v)) setEditDocStore(v)
                  }}
                />
              ) : null}
              <div className="space-y-1.5">
                <Label>{t("companyHybridDocTitle")}</Label>
                <Input value={driveTitle} onChange={(e) => setDriveTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t("companyHybridDocCategorySelect")}</Label>
                <Select value={formCategoryId} onValueChange={setFormCategoryId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={FORM_CAT_NONE}>
                      {t("companyHybridDocCategoryFilterUncat")}
                    </SelectItem>
                    {orderedCategoriesForPicker.map((c) => (
                      <SelectItem key={`${c.store}-${c.id}`} value={String(c.id)}>
                        {labelCategoryOption(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1">
                    <Label>{t("companyHybridDocPermission")}</Label>
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
                            aria-label={t("companyHybridDocPermissionHelpTitle")}
                          >
                            <CircleHelp className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[min(24rem,90vw)] text-left whitespace-normal">
                          <p className="font-medium">{t("companyHybridDocPermissionHelpTitle")}</p>
                          <p className="mt-1">- {t("companyHybridDocPermissionHelpAll")}</p>
                          <p>- {t("companyHybridDocPermissionHelpOffice")}</p>
                          <p>- {t("companyHybridDocPermissionHelpStoreAdmin")}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <Select value={formVisibility} onValueChange={(v) => setFormVisibility(v as CompanyHybridDocVisibility)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("companyHybridDocPermissionAll")}</SelectItem>
                      <SelectItem value="office">{t("companyHybridDocPermissionOffice")}</SelectItem>
                      <SelectItem value="store_admin">{t("companyHybridDocPermissionStoreAdmin")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
              {!showCorrFields ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setShowCorrFields(true)}
                >
                  <Mail className="h-3.5 w-3.5" aria-hidden />
                  {t("companyHybridCorrAddFieldsBtn")}
                </Button>
              ) : (
              <div className="space-y-3 rounded-md border border-dashed p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{t("companyHybridCorrRegisterSectionTitle")}</p>
                    <p className="text-xs text-muted-foreground">{t("companyHybridCorrRegisterSectionSub")}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 text-muted-foreground"
                    onClick={() => {
                      setShowCorrFields(false)
                      setCorrDirection("")
                      setCorrCounterparty("")
                      setCorrOfficialRef("")
                      setCorrStatus("")
                      setCorrReplyDue("")
                      setCorrChannel("")
                    }}
                  >
                    {t("companyHybridCorrHideFieldsBtn")}
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("companyHybridCorrDirection")}</Label>
                    <Select
                      value={corrDirection || LIST_CORR_SELECT_NONE}
                      onValueChange={(v) =>
                        setCorrDirection(v === LIST_CORR_SELECT_NONE ? "" : (v as "outbound" | "inbound"))
                      }
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
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("companyHybridCorrStatus")}</Label>
                    <Select
                      value={corrStatus || LIST_CORR_SELECT_NONE}
                      onValueChange={(v) =>
                        setCorrStatus(
                          v === LIST_CORR_SELECT_NONE ? "" : (v as "draft" | "sent" | "filed" | "replied")
                        )
                      }
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
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">{t("companyHybridCorrColCounterparty")}</Label>
                    <Input value={corrCounterparty} onChange={(e) => setCorrCounterparty(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("companyHybridCorrOfficialRef")}</Label>
                    <Input value={corrOfficialRef} onChange={(e) => setCorrOfficialRef(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t("companyHybridCorrReplyDue")}</Label>
                    <Input type="date" value={corrReplyDue} onChange={(e) => setCorrReplyDue(e.target.value)} />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs">{t("companyHybridCorrChannel")}</Label>
                    <Select
                      value={corrChannel || LIST_CORR_SELECT_NONE}
                      onValueChange={(v) =>
                        setCorrChannel(
                          v === LIST_CORR_SELECT_NONE ? "" : (v as "mail" | "email" | "visit" | "other")
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("companyHybridCorrChannelPh")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={LIST_CORR_SELECT_NONE}>{t("companyHybridCorrChannelPh")}</SelectItem>
                        <SelectItem value="mail">{t("companyHybridCorrChannelMail")}</SelectItem>
                        <SelectItem value="email">{t("companyHybridCorrChannelEmail")}</SelectItem>
                        <SelectItem value="visit">{t("companyHybridCorrChannelVisit")}</SelectItem>
                        <SelectItem value="other">{t("companyHybridCorrChannelOther")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              )}
              {editing && (
                <div className="flex flex-wrap gap-2 border-t pt-3">
                  <Button
                    type="button"
                    onClick={() =>
                      void (editing.source === "drive" ? onSaveDrive() : onSaveUploadedDocMeta())
                    }
                    disabled={!canSaveDocument}
                  >
                    {t("companyHybridDocSave")}
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    {t("companyHybridDocCancel")}
                  </Button>
                </div>
              )}
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
                  <Input
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    readOnly={editing != null && editing.source !== "drive"}
                    className={editing != null && editing.source !== "drive" ? "bg-muted/50" : undefined}
                    title={
                      editing != null && editing.source !== "drive"
                        ? t("companyHybridDocUploadLinkReadonlyHint")
                        : undefined
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => void onSaveDrive()}
                    disabled={
                      !canSaveDocument || (editing != null && editing.source !== "drive")
                    }
                  >
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
                  disabled={!documentSaveStore || fileBusy || editing != null}
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
            <CardHeader className="py-3">
              <CardTitle className="text-base">{t("companyHybridCategoryListTitle")}</CardTitle>
              <CardDescription>{t("companyHybridCategoryListHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {hasLegacyPerStoreCategories && categoriesForManageTab.length === 0 && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  {t("companyHybridCategoryLegacyHint")}
                </p>
              )}
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
                <div className="min-w-[12rem] flex-1 space-y-1.5">
                  <Label htmlFor="company-hybrid-category-search-top">{t("companyHybridCategorySearch")}</Label>
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      id="company-hybrid-category-search-top"
                      value={categoryManageSearchInput}
                      onChange={(e) => setCategoryManageSearchInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          void handleCategoryListSearch()
                        }
                      }}
                      placeholder={t("companyHybridCategorySearchPh")}
                      className="pl-9"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={categoriesLoading}
                  onClick={() => void handleCategoryListSearch()}
                >
                  {t("stockBtnSearch")}
                </Button>
              </div>

              {!hasCategoryListQueried ? (
                <p className="text-sm text-muted-foreground">{t("msg_click_query")}</p>
              ) : categoriesLoading ? (
                <p className="text-sm text-muted-foreground">…</p>
              ) : orderedManageCategories.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("companyHybridCategoryEmpty")}</p>
              ) : categoryListSearchActive && filteredManageCategories.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("companyHybridCategorySearchNoMatch")}</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {categoryListSearchActive
                      ? t("companyHybridCategorySearchCount")
                          .replace("{shown}", String(filteredManageCategories.length))
                          .replace("{total}", String(orderedManageCategories.length))
                      : t("companyHybridCategoryListAllCount").replace(
                          "{total}",
                          String(filteredManageCategories.length)
                        )}
                  </p>

                  {categoryDetailRow ? (
                    <div
                      ref={categoryDetailRef}
                      className="space-y-2 rounded-md border bg-muted/30 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="text-sm font-medium">{t("companyHybridCategoryDetailTitle")}</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => setCategoryDetailId(null)}
                        >
                          {t("companyHybridCategoryCloseDetail")}
                        </Button>
                      </div>
                      <dl className="grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-xs text-muted-foreground">{t("companyHybridCategoryDetailPath")}</dt>
                          <dd className="font-medium">
                            {categoryLabelById.get(categoryDetailRow.id) || categoryDetailRow.name}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">{t("companyHybridCategorySort")}</dt>
                          <dd>{categoryDetailRow.sort_order}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">{t("companyHybridCategoryColParent")}</dt>
                          <dd>
                            {categoryDetailRow.parent_category_id != null &&
                            Number(categoryDetailRow.parent_category_id) > 0
                              ? categoryById.get(Number(categoryDetailRow.parent_category_id))?.name || "—"
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">{t("companyHybridCategoryName")}</dt>
                          <dd>{categoryDetailRow.name}</dd>
                        </div>
                      </dl>
                      {canManageCategories ? (
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => startEditCategory(categoryDetailRow)}
                          >
                            {t("companyHybridCategoryEdit")}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="max-h-[min(28rem,60vh)] overflow-x-auto overflow-y-auto rounded-md border">
                      <Table>
                        <TableHeader className="sticky top-0 z-10 bg-card">
                          <TableRow>
                            <TableHead className="w-16">{t("companyHybridCategorySort")}</TableHead>
                            <TableHead>{t("companyHybridCategoryColParent")}</TableHead>
                            <TableHead>{t("companyHybridCategoryName")}</TableHead>
                            <TableHead className="text-right">{t("stockColAction")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredManageCategories.map((c) => {
                            const canCat = canManageCategories
                            const depth = manageCategoryDepthById.get(c.id) ?? 0
                            const parentId =
                              c.parent_category_id != null && Number(c.parent_category_id) > 0
                                ? Number(c.parent_category_id)
                                : null
                            const parentName = parentId ? categoryById.get(parentId)?.name : null
                            const isSelected =
                              categoryDetailId === c.id || editingCategory?.id === c.id
                            return (
                              <TableRow
                                key={`${c.store}-${c.id}`}
                                className={cn(isSelected && "bg-muted/50")}
                              >
                                <TableCell className="text-muted-foreground">{c.sort_order}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {parentName || "—"}
                                </TableCell>
                                <TableCell
                                  className="font-medium"
                                  style={{
                                    paddingLeft: depth > 0 ? `${Math.min(depth, 4) * 1.25}rem` : undefined,
                                  }}
                                >
                                  {depth > 0 ? (
                                    <span className="text-muted-foreground" aria-hidden>
                                      └{" "}
                                    </span>
                                  ) : null}
                                  {c.name}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="inline-flex flex-wrap justify-end gap-1">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={categoryDetailId === c.id ? "secondary" : "outline"}
                                      onClick={() => setCategoryDetailId(c.id)}
                                    >
                                      {t("companyHybridCategoryView")}
                                    </Button>
                                    {canCat ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => startEditCategory(c)}
                                      >
                                        {t("companyHybridCategoryEdit")}
                                      </Button>
                                    ) : null}
                                    {canCat ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="text-destructive hover:text-destructive"
                                        onClick={() => void onDeleteCategory(c)}
                                      >
                                        {t("companyHybridCategoryDelete")}
                                      </Button>
                                    ) : null}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </div>
                </>
              )}

              <div className="space-y-3 border-t pt-4">
                <div>
                  <p className="text-sm font-medium">{t("companyHybridCategoryManageTitle")}</p>
                  <p className="text-xs text-muted-foreground whitespace-pre-line">
                    {t("companyHybridCategoryGlobalHint")}
                    {"\n"}
                    {t("companyHybridCategoryHierarchyHint")}
                  </p>
                </div>
              {!canManageCategories && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  {t("companyHybridCategoryNoPermissionHint")}
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
                <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-1">
                  <Label>{t("companyHybridCategoryNew")}</Label>
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder={t("companyHybridCategoryName")}
                    disabled={!canManageCategories}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("companyHybridCategorySort")}</Label>
                  <Input
                    type="number"
                    value={newCategorySort}
                    onChange={(e) => setNewCategorySort(e.target.value)}
                    disabled={!canManageCategories}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("companyHybridCategoryParent")}</Label>
                  <Select value={newCategoryParentId} onValueChange={setNewCategoryParentId} disabled={!canManageCategories}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("companyHybridCategoryParentPh")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={FORM_CAT_NONE}>{t("companyHybridCategoryParentNone")}</SelectItem>
                      {rootCategoriesForManage.map((c) => (
                        <SelectItem key={`new-parent-${c.id}`} value={String(c.id)}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  onClick={() => void onAddCategory()}
                  disabled={!canManageCategories}
                >
                  {t("companyHybridCategoryAdd")}
                </Button>
              </div>

              {editingCategory && (
                <div
                  ref={categoryEditRef}
                  className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
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
                  <div className="space-y-1.5">
                    <Label>{t("companyHybridCategoryParent")}</Label>
                    <Select
                      value={
                        editingCategory.parent_category_id != null
                          ? String(editingCategory.parent_category_id)
                          : FORM_CAT_NONE
                      }
                      onValueChange={(v) =>
                        setEditingCategory((prev) =>
                          prev
                            ? {
                                ...prev,
                                parent_category_id: v !== FORM_CAT_NONE ? Math.floor(Number(v) || 0) : null,
                              }
                            : null
                        )
                      }
                      disabled={isCompanyHybridDocCategoryRoot(editingCategory)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("companyHybridCategoryParentPh")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={FORM_CAT_NONE}>{t("companyHybridCategoryParentNone")}</SelectItem>
                        {rootCategoriesForEditing.map((c) => (
                            <SelectItem key={`edit-parent-${c.id}`} value={String(c.id)}>
                              {c.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
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

              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="correspondence" className={cn(adminTabsContentCn, "space-y-4")}>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4" />
                {t("companyHybridCorrGuideTitle")}
              </CardTitle>
              <CardDescription>{t("companyHybridCorrTabHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground whitespace-pre-line">{t("companyHybridCorrGuideBody")}</p>
              <Button
                type="button"
                onClick={() => {
                  setListCorrPresence("yes")
                  setListCorrDirection("")
                  setListCorrStatus("")
                  setListCorrCounterpartySearch("")
                  setMainTab("list")
                  setHasSearched(true)
                  void load({
                    corrPresence: "yes",
                    corrDirection: "",
                    corrStatus: "",
                    corrCounterpartySearch: "",
                  })
                }}
              >
                {t("companyHybridCorrGoToFilteredList")}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
