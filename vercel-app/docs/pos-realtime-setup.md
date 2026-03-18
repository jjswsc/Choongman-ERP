# POS Realtime 설정

메인 포스에서 주문 단말의 신규 주문을 Realtime으로 즉시 수신하려면 아래 설정이 필요합니다.

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
