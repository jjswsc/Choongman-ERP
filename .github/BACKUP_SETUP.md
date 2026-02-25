# Supabase 백업 설정 (GitHub Actions)

하루 3회(KST 9시, 14시, 21시) Supabase DB를 백업합니다.

## 1. SUPABASE_DB_URL 시크릿 등록

**중요: GitHub Actions는 IPv6를 지원하지 않습니다.** Direct 연결(db.xxx.supabase.co) 사용 시 "Network is unreachable" 에러가 발생하므로, **Pooler(Supavisor)** 연결을 사용해야 합니다.

1. **Supabase 대시보드** → **Connect** 버튼 클릭 → **Connection String** 탭
2. 다음 설정으로 변경:
   - **Source**: Primary Database
   - **Method**: **Session** (또는 Transaction) — Direct가 아님
   - Pooler URI 형식: `postgresql://postgres.[project-ref]:[PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres` (Session) 또는 `...6543...` (Transaction)
3. `[YOUR-PASSWORD]`를 실제 DB 비밀번호로 교체 후 전체 URI 복사
4. **GitHub** → 저장소 → **Settings** → **Secrets and variables** → **Actions**
5. **New repository secret** → 이름: `SUPABASE_DB_URL`, 값: Pooler URI 붙여넣기 (또는 기존 시크릿 Update)

## 2. 스케줄 확인

| Cron (UTC) | 한국 시간 (KST) |
|------------|-----------------|
| 0 0 * * *  | 09:00           |
| 0 5 * * *  | 14:00           |
| 0 12 * * * | 21:00           |

`.github/workflows/supabase-backup.yml`에서 `schedule` 수정 시 변경 가능.

## 3. 백업 확인

- **GitHub** → **Actions** → **Supabase DB Backup**
- 각 실행마다 **Artifacts**에 `supabase-backup-{run_id}` (14일 보관)
- 백업 파일: `backup-{날짜시간}-roles.sql.gz`, `-schema.sql.gz`, `-data.sql.gz`

## 4. 수동 실행

Actions 탭 → **Supabase DB Backup** → **Run workflow** → **Run workflow**

## 5. 백업 실패 시 점검

| 증상 | 원인 | 해결 |
|------|------|------|
| Network is unreachable | Direct 연결 사용 (GitHub Actions는 IPv6 미지원) | **Pooler** URI(`pooler.supabase.com:5432` 또는 `:6543`)로 교체 |
| SUPABASE_DB_URL secret is not set | 시크릿 미등록 | GitHub Settings → Secrets에 추가 |
| password authentication failed | 비밀번호 오류 | Supabase Database Settings에서 비밀번호 재설정 후 시크릿 업데이트 |
