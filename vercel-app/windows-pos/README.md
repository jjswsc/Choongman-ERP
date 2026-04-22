# Choongman POS Windows Shell

Windows 설치형 하이브리드 POS 셸(Electron)입니다.

## 인쇄 레이아웃 (영수증·주방) 확정본

웹 POS와 **같은** HTML/CSS는 `vercel-app` 에서 만들어지고, 하이브리드는 Electron이 그걸 인쇄한다. **여백·그리드·`main.js` 인쇄 옵션까지 한곳에 적어 둔 문서**는 저장소 **`.cursor/rules/pos-print-layout-baseline.mdc`** 이다 (웹·하이브리드 공통 기준).

## 런타임 설정

기본 설정 파일: `runtime-config.json`

- **설치본(NSIS·포터블)**: `electron-builder` 가 `app.asar` 안에 이 파일을 **항상 포함**합니다(`package.json` → `build.files`). 별도로 복사할 필요 없이 설치되어 있습니다.
- **첫 실행 시**: `userData` 아래 `runtime-config.json`이 없으면(또는 0바이트) 번들을 복사하거나 기본 JSON을 씁니다. **NSIS 설치 Windows 본(패키징)**은 기본 `userData`를 `…\Choongman POS\resources\choongman-pos-user-data\`로 잡아, 요청하신 것처럼 `resources` 안에 생성됩니다(쓰기 권한이 없으면 자동으로 AppData로 폴백). `CM_POS_USE_DEFAULT_USERDATA=1`이면 **항상** 기본 AppData를 씁니다.

### Windows에서 파일이 안 보일 때 (검색 안 됨)

- 탐색기·시작 메뉴 검색은 **`AppData\Roaming` 아래를 잘 안 잡을** 수 있습니다. **앱을 한 번이라도 실행한 뒤**에는 위 자동 복사로 사용자 파일이 생깁니다.
- 셸은 두 곳을 **병합**합니다: (1) 설치된 앱(번들) (2) **사용자 덮어쓰기** — 매장에서 고치는 건 보통 (2)입니다.

**AppData는 필수가 아님.** Windows에서 권한·백업에 맞는 **기본 위치**로 Roaming을 쓰는 것뿐입니다. 전부 다른 폴더(예: `D:\cm-pos\data`)에 두려면 **앱이 처음 뜨기 전**에 환경 변수로 지정합니다.

- `WINDOWS_POS_USER_DATA` 또는 `CM_POS_USER_DATA` = **폴더** 절대/상대 경로(이름 기준). 이 경로가 Electron `userData` 루트가 되며, 그 아래 `runtime-config.json`·캐시·세션이 같이 갑니다.
- (위 미지정·Windows 설치 본) **기본**: `%ProgramFiles%\Choongman POS\resources\choongman-pos-user-data\` — `resources` 아래에 생성. 권한 오류 시 기본 AppData로 자동 전환.
- `CM_POS_USE_DEFAULT_USERDATA=1` / `WINDOWS_POS_USE_DEFAULT_USERDATA=1` = `resources` 기본을 쓰지 않고 **Electron 기본 userData(보통 AppData)**만 사용.
- `portable` / `next-to-exe` / `beside-exe` = **실행 파일 옆** `choongman-pos-user-data` 폴더(포터블·UAC 없는 경로 권장). `Program Files` 밑 설치본이면 쓰기 실패할 수 있어, 그때는 `D:\…` 등으로 `WINDOWS_POS_USER_DATA`를 쓰는 것이 낫습니다.

(바로가기·배치 파일에서 `set WINDOWS_POS_USER_DATA=...` 후 `Choongman POS.exe` 실행 등으로 적용할 수 있습니다.)

**사용자 덮어쓰기 경로(기본, `package.json`의 `name`이 `choongman-pos-windows`일 때):**

`%APPDATA%\choongman-pos-windows\runtime-config.json`  
→ 전체 예: `C:\Users\<사용자이름>\AppData\Roaming\choongman-pos-windows\runtime-config.json`

PowerShell에서 폴더를 바로 엽니다:

```powershell
explorer $env:APPDATA\choongman-pos-windows
```

여기에 아직 없으면 **POS를 한 번 실행**하거나, 수동으로 `windows-pos/runtime-config.example.json`과 같은 내용의 파일을 만들면 됩니다.

**참고:** 개발 중 `electron .`로 띄운 경우에도 동일하게 `AppData\Roaming\choongman-pos-windows`를 씁니다. 제품명만 다른 빌드(OmniFoodTech 등)는 `%APPDATA%` 아래 **앱 이름 폴더**가 다를 수 있으니, 해당 PC에서 위 `explorer`로 `Roaming`을 열어 폴더명을 확인하세요.

- `posUrl`: POS 접속 URL
- `allowedOrigin`: 허용 오리진(외부 이동 차단 기준)
- `kiosk`: `1`(기본) 키오스크 / `0` 일반창
- `updateManifestUrl`: 업데이트 매니페스트 URL (`latest.json`)
- `print.silent`: `true`(기본)이면 영수증·주방 HTML 인쇄도 **무인쇄 우선**. `false`이면 **항상 인쇄 대화상자**가 먼저 뜸.
- `print.deviceName`: 무인쇄·빠른 인쇄에 쓸 프린터 이름. Windows **정확한 표시 이름**과 일치해야 무인쇄 성공률이 높음 (비우면 Windows 기본 프린터).
- **ESC/POS 절단(무인쇄 RAW)**: `WINDOWS_POS_PRINT_ESC_POS_CUT=0`이면 종류와 관계없이 절단 안 함. 그 외에는 종류별로 `print` 또는 환경 변수로 지정:
  - `print.escPosCutAfterKitchenHtml` / `WINDOWS_POS_ESC_POS_CUT_AFTER_KITCHEN_HTML` (기본 `true`)
  - `print.escPosCutAfterHallOrderHtml` / `WINDOWS_POS_ESC_POS_CUT_AFTER_HALL_ORDER_HTML` (기본 `false`) — 터미널·주문 화면 **홀 주문서**
  - `print.escPosCutAfterPaymentReceiptHtml` / `WINDOWS_POS_ESC_POS_CUT_AFTER_PAYMENT_RECEIPT_HTML` (기본 `false`) — **결제 영수증**
  - (호환) 예전 단일 `printEscPosCutAfterReceiptHtml` / `WINDOWS_POS_ESC_POS_CUT_AFTER_RECEIPT_HTML` — 웹에서 `printReceiptKind`를 안 보낼 때만 적용.

운영 시에는 `runtime-config.example.json`을 복사해 값을 채운 뒤 빌드합니다.

## 브랜드 (내부 vs 판매)

| 구분 | `build-windows-pos.ps1` | 아이콘 소스 | 설치·바로가기 표시 이름 |
|------|---------------------------|-------------|-------------------------|
| 내부(충만) | `-Brand choongman` 또는 생략 | `assets/brand/choongman-logo.png` | `Choongman POS` (`package.json`) |
| 판매(OmniFoodTech) | **`-Brand omnifoodtech`** | `public/omnifoodtech-icon.svg` → 래스터 후 ICO | 기본 **`OmniFoodTech POS`** (`-ProductName`으로 변경 가능) |

판매용은 루트에서 `npm install`로 `sharp`가 있어야 SVG→PNG 래스터 스크립트가 동작합니다.

## 환경변수 (선택)

- `WINDOWS_POS_URL`: POS 접속 URL (예: `https://your-domain.com/pos/login`)
- `WINDOWS_POS_KIOSK`: `1`(기본) 이면 키오스크 모드, `0`이면 일반 창 모드
- `WINDOWS_UPDATE_MANIFEST_URL`: 업데이트 매니페스트 URL
- `WINDOWS_POS_AUTO_UPDATE`: `1`(기본) 자동 업데이트 체크 / `0` 비활성
- `WINDOWS_POS_PRINT_SILENT`: `1`(기본과 동일) 무인쇄 우선 / `0`이면 HTML 인쇄 시 대화상자를 먼저 시도
- `WINDOWS_POS_PRINT_DEVICE`: 빠른 인쇄 고정 프린터 이름

PowerShell 예시:

```powershell
$env:WINDOWS_POS_URL = "https://your-domain.com/pos/login"
$env:WINDOWS_POS_KIOSK = "1"
```

## 실행

```bash
npm install
npm run dev
```

## 빌드

**권장:** `vercel-app/` 루트에서 아래 중 하나를 실행하면 `build-windows-pos.ps1`가 `runtime-config.json`·아이콘·브랜드(제품명)를 **한 번에** 맞춥니다.

- `npm run windows:pos:build` 또는 `npm run windows:pos:build:internal` — 내부(충만) 배포 URL·Choongman 브랜드
- `npm run windows:pos:build:external` — 판매(OmniFoodTech) URL·브랜드

`windows-pos/`에서만 `npm run build:win`을 쓰면, 커밋된 `runtime-config.json`과 제품명/아이콘 파이프라인이 서로 다른 경우가 있어 내부·외부가 어긋날 수 있습니다.

`package.json`의 `win.signAndEditExecutable`은 **false**(기본)로 두는 것을 권장합니다.  
`true`이면 electron-builder가 `winCodeSign` 번들을 풀 때 **macOS용 심볼릭 링크**를 만들려다, Windows에서 **개발자 모드**가 꺼져 있거나 **관리자 권한**이 없으면 `Cannot create symbolic link` 로 실패할 수 있습니다.

- **아이콘**: NSIS 설치/제거 프로그램·바로가기 등에는 `installerIcon` / `uninstallerIcon`(ICO)이 적용됩니다. 메인 `Choongman POS.exe`에 직접 ICO를 넣으려면 개발자 모드를 켠 뒤 `signAndEditExecutable`을 `true`로 바꿔 빌드하세요.

미서명 빌드 시(선택):

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run build:win
```

`vercel-app/scripts/build-windows-pos.ps1`는 인증서를 생략하면 위 설정을 자동으로 넣습니다.

`npm run build:win` 실행 시 `../scripts/generate-windows-pos-icon.ps1`가 자동 실행되어
`windows-pos/assets/icon.ico`를 생성/갱신합니다. 소스는 `../assets/brand/choongman-logo.png`이며,
바탕화면·작업 표시줄에서 깨지지 않도록 **다중 해상도 ICO**(`png-to-ico`)로 묶습니다.

## 업데이트/인쇄 단축키

- `Ctrl+Shift+U`: 업데이트 확인
- `Ctrl+P`: 인쇄창 열기 (기본 인쇄)
- `Ctrl+Shift+P`: 빠른 인쇄 (고정 프린터/옵션 사용)

## 매장별 프린터 설정 템플릿

`windows-pos/store-configs/`에 샘플 파일을 두고, 매장마다 `print.deviceName`만 다르게 관리합니다.

- `store-a.sample.json`
- `store-b.sample.json`
- `store-c.sample.json`

적용(프로젝트 루트 `vercel-app/`에서):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/use-windows-pos-store-config.ps1 -TemplatePath "store-configs/store-a.sample.json"
```

또는 절대경로로:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/use-windows-pos-store-config.ps1 -TemplatePath "C:\CM_ERP\vercel-app\windows-pos\store-configs\store-a.sample.json"
```

프린터 이름 확인은 Windows에서 아래 명령으로 가능합니다:

```powershell
Get-Printer | Select-Object Name, DriverName, PortName
```

## 운영 빌드 (아이콘/서명 포함)

프로젝트 루트(`vercel-app/`)에서:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows-pos.ps1 `
  -PosUrl "https://your-domain.com/pos/login" `
  -AllowedOrigin "https://your-domain.com" `
  -UpdateManifestUrl "https://your-domain.com/downloads/windows-pos/latest.json" `
  -Version "0.1.1" `
  -IconPath "C:\assets\cm-pos.ico" `
  -CertPfxPath "C:\cert\cm-pos-signing.pfx" `
  -CertPassword "your-password"
```

이후 배포 파일 게시:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/publish-windows-pos.ps1 `
  -BaseUrl "https://your-domain.com" `
  -ReleaseNotes "파일럿 안정화 릴리스"
```
