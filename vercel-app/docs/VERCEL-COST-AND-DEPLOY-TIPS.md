# Vercel Cost and Deploy Time Tips

This project uses Vercel + Next.js. To reduce deploy duration and build costs:

## 1) Reduce upload size with `.vercelignore`

`vercel-app/.vercelignore` excludes local-only files like:

- `node_modules`, `.next`, `.vercel`
- local env files (`.env.*`, except `.env.example`)
- docs and backup/temp files
- large local data files (`*.xlsx`, `*.csv`, `*.zip`)

This usually gives the fastest win for "upload takes 1+ minute".

## 2) Skip build when only docs/meta changed

Use `scripts/vercel-ignored-build-step.sh` in Vercel Project Settings:

- Settings -> Git -> Ignored Build Step
- Command:

```sh
sh scripts/vercel-ignored-build-step.sh
```

Behavior:

- Exit code `0` => skip build
- Exit code `1` => run build

Current rules skip build when only docs/markdown/meta files changed.

## 3) Optional local prebuilt deploy

If you deploy manually from local machine often:

```sh
npm run build
npx vercel build
npx vercel deploy --prebuilt
```

For production:

```sh
npx vercel deploy --prebuilt --prod
```

This can reduce Vercel-side build work for frequent manual deployments.
