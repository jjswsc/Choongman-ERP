# Windows 하이브리드 POS·ERP 인쇄

웹 브라우저만 쓸 때와 달리, **Electron 셸**(`windows-pos`, `windows-erp`)은 `runtime-config.json`의 `print` 설정으로 **무인쇄 대상 프린터**를 고릅니다. 레이아웃·CSS는 Vercel 배포와 동일한 소스를 쓰고, **어느 물리 프린터로 보낼지**만 로컬 설정으로 나뉩니다.

## `runtime-config.json` — `print` 필드

| 키 | 용도 |
|----|------|
| `silent` | `true`면 대화상자 없이 인쇄 시도 |
| `deviceName` | 구버전 호환 기본 프린터(비우면 시스템 기본) |
| `receiptDeviceName` | **영수증** HTML 무인쇄 |
| `kitchen1DeviceName` ~ `kitchen3DeviceName` | **주방 1·2·3** 슬립 |
| `kitchenDeviceName` | 통합 주방(한 대만 쓸 때) |

POS에서 주방 슬립은 라벨 문자열이 아니라 **`station: 1 \| 2 \| 3`**(또는 통합 시 `1`)으로 라우팅되므로, 번역·라벨 변경과 무관하게 프린터 매핑이 유지됩니다.

## 포스 화면 — 프린터 점검

하이브리드 셸에서 포스 상단에 **프린터 점검** 버튼이 있으면, `listPrinters`와 현재 `getPrintConfig` 결과를 한 번에 볼 수 있습니다. 설치 PC에서 드라이버 이름과 `runtime-config`가 맞는지 확인할 때 사용합니다.

## 실패 알림

- **무인쇄 실패**(`printHtml`이 `ok: false`): 사용자에게 실패 사유를 알립니다(웹은 기존처럼 숨김 iframe 폴백).
- **인쇄 성공 후 절단만 실패**(`cutOk: false`): 용지 자동 절단 실패 안내(드라이버·커터·ESC/POS 경로에 따라 발생 가능).

## 오프라인·재시도

네트워크가 끊겨 주문이 큐에 쌓였다가 나중에 재전송되는 경우, **그 시점**에 맞춰 인쇄가 다시 시도됩니다. 인쇄 실패 시에는 위 알림을 참고하고, 프린터 전원·용지·드라이버 상태를 점검합니다.

## Windows ERP — 빠른 인쇄

메뉴 **Quick print**(`Ctrl+Shift+P`)는 **현재 창**을 `print.silent` 등과 함께 보내며, 대상 프린터는 **`receiptDeviceName`**이 있으면 우선합니다(없으면 `deviceName` 등 기존 규칙). 주방 슬립 전용이 아니라 **관리 화면 일반 인쇄**에 가깝게 쓰입니다.

## 배포 시 유의

- **Vercel**만 올리면: HTML/CSS·라우팅·알림 문구는 즉시 반영됩니다.
- **`printHtml` / IPC / 절단 결과**를 바꾼 경우: 해당 **Windows 설치본**도 재빌드·재배포해야 셸과 웹이 맞습니다.

관련: [POS 주문 영수증 인쇄 (브라우저 무인쇄)](./POS-SILENT-PRINT.md), [Windows POS README](../windows-pos/README.md).
