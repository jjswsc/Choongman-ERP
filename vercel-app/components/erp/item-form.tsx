"use client"

import * as React from "react"
import {
  Save,
  FilePlus,
  Package,
  Link2,
  Tag,
  Ruler,
  DollarSign,
  RotateCcw,
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

export function ItemForm() {
  const [isEditing, setIsEditing] = React.useState(false)

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Package className="h-[18px] w-[18px] text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-card-foreground">품목 정보 입력</h3>
            <p className="text-[11px] text-muted-foreground">
              {isEditing ? "품목 정보를 수정합니다." : "새로운 품목을 등록합니다."}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-3 text-[11px] font-semibold"
          onClick={() => setIsEditing(false)}
        >
          <FilePlus className="h-3.5 w-3.5" />
          신규 등록
        </Button>
      </div>

      <div className="flex flex-col gap-5 p-6">
        {/* Code */}
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Tag className="h-3.5 w-3.5 text-primary" />
            코드 (A열)
          </label>
          <Input placeholder="예: A001" className="h-10 text-sm" />
        </div>

        {/* Category & Vendor side by side */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-foreground">카테고리</label>
            <Input placeholder="카테고리 입력" className="h-10 text-sm" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="flex items-center justify-between text-xs font-semibold text-foreground">
              <span>주거래처</span>
              <button
                type="button"
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                매입처 선택/입력
              </button>
            </label>
            <Input placeholder="매입처 선택/입력" className="h-10 text-sm" />
          </div>
        </div>

        {/* Item Name */}
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Package className="h-3.5 w-3.5 text-success" />
            품목명
          </label>
          <Input placeholder="품목명을 입력하세요" className="h-10 text-sm" />
        </div>

        {/* Image Link */}
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
            이미지 링크 (G열)
          </label>
          <Input placeholder="https://..." className="h-10 text-sm" />
        </div>

        {/* Tax type */}
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <DollarSign className="h-3.5 w-3.5 text-warning" />
            과세 구분
          </label>
          <Select defaultValue="taxable">
            <SelectTrigger className="h-10 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="taxable">과세(VAT 포함)</SelectItem>
              <SelectItem value="exempt">면세</SelectItem>
              <SelectItem value="zero">영세율</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Spec */}
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
            규격
          </label>
          <Input placeholder="예: 1kg, 1ea" className="h-10 text-sm" />
        </div>

        {/* Sell price & Cost */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-foreground">판매가</label>
            <div className="relative">
              <Input type="number" placeholder="0" className="h-10 pr-8 text-sm text-right tabular-nums" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                &#8361;
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-foreground">원가</label>
            <div className="relative">
              <Input type="number" placeholder="0" className="h-10 pr-8 text-sm text-right tabular-nums" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
                &#8361;
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <Button className="flex-1 h-11 text-sm font-bold">
            <Save className="mr-2 h-4 w-4" />
            저장
          </Button>
          <Button variant="outline" className="h-11 px-5 text-sm font-semibold">
            <RotateCcw className="mr-2 h-4 w-4" />
            초기화
          </Button>
        </div>
      </div>
    </div>
  )
}
