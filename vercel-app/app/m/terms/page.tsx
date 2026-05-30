'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { MemberPortalLangProvider, useMemberPortalLang } from '@/lib/member-portal-lang-context'

function TermsContent() {
  const { lang } = useMemberPortalLang()

  const title =
    lang === 'ko'
      ? '이용약관'
      : lang === 'en'
        ? 'Terms of Service'
        : 'ข้อกำหนดการใช้งาน'

  const updated =
    lang === 'ko'
      ? '최종 업데이트: 2026-05-30 (방콕 기준)'
      : lang === 'en'
        ? 'Last updated: 2026-05-30 (Bangkok time)'
        : 'อัปเดตล่าสุด: 2026-05-30 (เวลาไทย)'

  const intro =
    lang === 'ko'
      ? '충만치킨 태국 멤버십 앱 이용 시 아래 약관이 적용됩니다.'
      : lang === 'en'
        ? 'These terms apply when using the Choongman Chicken Thailand membership app.'
        : 'ข้อกำหนดนี้ใช้กับการใช้งานแอปสมาชิก Choongman Chicken Thailand'

  const points =
    lang === 'ko'
      ? [
          '회원 포인트/쿠폰/혜택은 매장 정책에 따라 변경될 수 있습니다.',
          '부정 이용이 확인되면 계정 또는 혜택이 제한될 수 있습니다.',
          '서비스 안정화 목적의 점검으로 일시 중단이 있을 수 있습니다.',
          '문의가 필요한 경우 매장 또는 관리자에게 연락해 주세요.',
        ]
      : lang === 'en'
        ? [
            'Points, coupons, and benefits may change by store policy.',
            'If misuse is detected, account access or benefits may be limited.',
            'The service may be temporarily unavailable for maintenance.',
            'For support, please contact store staff or an administrator.',
          ]
        : [
            'แต้ม คูปอง และสิทธิประโยชน์อาจเปลี่ยนแปลงตามนโยบายสาขา',
            'หากพบการใช้งานผิดปกติ อาจมีการจำกัดบัญชีหรือสิทธิ์',
            'ระบบอาจหยุดชั่วคราวเพื่อบำรุงรักษา',
            'หากต้องการความช่วยเหลือ กรุณาติดต่อพนักงานสาขาหรือผู้ดูแล',
          ]

  return (
    <div className="min-h-[100dvh] bg-white text-[#1f1f1f]">
      <div className="mx-auto max-w-lg px-5 py-6">
        <Link href="/m" className="mb-4 inline-flex items-center gap-1 text-sm text-[#666] hover:text-[#222]">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Link>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-xs text-[#888]">{updated}</p>
        <p className="mt-5 text-sm leading-relaxed text-[#444]">{intro}</p>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[#444]">
          {points.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default function MemberTermsPage() {
  return (
    <MemberPortalLangProvider>
      <TermsContent />
    </MemberPortalLangProvider>
  )
}

