/**
 * 태국 정부·공공 전자신고 채널 참고 (링크·연동 방식 요약).
 * API 키·등록은 세무청/기관 절차에 따름.
 */

export type GovChannelId = 'rd_efiling_api' | 'dbd_efiling' | 'sso_eservice' | 'etax_etda' | 'rd_etax_ws'

export type GovFilingChannel = {
  id: GovChannelId
  agencyKo: string
  agencyEn: string
  purposeKo: string
  integrationKo: string
  urls: { label: string; href: string }[]
  envHints?: string[]
}

export const THAI_GOV_FILING_CHANNELS: GovFilingChannel[] = [
  {
    id: 'rd_efiling_api',
    agencyKo: '국세청 (กรมสรรพากร)',
    agencyEn: 'Revenue Department',
    purposeKo: 'VAT·원천·법인세·PIT 등 e-Filing',
    integrationKo:
      '공식 Open API(인증·전표 제출·납부·영수증 등). 사업자 유형별 등록(Single Entity / Full Service Provider 등). ERP는 JSON 생성 후 중간 허브 또는 인증 서버에서 연동하는 구성이 일반적.',
    urls: [
      { label: 'RD e-Filing Open API', href: 'https://efiling.rd.go.th/rd-cms/openapi' },
      { label: 'RD API Spec', href: 'https://efiling.rd.go.th/rd-cms/api' },
    ],
    envHints: [
      'RD_EFILING_CLIENT_ID',
      'RD_EFILING_CLIENT_SECRET',
      'RD_EFILING_BASE_URL (기본값 efiling.rd.go.th 문서 기준)',
    ],
  },
  {
    id: 'dbd_efiling',
    agencyKo: '상업발전부 (กพท. / DBD)',
    agencyEn: 'Department of Business Development',
    purposeKo: '연간 재무제표 전자제출',
    integrationKo:
      '포털 업로드·XBRL(엑셀 템플릿 변환) 중심. ERP는 DBD 템플릿에 맞춘 Export 또는 회계 클로징 툴과 연계.',
    urls: [{ label: 'DBD e-Filing', href: 'https://efiling.dbd.go.th/efilingweb/' }],
  },
  {
    id: 'sso_eservice',
    agencyKo: '사회보험공단 (สปส.)',
    agencyEn: 'Social Security Office',
    purposeKo: 'E-Contribution, E-WAGE 등 고용주 신고',
    integrationKo: '웹·앱(e-Service) 중심. 공개 REST 스펙은 RD 대비 제한적 — 필요 시 기관 문의.',
    urls: [{ label: 'SSO e-Services', href: 'https://www.sso.go.th/' }],
  },
  {
    id: 'etax_etda',
    agencyKo: 'e-Tax (ETDA·연계)',
    agencyEn: 'e-Tax Invoice ecosystem',
    purposeKo: '전자세금계산서·검증 등',
    integrationKo: 'ETDA 문서·샘플(예: soda-etax) 및 RD 연계 서비스 범위에 맞춰 단계적 도입.',
    urls: [
      { label: 'e-Tax download (TEDA)', href: 'https://etax.teda.th/download.php' },
      { label: 'ETDA soda-etax (GitHub)', href: 'https://github.com/ETDA/soda-etax' },
    ],
  },
  {
    id: 'rd_etax_ws',
    agencyKo: '국세청 ETAX Service',
    agencyEn: 'RD e-Tax registration check',
    purposeKo: '거래처 e-Tax 등록 여부 조회 등',
    integrationKo: 'RD에서 제공하는 웹서비스·엔드포인트(문서 기준). 운영 URL·인증은 최신 공지 확인.',
    urls: [{ label: 'RD e-Tax service 안내', href: 'https://www.rd.go.th/62829.html' }],
  },
]

/** 1단계: RD Open API 전 연 파일 Export 권장 여부 */
export const GOV_INTEGRATION_PHASES = {
  phase1: '시산·부가세·원천 부속장부 → CSV/엑셀 Export 후 세무사 검토',
  phase2: 'RD Open API 등록 후 제출 포맷 자동화(토큰·서명은 서버 전용 보관)',
  phase3: 'DBD XBRL·SSO는 포털/전용 툴 병행 또는 기관 API 협의 시 확장',
} as const
