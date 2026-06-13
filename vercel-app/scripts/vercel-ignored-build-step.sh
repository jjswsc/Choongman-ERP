#!/bin/sh

# Vercel Ignored Build Step: exit 0 = 빌드 생략(비용 절감), exit 1 = 빌드 실행
# https://vercel.com/docs/project-configuration/git-settings#ignored-build-step
#
# Next.js 번들과 무관한 경로만 바뀐 커밋은 프리뷰/프로덕션 빌드를 돌리지 않습니다.
# (문서, windows-pos 일렉트론, Supabase용 sql 참고 파일 등)
#
# 동일 Git 저장소를 충만·Omni 등 Vercel "프로젝트" 두 개에 연결하면 푸시마다 둘 다 빌드되어
# 요금이 거의 2배로 나갑니다. 당분간 쓰지 않는 프로젝트만 아래 환경변수를 켜 두세요.
# Vercel → 해당 프로젝트 → Settings → Environment Variables (Production·Preview·Development 전부 권장)
# CM_VERCEL_PAUSE_AUTO_BUILDS=1  (또는 true / yes, 대소문자 무관)
# 다시 배포할 때는 해당 프로젝트에서 변수를 끄거나 삭제한 뒤 Redeploy 하면 됩니다.

set -eu

case "${CM_VERCEL_PAUSE_AUTO_BUILDS:-}" in
  1|[Tt][Rr][Uu][Ee]|[Yy][Ee][Ss])
    echo "CM_VERCEL_PAUSE_AUTO_BUILDS is set — skipping build for this Vercel project."
    exit 0
    ;;
esac

if [ "${VERCEL_GIT_PREVIOUS_SHA:-}" = "" ]; then
  echo "No previous SHA found. Running build."
  exit 1
fi

if [ -n "${VERCEL_GIT_PREVIOUS_SHA:-}" ] && [ "${VERCEL_GIT_PREVIOUS_SHA}" = "${VERCEL_GIT_COMMIT_SHA:-}" ]; then
  echo "Same commit as previous deployment — running build (manual redeploy)."
  exit 1
fi

CHANGED_FILES="$(git diff --name-only "$VERCEL_GIT_PREVIOUS_SHA" "$VERCEL_GIT_COMMIT_SHA" 2>/dev/null || true)"

if [ "$CHANGED_FILES" = "" ]; then
  echo "No changed files in git diff — running build anyway (redeploy or shallow clone)."
  exit 1
fi

echo "Changed files:"
echo "$CHANGED_FILES"

# 단일 파일이 Next 배포에 필요한지 판별 (저장소 루트·vercel-app 루트 모두 허용)
is_meta_only_path() {
  f="$1"
  case "$f" in
    docs/*|vercel-app/docs/*|*/docs/*)
      return 0 ;;
    README.md|vercel-app/README.md|*/README.md)
      return 0 ;;
    windows-pos/*|vercel-app/windows-pos/*|*/windows-pos/*)
      return 0 ;;
    sql/*|vercel-app/sql/*|*/sql/*)
      return 0 ;;
    *)
      return 1 ;;
  esac
}

while IFS= read -r file; do
  [ -z "$file" ] && continue
  if is_meta_only_path "$file"; then
    echo "Non-Next bundle path: $file"
  else
    echo "Build required: $file"
    exit 1
  fi
done <<EOF
$CHANGED_FILES
EOF

echo "Only docs / windows-pos / sql / README changes. Skipping build."
exit 0
