"use strict";

/**
 * Hybrid POS 셸 복구 정책 (Electron main에서 사용).
 * 영업 중 흰 화면·렌더러 사망 시 직원이 키오스크를 만질 수 없으므로
 * 메인 프로세스가 혼자 새로고침·재실행한다.
 */

/** 빈 UI: 조작 가능한 노드도 글자도 없음 */
const DOM_BLANK_PROBE_JS =
  "(() => { try { const b = document && document.body; if (!b) return true; if (b.querySelector('svg,img,button,input,select,form,main,nav,header,footer,textarea,canvas,iframe')) return false; const t = (b.innerText || '').replace(/\\s/g, ''); if (t.length > 0) return false; return ((b.textContent || '').replace(/\\s/g, '')).length === 0; } catch (e) { return true; } })()";

function nextLiveBlankHits(prevHits, isBlank) {
  const prev = Math.max(0, Number(prevHits) || 0);
  if (!isBlank) return 0;
  return prev + 1;
}

/**
 * 흰 화면은 단순 새로고침이 아니라 Clear Cache(SW·Cache Storage 삭제)가 필요하다.
 * @returns {'wait'|'clear'|'clear-cache'|'offline'}
 */
function decideLiveBlankAction(opts) {
  const o = opts || {};
  const hitsBeforeReload = Math.max(1, Number(o.hitsBeforeReload) || 2);
  const recoveriesInWindow = Math.max(0, Number(o.recoveriesInWindow) || 0);
  const maxRecoveries = Math.max(1, Number(o.maxRecoveries) || 3);
  const consecutiveHits = Math.max(0, Number(o.consecutiveHits) || 0);
  if (o.onOfflinePage || o.isLoading || o.cooldown) return "wait";
  if (o.probeFailed) {
    return recoveriesInWindow >= maxRecoveries ? "offline" : "clear-cache";
  }
  if (!o.isBlank) return "clear";
  if (consecutiveHits < hitsBeforeReload) return "wait";
  return recoveriesInWindow >= maxRecoveries ? "offline" : "clear-cache";
}

/**
 * @returns {'ignore'|'clear-cache'|'offline'}
 */
function decideRendererGoneAction(opts) {
  const o = opts || {};
  const reason = String(o.reason || "");
  const recoveriesInWindow = Math.max(0, Number(o.recoveriesInWindow) || 0);
  const maxRecoveries = Math.max(1, Number(o.maxRecoveries) || 3);
  if (reason === "clean-exit") return "ignore";
  return recoveriesInWindow >= maxRecoveries ? "offline" : "clear-cache";
}

function shouldOpenAtLogin(opts) {
  const o = opts || {};
  const env = o.envValue === undefined || o.envValue === null ? "" : String(o.envValue).trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(env)) return false;
  if (["1", "true", "yes", "on"].includes(env)) return true;
  return Boolean(o.isPackaged);
}

function shouldRelaunchAfterAllWindowsClosed(opts) {
  const o = opts || {};
  if (o.userRequestedQuit) return false;
  if (o.platform === "darwin") return false;
  return true;
}

function bumpRecoveries(prev, now, windowMs) {
  const windowStart = Number(prev && prev.windowStart) || 0;
  const count = Number(prev && prev.count) || 0;
  const t = Number(now) || 0;
  const win = Number(windowMs) || 180000;
  if (!windowStart || t - windowStart > win) {
    return { count: 1, windowStart: t };
  }
  return { count: count + 1, windowStart };
}

function recoveriesInWindow(prev, now, windowMs) {
  const windowStart = Number(prev && prev.windowStart) || 0;
  const count = Number(prev && prev.count) || 0;
  const t = Number(now) || 0;
  const win = Number(windowMs) || 180000;
  if (!windowStart || t - windowStart > win) return 0;
  return count;
}

module.exports = {
  DOM_BLANK_PROBE_JS,
  nextLiveBlankHits,
  decideLiveBlankAction,
  decideRendererGoneAction,
  shouldOpenAtLogin,
  shouldRelaunchAfterAllWindowsClosed,
  bumpRecoveries,
  recoveriesInWindow,
};
