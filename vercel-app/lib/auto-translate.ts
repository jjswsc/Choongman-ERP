"use client"

import { useCallback, useEffect, useState } from "react"

export const AUTO_TRANSLATE_STORAGE_KEY = "cm_auto_translate_enabled"
const AUTO_TRANSLATE_CHANGED_EVENT = "cm:auto-translate-changed"

function parseEnabled(raw: string | null): boolean {
  if (!raw) return true
  const v = raw.trim().toLowerCase()
  return v !== "0" && v !== "false" && v !== "off"
}

export function readAutoTranslateEnabled(): boolean {
  if (typeof window === "undefined") return true
  try {
    return parseEnabled(sessionStorage.getItem(AUTO_TRANSLATE_STORAGE_KEY))
  } catch {
    return true
  }
}

export function writeAutoTranslateEnabled(enabled: boolean) {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(AUTO_TRANSLATE_STORAGE_KEY, enabled ? "1" : "0")
  } catch {}
  window.dispatchEvent(new Event(AUTO_TRANSLATE_CHANGED_EVENT))
}

export function useAutoTranslate() {
  const [enabled, setEnabledState] = useState(true)

  useEffect(() => {
    setEnabledState(readAutoTranslateEnabled())
  }, [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key !== AUTO_TRANSLATE_STORAGE_KEY) return
      setEnabledState(readAutoTranslateEnabled())
    }
    const onChanged = () => {
      setEnabledState(readAutoTranslateEnabled())
    }
    window.addEventListener("storage", onStorage)
    window.addEventListener(AUTO_TRANSLATE_CHANGED_EVENT, onChanged)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(AUTO_TRANSLATE_CHANGED_EVENT, onChanged)
    }
  }, [])

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next)
    writeAutoTranslateEnabled(next)
  }, [])

  return { enabled, setEnabled }
}
