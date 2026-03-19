# Supabase 불안정 대응 가이드

Supabase(또는 일시적 네트워크/서버 장애)로 인한 장애를 줄이기 위한 설정·코드·대안 정리.

---

## 1. 이미 적용된 대응 (코드)

| 대응 | 설명 |
|------|------|
| **서버 재시도** | `lib/supabase-server.ts`: 5xx·429·타임아웃·연결 오류 시 최대 3회 요청, 800ms → 1.6s → 3.2s 백오프 후 재시도. |
| **클라이언트 5xx 큐** | API가 500 대를 반환하면 쓰기 요청을 로컬 큐에 넣고, 복구 후 `syncPending`으로 전송. (`lib/api/fetch-offline.ts`) |
| **오프라인 로그인** | 서버 접속 불가 시, 같은 브라우저에 이전 세션이 있으면 "오프라인 모드로 들어가기"로 진입 가능. (`components/login/login-form.tsx`) |
| **오프라인 주문/결산** | POS 주문·결산 등은 오프라인 시 로컬 저장 후 복구 시 자동 전송. |

---

## 2. Supabase 대시보드·요금제에서 확인할 것

- **리전**: [status.supabase.com](https://status.supabase.com) 에서 사용 중 리전(예: ap-northeast) 장애 여부 확인. 문제가 잦으면 리전 변경 검토(프로젝트 재생성 필요할 수 있음).
- **Connection Pooler**: 대시보드 → Settings → Database에서 **Connection pooling** 사용 권장. 직접 연결 수 제한으로 인한 끊김을 줄일 수 있음.
- **무료 플랜 한계**: 동시 연결·리소스 제한이 있어 트래픽이 조금만 있어도 타임아웃·500이 날 수 있음. **Pro 플랜**으로 올리면 안정성·한도가 나아짐.
- **타임아웃**: 현재 서버 쪽 Supabase 요청 타임아웃은 15초. 필요하면 `lib/supabase-server.ts`의 `timeout: 15_000` 조정 가능(너무 길면 사용자 대기만 길어짐).

---

## 3. DB 이전(대안) 옵션

Supabase를 그대로 쓰지 않고 안정성을 직접 챙기고 싶을 때 선택지.

### A. Supabase Self-Hosted (동일 스택)

- [Supabase Self-Hosting](https://supabase.com/docs/guides/self-hosting) 으로 자체 서버(VPS, AWS 등)에 Supabase 스택(Postgres + PostgREST + Auth 등) 설치.
- **장점**: 코드 변경 거의 없음, 환경 변수만 자체 URL/키로 변경. **단점**: 백업·업데이트·모니터링을 직접 해야 함.

### B. Postgres + PostgREST 직접 운영

- Supabase는 내부적으로 **Postgres + PostgREST** 조합. 동일 API를 쓰려면:
  - 관리형 Postgres(Neon, Railway, AWS RDS 등) 생성.
  - [PostgREST](https://postgrest.org/) 를 서버/컨테이너에 띄우고, 기존 Supabase REST 호출(`/rest/v1/...`)을 이 PostgREST URL로 보내도록 `SUPABASE_URL`만 변경.
- **장점**: DB·리전·요금제를 자유롭게 선택. **단점**: RLS·Auth·Storage 등은 Supabase와 다르므로, 현재 Supabase Auth/Storage를 쓰고 있다면 별도 구현 또는 Supabase는 Auth만 쓰고 DB만 이전하는 식으로 나눌 수 있음.

### C. 다른 관리형 Postgres만 사용 (코드 수정 필요)

- Neon, Railway, PlanetScale(MySQL), AWS RDS 등으로 DB만 옮기고, 앱에서는 **Supabase REST 대신** `pg`(node-postgres) 등으로 직접 SQL 호출.
- **장점**: DB 완전 자율. **단점**: `supabaseSelect` / `supabaseInsert` / `supabaseRpc` 등을 쓰는 API 라우트를 전부 SQL/트랜잭션으로 다시 짜야 해서 작업량이 큼.

---

## 4. 정리

- **당장**: 서버 재시도·클라이언트 5xx 큐·오프라인 로그인으로 일시 장애는 이미 완화되어 있음.
- **설정**: Supabase 리전·Connection Pooler·Pro 플랜 검토.
- **근본 이전**: Supabase가 계속 불안하면 Self-Hosted 또는 PostgREST + 관리형 Postgres로 이전하는 방안을 검토하면 됨.
