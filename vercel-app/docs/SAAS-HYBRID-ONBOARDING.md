# SaaS Hybrid Onboarding

## 목적
- 내부 운영(충만)과 외부 SaaS를 같은 코드 코어로 운영한다.
- 기본은 멀티테넌트 1개 Supabase 프로젝트를 사용한다.
- 엔터프라이즈 고객은 전용 Supabase 프로젝트로 분기한다.

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
