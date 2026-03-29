# POS 돈통 로컬 브리지 가이드

POS 웹은 브라우저 보안 제한 때문에 하드웨어 돈통 포트를 직접 제어할 수 없습니다.  
그래서 **POS PC(로컬)에 작은 브리지 서버**를 띄우고, 웹에서 `127.0.0.1`로 요청해 돈통을 엽니다.

---

## 1) 표준 엔드포인트 스펙

- **Method**: `POST`
- **Path**:
  - `/pos/cash-drawer/open`
  - `/open-cash-drawer` (하위 호환)
- **Host**: `127.0.0.1`
- **Port**: `18181` (기본)

### Request JSON

```json
{
  "reason": "auto_card_payment",
  "source": "payment_auto",
  "storeCode": "CM ASOK",
  "userName": "홍길동",
  "drawerOpenOption": "reason_only",
  "at": "2026-03-28T12:34:56.000Z"
}
```

### Response JSON (성공)

```json
{
  "success": true,
  "reason": "auto_card_payment",
  "source": "payment_auto",
  "storeCode": "CM ASOK",
  "userName": "홍길동",
  "drawerOpenOption": "reason_only",
  "dryRun": false,
  "at": "2026-03-28T12:34:56.123Z"
}
```

### Response JSON (실패)

```json
{
  "success": false,
  "message": "drawer_open_failed",
  "error": "..."
}
```

---

## 2) 브리지 샘플 실행 (Windows)

프로젝트에 샘플 서버가 포함되어 있습니다.

- 파일: `vercel-app/scripts/local-cash-drawer-bridge.mjs`

PowerShell 예시:

```powershell
cd C:\CM_ERP\vercel-app
$env:DRAWER_OPEN_COMMAND="C:\POS\open-drawer.bat"
node scripts/local-cash-drawer-bridge.mjs
```

### 테스트 모드 (하드웨어 없이 성공 응답만)

```powershell
cd C:\CM_ERP\vercel-app
$env:DRAWER_DRY_RUN="1"
node scripts/local-cash-drawer-bridge.mjs
```

---

## 3) 환경 변수

- `POS_DRAWER_BRIDGE_PORT` (기본: `18181`)
- `DRAWER_OPEN_COMMAND` (실제 돈통 오픈 명령, 기본 없음)
- `DRAWER_DRY_RUN=1` (테스트 모드)
- `POS_BRIDGE_TOKEN` (선택, 설정 시 `x-pos-bridge-token` 헤더 필수)

---

## 4) DRAWER_OPEN_COMMAND 구성

브리지는 명령만 실행하고, 실제 돈통 오픈은 현장 환경(프린터/드라이버/유틸)에 맞춰야 합니다.

예시:

- 벤더 유틸 EXE 실행
- OPOS/ESC-POS 호출 PowerShell 스크립트 실행
- 프린터 제조사 제공 배치 파일 실행

즉, POS 앱 표준 스펙은 고정하고, 하드웨어 제어는 `DRAWER_OPEN_COMMAND`로 매장별 맞춤합니다.

### 바로 쓰는 템플릿

프로젝트에 템플릿을 넣어두었습니다.

- `vercel-app/scripts/open-drawer.bat.example`
- `vercel-app/scripts/open-drawer.ps1.example`

권장 절차:

1. `open-drawer.bat.example`를 `C:\POS\open-drawer.bat` 로 복사
2. 내부의 `[A]` 또는 `[B]` 섹션을 매장 장비 방식으로 수정
3. 브리지 실행 전에 단독 테스트:

```powershell
C:\POS\open-drawer.bat
echo $LASTEXITCODE
```

`0`이면 성공, `1`이면 실패입니다.

---

## 5) 자동 실행 권장

POS PC 재부팅 후에도 동작하도록 `pm2` 또는 작업 스케줄러로 브리지 자동 실행을 권장합니다.

간단 예시:

```powershell
npm install -g pm2
cd C:\CM_ERP\vercel-app
pm2 start "node scripts/local-cash-drawer-bridge.mjs" --name pos-drawer-bridge
pm2 save
```

---

## 6) 현재 POS 연동 동작

현재 POS 터미널은 결제 시 다음 조건에서 브리지를 호출합니다.

- `카드결제 자동열기=YES` + 카드 결제 금액 > 0
- `체크결제 자동열기=YES` + 체크 채널 결제 감지

브리지가 실행 중이 아니면 경고 메시지를 1회 표시하고 넘어갑니다.
