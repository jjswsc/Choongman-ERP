# Supabase 백업 설정 (GitHub Actions)

하루 3회(KST 9시, 14시, 21시) Supabase DB를 백업합니다.

## 1. SUPABASE_DB_URL 시크릿 등록

**중요: pg_dump 백업은 반드시 Direct 연결을 사용해야 합니다. Pooler(6543)로는 백업이 실패합니다.**

1. **Supabase 대시보드** → 프로젝트 선택 → **Settings** → **Database**
2. **Connection string** 섹션에서 **URI** 복사
   - **Direct connection** (권장): `postgresql://postgres:[YOUR-PASSWORD]@db.[project-ref].supabase.co:5432/postgres`
   - Connect 버튼 → **Direct connection** 탭에서 확인
   - `[YOUR-PASSWORD]`를 실제 DB 비밀번호로 교체
   - ❌ 사용 금지: `pooler.supabase.com:6543` (Pooler) — 백업 실패 원인
3. **GitHub** → 저장소 → **Settings** → **Secrets and variables** → **Actions**
4. **New repository secret** → 이름: `SUPABASE_DB_URL`, 값: Direct URI 붙여넣기

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
| 연결 실패 / timeout | Pooler(6543) 사용 | Direct URI(`db.xxx.supabase.co:5432`)로 교체 |
| SUPABASE_DB_URL secret is not set | 시크릿 미등록 | GitHub Settings → Secrets에 추가 |
| 권한 오류 | IPv4 제한 등 | Supabase Database Settings → Connection → Restrict connections 확인 |
