"use client"

import { useState, useEffect, useCallback } from "react"
import { translateTexts } from "@/lib/api-client"

const SEP = "\u241e"

function uniqueTrimmed(texts: string[]) {
  return [...new Set(texts.map((s) => String(s || "").trim()).filter(Boolean))].sort()
}

function stableKey(texts: string[]) {
  const u = uniqueTrimmed(texts)
  return u.length ? u.join(SEP) : ""
}

/**
 * 고정 문자열 목록을 UI 언어로 번역해 lookup (제목·메모 목록 등)
 */
export function useTranslatedTextMap(texts: string[], lang: string) {
  const key = stableKey(texts)
  const [map, setMap] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!key) {
      setMap({})
      return
    }
    const unique = key.split(SEP)
    let cancelled = false
    translateTexts(unique, lang)
      .then((translated) => {
        if (cancelled) return
        const m: Record<string, string> = {}
        unique.forEach((txt, i) => {
          m[txt] = (translated[i] ?? txt).trim() || txt
        })
        setMap(m)
      })
      .catch(() => {
        if (!cancelled) setMap({})
      })
    return () => {
      cancelled = true
    }
  }, [key, lang])

  return useCallback(
    (s: string) => {
      const t = String(s || "").trim()
      if (!t) return ""
      return map[t] ?? s
    },
    [map]
  )
}

/**
 * 입력 중 텍스트를 디바운스 후 선택 언어로 번역 (미리보기용)
 */
export function useDebouncedTranslatedText(text: string, lang: string, debounceMs = 450) {
  const [translated, setTranslated] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const raw = String(text || "").trim()
    if (!raw) {
      setTranslated("")
      setPending(false)
      return
    }
    setPending(true)
    const id = setTimeout(() => {
      translateTexts([raw], lang)
        .then(([tr]) => {
          setTranslated((tr || raw).trim())
        })
        .catch(() => setTranslated(raw))
        .finally(() => setPending(false))
    }, debounceMs)
    return () => clearTimeout(id)
  }, [text, lang, debounceMs])

  return { translated, pending }
}
