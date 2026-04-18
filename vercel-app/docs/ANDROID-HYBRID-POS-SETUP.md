# Android 설치형 Hybrid POS 설정 가이드

## 1) 목적
- 브라우저 접속 품질 이슈(느림, 탭 종료, 주소창 진입 오류)를 줄이기 위해 Android APK 설치형으로 전환
- POS 화면은 기존 `vercel-app`을 그대로 사용하고, 앱은 WebView 셸 역할만 수행

## 2) 코드 기준점
- Capacitor 설정 파일: `capacitor.config.ts`
- 앱 시작 경로: `CAPACITOR_POS_URL` (예: `https://your-domain/pos/login`)
- 오프라인 동기화: `lib/offline/sync.ts`
- 오프라인 상태 배너: `components/offline-banner.tsx`

## 3) 초기 준비
1. Node 설치
2. Android Studio 설치 (SDK/Platform Tools 포함)
3. Java 17 설정
4. 환경변수 예시(수동 동기화 시)
   - `CAPACITOR_POS_URL=https://your-domain/pos/login`
   - 아래 **npm 프로필**을 쓰면 동기화 시점에 URL이 자동 설정되므로, 보통은 수동 env 없이 진행하면 됩니다.

## 4) 실행 절차
1. 의존성 설치: `npm install`
2. Android 프로젝트 동기화 (`capacitor.config.ts`에 WebView URL 반영):
   - **내부(충만) 기본:** `npm run mobile:android:sync` 또는 `npm run mobile:android:sync:internal`
   - **판매(omnifoodtech):** `npm run mobile:android:sync:external`
   - 구현: `scripts/cap-sync-android-profile.cjs`가 프로필별 `CAPACITOR_POS_URL`·`DEPLOY_PUBLIC_ORIGIN`을 넣은 뒤 `npx cap sync android` 실행
3. Android Studio 열기: `npm run mobile:android:open`
4. APK 생성: Android Studio Build 메뉴 또는 Gradle task 사용 (`npm run mobile:android:assemble:prod` 등)

**웹 빌드 + 동기화 한 번에:** `npm run mobile:android:build`(내부 기본), `npm run mobile:android:build:external`(판매 URL로 동기화)

## 5) 운영 원칙
- 주문/정산/상태 변경은 온라인 우선, 실패 시 오프라인 큐 적재
- 카드단말 승인 흐름은 즉시 승인형(온라인)으로 유지
- 재고 차감은 `completed` 상태 시점 서버 처리(오프라인 주문은 재연결 후 동기화 시 처리)
