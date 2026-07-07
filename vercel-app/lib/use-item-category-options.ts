"use client"

import { useEffect, useState } from "react"
import { getOrderFilterOptions } from "@/lib/api-client"

/** items 마스터의 distinct category — 재고·이력 필터 공통 */
export function useItemCategoryOptions(): string[] {
  const [categories, setCategories] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    getOrderFilterOptions()
      .then((r) => {
        if (!cancelled) setCategories(Array.isArray(r.categories) ? r.categories : [])
      })
      .catch(() => {
        if (!cancelled) setCategories([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  return categories
}
