"use client"

import { useCallback, useEffect, useState } from "react"

/** v2: 이전 세션에서 OFF로 남은 값을 무시하고 전 직원 기본 ON으로 재설정 */
export const AUTO_TRANSLATE_STORAGE_KEY = "cm_auto_translate_enabled_v2"
const AUTO_TRANSLATE_CHANGED_EVENT = "cm:auto-translate-changed"

/**
 * 회사 정책: 자동번역 기본·권장 ON.
 * 저장값이 없거나 깨져 있으면 ON. (명시적 OFF만 허용)
 */
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

/** 앱 진입 시 한 번: 미설정이면 ON으로 기록 (모바일·PC 공통) */
export function ensureAutoTranslateDefaultOn(): void {
  if (typeof window === "undefined") return
  try {
    const raw = sessionStorage.getItem(AUTO_TRANSLATE_STORAGE_KEY)
    if (raw == null || raw === "") {
      sessionStorage.setItem(AUTO_TRANSLATE_STORAGE_KEY, "1")
      window.dispatchEvent(new Event(AUTO_TRANSLATE_CHANGED_EVENT))
    }
  } catch {
    /* ignore */
  }
}

export function useAutoTranslate() {
  const [enabled, setEnabledState] = useState(true)

  useEffect(() => {
    ensureAutoTranslateDefaultOn()
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
