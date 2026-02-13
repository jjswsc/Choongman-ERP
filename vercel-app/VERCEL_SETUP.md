# Vercel 404 해결 - 설정 확인

## ⚠️ 404 NOT_FOUND 발생 시 반드시 확인

### 1. Root Directory 설정 (가장 중요)

Vercel 대시보드에서:
1. 프로젝트 클릭 → **Settings** → **General**
2. **Root Directory** 섹션에서 **Edit** 클릭
3. `vercel-app` 입력 후 **Save**
4. **Deployments** 탭 → 최신 배포 **⋯** → **Redeploy**

> ❌ Root Directory가 비어있거나 `.`이면 프로젝트 루트의 package.json을 사용합니다.  
> 그 package.json에는 Next.js가 없어 빌드 실패 또는 404가 발생합니다.

### 2. 접속 URL

| URL | 설명 |
|-----|------|
| `https://프로젝트명.vercel.app/` | 메인 (로그인 후 대시보드) |
| `https://프로젝트명.vercel.app/login` | 로그인 페이지 |

**주의:** `/app` 으로 접속하면 404. `/` 또는 `/login` 사용.

### 3. 배포 상태

**Deployments** 탭에서 최신 배포가 **Ready** (초록 체크) 인지 확인.

### 4. Build 로그 확인

배포 클릭 → **Building** 로그에서:
- `Running "npm run build"` 가 보여야 함
- `next build` 실행 후 **Compiled successfully** 확인

오류가 있으면 빌드 실패로 404가 날 수 있습니다.
