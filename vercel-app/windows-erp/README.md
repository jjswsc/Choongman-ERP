# Choongman ERP Windows Shell

Windows 설치형 하이브리드 ERP 셸(Electron)입니다.

## 런타임 설정

기본 설정 파일: `runtime-config.json`

- `erpUrl`: ERP 접속 URL (예: `/admin/login`)
- `allowedOrigin`: 허용 오리진
- `kiosk`: `1` 키오스크 / `0` 일반창
- `updateManifestUrl`: 업데이트 매니페스트 URL
- `print.silent`: 빠른 인쇄 시 인쇄창 생략 여부
- `print.deviceName`: 빠른 인쇄 고정 프린터 이름

## 환경변수 (선택)

- `WINDOWS_ERP_URL`
- `WINDOWS_ERP_ALLOWED_ORIGIN`
- `WINDOWS_ERP_KIOSK`
- `WINDOWS_ERP_UPDATE_MANIFEST_URL`
- `WINDOWS_ERP_AUTO_UPDATE`
- `WINDOWS_ERP_PRINT_SILENT`
- `WINDOWS_ERP_PRINT_DEVICE`

## 실행

```bash
npm install
npm run dev
```

## 빌드

```powershell
$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm run build:win
```

`npm run build:win` 실행 시 `../scripts/generate-windows-erp-icon.ps1`이 자동 실행되어
`windows-erp/assets/icon.ico`를 생성/갱신합니다.

## 단축키

- `Ctrl+Shift+U`: 업데이트 확인
- `Ctrl+P`: 인쇄창 열기
- `Ctrl+Shift+P`: 빠른 인쇄

## 매장별 설정 템플릿

- `store-configs/pilot-store-a.sample.json`
- `store-configs/pilot-store-b.sample.json`

적용(프로젝트 루트 `vercel-app/`에서):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/use-windows-erp-store-config.ps1 -TemplatePath "store-configs/pilot-store-a.sample.json"
```

## 운영 빌드/게시

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows-erp.ps1 `
  -ErpUrl "https://choongman-erp.vercel.app/admin/login" `
  -AllowedOrigin "https://choongman-erp.vercel.app" `
  -UpdateManifestUrl "https://choongman-erp.vercel.app/downloads/windows-erp/latest.json"
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/publish-windows-erp.ps1 `
  -BaseUrl "https://choongman-erp.vercel.app" `
  -ReleaseNotes "ERP installer rollout"
```
