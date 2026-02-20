# Supabase 백업 설정 (GitHub Actions)

하루 3회(KST 9시, 14시, 21시) Supabase DB를 백업합니다.

## 1. SUPABASE_DB_URL 시크릿 등록

1. **Supabase 대시보드** → 프로젝트 선택 → **Settings** → **Database**
2. **Connection string** 섹션에서 **URI** 복사
   - 형식: `postgresql://postgres.[project-ref]:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres`
   - `[YOUR-PASSWORD]` 부분을 실제 DB 비밀번호로 교체
3. **GitHub** → 저장소 → **Settings** → **Secrets and variables** → **Actions**
4. **New repository secret** → 이름: `SUPABASE_DB_URL`, 값: 위 URI 붙여넣기

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

## 4. 수동 실행

Actions 탭 → **Supabase DB Backup** → **Run workflow** → **Run workflow**
