'use client'

import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { MemberPortalLangProvider, useMemberPortalLang } from '@/lib/member-portal-lang-context'

function PrivacyContent() {
  const { lang } = useMemberPortalLang()

  const title =
    lang === 'ko'
      ? '개인정보처리방침'
      : lang === 'en'
        ? 'Privacy Policy'
        : 'นโยบายความเป็นส่วนตัว'

  const updated =
    lang === 'ko'
      ? '최종 업데이트: 2026-05-30 (방콕 기준)'
      : lang === 'en'
        ? 'Last updated: 2026-05-30 (Bangkok time)'
        : 'อัปเดตล่าสุด: 2026-05-30 (เวลาไทย)'

  const intro =
    lang === 'ko'
      ? '회원 서비스 제공을 위해 최소한의 정보를 수집하고 안전하게 보관합니다.'
      : lang === 'en'
        ? 'We collect minimum data required for membership services and keep it secure.'
        : 'เราเก็บข้อมูลเท่าที่จำเป็นสำหรับบริการสมาชิกและดูแลความปลอดภัยของข้อมูล'

  const points =
    lang === 'ko'
      ? [
          '수집 항목: 이름, 전화번호, 생년월일, 이용 내역, 포인트/쿠폰 정보',
          '이용 목적: 로그인 인증, 혜택 제공, 서비스 운영 및 고객 지원',
          '보관/보호: 권한 통제, 접근 기록, 서버 보안 정책 적용',
          '요청 권리: 정보 확인·정정·삭제 요청은 매장 또는 관리자에게 문의',
        ]
      : lang === 'en'
        ? [
            'Data collected: name, phone, birth date, usage history, points/coupons.',
            'Purpose: authentication, benefit delivery, service operation, customer support.',
            'Protection: access control, audit logs, server security policies.',
            'Your rights: request access, correction, or deletion via store/admin support.',
          ]
        : [
            'ข้อมูลที่เก็บ: ชื่อ เบอร์โทร วันเกิด ประวัติการใช้งาน แต้ม/คูปอง',
            'วัตถุประสงค์: ยืนยันตัวตน มอบสิทธิประโยชน์ และดูแลการให้บริการ',
            'การปกป้องข้อมูล: ควบคุมสิทธิ์การเข้าถึง บันทึกการใช้งาน และนโยบายความปลอดภัยเซิร์ฟเวอร์',
            'สิทธิของผู้ใช้: ขอเข้าถึง แก้ไข หรือลบข้อมูลผ่านสาขาหรือผู้ดูแลระบบ',
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

export default function MemberPrivacyPage() {
  return (
    <MemberPortalLangProvider>
      <PrivacyContent />
    </MemberPortalLangProvider>
  )
}

