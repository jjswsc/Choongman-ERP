# POS 주문 영수증 인쇄 — 대화상자 없이 바로 인쇄

> **매장 오픈 시 할 세팅 전체(인터넷 끊김 대비 + 주문 바로 인쇄)를 한 번에 보려면** → [매장 오픈 시 컴퓨터 세팅 가이드](./STORE-OPEN-SETUP.md) 참고.

주문하기를 누르면 **인쇄 미리보기(인쇄 대화상자) 없이** 바로 프린터로 나가게 하려면, 포스 전용 PC에서 브라우저를 아래처럼 실행해야 합니다.  
(일반 웹에서는 보안상 대화상자를 없앨 수 없습니다.)

---

## 1. Chrome — 권장 (포스 전용 PC)

포스에서 쓰는 Chrome을 **인쇄 대화상자 생략** 옵션으로 실행합니다.

### Windows

1. Chrome **완전히 종료**
2. **Chrome 위치 확인**  
   - 파일 탐색기에서 `C:\Program Files\Google\Chrome\Application\` 폴더에 `chrome.exe`가 있는지 확인  
   - 없으면 `C:\Program Files (x86)\Google\Chrome\Application\` 확인  
   - 또는 시작 메뉴에서 "Chrome" 우클릭 → "파일 위치 열기"로 실제 경로 확인
3. **바로가기 만들기**
   - 바탕화면에서 우클릭 → 새로 만들기 → **바로 가기**
   - "항목 위치 입력" 칸에 **아래 전체를 한 줄로 복사**해서 붙여넣기 (맨 앞의 `"` 부터 맨 끝 `"` 까지 전부):

   ```text
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --no-first-run "https://choongman-erp.vercel.app/pos/terminal"
   ```

   - **주의:** 맨 앞에 반드시 **큰따옴표 한 개 `"`** 가 있어야 합니다. `C:` 앞에 `"` 가 없으면 "찾을 수 없음" 오류가 납니다.
   - Chrome이 **Program Files (x86)** 에 있으면 아래처럼 넣습니다:

   ```text
   "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --kiosk-printing --no-first-run "https://choongman-erp.vercel.app/pos/terminal"
   ```

4. 다음 → 바로가기 이름 적기(예: 포스) → 마침
5. 이 **바로가기**를 더블클릭해서 포스 사용

**인쇄 시 위·아래 불필요한 글자(날짜, 제목, 주소, 1/1) 제거:**  
주문 **영수증·주방 주문서** 자동 인쇄는 **별도 브라우저 창 없이** 숨김 iframe으로 나가므로, 보통 **포스 메인 화면**에서 **Ctrl + P** → **추가 설정** → **머리글 및 바닥글** 끄기로 설정합니다. (결제 등 **새 창** 인쇄가 있으면 그 창에서도 동일 설정 가능.) 자세한 안내는 [매장 오픈 시 컴퓨터 세팅 가이드](./STORE-OPEN-SETUP.md)의 머리글/바닥글 절을 참고하세요.

**또는 배치 파일(.bat)로 실행**

- 메모장을 열고 아래를 붙여넣고, `pos-chrome.bat` 같은 이름으로 **바탕화면에 저장**한 뒤 더블클릭:

```bat
@echo off
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --no-first-run "https://choongman-erp.vercel.app/pos/terminal"
```

- Chrome이 `Program Files (x86)`에 있으면 첫 줄의 경로를 `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe` 로 바꿉니다.

### macOS

터미널에서:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --kiosk-printing "https://your-pos-url.com/pos/terminal"
```

### 동작

- `--kiosk-printing` 이 있으면 `window.print()` 호출 시 **기본 프린터로 바로 인쇄**되고, 인쇄 대화상자는 뜨지 않습니다.
- 포스 전용 PC에서 이렇게만 켜두면, 주문 시 별도 클릭 없이 영수증이 바로 나갑니다.

---

## 2. Firefox (대안)

1. 주소창에 `about:config` 입력 후 이동
2. `print.always_print_silent` 검색
3. 값을 **true**로 변경

이후에는 인쇄 시 대화상자 없이 기본 프린터로 바로 인쇄됩니다.

---

## 3. 그 외 (플러그인/로컬 프로그램)

- **QZ Tray**, **JS Print Manager** 등 로컬 프로그램을 설치하면, 브라우저에서 해당 프로그램으로 인쇄를 넘겨서 대화상자 없이 인쇄할 수 있습니다.
- 영수증 전용이라면 **thermal printer + 로컬 HTTP 서버** 조합으로 브라우저에서 `fetch`로 인쇄 요청을 보내는 방식도 가능합니다.
- 돈통 자동 열림도 같은 방식으로 로컬 브리지를 사용합니다: [POS 돈통 로컬 브리지 가이드](./POS-CASH-DRAWER-BRIDGE.md)

---

## 요약

| 목표                         | 방법 |
|-----------------------------|------|
| 주문 시 인쇄 대화상자 없이 바로 인쇄 | 포스 전용 PC에서 Chrome을 `--kiosk-printing` 으로 실행 (또는 Firefox `print.always_print_silent` 사용) |
| 결제 영수증은 지금처럼 미리보기 유지 | 별도 설정 없음 (현재 동작 유지) |

앱 코드는 그대로 두고, **포스용 Chrome 실행 방법만** 위처럼 바꾸면 됩니다.
