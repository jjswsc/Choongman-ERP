"use client"

import * as React from "react"
import { UtensilsCrossed, FilePlus, Save, RotateCcw, Pencil, Trash2, Search, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import {
  getPosMenus,
  getPosMenuCategories,
  getPosMenuOptions,
  savePosMenu,
  savePosMenuOption,
  deletePosMenu,
  deletePosMenuOption,
  updatePosMenuSoldOut,
  type PosMenu,
  type PosMenuOption,
} from "@/lib/api-client"
import { cn } from "@/lib/utils"

const emptyForm = {
  code: "",
  name: "",
  category: "",
  price: "",
  imageUrl: "",
  vatIncluded: true,
  isActive: true,
}

export default function PosMenusPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [allCategories, setAllCategories] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(true)
  const [formData, setFormData] = React.useState(emptyForm)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState("all")
  const [soldOutTogglingId, setSoldOutTogglingId] = React.useState<string | null>(null)
  const [menuOptions, setMenuOptions] = React.useState<PosMenuOption[]>([])
  const [newOptionName, setNewOptionName] = React.useState("")
  const [newOptionModifier, setNewOptionModifier] = React.useState("0")

  React.useEffect(() => {
    Promise.all([getPosMenus(), getPosMenuCategories()])
      .then(([list, { categories }]) => {
        setMenus(list || [])
        setAllCategories(categories || [])
      })
      .catch(() => {
        setMenus([])
        setAllCategories([])
      })
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    if (!editingId) {
      setMenuOptions([])
      return
    }
    getPosMenuOptions({ menuId: editingId })
      .then(setMenuOptions)
      .catch(() => setMenuOptions([]))
  }, [editingId])

  const handleNewRegister = () => {
    setFormData(emptyForm)
    setEditingId(null)
  }

  const handleReset = () => {
    if (editingId) {
      const m = menus.find((x) => x.id === editingId)
      if (m) {
        setFormData({
          code: m.code,
          name: m.name,
          category: m.category,
          price: String(m.price),
          imageUrl: m.imageUrl,
          vatIncluded: m.vatIncluded,
          isActive: m.isActive,
        })
      }
    } else {
      setFormData(emptyForm)
    }
  }

  const handleSave = async () => {
    const code = formData.code.trim()
    const name = formData.name.trim()
    if (!code || !name) {
      alert(t("posMenuAlertCodeName"))
      return
    }
    if (!editingId && menus.some((m) => m.code === code)) {
      alert(t("itemsAlertCodeExists"))
      return
    }
    const res = await savePosMenu({
      id: editingId || undefined,
      code,
      name,
      category: formData.category.trim(),
      price: Number(formData.price) || 0,
      imageUrl: formData.imageUrl.trim(),
      vatIncluded: formData.vatIncluded,
      isActive: formData.isActive,
    })
    if (!res.success) {
      alert(translateApiMessage(res.message, t) || t("msg_save_fail_detail"))
      return
    }
    const newMenu: PosMenu = {
      id: editingId || "",
      code,
      name,
      category: formData.category.trim(),
      price: Number(formData.price) || 0,
      imageUrl: formData.imageUrl.trim(),
      vatIncluded: formData.vatIncluded,
      isActive: formData.isActive,
      sortOrder: 0,
    }
    if (editingId) {
      setMenus((prev) => prev.map((m) => (m.id === editingId ? { ...newMenu, id: editingId } : m)))
      alert(t("itemsAlertUpdated"))
    } else {
      getPosMenus().then(setMenus)
      alert(t("itemsAlertSaved"))
    }
    const newCat = formData.category.trim()
    if (newCat && !allCategories.includes(newCat)) {
      setAllCategories((prev) => [...prev, newCat].sort())
    }
    setFormData(emptyForm)
    setEditingId(null)
  }

  const handleEdit = (menu: PosMenu) => {
    setFormData({
      code: menu.code,
      name: menu.name,
      category: menu.category,
      price: String(menu.price),
      imageUrl: menu.imageUrl,
      vatIncluded: menu.vatIncluded,
      isActive: menu.isActive,
    })
    setEditingId(menu.id)
    setNewOptionName("")
    setNewOptionModifier("0")
  }

  const handleAddOption = async () => {
    if (!editingId || !newOptionName.trim()) return
    const res = await savePosMenuOption({
      menuId: Number(editingId),
      name: newOptionName.trim(),
      priceModifier: Number(newOptionModifier) || 0,
      sortOrder: menuOptions.length,
    })
    if (res.success) {
      getPosMenuOptions({ menuId: editingId }).then(setMenuOptions)
      setNewOptionName("")
      setNewOptionModifier("0")
    } else {
      alert(res.message)
    }
  }

  const handleDeleteOption = async (opt: PosMenuOption) => {
    if (!confirm(`"${opt.name}" ${t("posMenuConfirmDelete")}`)) return
    const res = await deletePosMenuOption({ id: opt.id })
    if (res.success) {
      setMenuOptions((prev) => prev.filter((o) => o.id !== opt.id))
    } else {
      alert(res.message)
    }
  }

  const handleDelete = async (menu: PosMenu) => {
    if (!confirm(`"${menu.name}" ${t("posMenuConfirmDelete")}`)) return
    const res = await deletePosMenu({ id: menu.id })
    if (!res.success) {
      alert(translateApiMessage(res.message, t) || t("msg_delete_fail_detail"))
      return
    }
    setMenus((prev) => prev.filter((m) => m.id !== menu.id))
    if (editingId === menu.id) {
      setFormData(emptyForm)
      setEditingId(null)
    }
    alert(t("itemsAlertDeleted"))
  }

  const handleSearch = () => setHasSearched(true)

  const todayStr = new Date().toISOString().slice(0, 10)
  const handleSoldOutToggle = async (menu: PosMenu) => {
    const isSoldOut = menu.soldOutDate === todayStr
    setSoldOutTogglingId(menu.id)
    try {
      const res = await updatePosMenuSoldOut({ id: menu.id, soldOut: !isSoldOut })
      if (res.success) {
        setMenus((prev) =>
          prev.map((m) =>
            m.id === menu.id
              ? { ...m, soldOutDate: !isSoldOut ? todayStr : null }
              : m
          )
        )
      } else {
        alert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      alert(String(e))
    } finally {
      setSoldOutTogglingId(null)
    }
  }

  const filteredMenus = React.useMemo(() => {
    if (!hasSearched) return []
    return menus.filter((m) => {
      const matchTerm =
        !searchTerm ||
        m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.code.toLowerCase().includes(searchTerm.toLowerCase())
      const matchCategory = categoryFilter === "all" || m.category === categoryFilter
      return matchTerm && matchCategory
    })
  }, [menus, hasSearched, searchTerm, categoryFilter])

  const categories = React.useMemo(() => {
    const fromMenus = new Set(menus.map((m) => m.category).filter(Boolean))
    const fromDb = new Set(allCategories)
    return Array.from(new Set([...fromDb, ...fromMenus])).sort()
  }, [menus, allCategories])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <UtensilsCrossed className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t("posMenuMgmt")}</h1>
            <p className="text-xs text-muted-foreground">{t("posMenuMgmtSub")}</p>
          </div>
        </div>

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          {/* Form */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h3 className="text-sm font-bold text-card-foreground">{t("posMenuFormTitle")}</h3>
                <p className="text-[11px] text-muted-foreground">
                  {editingId ? t("itemsFormEditDesc") : t("itemsFormNewDesc")}
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 px-3 text-[11px]" onClick={handleNewRegister}>
                <FilePlus className="h-3.5 w-3.5" />
                {t("itemsBtnNewRegister")}
              </Button>
            </div>
            <div className="flex flex-col gap-4 p-6">
              <div>
                <label className="text-xs font-semibold">{t("posMenuCode")}</label>
                <Input
                  placeholder="M001"
                  className="mt-1 h-10"
                  value={formData.code}
                  onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))}
                  disabled={!!editingId}
                />
              </div>
              <div>
                <label className="text-xs font-semibold">{t("posMenuName")}</label>
                <Input
                  placeholder={t("itemsNamePh")}
                  className="mt-1 h-10"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold">{t("posMenuCategory")}</label>
                <Select
                  value={formData.category || "_"}
                  onValueChange={(v) => setFormData((p) => ({ ...p, category: v === "_" ? "" : v }))}
                >
                  <SelectTrigger className="mt-1 h-10">
                    <SelectValue placeholder={t("itemsCategoryPh")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_">-</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-semibold">{t("posMenuPrice")}</label>
                <Input
                  type="number"
                  placeholder="0"
                  className="mt-1 h-10 text-right"
                  value={formData.price}
                  onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={formData.vatIncluded}
                    onChange={(e) => setFormData((p) => ({ ...p, vatIncluded: e.target.checked }))}
                  />
                  {t("posMenuVatIncluded")}
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData((p) => ({ ...p, isActive: e.target.checked }))}
                  />
                  {t("posMenuActive")}
                </label>
              </div>
              {editingId && (
                <div className="rounded border border-dashed p-3">
                  <h4 className="mb-2 text-xs font-semibold">{t("posMenuOptions") || "옵션 (반반, 뼈/순살 등)"}</h4>
                  <ul className="mb-2 space-y-1">
                    {menuOptions.map((o) => (
                      <li key={o.id} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1 text-xs">
                        <span>{o.name} {o.priceModifier ? `(+${o.priceModifier} ฿)` : ""}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 px-1 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteOption(o)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex gap-2">
                    <Input
                      placeholder={t("posOptionNamePh") || "옵션명"}
                      className="h-8 text-xs flex-1"
                      value={newOptionName}
                      onChange={(e) => setNewOptionName(e.target.value)}
                    />
                    <Input
                      type="number"
                      placeholder="+0"
                      className="h-8 w-20 text-right text-xs"
                      value={newOptionModifier}
                      onChange={(e) => setNewOptionModifier(e.target.value)}
                    />
                    <Button size="sm" className="h-8 px-2" onClick={handleAddOption}>
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <Button className="flex-1" onClick={handleSave}>
                  <Save className="mr-2 h-4 w-4" />
                  {t("itemsBtnSave")}
                </Button>
                <Button variant="outline" onClick={handleReset}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t("itemsBtnReset")}
                </Button>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center gap-3 border-b px-6 py-4">
              <h3 className="text-sm font-bold">{t("itemsList")}</h3>
            </div>
            <div className="flex items-center gap-3 border-b bg-muted/20 px-6 py-3">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9 w-36 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("itemsSearchPh")}
                className="h-9 flex-1 text-xs"
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <Button size="sm" className="h-9 px-4 text-xs" onClick={handleSearch}>
                <Search className="mr-1.5 h-3.5 w-3.5" />
                {t("itemsBtnSearch")}
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-20">{t("itemsColCode")}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center min-w-[140px]">{t("posMenuName")}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-24">{t("posMenuCategory")}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-24">{t("posMenuPrice")}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-20">{t("posMenuActive")}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-20">{t("posSoldOut")}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-24">{t("itemsColAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {!hasSearched ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                        {t("itemsSearchHint")}
                      </td>
                    </tr>
                  ) : filteredMenus.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                        {t("itemsNoResults")}
                      </td>
                    </tr>
                  ) : (
                    filteredMenus.map((m, idx) => {
                      const isSoldOutToday = m.soldOutDate === todayStr
                      return (
                      <tr
                        key={m.id}
                        className={cn(
                          "border-b last:border-b-0 hover:bg-muted/20",
                          idx % 2 === 1 && "bg-muted/5"
                        )}
                      >
                        <td className="px-5 py-3 text-center">
                          <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                            {m.code}
                          </span>
                        </td>
                        <td className="px-5 py-3">{m.name}</td>
                        <td className="px-5 py-3 text-center text-muted-foreground">{m.category || "-"}</td>
                        <td className="px-5 py-3 text-right font-bold tabular-nums">
                          {m.price > 0 ? `${m.price.toLocaleString()} ฿` : "-"}
                        </td>
                        <td className="px-5 py-3 text-center">
                          {m.isActive ? (
                            <span className="text-[10px] text-green-600 font-medium">Y</span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">-</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant={isSoldOutToday ? "destructive" : "outline"}
                            className="h-6 px-2 text-[10px]"
                            onClick={() => handleSoldOutToggle(m)}
                            disabled={soldOutTogglingId === m.id || !m.isActive}
                          >
                            {soldOutTogglingId === m.id ? "..." : isSoldOutToday ? (t("posSoldOut") || "품절") : (t("posAvailable") || "판매")}
                          </Button>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => handleEdit(m)}
                            >
                              <Pencil className="mr-1 h-2.5 w-2.5" />
                              {t("itemsBtnEdit")}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[10px] text-destructive"
                              onClick={() => handleDelete(m)}
                            >
                              <Trash2 className="mr-1 h-2.5 w-2.5" />
                              {t("itemsBtnDelete")}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )})
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
