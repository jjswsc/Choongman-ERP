# SaaS Hybrid Onboarding

## 목적
- 내부 운영(충만)과 외부 SaaS를 같은 코드 코어로 운영한다.
- 기본은 멀티테넌트 1개 Supabase 프로젝트를 사용한다.
- 엔터프라이즈 고객은 전용 Supabase 프로젝트로 분기한다.

## 고객사별 KBank / Grab 연동 (DB)

Vercel env는 **Omni 플랫폼 1세트**만 유지합니다. 고객·매장별 카시콘·Grab 자격은 DB에 저장합니다.

1. Supabase SQL Editor에 `sql/tenant_integrations.sql` 실행
2. `/saas-admin/customers` → 고객사 선택 → **연동(KBank/Grab)** 탭에서 입력
3. API: `GET/POST /api/saasAdminIntegrations?tenantId=...`

| 테이블 | 용도 |
|--------|------|
| `tenant_integrations` | 고객사별 KBank OAuth / Grab OAuth |
| `tenant_store_integrations` | 매장별 terminalId, Grab merchant 매핑 |

DB 행이 없으면 기존 `process.env` 폴백(충만 단일 운영 호환).

## 환경 변수
- `NEXT_PUBLIC_APP_BRAND`: `choongman` | `omnifoodtech`
- `NEXT_PUBLIC_APP_DOMAIN`: 브랜드 도메인 문자열
- `SUPABASE_RUNTIME_MAP_JSON`: tenant -> 전용 프로젝트 매핑(JSON)

예시:

```json
{
  "acme-food": {
    "url": "https://xxx.supabase.co",
    "serviceRoleKey": "service-role-key"
  }
}
```

## 신규 고객 온보딩 순서
1. `tenant_id`/회사명 확정
2. (신규 빈 프로젝트면) `sql/saas_base_schema.sql` 실행
3. `sql/saas_tenant_bootstrap.sql` 실행
4. `tenants` 레코드 생성
5. 초기 관리자 계정 생성(`employees.company`, `employees.tenant_id`)
6. 매장/거래처/기초설정 데이터 시드
7. 로그인 검증(회사/매장/사용자/비밀번호)

## 전용 프로젝트 분기
1. 전용 Supabase 프로젝트 생성
2. 스키마 동기화 (`sql/saas_base_schema.sql` -> `sql/saas_tenant_bootstrap.sql` -> 운영 SQL)
3. `SUPABASE_RUNTIME_MAP_JSON`에 tenant 매핑 추가
4. 배포 후 `/saas-admin`에서 테넌트별 검증

## 빠른 체크리스트 (Supabase SQL Editor)
1. 새 프로젝트 생성
2. `saas_base_schema.sql` 실행
3. `saas_tenant_bootstrap.sql` 실행
4. `employees`에 관리자 1명 insert (company/store/name/password)
5. 앱에서 회사/매장/사용자/비밀번호 로그인 테스트
