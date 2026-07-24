# Windows 설치형 하이브리드 POS 운영 가이드

## 1) 매장별 사용 원칙

- **Windows POS 단말(기본)**: 설치형 앱(`.exe`) 사용
- **Android 태블릿(보조/이동형)**: Android 앱(`.apk`) 별도 설치 사용
- 두 플랫폼 모두 같은 서버/POS URL을 사용하며, 계정/데이터 정책은 동일

즉, 기존처럼 Windows에서 브라우저로만 쓰는 것이 아니라,
Windows 단말은 설치형 앱으로 전환하는 것을 기본 운영으로 권장합니다.

## 2) Windows 설치형 앱(핵심 운영)

경로: `windows-pos/`

- Electron 기반 설치형 셸
- 서버 URL: `WINDOWS_POS_URL` 환경변수로 지정 (기본값은 예시 URL)
- 오프라인/네트워크 실패 시 로컬 안내 화면 표시
- 외부 도메인 이동 차단(허용 origin 외 링크는 외부 브라우저로 열기)

### 로컬 실행

```bash
cd windows-pos
npm install
npm run dev
```

### Windows 설치파일 빌드 (아이콘/서명/버전 포함)

```powershell
cd vercel-app
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows-pos.ps1 `
  -PosUrl "https://your-domain.com/pos/login" `
  -AllowedOrigin "https://your-domain.com" `
  -UpdateManifestUrl "https://your-domain.com/downloads/windows-pos/latest.json" `
  -Version "0.1.1" `
  -IconPath "C:\assets\cm-pos.ico" `
  -CertPfxPath "C:\cert\cm-pos-signing.pfx" `
  -CertPassword "your-password"
```

생성물: `windows-pos/dist/` 아래 `nsis installer` 및 `portable exe`

참고: `build-windows-pos.ps1`는 기본적으로 회사 로고 스타일 아이콘(`windows-pos/assets/icon.ico`)을 자동 생성해 사용합니다.
별도 아이콘을 쓰려면 `-IconPath` 인자를 지정하세요.
또한 설치형 앱 내부에 수동 업데이트 확인/인쇄 단축키(`Ctrl+Shift+U`, `Ctrl+P`, `Ctrl+Shift+P`)가 포함됩니다.

### 매장별 프린터 설정 운영 방식

- 공통 설치파일은 동일하게 배포
- 매장별로 `runtime-config.json`의 `print.deviceName`만 다르게 적용
- 샘플 템플릿: `windows-pos/store-configs/*.sample.json`

### 영수증·주방 인쇄 (브라우저 POS vs 설치형)

- **브라우저**: Chromium `window.print` / 숨김 iframe — OS 인쇄 대화상자 흐름이 기준.
- **설치형(Electron)**: `iframe.print()`가 무시되는 경우가 많아, **숨은 `BrowserWindow`에 HTML을 올린 뒤 `webContents.print()`**로 보냄.  
  CSS(`@page` 80mm 등)는 같아도, **용지·마진·스케일을 Electron이 별도로 넘기므로** 미세하게 어긋날 수 있음(웹과 1:1 동일을 기대하지 말 것).
- **자동(무인쇄) 인쇄**가 되려면:
  1. `runtime-config.json`의 `print.silent`가 **`true`**(기본)일 것. `false`이면 처음부터 대화상자가 뜸.
  2. `print.deviceName`을 Windows에 표시되는 프린터 이름과 **완전히 동일**하게 넣을 것(`Get-Printer` 등으로 확인). 비우면 기본 프린터로 무인쇄 시도.
  3. 일부 열전사 드라이버는 **커스텀 용지(80mm) 무인쇄를 거부**한다. 앱은 **드라이버 기본 용지로 무인쇄를 한 번 더 시도**한 뒤, 그래도 실패할 때만 대화상자를 연다(버전에 따라 `printStage` 응답 필드로 구분 가능).
- 여전히 매번 대화상자만 뜨면: 드라이버/포트/프린터 오프라인 여부와 `deviceName` 오타를 먼저 본다.

적용 명령:

```powershell
cd vercel-app
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/use-windows-pos-store-config.ps1 -TemplatePath "store-configs/store-a.sample.json"
```

### Windows 다운로드 게시 + 자동업데이트 매니페스트 생성

```powershell
cd vercel-app
# Omni 판매용 (latest.json + cm-pos-windows-latest-*)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/publish-windows-pos.ps1 `
  -Brand omnifoodtech `
  -BaseUrl "https://app.omnifoodtech.com" `
  -ReleaseNotes "파일럿 안정화 릴리스"

# 충만 내부용 (latest-choongman.json + cm-pos-windows-choongman-*) — Omni 경로를 덮어쓰지 않음
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/publish-windows-pos.ps1 `
  -Brand choongman `
  -BaseUrl "https://choongman-erp.vercel.app" `
  -ReleaseNotes "파일럿 안정화 릴리스"
```

게시 결과:

- Omni: `/downloads/windows-pos/cm-pos-windows-latest-setup.exe` + `latest.json`
- 충만: `/downloads/windows-pos/cm-pos-windows-choongman-latest-setup.exe` + `latest-choongman.json`
- (생성 시) 각 브랜드 portable 도 동일 접두사로 게시

## 3) Android 다운로드 경로(매장 안내용)

Android는 반드시 별도 설치가 필요합니다.  
이번에 **고정 다운로드 URL 방식**을 추가했습니다.

- 배포 파일 위치: `public/downloads/`
- 권장 링크:
  - APK: `/downloads/cm-pos-android-latest.apk`
  - 체크섬: `/downloads/cm-pos-android-latest.apk.sha256.txt`

### APK 게시 절차 (태블릿 설치 링크 고정)

```powershell
cd vercel-app
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/publish-android-apk.ps1
```

또는 소스 APK를 직접 지정:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/publish-android-apk.ps1 -SourceApkPath "C:\path\to\your.apk"
```

배포 후 매장에는 회사 도메인 링크만 안내하면 됩니다.

예시(매장 공유 링크):

- `https://your-domain.com/downloads/cm-pos-android-latest.apk`
- `https://your-domain.com/downloads/cm-pos-android-latest.apk.sha256.txt`

## 4) 권장 운영 정리

- **카운터 POS(Windows)**: 설치형 Windows 앱 사용 (핵심)
- **태블릿**: Android 앱 별도 설치
- 웹 브라우저 POS는 비상/관리 용도로만 유지하고, 실운영은 설치형 전환
- Windows 앱은 실행 시 `latest.json`을 조회해 새 버전이 있으면 다운로드 링크를 자동 안내
