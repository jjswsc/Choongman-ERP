#!/bin/sh

# Exit 0 means "skip build" in Vercel Ignored Build Step.
# Exit 1 means "run build".

set -eu

if [ "${VERCEL_GIT_PREVIOUS_SHA:-}" = "" ]; then
  echo "No previous SHA found. Running build."
  exit 1
fi

CHANGED_FILES="$(git diff --name-only "$VERCEL_GIT_PREVIOUS_SHA" "$VERCEL_GIT_COMMIT_SHA" || true)"

if [ "$CHANGED_FILES" = "" ]; then
  echo "No changed files. Skipping build."
  exit 0
fi

echo "Changed files:"
echo "$CHANGED_FILES"

# Strict mode:
# - Skip build ONLY when every changed file is docs/meta-only.
# - Any runtime/config/tooling change forces a build.
while IFS= read -r file; do
  case "$file" in
    docs/*|README.md)
      # allowed non-runtime change
      ;;
    *)
      echo "Build required: $file"
      exit 1
      ;;
  esac
done <<EOF
$CHANGED_FILES
EOF

echo "Only docs/meta files changed. Skipping build."
exit 0
