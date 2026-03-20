# 매장 로컬 서버 구축 가이드 (오프라인 포스/ERP)

> **매장 오픈 시 할 세팅 전체(인터넷 끊김 대비 + 주문 바로 인쇄)를 한 번에 보려면** → [매장 오픈 시 컴퓨터 세팅 가이드](./STORE-OPEN-SETUP.md) 참고.

인터넷이 끊긴 상태에서도 포스/ERP를 열 수 있도록, 매장 안에 소형 서버를 두고 같은 앱을 로컬에서 실행하는 방법입니다.

---

## 1. 준비물

| 항목 | 권장 |
|------|------|
| **기기** | Raspberry Pi 4 (4GB RAM 이상) 또는 사용하지 않는 PC/노트북 |
| **OS** | Raspberry Pi OS (Pi용), Ubuntu 22.04 LTS (PC용), 또는 Windows 10/11 |
| **네트워크** | 매장 공유기/와이파이에 연결 (포스 기기들과 같은 LAN) |

---

## 2. Node.js 설치

### Raspberry Pi / Ubuntu (Linux)

```bash
# Node.js 20 LTS 설치 (NodeSource)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

node -v   # v20.x 확인
npm -v
```

### Windows

- https://nodejs.org/ 에서 **LTS(20.x)** 설치 파일 다운로드 후 설치
- 설치 후 터미널에서 `node -v`, `npm -v` 확인

---

## 3. 프로젝트 복사 및 빌드

로컬 서버가 될 기기에서:

```bash
# 프로젝트가 이미 있다면 (Git 사용)
cd /home/pi/CM_ERP   # 또는 본인 경로
git pull

# vercel-app만 사용
cd vercel-app
```

또는 **Vercel에서 배포된 코드**를 그대로 쓰려면, 같은 저장소를 클론한 뒤 `vercel-app` 폴더만 사용해도 됩니다.

```bash
npm install
npm run build
```

빌드가 끝나면 `.next` 폴더가 생깁니다.

---

## 4. 환경 변수 설정

Vercel에서 쓰는 값과 **동일한 값**을 로컬에도 넣어야 합니다.

`vercel-app` 폴더 안에 `.env.local` 파일을 만들고 아래를 채웁니다.  
(Vercel 대시보드 → 프로젝트 → Settings → Environment Variables 에서 복사)

```env
# 필수 (Supabase)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

# 클라이언트(브라우저)에서도 사용
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

# 선택 (JWT 로그인 등)
JWT_SECRET=아무랜덤문자열
```

- **SUPABASE_*** 값은 Vercel에 설정된 것과 동일하게 넣으면 됩니다.
- `.env.local`은 Git에 올리지 마세요 (이미 .gitignore에 있을 수 있음).

---

## 5. 서버 실행 (LAN에서 접속 가능하게)

같은 매장 네트워크의 다른 기기(태블릿, 폰)에서 접속하려면 **모든 인터페이스**에서 받을 수 있게 실행합니다.

```bash
cd vercel-app
npm run start
```

Next.js 기본값이 `0.0.0.0`이면 이미 LAN 접속 가능합니다.  
만약 접속이 안 되면:

```bash
# 포트 지정 + 호스트 명시 (필요 시)
npx next start -H 0.0.0.0 -p 3000
```

- **로컬 서버 기기에서:** http://localhost:3000
- **같은 와이파이의 다른 기기에서:** http://로컬서버IP:3000  
  (예: http://192.168.0.10:3000 — 서버 IP는 라우터 설정 또는 `ip addr`(Linux) / `ipconfig`(Windows)로 확인)

---

## 6. 부팅 시 자동 실행 (선택)

서버를 껐다 켜도 앱이 자동으로 떠 있게 하려면 아래 중 하나를 사용합니다.

### 6-1. PM2 (Raspberry Pi / Ubuntu / Windows)

```bash
sudo npm install -g pm2
cd vercel-app
pm2 start npm --name "cm-erp" -- run start
pm2 save
pm2 startup   # 부팅 시 pm2 자동 실행 (안내에 나오는 명령 한 번 더 실행)
```

### 6-2. systemd (Raspberry Pi / Ubuntu만)

`/etc/systemd/system/cm-erp.service` 파일 생성:

```ini
[Unit]
Description=CM ERP Local Server
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/CM_ERP/vercel-app
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable cm-erp
sudo systemctl start cm-erp
```

(경로 `WorkingDirectory`와 `User`는 환경에 맞게 수정)

---

## 7. 포스/ERP 사용 방법

| 상황 | 접속 주소 |
|------|-----------|
| **인터넷 있음** | 기존처럼 choongman-erp.vercel.app 사용 가능. 로컬은 **http://로컬서버IP:3000** |
| **인터넷 끊김** | **http://로컬서버IP:3000** 만 사용 (매장 기기들은 이 주소로 접속) |

- 로컬 서버 주소를 **바탕화면 바로가기** 또는 **홈 화면에 추가**해 두면, 오프라인일 때도 같은 주소로만 열면 됩니다.
- 주문·데이터는 기존처럼 **Supabase**로 저장됩니다. 인터넷이 나오면 로컬 서버도 Supabase와 통신하므로 별도 동기화 설정은 없어도 됩니다.
- 앱 안의 **오프라인 저장/재전송** 로직은 그대로 동작합니다 (로컬 서버는 “항상 붙어 있는 브라우저용 서버” 역할만 합니다).

---

## 8. 방화벽 확인

다른 기기에서 `http://로컬서버IP:3000` 이 안 열리면:

- **Linux:** `sudo ufw allow 3000` 후 `sudo ufw reload` (ufw 사용 시)
- **Windows:** 방화벽에서 포트 3000 인바운드 허용
- **공유기:** 매장 내부 LAN만 쓰면 보통 별도 설정 없음

---

## 9. 정리

1. 매장에 Raspberry Pi 또는 PC 한 대를 두고, 위처럼 **Node.js → 빌드 → .env.local → npm run start** 까지 진행합니다.
2. 포스/태블릿에서는 **http://로컬서버IP:3000** 을 홈 화면에 추가해 두고, 인터넷이 끊겨도 이 주소로 접속합니다.
3. 인터넷이 나오면 로컬 서버도 같은 Supabase를 쓰므로, Vercel이든 로컬이든 데이터는 동일하게 유지됩니다.

추가로 “이 기기에서만 포스 전용으로 쓰고 싶다” 같은 요구가 있으면, 그에 맞춰 주소나 북마크만 정리해 주면 됩니다.
