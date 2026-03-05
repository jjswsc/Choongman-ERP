# Supabase 보안 취약점 조치안

> Supabase에서 수신한 "security vulnerabilities" 이메일에 대한 대응입니다.

## 1. 취약점 요약

### 문제
- **RLS 정책**: 모든 테이블에 `USING (true) WITH CHECK (true)` 형태의 "Allow all for anon" 정책이 적용되어 있음
- **의미**: anon(공개) 키를 가진 **누구나** Supabase REST API를 직접 호출해 **전체 데이터를 읽고 수정/삭제**할 수 있음
- anon 키가 네트워크·번들 등으로 노출되면, 공격자가 Next.js API를 우회해 DB에 직접 접근 가능

### 현재 아키텍처
```
[클라이언트] → [Next.js API] → [Supabase]  (JWT 검증, anon 키 사용)
                    ↑
              인증은 API 레벨에서 수행
              하지만 Supabase는 anon 키로 직접 호출 시 RLS가 사실상 없음
```

## 2. 조치 방안

### 2-1. 서버에서 `service_role` 키 사용 (권장)

- **목적**: 서버 전용 키(service_role)는 RLS를 **우회**함. 클라이언트에는 노출하지 않음.
- **효과**: 
  - Next.js API만 DB에 접근 → JWT 검증이 유일한 접근 제어
  - anon 키로 직접 Supabase 호출 시 RLS에 의해 **차단** (아래 2-2와 함께 적용)

**필요 작업**:
1. Supabase Dashboard → Project Settings → API → `service_role` 키 복사
2. Vercel 환경 변수에 `SUPABASE_SERVICE_ROLE_KEY` 추가 (기존 `SUPABASE_ANON_KEY`는 삭제하지 않아도 됨)
3. `vercel-app/lib/supabase-server.ts` 수정: `SUPABASE_SERVICE_ROLE_KEY` 우선 사용

### 2-2. anon용 RLS 정책 제거 (차단)

- **목적**: anon 키로의 **직접** Supabase 접근 차단
- **방법**: "Allow all" 계열 RLS 정책을 모두 제거
- **결과**: RLS가 켜져 있고 허용 정책이 없으면 → anon 키로는 **모든 접근 거부**

**필요 작업**:
1. `supabase_fix_rls_deny_anon.sql` 실행 (기존 "Allow all" 정책 제거)
2. `supabase_enable_rls_all_tables.sql` 실행 (RLS 미적용 테이블에 RLS 활성화)
3. 실행 후 Supabase Security Advisor에서 취약점 해소 여부 확인

### 2-3. getLoginData API 검토 (추가 권장사항)

- `getLoginData` API는 **인증 없이** 직원 목록·거래처 목록을 반환
- 로그인 화면 dropdown용이지만, 정보 노출 범위를 고려해 **속도 제한(rate limit)** 또는 **제한된 데이터만 노출** 등 검토 권장

## 3. 적용 순서 (순서 중요)

1. **Vercel**: `SUPABASE_SERVICE_ROLE_KEY` 환경 변수 추가  
   - Supabase Dashboard → Project Settings → API → service_role 키 복사 후 설정
2. **코드 배포**: `supabase-server.ts` 수정사항 배포 (service_role 우선 사용)
3. **Supabase SQL 실행** (1~2 완료 후 실행):
   - `supabase_fix_rls_deny_anon.sql` — 기존 "Allow all" 정책 제거
   - `supabase_enable_rls_all_tables.sql` — RLS 미적용 테이블에 RLS 활성화  
   - ⚠️ **주의**: 1~2를 먼저 적용하지 않고 SQL만 먼저 실행하면 앱이 동작하지 않습니다.
4. **검증**: 로그인·주요 기능 정상 동작 확인, Supabase Security Advisor 재확인

## 4. Supabase Dashboard에서 확인할 위치

- **Project Settings** → **API**: `anon` / `service_role` 키 확인
- **Database** → **Policies**: RLS 정책 목록
- **Security** / **Advisors** (해당 메뉴가 있다면): 취약점 리포트

## 5. 참고

- [Supabase - Securing your data](https://supabase.com/docs/guides/database/secure-data)
- [Supabase - Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- service_role 키는 **절대** 클라이언트 번들·환경 변수(공개 가능한 것)·프론트엔드에 포함하지 말 것
