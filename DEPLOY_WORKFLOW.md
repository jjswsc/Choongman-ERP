# 배포 워크플로우 (브랜치 + Preview)

## 브랜치 구성

| 브랜치 | 용도 |
|--------|------|
| `develop` | 개발·수정 작업. push 시 **Preview URL**로 자동 배포됨 |
| `main` | 운영 버전. merge 시 **실제 서비스 URL**로 배포됨 |

---

## 일상적인 업데이트 절차

### 1. develop에서 작업

```bash
git checkout develop
# 파일 수정 후...
git add .
git commit -m "변경 내용"
git push
```

→ Vercel이 **Preview URL**을 자동 생성 (Deployments 탭에서 확인)

### 2. Preview에서 테스트

- Vercel 대시보드 → **Deployments** → 최신 develop 배포의 **Visit** 클릭
- 또는 이메일로 오는 Preview 링크에서 확인
- 모바일·관리자 페이지 모두 충분히 테스트

### 3. 문제 없으면 main에 반영

```bash
# 방법 A: 로컬에서 merge 후 push
git checkout main
git merge develop
git push

# 방법 B: GitHub에서 Pull Request
# https://github.com/jjswsc/Choongman-ERP/compare/main...develop
# PR 생성 → Review → Merge
```

→ `main` push 후 실제 서비스 URL에 바로 반영됨

---

## 현재 브랜치 확인

```bash
git branch
# * develop  ← 현재 develop에 있음
#   main
```

- `develop`에서 작업 중이면 `* develop`으로 표시됨
- `main`으로 돌아가려면: `git checkout main`
