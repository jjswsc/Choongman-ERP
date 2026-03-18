"use client"

import * as React from "react"

const STORAGE_KEY = "pos_main_device"

export function usePosMainDevice(): [boolean, (value: boolean) => void] {
  const [isMain, setIsMain] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false
    try {
      const v = localStorage.getItem(STORAGE_KEY)
      return v === "1" || v === "true"
    } catch {
      return false
    }
  })

  const setValue = React.useCallback((value: boolean) => {
    setIsMain(value)
    try {
      localStorage.setItem(STORAGE_KEY, value ? "1" : "0")
    } catch {
      // ignore
    }
  }, [])

  return [isMain, setValue]
}
