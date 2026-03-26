"use client"

import * as React from "react"
import { Plus, Trash2 } from "lucide-react"
import { appAlert } from "@/lib/app-message"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
  deletePosPromoItem,
  getPosMenuOptions,
  getPosPromoItems,
  savePosPromoItem,
  type PosMenu,
  type PosMenuOption,
  type PosPromoItem,
} from "@/lib/api-client"

export function PosSetComposeDialog({
  open,
  onOpenChange,
  promoId,
  mirrorMenu,
  menus,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  promoId: string | null
  mirrorMenu: PosMenu | null
  menus: PosMenu[]
  onSaved?: () => void
}) {
  const { lang } = useLang()
  const t = useT(lang)
  const [items, setItems] = React.useState<PosPromoItem[]>([])
  const [allOptions, setAllOptions] = React.useState<PosMenuOption[]>([])
  const [loading, setLoading] = React.useState(false)
  const [newMenuId, setNewMenuId] = React.useState("")
  const [newOptionId, setNewOptionId] = React.useState<string | null>(null)
  const [newQty, setNewQty] = React.useState("1")

  const composeMenus = React.useMemo(
    () => menus.filter((m) => m.isActive && !(m.promoId != null && String(m.promoId).trim() !== "")),
    [menus]
  )

  const optionsByMenuId = React.useMemo(() => {
    const m: Record<string, PosMenuOption[]> = {}
    for (const o of allOptions) {
      const mid = String(o.menuId ?? "")
      if (!mid) continue
      if (!m[mid]) m[mid] = []
      m[mid].push(o)
    }
    return m
  }, [allOptions])

  React.useEffect(() => {
    if (!open) {
      setItems([])
      setAllOptions([])
      setNewMenuId("")
      setNewOptionId(null)
      setNewQty("1")
      return
    }
    const pid = promoId?.trim()
    if (!pid) {
      setItems([])
      setAllOptions([])
      return
    }
    setLoading(true)
    void Promise.all([getPosPromoItems({ promoId: pid }), getPosMenuOptions().catch(() => [])])
      .then(([pi, opts]) => {
        setItems(Array.isArray(pi) ? pi : [])
        setAllOptions(Array.isArray(opts) ? opts : [])
      })
      .finally(() => setLoading(false))
  }, [open, promoId])

  const getItemDisplayName = React.useCallback(
    (item: PosPromoItem): string => {
      const menu = menus.find((m) => m.id === item.menuId)
      if (!menu) return `${t("posPromoMenuUnknownPrefix")}${item.menuId}`
      if (!item.optionId) return menu.name
      const opt = allOptions.find((o) => o.id === item.optionId)
      return opt ? `${menu.name} (${opt.name})` : menu.name
    },
    [allOptions, menus, t]
  )

  const handleAdd = async () => {
    const pid = promoId?.trim()
    if (!pid || !newMenuId.trim()) return
    const opts = optionsByMenuId[newMenuId]
    const hasOptions = opts && opts.length > 0
    if (hasOptions && !newOptionId) {
      await appAlert(t("posPromoSelectOption"))
      return
    }
    const res = await savePosPromoItem({
      promoId: Number(pid),
      menuId: Number(newMenuId),
      optionId: newOptionId ? Number(newOptionId) : null,
      quantity: Number(newQty) || 1,
      sortOrder: items.length,
    })
    if (res.success) {
      const next = await getPosPromoItems({ promoId: pid })
      setItems(Array.isArray(next) ? next : [])
      setNewMenuId("")
      setNewOptionId(null)
      setNewQty("1")
      onSaved?.()
    } else {
      await appAlert(translateApiMessage(res.message, t) || res.message || t("msg_save_fail"))
    }
  }

  const handleDelete = async (it: PosPromoItem) => {
    const res = await deletePosPromoItem({ id: it.id })
    if (res.success) {
      setItems((prev) => prev.filter((x) => x.id !== it.id))
      onSaved?.()
    } else {
      await appAlert(translateApiMessage(res.message, t) || res.message || t("msg_delete_fail"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(90vh,720px)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("posMenuSetComposeDialogTitle")}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1 text-left text-sm">
              {mirrorMenu ? (
                <p className="font-medium text-foreground">
                  {mirrorMenu.name}{" "}
                  <span className="font-mono text-xs text-muted-foreground">({mirrorMenu.code})</span>
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground leading-relaxed">{t("posMenuSetComposeDesc")}</p>
            </div>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-4 text-sm text-muted-foreground">{t("loading")}</p>
        ) : (
          <div className="space-y-4">
            <div className="max-h-52 overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/60">
                    <th className="px-2 py-2 text-left font-semibold">{t("posPromoItems")}</th>
                    <th className="w-14 px-2 py-2 text-right font-semibold">{t("qty")}</th>
                    <th className="w-9" />
                  </tr>
                </thead>
                <tbody>
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                        {t("posMenuSetComposeEmpty")}
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => (
                      <tr key={it.id} className="border-b border-border/60 last:border-0">
                        <td className="px-2 py-1.5">{getItemDisplayName(it)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{it.quantity}</td>
                        <td className="px-1 py-1 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => void handleDelete(it)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {composeMenus.length === 0 ? (
              <p className="rounded-md bg-amber-50 px-2 py-2 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                {t("posPromoNoMenusForCompose")}
              </p>
            ) : (
              <div className="flex flex-col gap-2 border-t pt-3">
                <p className="text-[10px] text-muted-foreground">
                  {t("posMenuSetComposeAddHint")} ({composeMenus.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  <Select
                    value={newMenuId || "_"}
                    onValueChange={(v) => {
                      setNewMenuId(v === "_" ? "" : v)
                      setNewOptionId(null)
                    }}
                  >
                    <SelectTrigger className="h-9 min-w-[160px] flex-1 text-xs">
                      <SelectValue placeholder={t("posPromoSelectMenu")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_">-</SelectItem>
                      {composeMenus.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                          {m.category ? ` · ${m.category}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(optionsByMenuId[newMenuId]?.length ?? 0) > 0 && (
                    <Select
                      value={newOptionId || "_"}
                      onValueChange={(v) => setNewOptionId(v === "_" ? null : v)}
                    >
                      <SelectTrigger className="h-9 min-w-[120px] flex-1 text-xs">
                        <SelectValue placeholder={t("posPromoSelectOption")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_">-</SelectItem>
                        {(optionsByMenuId[newMenuId] || []).map((opt) => (
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
                    className="h-9 w-16 text-right text-xs tabular-nums"
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                    aria-label={t("qty")}
                  />
                  <Button type="button" size="sm" className="h-9 shrink-0" onClick={() => void handleAdd()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
