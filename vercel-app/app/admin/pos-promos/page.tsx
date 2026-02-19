"use client"

import * as React from "react"
import { Tag, FilePlus, Save, RotateCcw, Pencil, Trash2, Plus } from "lucide-react"
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
  getPosPromos,
  getPosPromoItems,
  getPosMenus,
  getPosMenuOptions,
  savePosPromo,
  savePosPromoItem,
  deletePosPromo,
  deletePosPromoItem,
  type PosPromo,
  type PosPromoItem,
  type PosMenu,
  type PosMenuOption,
} from "@/lib/api-client"
import { cn } from "@/lib/utils"

const emptyForm = {
  code: "",
  name: "",
  category: "프로모션",
  price: "",
  priceDelivery: "",
  vatIncluded: true,
  isActive: true,
}

export default function PosPromosPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [promos, setPromos] = React.useState<PosPromo[]>([])
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [allOptions, setAllOptions] = React.useState<PosMenuOption[]>([])
  const [promoItems, setPromoItems] = React.useState<PosPromoItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [formData, setFormData] = React.useState(emptyForm)
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [newItemMenuId, setNewItemMenuId] = React.useState("")
  const [newItemOptionId, setNewItemOptionId] = React.useState<string | null>(null)
  const [newItemQty, setNewItemQty] = React.useState("1")

  const optionsByMenuId = React.useMemo(() => {
    const m: Record<string, PosMenuOption[]> = {}
    for (const o of allOptions) {
      const mid = o.menuId
      if (!m[mid]) m[mid] = []
      m[mid].push(o)
    }
    return m
  }, [allOptions])

  React.useEffect(() => {
    Promise.all([getPosPromos(), getPosMenus(), getPosMenuOptions()])
      .then(([promoList, menuList, opts]) => {
        setPromos(promoList || [])
        setMenus((menuList || []).filter((m) => m.isActive))
        setAllOptions(opts || [])
      })
      .catch(() => {
        setPromos([])
        setMenus([])
        setAllOptions([])
      })
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => {
    if (!editingId) {
      setPromoItems([])
      return
    }
    getPosPromoItems({ promoId: editingId })
      .then(setPromoItems)
      .catch(() => setPromoItems([]))
  }, [editingId])

  const handleNewRegister = () => {
    setFormData(emptyForm)
    setEditingId(null)
  }

  const handleReset = () => {
    if (editingId) {
      const p = promos.find((x) => x.id === editingId)
      if (p) {
        setFormData({
          code: p.code,
          name: p.name,
          category: p.category,
          price: String(p.price),
          priceDelivery: p.priceDelivery != null ? String(p.priceDelivery) : "",
          vatIncluded: p.vatIncluded,
          isActive: p.isActive,
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
    if (!editingId && promos.some((p) => p.code === code)) {
      alert(t("itemsAlertCodeExists"))
      return
    }
    const res = await savePosPromo({
      id: editingId || undefined,
      code,
      name,
      category: formData.category.trim(),
      price: Number(formData.price) || 0,
      priceDelivery: formData.priceDelivery !== "" ? Number(formData.priceDelivery) : null,
      vatIncluded: formData.vatIncluded,
      isActive: formData.isActive,
    })
    if (!res.success) {
      alert(translateApiMessage(res.message, t) || t("msg_save_fail_detail"))
      return
    }
    if (editingId) {
      setPromos((prev) =>
        prev.map((p) =>
          p.id === editingId
            ? { ...p, code, name, category: formData.category.trim(), price: Number(formData.price) || 0, priceDelivery: formData.priceDelivery !== "" ? Number(formData.priceDelivery) : null }
            : p
        )
      )
      alert(t("itemsAlertUpdated"))
    } else if (res.id) {
      setEditingId(res.id)
      getPosPromos().then(setPromos)
      alert(t("itemsAlertSaved"))
    }
  }

  const handleEdit = (promo: PosPromo) => {
    setFormData({
      code: promo.code,
      name: promo.name,
      category: promo.category || "프로모션",
      price: String(promo.price),
      priceDelivery: promo.priceDelivery != null ? String(promo.priceDelivery) : "",
      vatIncluded: promo.vatIncluded,
      isActive: promo.isActive,
    })
    setEditingId(promo.id)
    setNewItemMenuId("")
    setNewItemOptionId(null)
    setNewItemQty("1")
  }

  const handleAddItem = async () => {
    if (!editingId || !newItemMenuId.trim()) return
    const opts = optionsByMenuId[newItemMenuId]
    const hasOptions = opts && opts.length > 0
    if (hasOptions && !newItemOptionId) {
      alert(t("posPromoSelectOption") || "옵션을 선택해 주세요.")
      return
    }
    const res = await savePosPromoItem({
      promoId: Number(editingId),
      menuId: Number(newItemMenuId),
      optionId: newItemOptionId ? Number(newItemOptionId) : null,
      quantity: Number(newItemQty) || 1,
      sortOrder: promoItems.length,
    })
    if (res.success) {
      getPosPromoItems({ promoId: editingId }).then(setPromoItems)
      setNewItemMenuId("")
      setNewItemOptionId(null)
      setNewItemQty("1")
    } else {
      alert(res.message)
    }
  }

  const handleDeleteItem = async (item: PosPromoItem) => {
    if (!confirm(t("posMenuConfirmDelete"))) return
    const res = await deletePosPromoItem({ id: item.id })
    if (res.success) {
      setPromoItems((prev) => prev.filter((i) => i.id !== item.id))
    } else {
      alert(res.message)
    }
  }

  const handleDelete = async (promo: PosPromo) => {
    if (!confirm(`"${promo.name}" ${t("posMenuConfirmDelete")}`)) return
    const res = await deletePosPromo({ id: promo.id })
    if (res.success) {
      setPromos((prev) => prev.filter((p) => p.id !== promo.id))
      if (editingId === promo.id) {
        setFormData(emptyForm)
        setEditingId(null)
      }
    } else {
      alert(res.message)
    }
  }

  const getItemDisplayName = (item: PosPromoItem) => {
    const menu = menus.find((m) => m.id === item.menuId)
    if (!menu) return `메뉴 #${item.menuId}`
    if (!item.optionId) return menu.name
    const opt = allOptions.find((o) => o.id === item.optionId)
    return opt ? `${menu.name} (${opt.name})` : menu.name
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Tag className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t("posPromoMgmt")}</h1>
            <p className="text-xs text-muted-foreground">{t("posPromoMgmtSub")}</p>
          </div>
        </div>

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          {/* Form */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h3 className="text-sm font-bold text-card-foreground">{t("posPromoFormTitle")}</h3>
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
                  placeholder="PROMO001"
                  className="mt-1 h-10"
                  value={formData.code}
                  onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))}
                  disabled={!!editingId}
                />
              </div>
              <div>
                <label className="text-xs font-semibold">{t("posPromoName")}</label>
                <Input
                  placeholder="치킨+음료+감자튀김 세트"
                  className="mt-1 h-10"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold">{t("posMenuCategory")}</label>
                <Input
                  className="mt-1 h-10"
                  value={formData.category}
                  onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold">{t("posMenuPriceHall")}</label>
                <Input
                  type="number"
                  placeholder="0"
                  className="mt-1 h-10 text-right"
                  value={formData.price}
                  onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold">{t("posMenuPriceDelivery")}</label>
                <Input
                  type="number"
                  placeholder="비워두면 홀과 동일"
                  className="mt-1 h-10 text-right"
                  value={formData.priceDelivery}
                  onChange={(e) => setFormData((p) => ({ ...p, priceDelivery: e.target.value }))}
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
                  <h4 className="mb-2 text-xs font-semibold">{t("posPromoItems")}</h4>
                  <ul className="mb-2 space-y-1">
                    {promoItems.map((item) => (
                      <li key={item.id} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1 text-xs">
                        <span>
                          {getItemDisplayName(item)} × {item.quantity}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 px-1 text-destructive hover:text-destructive"
                          onClick={() => handleDeleteItem(item)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <Select value={newItemMenuId || "_"} onValueChange={(v) => { setNewItemMenuId(v === "_" ? "" : v); setNewItemOptionId(null) }}>
                        <SelectTrigger className="h-8 flex-1 text-xs">
                          <SelectValue placeholder={t("posPromoSelectMenu")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="_">-</SelectItem>
                          {menus.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {(optionsByMenuId[newItemMenuId]?.length ?? 0) > 0 && (
                        <Select value={newItemOptionId || "_"} onValueChange={(v) => setNewItemOptionId(v === "_" ? null : v)}>
                          <SelectTrigger className="h-8 min-w-[100px] text-xs">
                            <SelectValue placeholder={t("posPromoSelectOption")} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_">-</SelectItem>
                            {(optionsByMenuId[newItemMenuId] || []).map((opt) => (
                              <SelectItem key={opt.id} value={opt.id}>
                                {opt.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Input
                        type="number"
                        min={0.5}
                        step={0.5}
                        placeholder="1"
                        className="h-8 w-14 text-right text-xs"
                        value={newItemQty}
                        onChange={(e) => setNewItemQty(e.target.value)}
                      />
                      <Button size="sm" className="h-8 px-2 shrink-0" onClick={handleAddItem}>
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
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

          {/* List */}
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="border-b px-6 py-4">
              <h3 className="text-sm font-bold">{t("itemsList")}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-20">{t("posMenuCode")}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center min-w-[160px]">{t("posPromoName")}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-32">{t("posMenuPriceHall")} / {t("posMenuPriceDelivery")}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-20">{t("posMenuActive")}</th>
                    <th className="px-5 py-3 text-[11px] font-bold text-center w-24">{t("itemsColAction")}</th>
                  </tr>
                </thead>
                <tbody>
                  {promos.map((p, idx) => (
                    <tr
                      key={p.id}
                      className={cn(
                        "border-b last:border-b-0 hover:bg-muted/20 cursor-pointer",
                        idx % 2 === 1 && "bg-muted/5",
                        editingId === p.id && "bg-primary/5"
                      )}
                      onClick={() => handleEdit(p)}
                    >
                      <td className="px-5 py-3 text-center">
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          {p.code}
                        </span>
                      </td>
                      <td className="px-5 py-3">{p.name}</td>
                      <td className="px-5 py-3 text-right font-bold tabular-nums text-xs">
                        {p.price > 0 ? `${p.price.toLocaleString()} ฿` : "-"}
                        {p.priceDelivery != null ? ` / ${p.priceDelivery.toLocaleString()} ฿` : ""}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {p.isActive ? (
                          <span className="text-[10px] text-green-600 font-medium">Y</span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => handleEdit(p)}
                          >
                            <Pencil className="mr-1 h-2.5 w-2.5" />
                            {t("itemsBtnEdit")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[10px] text-destructive"
                            onClick={() => handleDelete(p)}
                          >
                            <Trash2 className="mr-1 h-2.5 w-2.5" />
                            {t("itemsBtnDelete")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
