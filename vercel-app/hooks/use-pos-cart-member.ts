'use client'

import {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react'
import {
  getMembers,
  getPosMemberTierRates,
} from '@/lib/api-client'
import {
  computeMemberTierDiscountAmount,
  normalizeMemberTierCodeForDiscount,
} from '@/lib/member-tier-discount'
import {
  isMemberCouponQrPayload,
  isMemberCouponScanPayload,
  normalizeCouponScanDelimiters,
  parseLooseMemberCouponScanInput,
} from '@/lib/member-coupon-qr'
import { parseMemberPosScanInput } from '@/lib/member-pos-qr'

export type PosMemberMapEntry = {
  id: number
  memberNo: string
  name: string
  phone: string
  email: string
  tierCode: string
}

export type PosMemberOption = { value: string; label: string }

export interface UsePosCartMemberParams {
  discountScopeSubtotal: number
  triggerScanFieldFeedback: (field: 'member' | 'coupon', outcome: 'success' | 'error') => void
  refocusActiveScanInput: () => void
  pendingMemberCouponQrRawRef: React.MutableRefObject<string | null>
  couponUsbScanBufferRef: React.MutableRefObject<{ chars: string; lastAt: number }>
}

export function usePosCartMember(params: UsePosCartMemberParams) {
  const {
    discountScopeSubtotal,
    triggerScanFieldFeedback,
    refocusActiveScanInput,
    pendingMemberCouponQrRawRef,
    couponUsbScanBufferRef,
  } = params

  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [memberKeyword, setMemberKeyword] = useState('')
  const [memberOptions, setMemberOptions] = useState<PosMemberOption[]>([])
  const [memberMap, setMemberMap] = useState<Record<string, PosMemberMapEntry>>({})
  const [tierDiscountRates, setTierDiscountRates] = useState<Record<string, number>>({})
  const [, setRecentMemberIds] = useState<string[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const memberScanAutoSubmitRef = useRef<string | null>(null)

  const isMemberOrder = selectedMemberId !== ''
  const selectedMemberDetail = memberMap[selectedMemberId]
  const memberSearchEmpty = !membersLoading && memberKeyword.trim().length >= 2 && memberOptions.length === 0

  const selectedMemberTierDiscountRate = useMemo(() => {
    if (!selectedMemberId) return 0
    const tierCode = normalizeMemberTierCodeForDiscount(memberMap[selectedMemberId]?.tierCode || 'BRONZE')
    return Math.max(0, Number(tierDiscountRates[tierCode] ?? 0))
  }, [memberMap, selectedMemberId, tierDiscountRates])

  const tierDiscountAmt = useMemo(() => {
    if (!selectedMemberId || selectedMemberTierDiscountRate <= 0) return 0
    return computeMemberTierDiscountAmount(discountScopeSubtotal, selectedMemberTierDiscountRate)
  }, [discountScopeSubtotal, selectedMemberId, selectedMemberTierDiscountRate])

  const tierOrderFields = useMemo(
    () => ({
      ...(tierDiscountAmt > 0.0001 ? { tierDiscountAmt } : {}),
      ...(selectedMemberId
        ? {
            memberTierCode: normalizeMemberTierCodeForDiscount(
              memberMap[selectedMemberId]?.tierCode || 'BRONZE'
            ),
          }
        : {}),
    }),
    [memberMap, selectedMemberId, tierDiscountAmt]
  )

  useEffect(() => {
    getPosMemberTierRates()
      .then((res) => {
        if (res.success && res.rates) setTierDiscountRates(res.rates)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('pos-recent-member-ids')
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        setRecentMemberIds(parsed.map((x: unknown) => String(x || '')).filter(Boolean).slice(0, 6))
      }
    } catch {
      setRecentMemberIds([])
    }
  }, [])

  useEffect(() => {
    if (!selectedMemberId) return
    setRecentMemberIds((prev) => {
      const next = [selectedMemberId, ...prev.filter((x) => x !== selectedMemberId)].slice(0, 6)
      try {
        localStorage.setItem('pos-recent-member-ids', JSON.stringify(next))
      } catch {
        // ignore storage failures
      }
      return next
    })
  }, [selectedMemberId])

  const finishMemberScanInput = useCallback(
    (outcome: 'success' | 'error') => {
      triggerScanFieldFeedback('member', outcome)
      setMemberKeyword('')
      memberScanAutoSubmitRef.current = null
      pendingMemberCouponQrRawRef.current = null
      couponUsbScanBufferRef.current = { chars: '', lastAt: 0 }
      refocusActiveScanInput()
    },
    [refocusActiveScanInput, triggerScanFieldFeedback]
  )

  const loadMembers = async (
    keyword?: string,
    opts?: { autoSelectExactMemberNo?: string }
  ) => {
    setMembersLoading(true)
    try {
      const rawKeyword = String(keyword || '').trim()
      const normalizedPhoneKeyword = rawKeyword.replace(/[^\d+]/g, '')
      const q = normalizedPhoneKeyword.length >= 4 ? normalizedPhoneKeyword : rawKeyword
      const rows = await getMembers({ q, limit: 20 })
      const options = rows
        .filter((row) => row.status !== 'inactive')
        .map((row) => ({
          value: String(row.id),
          label: `${row.name}${row.memberNo ? ` (${row.memberNo})` : ''}${row.phone ? ` · ${row.phone}` : ''}`,
        }))
      const map: Record<string, PosMemberMapEntry> = {}
      for (const row of rows) {
        map[String(row.id)] = {
          id: row.id,
          memberNo: row.memberNo || '',
          name: row.name || '',
          phone: row.phone || '',
          email: row.email || '',
          tierCode: row.tierCode || 'BRONZE',
        }
      }
      setMemberOptions(options)
      setMemberMap(map)

      const exactMemberNo = String(opts?.autoSelectExactMemberNo || '').trim().toUpperCase()
      if (exactMemberNo) {
        const exact = rows.find(
          (row) => String(row.memberNo || '').trim().toUpperCase() === exactMemberNo
        )
        if (exact?.id) {
          setSelectedMemberId(String(exact.id))
          finishMemberScanInput('success')
        } else {
          finishMemberScanInput('error')
        }
      }
    } catch (e) {
      console.error('getMembers:', e)
      setMemberOptions([])
      setMemberMap({})
    } finally {
      setMembersLoading(false)
    }
  }

  const linkMemberByMemberNo = useCallback(
    async (
      memberNo: string,
      _opts?: { beep?: boolean }
    ): Promise<{ id: number; name: string } | null> => {
      const keyword = String(memberNo || '').trim()
      if (!keyword) return null
      const rows = await getMembers({ q: keyword, limit: 20 })
      const match = (rows || []).find(
        (row) => String(row.memberNo || '').trim().toUpperCase() === keyword.toUpperCase()
      )
      if (!match?.id) return null
      const value = String(match.id)
      const name = match.name || match.memberNo || keyword
      setSelectedMemberId(value)
      setMemberKeyword(match.memberNo || keyword)
      setMemberOptions((prev) => {
        const label = `${match.name || ''}${match.memberNo ? ` (${match.memberNo})` : ''}${match.phone ? ` · ${match.phone}` : ''}`
        if (prev.some((row) => row.value === value)) return prev
        return [{ value, label }, ...prev]
      })
      setMemberMap((prev) => ({
        ...prev,
        [value]: {
          id: match.id,
          memberNo: match.memberNo || '',
          name: match.name || '',
          phone: match.phone || '',
          email: match.email || '',
          tierCode: match.tierCode || 'BRONZE',
        },
      }))
      return { id: match.id, name }
    },
    []
  )

  const linkMemberById = useCallback(
    async (memberId: number): Promise<{ id: number; name: string } | null> => {
      const id = Math.max(0, Math.trunc(Number(memberId) || 0))
      if (!id) return null
      const rows = await getMembers({ q: String(id), limit: 20 })
      const match = (rows || []).find((row) => Number(row.id) === id)
      if (!match?.id) return null
      const value = String(match.id)
      const name = match.name || match.memberNo || String(id)
      setSelectedMemberId(value)
      setMemberKeyword(match.memberNo || String(id))
      setMemberOptions((prev) => {
        const label = `${match.name || ''}${match.memberNo ? ` (${match.memberNo})` : ''}${match.phone ? ` · ${match.phone}` : ''}`
        if (prev.some((row) => row.value === value)) return prev
        return [{ value, label }, ...prev]
      })
      setMemberMap((prev) => ({
        ...prev,
        [value]: {
          id: match.id,
          memberNo: match.memberNo || '',
          name: match.name || '',
          phone: match.phone || '',
          email: match.email || '',
          tierCode: match.tierCode || 'BRONZE',
        },
      }))
      return { id: match.id, name }
    },
    []
  )

  const handleMemberSearch = useCallback(
    async (rawOverride?: string, opts?: { fromScan?: boolean }): Promise<boolean> => {
      const raw = normalizeCouponScanDelimiters(String(rawOverride ?? memberKeyword).trim())
      if (!raw) return false
      const fromScan = opts?.fromScan === true

      if (isMemberCouponScanPayload(raw)) {
        const couponParsed = parseLooseMemberCouponScanInput(raw)
        if (couponParsed?.memberNo) {
          const linked = await linkMemberByMemberNo(couponParsed.memberNo, { beep: false })
          if (linked) {
            if (fromScan) finishMemberScanInput('success')
            return true
          }
          if (fromScan) finishMemberScanInput('error')
          return false
        }
      }

      const memberParsed = parseMemberPosScanInput(raw)
      if (memberParsed) {
        const linked = await linkMemberByMemberNo(memberParsed.memberNo, { beep: false })
        if (linked) {
          if (fromScan) finishMemberScanInput('success')
          return true
        }
        if (fromScan) finishMemberScanInput('error')
        return false
      }

      const searchKey = raw
      setMemberKeyword(searchKey)
      await loadMembers(searchKey, { autoSelectExactMemberNo: undefined })
      return false
    },
    [finishMemberScanInput, linkMemberByMemberNo, memberKeyword]
  )

  const handleMemberKeywordInput = useCallback(
    (next: string) => {
      const sanitized = normalizeCouponScanDelimiters(String(next ?? '').replace(/[^\x20-\x7E\uFF5E\u223C\u02DC\u2053]/g, ''))
      const memberParsed = parseMemberPosScanInput(sanitized)
      if (memberParsed) {
        setMemberKeyword(memberParsed.memberNo)
        return
      }
      if (isMemberCouponScanPayload(sanitized)) {
        if (isMemberCouponQrPayload(sanitized)) {
          setMemberKeyword(sanitized)
          return
        }
        const couponParsed = parseLooseMemberCouponScanInput(sanitized)
        if (couponParsed?.memberNo) {
          setMemberKeyword(couponParsed.memberNo)
          return
        }
      }
      setMemberKeyword(sanitized)
    },
    []
  )

  return {
    selectedMemberId,
    setSelectedMemberId,
    memberKeyword,
    setMemberKeyword,
    memberOptions,
    setMemberOptions,
    memberMap,
    setMemberMap,
    membersLoading,
    tierDiscountRates,
    memberScanAutoSubmitRef,
    isMemberOrder,
    selectedMemberDetail,
    memberSearchEmpty,
    selectedMemberTierDiscountRate,
    tierDiscountAmt,
    tierOrderFields,
    loadMembers,
    linkMemberByMemberNo,
    linkMemberById,
    handleMemberSearch,
    handleMemberKeywordInput,
    finishMemberScanInput,
  }
}
