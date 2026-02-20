# CM ERP (Choongman ERP)

매장·유통·인사 통합 관리 시스템. POS, 발주/입출고, 재고, 급여, 근태, 매장 방문 관리 등을 하나의 플랫폼에서 운영합니다.

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) |
| 언어 | TypeScript |
| UI | React 19, Tailwind CSS, Radix UI |
| 백엔드 | Supabase (PostgreSQL) |
| 배포 | Vercel |
| 다국어 | 자체 i18n (ko, en, th, mm, la) |

## 프로젝트 구조

```
vercel-app/
├── app/                    # Next.js App Router
│   ├── api/                 # API 라우트 (165+ 개)
│   ├── admin/               # 관리자 페이지 (28개)
│   ├── pos/                 # POS 화면
│   └── login/               # 로그인
├── components/              # React 컴포넌트
│   ├── erp/                 # ERP 공통 (발주, 재고, 발주내역 등)
│   ├── admin/               # 관리자 전용 (급여, 스케줄, 직원 등)
│   ├── shipment/            # 출고 관련
│   ├── inbound/             # 입고 관련
│   └── ui/                  # shadcn/ui 기반 UI
├── lib/                     # 유틸·클라이언트
│   ├── api-client.ts        # API 호출 함수 (145+ 개)
│   ├── supabase-server.ts   # Supabase REST (서버 전용)
│   ├── auth-context.tsx     # 인증 컨텍스트
│   ├── i18n.ts              # 다국어 번역
│   └── offline/             # POS 오프라인 동기화
└── docs/                    # 문서
```

## 로컬 실행

### 사전 요구사항

- Node.js 18+
- pnpm (권장) 또는 npm

### 1. 의존성 설치

```bash
cd vercel-app
pnpm install
# 또는
npm install
```

### 2. 환경 변수 설정

`.env.example`을 복사하여 `.env` 생성:

```bash
cp .env.example .env
```

`.env`에서 아래 값 설정:

| 변수 | 설명 | 필수 |
|------|------|------|
| `SUPABASE_URL` | Supabase 프로젝트 URL | ✅ |
| `SUPABASE_ANON_KEY` | Supabase anon 키 | ✅ |
| `JWT_SECRET` | JWT 서명용 (32자 이상). 미설정 시 ANON_KEY 사용 | 권장 |
| `RESEND_API_KEY` | 급여 명세서 이메일 발송 (resend.com) | 선택 |
| `RESEND_FROM` | 발신 이메일 주소 | 선택 |

Supabase 값은 **Supabase 대시보드 → Project Settings → API**에서 확인합니다.

### 3. 개발 서버 실행

```bash
pnpm dev
# 또는
npm run dev
```

브라우저에서 http://localhost:3000 접속.

## 데이터베이스 설정

1. **Supabase 프로젝트** 생성 (supabase.com)
2. **스키마 적용**:
   - `supabase_schema.sql` → Supabase SQL Editor에서 실행
   - `supabase_migration_consolidated.sql` → 동일하게 실행 (중복 제거, 유니크 제약, 추가 테이블)

상세 스키마는 [docs/DATABASE.md](./docs/DATABASE.md) 참고.

## 배포 (Vercel)

1. [Vercel](https://vercel.com)에 프로젝트 연결
2. **Root Directory**를 `vercel-app`으로 설정
3. 환경 변수(`SUPABASE_URL`, `SUPABASE_ANON_KEY` 등) 설정
4. 배포

## 주요 기능

| 영역 | 기능 |
|------|------|
| **발주** | 매장 발주, 본사 발주, 주문 승인, 입고 수령 |
| **재고** | 매장별 재고, 적정재고, 재고 조정 이력 |
| **출고** | 강제 출고, 창고별 출고 목록, 인보이스 인쇄 |
| **POS** | 주문, 테이블 배치, 결산, 메뉴/옵션, 오프라인 |
| **인사** | 급여, 근태, 휴가, 직원 평가 |
| **매장** | 스케줄, 매장 방문 기록, 점검 체크리스트 |
| **기타** | 공지, 불만 접수, 경비( petty cash), 설정 |

## 문서

- [ARCHITECTURE.md](./docs/ARCHITECTURE.md) - 기능별 모듈·파일 구조
- [DATABASE.md](./docs/DATABASE.md) - DB 테이블·마이그레이션 요약
- [OFFLINE_DESIGN.md](./docs/OFFLINE_DESIGN.md) - POS 오프라인 동기화 설계
- [USAGE_GUIDE_KO.md](./docs/USAGE_GUIDE_KO.md) - 사용 가이드 (한국어)
- [PURCHASE_ORDERS_SETUP.md](../docs/PURCHASE_ORDERS_SETUP.md) - 발주 설정
- [POS_SPEC.md](../docs/POS_SPEC.md) - POS 상세 스펙

## 트러블슈팅

- **로그인 실패**: Supabase `store_settings`에 매장/직원이 등록되어 있는지 확인
- **API 401**: JWT 만료 또는 `JWT_SECRET` 불일치
- **빌드 실패**: `pnpm install` 후 `pnpm build` 재시도. Node 18+ 사용 확인
