# 회원앱 픽업 선결제 운영 가이드

## 배포 체크리스트

1. **Vercel 환경변수 (Production 필수)**
   - `KBANK_TERMINAL_ID` 등 KBank QR (POS와 동일)
   - **`CRON_SECRET`** — Vercel Cron이 `Authorization: Bearer {값}` 으로 호출. **16자 이상 랜덤 문자열**, 특수문자·줄바꿈 없이. Production에 등록 후 **재배포**해야 Cron에 반영됨.
   - (선택) `MEMBER_PORTAL_PREPAY_ENABLED=1` — DB 설정보다 env 우선

2. **Supabase SQL** (1회)
   - `sql/member_portal_prepay_office_pilot.sql` 실행
   - 또는 CRM → 회원앱 → 배달 탭에서 선결제 ON

3. **Vercel Cron** (`vercel.json`)
   - `*/5` — `/api/member-portal/cron/expire-pending-payments` (5분 QR 만료)
   - `*/10` — `/api/member-portal/cron/reconcile-pending-payments` (웹훅 누락 복구)

## 동작 요약

| 단계 | 설명 |
|------|------|
| QR 결제 전 | `[결제대기]` — POS·주방 목록에 **미표시** |
| QR 결제 완료 | `paid` — POS 접수, 주방·홀 자동인쇄, 알림음 |
| 5분 초과 미결제 | `cancelled` + `[결제만료]` |

## 관리자 설정

- **CRM → 회원앱 → 배달**: 선결제 ON/OFF, 매장 칩, 전 매장 공개, **7일 통계**, **픽업 최소 리드(분)**

## 수동 점검 (manager 로그인)

```http
GET /api/member-portal/cron/expire-pending-payments
GET /api/member-portal/cron/reconcile-pending-payments
Authorization: Bearer {manager session}
```

Cron은 `Authorization: Bearer {CRON_SECRET}`. `CRON_SECRET` 미설정 시 Cron 로그에 **503**과 안내 메시지가 보입니다.
