'use client'

import { useState, useCallback } from 'react'

export interface UseApiCallState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

export interface UseApiCallReturn<T> extends UseApiCallState<T> {
  execute: () => Promise<T | null>
  reset: () => void
}

/**
 * API 호출 시 로딩/에러 상태를 관리하는 훅
 * @param apiFn - 호출할 API 함수 (인자 없음)
 * @returns { data, loading, error, execute, reset }
 */
export function useApiCall<T>(apiFn: () => Promise<T>): UseApiCallReturn<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const execute = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiFn()
      setData(result)
      return result
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      return null
    } finally {
      setLoading(false)
    }
  }, [apiFn])

  const reset = useCallback(() => {
    setData(null)
    setError(null)
    setLoading(false)
  }, [])

  return { data, loading, error, execute, reset }
}
