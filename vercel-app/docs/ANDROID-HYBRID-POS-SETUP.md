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
4. 환경변수 예시
   - `CAPACITOR_POS_URL=https://your-domain/pos/login`

## 4) 실행 절차
1. 의존성 설치: `npm install`
2. Android 프로젝트 동기화: `npm run mobile:android:sync`
3. Android Studio 열기: `npm run mobile:android:open`
4. APK 생성: Android Studio Build 메뉴 또는 Gradle task 사용

## 5) 운영 원칙
- 주문/정산/상태 변경은 온라인 우선, 실패 시 오프라인 큐 적재
- 카드단말 승인 흐름은 즉시 승인형(온라인)으로 유지
- 재고 차감은 `completed` 상태 시점 서버 처리(오프라인 주문은 재연결 후 동기화 시 처리)
