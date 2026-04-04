# Windows 설치형 하이브리드 ERP 운영 가이드

## 1) 운영 원칙

- ERP는 웹과 동일 서버/DB를 사용하되, **Windows 설치형(`windows-erp`)**으로 운영 안정성을 높인다.
- POS 설치형(`windows-pos`)과 ERP 설치형(`windows-erp`)은 분리 배포한다.
- 공통 배포 파일은 동일하게 쓰고, 매장별 차이는 `runtime-config.json`으로 관리한다.

## 2) 빌드

프로젝트 루트(`vercel-app/`)에서:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows-erp.ps1 `
  -ErpUrl "https://choongman-erp.vercel.app/admin/login" `
  -AllowedOrigin "https://choongman-erp.vercel.app" `
  -UpdateManifestUrl "https://choongman-erp.vercel.app/downloads/windows-erp/latest.json"
```

산출물:

- `windows-erp/dist/Choongman ERP-Setup-<version>-x64.exe`
- `windows-erp/dist/Choongman ERP-Portable-<version>-x64.exe`

## 3) 게시(다운로드/업데이트 매니페스트)

```powershell
cd vercel-app
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/publish-windows-erp.ps1 `
  -BaseUrl "https://choongman-erp.vercel.app" `
  -ReleaseNotes "ERP 설치형 파일럿 배포"
```

게시 경로:

- `/downloads/windows-erp/cm-erp-windows-latest-setup.exe`
- `/downloads/windows-erp/cm-erp-windows-latest-portable.exe` (생성 시)
- `/downloads/windows-erp/latest.json`

## 4) 매장별 설정 적용

샘플 템플릿:

- `windows-erp/store-configs/pilot-store-a.sample.json`
- `windows-erp/store-configs/pilot-store-b.sample.json`

적용 명령:

```powershell
cd vercel-app
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/use-windows-erp-store-config.ps1 `
  -TemplatePath "store-configs/pilot-store-a.sample.json"
```

## 5) 필수 DB 작업(멱등성)

아래 SQL을 Supabase SQL Editor에 적용:

- `sql/api_request_idempotency_keys.sql`

적용 대상 API:

- `savePurchaseOrder`
- `addBankTransaction`
- `processPosStockDeduction`

## 6) 운영 단축키

- `Ctrl+Shift+U`: 업데이트 확인
- `Ctrl+P`: 인쇄창
- `Ctrl+Shift+P`: 빠른 인쇄
