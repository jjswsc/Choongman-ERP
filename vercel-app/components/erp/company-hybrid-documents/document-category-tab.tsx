"use client"

import * as React from "react"
import { Search } from "lucide-react"
import type { CompanyHybridDocumentCategory } from "@/lib/api-client"
import {
  deleteCompanyHybridDocumentCategory,
  saveCompanyHybridDocumentCategory,
} from "@/lib/api-client"
import { translateApiMessage } from "@/lib/translate-api-message"
import { appAlert, appConfirm } from "@/lib/app-message"
import {
  COMPANY_HYBRID_DOC_CATEGORY_GLOBAL_STORE,
  isCompanyHybridDocCategoryGlobalStore,
  isCompanyHybridDocCategoryRoot,
  pickCompanyHybridDocCategoriesForPicker,
  sortCompanyHybridDocCategoriesTree,
} from "@/lib/company-hybrid-documents"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { FORM_CAT_NONE } from "@/components/erp/company-hybrid-documents/shared"
import { cn } from "@/lib/utils"

export type CompanyHybridDocumentCategoryTabProps = {
  categories: CompanyHybridDocumentCategory[]
  onReloadCategories: () => Promise<void>
  canManageCategories: boolean
  listCategoryFilter: string
  onListCategoryFilterChange: (value: string) => void
  onReloadList: () => void
  onUnauthorized: (httpStatus: number) => boolean
  t: (key: string) => string
}

export function CompanyHybridDocumentCategoryTab({
  categories,
  onReloadCategories,
  canManageCategories,
  listCategoryFilter,
  onListCategoryFilterChange,
  onReloadList,
  onUnauthorized,
  t,
}: CompanyHybridDocumentCategoryTabProps) {
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

  const categoriesForManageTab = React.useMemo(
    () => categories.filter((c) => isCompanyHybridDocCategoryGlobalStore(c.store)),
    [categories]
  )

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

  const categoryStoreKey = React.useCallback((store: string | null | undefined) => {
    const s = String(store ?? "").trim()
    return s || COMPANY_HYBRID_DOC_CATEGORY_GLOBAL_STORE
  }, [])

  const rootCategoriesForManage = React.useMemo(
    () =>
      categoriesForManageTab
        .filter((c) => isCompanyHybridDocCategoryRoot(c))
        .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id),
    [categoriesForManageTab]
  )

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

  const hasLegacyPerStoreCategories = React.useMemo(
    () => categories.some((c) => !isCompanyHybridDocCategoryGlobalStore(c.store)),
    [categories]
  )

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

  const handleCategoryListSearch = React.useCallback(async () => {
    setHasCategoryListQueried(true)
    setCategoryManageSearchApplied(categoryManageSearchInput.trim())
    setCategoriesLoading(true)
    try {
      await onReloadCategories()
    } finally {
      setCategoriesLoading(false)
    }
  }, [categoryManageSearchInput, onReloadCategories])

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
      if (onUnauthorized(res.httpStatus)) return
      void appAlert(translateApiMessage(String(res.message || "Error"), (k) => t(k)))
      return
    }
    setNewCategoryName("")
    setNewCategorySort("0")
    setNewCategoryParentId(FORM_CAT_NONE)
    await onReloadCategories()
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
      store: String(editingCategory.store || "").trim() || COMPANY_HYBRID_DOC_CATEGORY_GLOBAL_STORE,
      name,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
      parentCategoryId: editingCategory.parent_category_id,
    })
    if (!res.success) {
      if (onUnauthorized(res.httpStatus)) return
      void appAlert(translateApiMessage(String(res.message || "Error"), (k) => t(k)))
      return
    }
    setEditingCategory(null)
    await onReloadCategories()
    if (hasCategoryListQueried) void handleCategoryListSearch()
    if (listCategoryFilter === String(editingCategory.id)) onReloadList()
  }

  const onDeleteCategory = async (row: CompanyHybridDocumentCategory) => {
    if (!(await appConfirm(String(row.name) + " — " + t("companyHybridCategoryDelete") + "?"))) return
    const res = await deleteCompanyHybridDocumentCategory({ id: row.id })
    if (!res.success) {
      if (onUnauthorized(res.httpStatus)) return
      void appAlert(translateApiMessage(String(res.message || "Error"), (k) => t(k)))
      return
    }
    if (editingCategory?.id === row.id) setEditingCategory(null)
    if (listCategoryFilter === String(row.id)) onListCategoryFilterChange("all")
    await onReloadCategories()
    if (hasCategoryListQueried) void handleCategoryListSearch()
    onReloadList()
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-base">{t("companyHybridCategoryListTitle")}</CardTitle>
        <CardDescription>{t("companyHybridCategoryListHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {hasLegacyPerStoreCategories && categoriesForManageTab.length === 0 ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">{t("companyHybridCategoryLegacyHint")}</p>
        ) : null}
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
              <div ref={categoryDetailRef} className="space-y-2 rounded-md border bg-muted/30 p-3">
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
                    const depth = manageCategoryDepthById.get(c.id) ?? 0
                    const parentId =
                      c.parent_category_id != null && Number(c.parent_category_id) > 0
                        ? Number(c.parent_category_id)
                        : null
                    const parentName = parentId ? categoryById.get(parentId)?.name : null
                    const isSelected = categoryDetailId === c.id || editingCategory?.id === c.id
                    return (
                      <TableRow key={`${c.store}-${c.id}`} className={cn(isSelected && "bg-muted/50")}>
                        <TableCell className="text-muted-foreground">{c.sort_order}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{parentName || "—"}</TableCell>
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
                            {canManageCategories ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => startEditCategory(c)}
                              >
                                {t("companyHybridCategoryEdit")}
                              </Button>
                            ) : null}
                            {canManageCategories ? (
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
            <p className="whitespace-pre-line text-xs text-muted-foreground">
              {t("companyHybridCategoryGlobalHint")}
              {"\n"}
              {t("companyHybridCategoryHierarchyHint")}
            </p>
          </div>
          {!canManageCategories ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">{t("companyHybridCategoryNoPermissionHint")}</p>
          ) : null}
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
              <Select
                value={newCategoryParentId}
                onValueChange={setNewCategoryParentId}
                disabled={!canManageCategories}
              >
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

          {editingCategory ? (
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
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
