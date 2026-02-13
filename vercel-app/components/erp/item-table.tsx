"use client"

import * as React from "react"
import {
  Search,
  Pencil,
  Trash2,
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

interface Product {
  code: string
  name: string
  spec: string
  price: number
  hasImage: boolean
}

const sampleProducts: Product[] = [
  { code: "CM001", name: "TIGUDAK MIX SAUCE", spec: "2.5kg*4ea", price: 1640, hasImage: true },
  { code: "CM002", name: "CHOONGMAN SPICY GARLIC SAUCE", spec: "2.5kg*4ea", price: 1520, hasImage: true },
  { code: "CM004", name: "TIGUDAK CURRY SAUCE", spec: "2.5kg*4ea", price: 1700, hasImage: false },
  { code: "CM005", name: "WHITE SNOW SAUCE", spec: "2.5kg*4ea", price: 1900, hasImage: false },
  { code: "CM006", name: "TIGUDAK GARLIC SAUCE", spec: "2.5kg*4ea", price: 2600, hasImage: false },
  { code: "CM007", name: "HOT GREEN SAUCE (2.5kg*4ea/Box)", spec: "2.5kg*1ea", price: 2400, hasImage: true },
  { code: "CM015", name: "CHOONGMAN KOREA SEASOINING", spec: "2kg*13ea", price: 0, hasImage: false },
  { code: "CM016", name: "CHOONGMAN CHICKEN DRESSING POWDER (1kg*6ea/Box)", spec: "1kg*1ea", price: 1100, hasImage: true },
  { code: "CM017", name: "CHOONGMAN BATTER MIX FOR CHICKEN", spec: "5kg*4ea", price: 2100, hasImage: true },
  { code: "CM018", name: "BASE POWDER FOR SALTED RADISH", spec: "5kg*1ea", price: 2055, hasImage: false },
  { code: "CM019", name: "CHOONGMAN TTEOKBOKKI SOUP POWDER", spec: "2kg*5ea", price: 3550, hasImage: true },
  { code: "CM020", name: "NEW REDMIX", spec: "2.5kg*4ea", price: 2020, hasImage: true },
]

export function ItemTable() {
  const [searchTerm, setSearchTerm] = React.useState("")

  const filtered = sampleProducts.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* Header with search */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10">
          <ListFilter className="h-[18px] w-[18px] text-warning" />
        </div>
        <h3 className="text-sm font-bold text-card-foreground">품목 목록</h3>
        <span className="ml-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold tabular-nums text-muted-foreground">
          {filtered.length}건
        </span>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 border-b bg-muted/20 px-6 py-3">
        <Select defaultValue="all">
          <SelectTrigger className="h-9 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 카테고리</SelectItem>
            <SelectItem value="sauce">소스류</SelectItem>
            <SelectItem value="powder">파우더류</SelectItem>
            <SelectItem value="etc">기타</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="검색어 입력 (코드, 품목명)"
            className="h-9 pl-9 text-xs"
          />
        </div>
        <Button size="sm" className="h-9 px-4 text-xs font-semibold">
          <Search className="mr-1.5 h-3.5 w-3.5" />
          검색
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-24">코드</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-16 text-center">이미지</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground">품목명</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-28">규격</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-28 text-right">판매가</th>
              <th className="px-5 py-3 text-[11px] font-bold text-muted-foreground w-28 text-center">관리</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((product, idx) => (
              <tr
                key={product.code}
                className={cn(
                  "border-b last:border-b-0 transition-colors hover:bg-muted/20",
                  idx % 2 === 1 && "bg-muted/5"
                )}
              >
                <td className="px-5 py-3">
                  <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold tabular-nums text-primary">
                    {product.code}
                  </span>
                </td>
                <td className="px-5 py-3 text-center">
                  {product.hasImage ? (
                    <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <span className="text-sm font-medium text-foreground">{product.name}</span>
                </td>
                <td className="px-5 py-3">
                  <span className="text-xs text-muted-foreground">{product.spec}</span>
                </td>
                <td className="px-5 py-3 text-right">
                  <span className="text-sm font-bold tabular-nums text-foreground">
                    {product.price > 0 ? product.price.toLocaleString() : "-"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center justify-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-[11px] font-semibold text-primary border-primary/30 hover:bg-primary/10 hover:text-primary"
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      수정
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-[11px] font-semibold text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      삭제
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t bg-muted/10 px-6 py-3">
        <span className="text-[11px] text-muted-foreground">
          전체 <span className="font-bold text-foreground">{filtered.length}</span>개
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
