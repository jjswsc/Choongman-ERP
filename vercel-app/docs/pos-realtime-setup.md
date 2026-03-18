# POS Realtime 설정

메인 포스에서 주문 단말의 신규 주문을 Realtime으로 즉시 수신하려면 아래 설정이 필요합니다.

## 0. 메인 포스 1대 지정 (단말 설정)

관리자 **POS 설정** > **단말 설정** 탭에서:
- 매장당 **메인 포스 1대**만 등록되며, 해당 기기에서만 주문 수신 시 자동 인쇄가 됩니다.
- 포스 터미널 화면에서 "메인" 버튼으로 기기를 등록하고, 관리자에서 "메인 포스 해제"로 해제할 수 있습니다.
- DB에 `main_device_token` 컬럼이 필요합니다. Supabase SQL Editor에서 실행:

```sql
-- vercel-app/scripts/pos_main_device_token.sql
alter table public.pos_printer_settings add column if not exists main_device_token text;
```

- **접속 기기 목록**을 보려면 `pos_connected_devices` 테이블이 필요합니다. Supabase SQL Editor에서 실행:

```sql
-- vercel-app/scripts/pos_connected_devices.sql
-- (파일 내용 전체 실행)
```

## 1. Supabase Realtime 발행(Publication) 설정

Supabase 대시보드 → Database → Publications → `supabase_realtime` 에서 `pos_orders` 테이블을 추가하거나, SQL Editor에서 실행:

```sql
alter publication supabase_realtime add table pos_orders;
```

## 2. 환경 변수 (클라이언트 Realtime)

브라우저에서 Supabase Realtime을 사용하려면 **NEXT_PUBLIC_** 프리픽스 환경 변수가 필요합니다.

| 변수 | 설명 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL (기존 `SUPABASE_URL`과 동일 값) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 (기존 `SUPABASE_ANON_KEY`와 동일 값) |

Vercel 환경 변수에 위 두 개를 추가하세요. 기존 `SUPABASE_URL`, `SUPABASE_ANON_KEY`는 서버용으로 유지됩니다.

## 3. 동작 방식

- **Realtime**: `pos_orders` INSERT 시 WebSocket으로 즉시 수신 → 인쇄
- **폴링 보조**: 45초마다 증분 조회(`sinceId`)로 Realtime 누락 분 보완

NEXT_PUBLIC_ 변수가 없으면 Realtime 구독 없이 폴링만 동작합니다.
