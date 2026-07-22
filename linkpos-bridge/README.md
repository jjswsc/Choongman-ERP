# LinkPOS Bridge — HTTP ↔ RS232 (Hypercom)

POS 웹앱에서 HTTP로 보낸 Hypercom 프레임을 RS232 시리얼로 EDC 단말기에 전달하고,
EDC 응답을 다시 HTTP로 돌려주는 로컬 브리지 프로그램입니다.

프로토콜은 매장에서 EDC 연결에 성공한 테스트 프로그램(`EDC.rar` / `LinkPos.Protocol.ps1`)과 동일합니다.
- BCD length / LRC(STX 제외) / ACK·NAK / Sale More Indicator = 1

## 설치

```bash
cd linkpos-bridge
npm install
```

> `serialport` 패키지는 네이티브 바인딩이 필요합니다.
> Windows에서 `npm install` 실패 시:
> 1. **Node.js 18+** 설치 확인
> 2. `npm install --global windows-build-tools` (관리자 PowerShell)
> 3. 다시 `npm install`

## 설정

`config.json`을 편집합니다:

```json
{
  "httpPort": 18181,
  "serial": {
    "path": "COM3",        ← EDC가 연결된 COM 포트
    "baudRate": 9600,      ← EDC 기본값 (Verifone X990: 보통 9600)
    "dataBits": 8,
    "stopBits": 1,
    "parity": "none"
  },
  "responseTimeoutMs": 30000,
  "verbose": false
}
```

### COM 포트 확인 방법

1. Windows **장치 관리자** → 포트(COM & LPT) 에서 확인
2. 또는 브리지 실행 후 `http://localhost:18181/ports` 접속

## 실행

```bash
npm start           # 일반 모드
npm run dev         # 상세 로그 모드
```

## API 엔드포인트

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/linkpos/send` | Hypercom 프레임 전송 → EDC 응답 반환 |
| `GET` | `/health` | 브리지 상태 (시리얼 연결 여부) |
| `GET` | `/ports` | 사용 가능한 시리얼 포트 목록 |

### POST /linkpos/send

```json
{
  "payloadHex": "02...(Hypercom frame hex)...03XX",
  "timeoutMs": 30000
}
```

응답:
```json
{ "success": true, "responseHex": "02...03XX" }
```

## POS 연동

POS 웹앱(`linkpos-local-bridge.ts`)이 자동으로 `http://127.0.0.1:18181/linkpos/send`에
요청합니다. 이 브리지가 실행 중이면 자동 연결됩니다.

## Mock 모드

`serialport`가 설치되지 않은 상태에서도 실행 가능합니다.
EDC 없이 HTTP↔프레임 흐름을 테스트할 수 있습니다.
