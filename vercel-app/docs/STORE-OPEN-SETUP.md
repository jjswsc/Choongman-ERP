# 매장 오픈 시 컴퓨터 세팅 가이드

새 매장에서 포스/ERP를 쓰기 위해 **컴퓨터에 해 두면 좋은 세팅**을 한 문서로 정리했습니다.

| 세팅 | 목적 |
|------|------|
| **1. 포스 전용 Chrome 실행** | 주문 시 인쇄 대화상자 없이 **바로 프린터로 인쇄** |
| **2. (선택) 로컬 서버** | **인터넷이 끊겨도** 같은 주소로 포스/ERP 접속 가능 |

---

## 1. 포스 전용 Chrome — 주문 시 바로 인쇄

포스로 쓰는 PC에서는 **Chrome을 특별한 옵션으로 실행**해야, 주문하기를 누를 때 인쇄 화면(미리보기) 없이 바로 프린터로 나갑니다.

### 1-1. Windows에서 바로가기 만들기

1. Chrome **완전히 종료**
2. Chrome 위치 확인  
   - `C:\Program Files\Google\Chrome\Application\chrome.exe` 또는  
   - `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`  
   (시작 메뉴에서 Chrome 우클릭 → "파일 위치 열기"로 확인)
3. 바탕화면 → 우클릭 → 새로 만들기 → **바로 가기**
4. "항목 위치 입력"에 **아래 한 줄 전체를 복사**해서 붙여넣기 (맨 앞 `"` 부터 맨 끝 `"` 까지):

   **인터넷으로 접속할 때 (기본):**

   ```text
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --no-first-run "https://choongman-erp.vercel.app/pos/terminal"
   ```

   Chrome이 **Program Files (x86)** 에 있으면:

   ```text
   "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --kiosk-printing --no-first-run "https://choongman-erp.vercel.app/pos/terminal"
   ```

   **로컬 서버(오프라인 대비)를 쓰는 매장**이면, 주소만 로컬로 바꿉니다 (예: `http://192.168.0.10:3000/pos/terminal`).

5. 다음 → 이름 입력 (예: **포스**) → 마침
6. **앞으로는 이 바로가기로만** Chrome을 켜서 포스 사용

**주의:** `C:` 앞에 큰따옴표 `"` 가 없으면 "찾을 수 없음" 오류가 납니다. 반드시 맨 앞에 `"` 를 넣으세요.

### 1-1-1. 인쇄 시 위·아래 불필요한 글자 제거 (머리글/바닥글 끄기)

영수증을 인쇄했을 때 **맨 위(날짜, 제목)** 나 **맨 아래(주소, 1/1)** 같은 게 같이 찍히면, Chrome 인쇄 설정에서 **머리글·바닥글**을 꺼야 합니다.

**참고:** 테이블 **주문 영수증**과 **주방 주문서**(자동 인쇄)는 별도 브라우저 창 없이 **페이지 안 숨김 iframe**으로 인쇄합니다. 머리글/바닥글은 보통 **포스 메인 화면**에서 **Ctrl + P** → 추가 설정 → **머리글 및 바닥글** 끄기로 한 번만 설정하면 됩니다. (적용이 안 되면 `--kiosk-printing` 없이 Chrome으로 한 번 인쇄 미리보기를 열어 같은 설정을 해 보세요.)  
결제·수동 인쇄 등 **다른 경로**에서 새 창이 뜨면, 그 창에서도 동일하게 머리글/바닥글을 끌 수 있습니다.

**방법 (1회 설정)**  
1. 포스 메인 화면(또는 인쇄가 뜨는 창)에서 **Ctrl + P** → **추가 설정** → **머리글 및 바닥글** **체크 해제** → 취소 또는 인쇄.  
2. 키오스크 모드라면, 필요 시 Chrome을 **일반 실행**으로 한 번 열어 위 설정을 저장한 뒤 다시 **바로가기(`--kiosk-printing`)** 로 사용합니다.

이후에는 주문 시 자동 인쇄해도 위·아래 날짜·주소·쪽번호가 나오지 않습니다.

### 1-2. 배치 파일(.bat)로 실행 (바로가기가 안 될 때)

메모장에 아래 3줄만 넣고, **pos-chrome.bat** 이름으로 바탕화면에 저장한 뒤 더블클릭해서 사용합니다.

```bat
@echo off
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing --no-first-run "https://choongman-erp.vercel.app/pos/terminal"
```

Chrome이 `Program Files (x86)`에 있으면 경로만 `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe` 로 바꿉니다.  
로컬 서버를 쓰면 마지막 URL을 `http://로컬서버IP:3000/pos/terminal` 로 바꿉니다.

### 1-3. Firefox 사용 시 (대안)

1. 주소창에 `about:config` 입력 후 이동
2. `print.always_print_silent` 검색 후 값을 **true**로 변경  
→ 인쇄 시 대화상자 없이 기본 프린터로 바로 인쇄됩니다.

---

## 2. (선택) 인터넷 끊겼을 때 대비 — 로컬 서버

인터넷이 끊겨도 **처음부터 같은 주소로** 포스/ERP에 접속하려면, 매장 안에 **로컬 서버 한 대**를 두고 그 주소로 접속하도록 세팅합니다.

### 2-1. 준비물

| 항목 | 권장 |
|------|------|
| **서버로 쓸 기기** | Raspberry Pi 4 (4GB RAM 이상) 또는 사용하지 않는 PC/노트북 |
| **OS** | Raspberry Pi OS, Ubuntu 22.04 LTS, 또는 Windows 10/11 |
| **네트워크** | 매장 공유기/와이파이 (포스 기기들과 같은 LAN) |

### 2-2. 로컬 서버 기기에서 할 일

**1) Node.js 설치**

- Windows: https://nodejs.org/ 에서 **LTS(20.x)** 설치
- Raspberry Pi / Ubuntu:

  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
  node -v   # v20.x 확인
  ```

**2) 프로젝트 복사 후 빌드**

```bash
cd CM_ERP/vercel-app   # 프로젝트 경로로 이동
npm install
npm run build
```

**3) 환경 변수 (.env.local)**

`vercel-app` 폴더 안에 `.env.local` 파일을 만들고, Vercel에 설정한 값과 **동일하게** 넣습니다.

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

(Vercel 대시보드 → 프로젝트 → Settings → Environment Variables 에서 복사)

**4) 서버 실행**

```bash
cd vercel-app
npm run start
```

다른 기기에서 접속이 안 되면:

```bash
npx next start -H 0.0.0.0 -p 3000
```

**5) 접속 주소 확인**

- 로컬 서버 기기: http://localhost:3000  
- **포스/태블릿:** http://로컬서버IP:3000  
  (예: http://192.168.0.10:3000 — 서버 IP는 `ipconfig`(Windows) 또는 `ip addr`(Linux)로 확인)

**6) 부팅 시 자동 실행 (선택)**

- **PM2 사용 (Windows / Linux 공통):**

  ```bash
  npm install -g pm2
  cd vercel-app
  pm2 start npm --name "cm-erp" -- run start
  pm2 save
  pm2 startup   # 안내에 나오는 명령 한 번 더 실행
  ```

- **Windows 서비스**나 **Raspberry Pi systemd**로 등록해도 됩니다. (자세한 내용은 아래 "상세 문서" 참고)

### 2-3. 포스/태블릿에서 할 일

- **인터넷 있을 때:** 기존처럼 choongman-erp.vercel.app 사용 가능
- **인터넷 끊겼을 때:** **http://로컬서버IP:3000** 만 사용  
  (예: http://192.168.0.10:3000)
- 이 주소를 **바탕화면 바로가기** 또는 **홈 화면에 추가**해 두면, 오프라인일 때도 같은 주소로만 열면 됩니다.
- **1번에서 만든 Chrome 바로가기**를 쓰는 PC는, 로컬 서버를 쓰는 경우에만 Chrome 경로 마지막의 URL을 `http://로컬서버IP:3000/pos/terminal` 로 바꿔서 사용하면 됩니다.

### 2-4. 방화벽

다른 기기에서 `http://로컬서버IP:3000` 이 안 열리면:

- **Windows:** 방화벽에서 포트 **3000** 인바운드 허용
- **Linux (ufw):** `sudo ufw allow 3000` 후 `sudo ufw reload`

---

## 3. 매장 오픈 시 체크리스트

| 순서 | 할 일 | 비고 |
|------|--------|------|
| 1 | 포스용 PC에 **Chrome 바로가기**(또는 .bat) 만들기 | 1번 참고, 주문 시 바로 인쇄 |
| 2 | **Ctrl + P** → 추가 설정 → **머리글 및 바닥글** 체크 해제 | 영수증 위·아래 날짜/주소/쪽번호 제거 |
| 3 | 바로가기로 Chrome 실행 후 **포스 주소** 접속 확인 | vercel.app 또는 로컬 주소 |
| 4 | (선택) 인터넷 끊김 대비 **로컬 서버** 설치·실행 | 2번 참고 |
| 5 | (로컬 서버 쓸 때) 포스/태블릿에 **로컬 주소** 바로가기 추가 | http://로컬서버IP:3000 |
| 6 | (로컬 서버 쓸 때) Chrome 바로가기 URL을 로컬 주소로 변경 | 마지막 부분만 수정 |

---

## 4. 상세 문서

- **로컬 서버만 더 자세히:** `vercel-app/docs/LOCAL-SERVER-SETUP.md`  
- **인쇄 대화상자 없이 인쇄만:** `vercel-app/docs/POS-SILENT-PRINT.md`

이 문서는 위 두 가지를 **매장 오픈 시 컴퓨터 세팅** 한 흐름으로 묶은 요약본입니다.
