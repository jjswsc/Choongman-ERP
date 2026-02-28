"use client"

import * as React from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  Search,
  Pencil,
  Trash2,
  PauseCircle,
  PlayCircle,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  ListFilter,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { Product } from "@/app/admin/items/page"

import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"

/** 외부 이미지 URL → 프록시 또는 직접 사용 */
function toImageUrl(url: string): string {
  const s = String(url || '').trim()
  if (!s) return s
  if (s.startsWith('data:image')) return s
  if (s.startsWith('http')) {
    return `/api/imageProxy?url=${encodeURIComponent(s)}`
  }
  return s
}

export interface ItemTableProps {
  products: Product[]
  categories: string[]
  outboundOptions: string[]
  hasSearched: boolean
  searchTerm: string
  setSearchTerm: (v: string) => void
  categoryFilter: string
  setCategoryFilter: (v: string) => void
  outboundFilter: string
  setOutboundFilter: (v: string) => void
  onSearch: () => void
  onEdit: (product: Product) => void
  onDelete: (product: Product) => void
  onToggleOrderDisabled?: (product: Product) => void | Promise<void>
}

export function ItemTable({
  products,
  categories,
  outboundOptions,
  hasSearched,
  searchTerm,
  setSearchTerm,
  categoryFilter,
  setCategoryFilter,
  outboundFilter,
  setOutboundFilter,
  onSearch,
  onEdit,
  onDelete,
  onToggleOrderDisabled,
}: ItemTableProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [imagePreview, setImagePreview] = React.useState<{ url: string; name: string } | null>(null)
  const [imageLoadError, setImageLoadError] = React.useState(false)

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Header with search */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10">
          <ListFilter className="h-[18px] w-[18px] text-warning" />
        </div>
        <h3 className="text-sm font-bold text-card-foreground">{t("itemsList")}</h3>
        <span className="ml-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
          {hasSearched ? `${products.length} ${t("itemsCount")}` : "-"}
        </span>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/20 px-6 py-3">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-9 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("itemsCategoryAll")}</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={outboundFilter} onValueChange={setOutboundFilter}>
          <SelectTrigger className="h-9 w-36 text-xs">
            <SelectValue placeholder={t("outWhWarehouseCol") || "출고지"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("outWhWarehouseAll") || "전체"}</SelectItem>
            {outboundOptions.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {loc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[120px]">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("itemsSearchPh")}
            className="h-9 pl-9 text-xs"
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
          />
        </div>
        <Button size="sm" className="h-9 px-4 text-xs font-semibold" onClick={onSearch}>
          <Search className="mr-1.5 h-3.5 w-3.5" />
          {t("itemsBtnSearch")}
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-20 text-center">{t("itemsColCode")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-10 text-center">{t("itemsColImage")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground min-w-[120px] text-center">{t("itemsColName")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-40 min-w-[160px] text-center">{t("itemsColSpec")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-16 text-center">{t("itemsColPrice")}</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-28 text-center">{t("itemsColAction")}</th>
            </tr>
          </thead>
          <tbody>
            {!hasSearched ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  {t("itemsSearchHint")}
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                  {t("itemsNoResults")}
                </td>
              </tr>
            ) : (
              products.map((product, idx) => (
                <tr
                  key={product.code}
                  className={cn(
                    "border-b last:border-b-0 transition-colors hover:bg-muted/20",
                    idx % 2 === 1 && "bg-muted/5"
                  )}
                >
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-primary">
                      {product.code}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    {product.hasImage && product.imageUrl ? (
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => {
                          setImageLoadError(false)
                          setImagePreview({ url: toImageUrl(product.imageUrl!), name: product.name })
                        }}
                        title={t("photo")}
                      >
                        <ImageIcon className="h-3 w-3" />
                      </Button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="px-5 py-3 min-w-[120px]">
                    <span className="text-sm font-medium text-foreground">{product.name}</span>
                  </td>
                  <td className="px-5 py-3 min-w-[160px]">
                    <span className="text-[11px] text-muted-foreground">{product.spec}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <span className="text-xs tabular-nums text-foreground">
                      {product.price > 0 ? product.price.toLocaleString() : "-"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {onToggleOrderDisabled != null && (
                        <Button
                          variant="outline"
                          size="icon"
                          className={cn(
                            "h-7 w-7",
                            product.orderDisabled
                              ? "text-emerald-600 border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                              : "text-amber-600 border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                          )}
                          onClick={() => onToggleOrderDisabled(product)}
                          title={product.orderDisabled ? (t("itemsOrderResume") || "재개") : (t("itemsOrderDisabled") || "발주 중지")}
                        >
                          {product.orderDisabled ? (
                            <PlayCircle className="h-3.5 w-3.5" />
                          ) : (
                            <PauseCircle className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 text-primary border-primary/30 hover:bg-primary/10 hover:text-primary"
                        onClick={() => onEdit(product)}
                        title={t("itemsBtnEdit") || "수정"}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => onDelete(product)}
                        title={t("itemsBtnDelete") || "삭제"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 이미지 미리보기 모달 */}
      {imagePreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => { setImagePreview(null); setImageLoadError(false) }}
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] rounded-xl bg-card p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-2 text-xs font-semibold text-muted-foreground">{imagePreview.name}</p>
            {imageLoadError ? (
              <div className="flex min-h-[120px] items-center justify-center rounded-lg bg-muted/80 px-6 py-8">
                <p className="text-center text-sm text-muted-foreground">{t("imageLoadError")}</p>
              </div>
            ) : (
              <ImageViewerWithRotate
                src={imagePreview.url}
                alt={imagePreview.name}
                imgClassName="max-h-[70vh] max-w-full rounded-lg object-contain"
                referrerPolicy="no-referrer"
                onError={() => setImageLoadError(true)}
                onLoad={() => setImageLoadError(false)}
                rotateLeftLabel={t("imageRotateLeft") || "반시계"}
                rotateRightLabel={t("imageRotateRight") || "시계"}
              />
            )}
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              onClick={() => { setImagePreview(null); setImageLoadError(false) }}
            >
              {t("itemsBtnClose")}
            </Button>
          </div>
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between border-t bg-muted/10 px-6 py-3">
        <span className="text-[11px] text-muted-foreground">
          {t("itemsTotal")} <span className="font-bold text-foreground">{hasSearched ? products.length : 0}</span> {t("itemsTotalCount")}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7" disabled>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 min-w-7 bg-primary text-primary-foreground border-primary text-[11px] font-bold hover:bg-primary/90 hover:text-primary-foreground">
            1
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" disabled>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
