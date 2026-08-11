"use client"

import * as React from "react"

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isWorklogDraftDate(value: unknown): value is string {
  return typeof value === "string" && DATE_RE.test(value)
}

export function worklogQueryDraftKey(panel: string, user: string): string {
  const uid = String(user || "anon")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 64)
  return `worklog_query_draft_v1:${panel}:${uid}`
}

export function readWorklogQueryDraft<T>(key: string): T | null {
  if (typeof sessionStorage === "undefined") return null
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function writeWorklogQueryDraft(key: string, draft: unknown): void {
  if (typeof sessionStorage === "undefined") return
  try {
    sessionStorage.setItem(key, JSON.stringify(draft))
  } catch {
    /* quota */
  }
}

export function clearWorklogQueryDraft(key: string): void {
  if (typeof sessionStorage === "undefined") return
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

type UseWorklogQueryDraftOptions<T> = {
  storageKey: string
  /** 현재 조회 조건 스냅샷 (매 렌더 새 객체여도 JSON 비교로 저장) */
  draft: T
  /** 저장할 가치가 있는 상태인지 (조회했거나 필터를 바꿈) */
  shouldPersist: boolean
  /**
   * 마운트 시 1회.
   * - true: 복원 성공 → restoreEpoch 증가
   * - false: 무효 초안 → storage 삭제
   * - "skip": 호출부가 이미 복원(또는 URL 우선) → storage 유지
   */
  applyDraft: (draft: T) => boolean | "skip"
}

/**
 * remount(탭 닫힘·캐시 축출 등) 시에도 업무일지 조회 조건을 sessionStorage로 유지.
 * keep-alive가 살아 있으면 no-op에 가깝고, remount 시에만 복원이 체감된다.
 */
export function useWorklogQueryDraftPersistence<T>(options: UseWorklogQueryDraftOptions<T>): {
  /** 복원 직후 1회 true → 재조회 트리거용 */
  restoreEpoch: number
} {
  const { storageKey, draft, shouldPersist, applyDraft } = options
  const applyRef = React.useRef(applyDraft)
  applyRef.current = applyDraft
  const restoredForKeyRef = React.useRef<string | null>(null)
  const hadPersistedRef = React.useRef(false)
  const lastJsonRef = React.useRef<string>("")
  const [restoreEpoch, setRestoreEpoch] = React.useState(0)

  React.useLayoutEffect(() => {
    // auth 로딩 등으로 storageKey가 anon→실사용자로 바뀌면 새 키로 다시 복원
    if (restoredForKeyRef.current === storageKey) return
    restoredForKeyRef.current = storageKey
    const saved = readWorklogQueryDraft<T>(storageKey)
    if (!saved) return
    const result = applyRef.current(saved)
    if (result === "skip") return
    if (result) {
      setRestoreEpoch((n) => n + 1)
    } else {
      clearWorklogQueryDraft(storageKey)
    }
  }, [storageKey])

  React.useEffect(() => {
    if (!shouldPersist) {
      // remount 직후 초기값으로 초안을 지우지 않음 (복원 setState 전)
      if (hadPersistedRef.current) clearWorklogQueryDraft(storageKey)
      hadPersistedRef.current = false
      lastJsonRef.current = ""
      return
    }
    hadPersistedRef.current = true
    let json = ""
    try {
      json = JSON.stringify(draft)
    } catch {
      return
    }
    if (json === lastJsonRef.current) return
    lastJsonRef.current = json
    writeWorklogQueryDraft(storageKey, draft)
  }, [storageKey, shouldPersist, draft])

  return { restoreEpoch }
}
