#!/usr/bin/env node
/**
 * CI/로컬에서 현재 적용될 단일 배포 Origin을 출력합니다.
 * 예: DEPLOY_PUBLIC_ORIGIN=$(node scripts/print-deploy-public-origin.mjs)
 */
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { resolveDeployPublicOrigin } = require("../lib/deploy-public-origin.cjs")

console.log(resolveDeployPublicOrigin())
