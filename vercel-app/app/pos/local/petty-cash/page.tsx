'use client'

import { PosPettyCashTab } from '@/components/tabs/pos-petty-cash-tab'

/** POS 패티캐쉬 - 시재와 별도, 소액 경비(배달비 등) */
export default function PosLocalPettyCashPage() {
  return <PosPettyCashTab offlineAware />
}
