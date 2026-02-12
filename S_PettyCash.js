/* =================================================================
   회계 관리: 패티 캐쉬 (소액 현금)
   ================================================================= */

/**
 * 패티 캐쉬 내역 조회 (오피스=전매장, 매니저=자기 매장만)
 * @param {string} userStore - 로그인 사용자 매장
 * @param {string} userRole - director, officer, manager 등
 * @param {string} startStr - 기간 시작 (yyyy-MM-dd)
 * @param {string} endStr - 기간 종료
 * @param {string} storeFilter - 매장 필터 (All 또는 매장명)
 */
function getPettyCashList(userStore, userRole, startStr, endStr, storeFilter) {
  try {
    var r = String(userRole || "").toLowerCase();
    var isOffice = r.indexOf("director") !== -1 || r.indexOf("officer") !== -1 || r.indexOf("ceo") !== -1 || r.indexOf("hr") !== -1;
    var effectiveStore = "";
    if (!isOffice && userStore) effectiveStore = String(userStore).trim();
    else if (storeFilter && storeFilter !== "All" && storeFilter !== "") effectiveStore = String(storeFilter).trim();

    var rows = [];
    if (effectiveStore) {
      rows = supabaseSelectFilter("petty_cash_transactions", "store=eq." + encodeURIComponent(effectiveStore), { order: "trans_date.desc,id.desc", limit: 500 }) || [];
    } else {
      rows = supabaseSelect("petty_cash_transactions", { order: "trans_date.desc,id.desc", limit: 500 }) || [];
    }

    var startD = startStr ? new Date(startStr + "T00:00:00") : null;
    var endD = endStr ? new Date(endStr + "T23:59:59") : null;
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      var rw = rows[i];
      var dt = rw.trans_date ? (typeof rw.trans_date === "string" ? rw.trans_date.slice(0, 10) : Utilities.formatDate(new Date(rw.trans_date), "GMT+7", "yyyy-MM-dd")) : "";
      if (startD && dt && new Date(dt + "T12:00:00") < startD) continue;
      if (endD && dt && new Date(dt + "T12:00:00") > endD) continue;
        list.push({
        id: rw.id,
        store: String(rw.store || "").trim(),
        trans_date: dt,
        trans_type: String(rw.trans_type || "expense").trim(),
        amount: Number(rw.amount) || 0,
        balance_after: rw.balance_after != null ? Number(rw.balance_after) : null,
        memo: String(rw.memo || "").trim(),
        receipt_url: rw.receipt_url ? String(rw.receipt_url).trim() : "",
        user_name: String(rw.user_name || "").trim(),
        created_at: rw.created_at ? String(rw.created_at).slice(0, 19) : ""
      });
    }
    return list;
  } catch (e) {
    Logger.log("getPettyCashList: " + e.message);
    return [];
  }
}

/**
 * 패티 캐쉬 거래 추가 (오피스=전매장, 매니저=자기 매장만)
 * trans_type: receive(수령), expense(지출), replenish(보충), settle(정산)
 */
function addPettyCashTransaction(store, transDate, transType, amount, memo, userName, userStore, userRole, receiptUrl) {
  try {
    var r = String(userRole || "").toLowerCase();
    var isOffice = r.indexOf("director") !== -1 || r.indexOf("officer") !== -1 || r.indexOf("ceo") !== -1 || r.indexOf("hr") !== -1;
    if (!isOffice && userStore && String(store).trim() !== String(userStore).trim()) {
      return "❌ 해당 매장만 등록할 수 있습니다.";
    }

    var amt = Number(amount) || 0;
    if (amt === 0) return "❌ 금액을 입력하세요.";
    var typed = String(transType || "expense").toLowerCase();
    if (typed === "expense") amt = -Math.abs(amt);

    var storeTrim = String(store || "").trim();
    if (!storeTrim) return "❌ 매장을 선택하세요.";
    var dateStr = transDate ? (typeof transDate === "string" ? transDate.slice(0, 10) : Utilities.formatDate(new Date(transDate), "GMT+7", "yyyy-MM-dd")) : "";
    if (!dateStr) return "❌ 날짜를 선택하세요.";

    var row = {
      store: storeTrim,
      trans_date: dateStr,
      trans_type: typed,
      amount: amt,
      memo: String(memo || "").trim(),
      user_name: String(userName || "").trim()
    };
    if (receiptUrl && String(receiptUrl).trim().length > 0) {
      row.receipt_url = String(receiptUrl).trim();
    }
    supabaseInsert("petty_cash_transactions", row);
    return "✅ 등록되었습니다.";
  } catch (e) {
    Logger.log("addPettyCashTransaction: " + e.message);
    return "❌ 오류: " + e.message;
  }
}

/**
 * 패티 캐쉬 해당 월 거래 내역 (실시간 잔액 포함)
 * 월 선택 시 그 월에 있었던 모든 수입/지출을 보여주고, 거래별 잔액을 계산
 * @param {string} userStore - 로그인 사용자 매장
 * @param {string} userRole - director, officer, manager 등
 * @param {string} storeFilter - 매장 필터 (All 또는 매장명)
 * @param {string} yearMonth - 조회 연월 (예: "2025-02")
 */
function getPettyCashMonthDetail(userStore, userRole, storeFilter, yearMonth) {
  try {
    var r = String(userRole || "").toLowerCase();
    var isOffice = r.indexOf("director") !== -1 || r.indexOf("officer") !== -1 || r.indexOf("ceo") !== -1 || r.indexOf("hr") !== -1;
    var effectiveStore = "";
    if (!isOffice && userStore) effectiveStore = String(userStore).trim();
    else if (storeFilter && storeFilter !== "All" && storeFilter !== "") effectiveStore = String(storeFilter).trim();

    var ym = String(yearMonth || "").trim();
    if (ym.length < 7) {
      var y = new Date().getFullYear();
      var m = new Date().getMonth() + 1;
      ym = y + "-" + String(m).padStart(2, "0");
    }
    var parts = ym.split("-");
    var year = parseInt(parts[0], 10) || new Date().getFullYear();
    var month = parseInt(parts[1], 10) || 1;
    var startStr = String(year) + "-" + String(month).padStart(2, "0") + "-01";
    var lastDay = new Date(year, month, 0).getDate();
    var endStr = String(year) + "-" + String(month).padStart(2, "0") + "-" + String(lastDay).padStart(2, "0");

    var rows = [];
    if (effectiveStore) {
      rows = supabaseSelectFilter("petty_cash_transactions", "store=eq." + encodeURIComponent(effectiveStore), { order: "trans_date.asc,id.asc", limit: 2000 }) || [];
    } else {
      rows = supabaseSelect("petty_cash_transactions", { order: "trans_date.asc,id.asc", limit: 2000 }) || [];
    }

    var startD = new Date(startStr + "T00:00:00");
    var endD = new Date(endStr + "T23:59:59");
    var storePrevBal = {};
    var inMonth = [];
    for (var i = 0; i < rows.length; i++) {
      var rw = rows[i];
      var dt = rw.trans_date ? (typeof rw.trans_date === "string" ? rw.trans_date.slice(0, 10) : Utilities.formatDate(new Date(rw.trans_date), "GMT+7", "yyyy-MM-dd")) : "";
      if (!dt) continue;
      var store = String(rw.store || "").trim();
      if (!store) continue;
      var amt = Number(rw.amount) || 0;
      var dtD = new Date(dt + "T12:00:00");

      if (dtD < startD) {
        if (!storePrevBal[store]) storePrevBal[store] = 0;
        storePrevBal[store] += amt;
        continue;
      }
      if (dtD > endD) continue;
      inMonth.push({
        id: rw.id, store: store, trans_date: dt, trans_type: String(rw.trans_type || "expense").trim(),
        amount: amt, memo: String(rw.memo || "").trim(), receipt_url: rw.receipt_url ? String(rw.receipt_url).trim() : "", user_name: String(rw.user_name || "").trim()
      });
    }
    inMonth.sort(function(a, b) {
      var c = a.store.localeCompare(b.store);
      return c !== 0 ? c : a.trans_date.localeCompare(b.trans_date);
    });
    var storeBal = {};
    for (var k in storePrevBal) { storeBal[k] = storePrevBal[k]; }
    var list = [];
    for (var idx = 0; idx < inMonth.length; idx++) {
      var it = inMonth[idx];
      if (!storeBal[it.store]) storeBal[it.store] = 0;
      storeBal[it.store] += it.amount;
      list.push({
        id: it.id, store: it.store, trans_date: it.trans_date, trans_type: it.trans_type,
        amount: it.amount, balance_after: storeBal[it.store], memo: it.memo, receipt_url: it.receipt_url || "", user_name: it.user_name
      });
    }
    return list;
  } catch (e) {
    Logger.log("getPettyCashMonthDetail: " + e.message);
    return [];
  }
}
