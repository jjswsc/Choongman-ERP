# Choongman POS Windows Shell

Windows 설치형 하이브리드 POS 셸(Electron)입니다.

## 런타임 설정

기본 설정 파일: `runtime-config.json`

- `posUrl`: POS 접속 URL
- `allowedOrigin`: 허용 오리진(외부 이동 차단 기준)
- `kiosk`: `1`(기본) 키오스크 / `0` 일반창
- `updateManifestUrl`: 업데이트 매니페스트 URL (`latest.json`)
- `print.silent`: `true`(기본)이면 영수증·주방 HTML 인쇄도 **무인쇄 우선**. `false`이면 **항상 인쇄 대화상자**가 먼저 뜸.
- `print.deviceName`: 무인쇄·빠른 인쇄에 쓸 프린터 이름. Windows **정확한 표시 이름**과 일치해야 무인쇄 성공률이 높음 (비우면 Windows 기본 프린터).

운영 시에는 `runtime-config.example.json`을 복사해 값을 채운 뒤 빌드합니다.

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

PowerShell에서 **서명 인증서 없이** 빌드할 때는 아래처럼 환경 변수를 켜두세요.  
(안 하면 `winCodeSign` 압축 해제 단계에서 심볼릭 링크 오류가 날 수 있습니다.)

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run build:win
```

또는 `vercel-app/scripts/build-windows-pos.ps1`는 인증서를 생략하면 위 설정을 자동으로 합니다.

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
