/* =================================================================
   매장 관리: 매장점검, 시간표
   ================================================================= */

/* =================================================================
   매장점검
   ================================================================= */   

/* 1. 점검 항목 가져오기 (Supabase checklist_items) */
function getChecklistItems(activeOnly) {
  var list = [];
  try {
    var rows = activeOnly
      ? supabaseSelectFilter("checklist_items", "use_flag=eq.true", { order: "item_id.asc" })
      : supabaseSelect("checklist_items", { order: "item_id.asc" });
    if (!rows) return [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      list.push({
        id: r.item_id != null ? r.item_id : r.id,
        main: r.main_cat || "",
        sub: r.sub_cat || "",
        name: r.name || "",
        use: r.use_flag
      });
    }
  } catch (e) {
    Logger.log("getChecklistItems: " + e.message);
  }
  return list;
}

/* [수정] 점검 결과 저장 (Supabase check_results) */
function saveCheckResult(id, date, store, inspector, summary, memo, jsonData) {
  var dateStr = (date && (date instanceof Date || typeof date === "object")) ? new Date(date).toISOString().slice(0, 10) : String(date || "").trim().slice(0, 10);
  if (!dateStr || dateStr.length < 10) return "ERROR: 날짜 형식";
  if (id) {
    try {
      var existing = supabaseSelectFilter("check_results", "id=eq." + encodeURIComponent(String(id)), { limit: 1 });
      if (existing && existing.length > 0) {
        supabaseUpdateByFilter("check_results", "id=eq." + encodeURIComponent(String(id)), {
          check_date: dateStr,
          store_name: String(store || "").trim(),
          inspector: String(inspector || "").trim(),
          summary: String(summary || "").trim(),
          memo: String(memo || "").trim(),
          json_data: String(jsonData || "").trim()
        });
        return "UPDATED";
      }
    } catch (e) {
      Logger.log("saveCheckResult update: " + e.message);
    }
  }
  var newId = Utilities.formatDate(new Date(), "GMT+7", "yyyyMMddHHmmss") + "_" + String(store || "").trim();
  try {
    supabaseInsert("check_results", {
      id: newId,
      check_date: dateStr,
      store_name: String(store || "").trim(),
      inspector: String(inspector || "").trim(),
      summary: String(summary || "").trim(),
      memo: String(memo || "").trim(),
      json_data: String(jsonData || "").trim()
    });
    return "SAVED";
  } catch (e) {
    return "ERROR: " + e.message;
  }
}

/* [신규] 점검 이력 삭제 (Supabase check_results) */
function deleteCheckHistory(id) {
  try {
    supabaseDelete("check_results", String(id));
    return "DELETED";
  } catch (e) {
    if (String(e.message).indexOf("JWT") !== -1 || String(e.message).indexOf("0 rows") !== -1) return "NOT_FOUND";
    Logger.log("deleteCheckHistory: " + e.message);
    return "NOT_FOUND";
  }
}

/* [수정] 점검 이력 조회 (Supabase check_results) */
function getCheckHistory(startStr, endStr, filterStore, filterInspector) {
  var startStr2 = String(startStr || "2000-01-01").substring(0, 10);
  var endStr2 = String(endStr || "2100-12-31").substring(0, 10);
  var filters = ["check_date=gte." + startStr2, "check_date=lte." + endStr2];
  if (filterStore && filterStore !== "All") filters.push("store_name=eq." + encodeURIComponent(filterStore));
  var list = [];
  try {
    list = supabaseSelectFilter("check_results", filters.join("&"), { order: "check_date.desc", limit: 2000 });
  } catch (e) {
    Logger.log("getCheckHistory: " + e.message);
    return [];
  }
  var searchName = filterInspector ? String(filterInspector).toLowerCase().trim() : "";
  var result = [];
  for (var i = 0; i < list.length; i++) {
    var d = list[i];
    var rowInspector = String(d.inspector || "").trim();
    if (searchName !== "" && !rowInspector.toLowerCase().includes(searchName)) continue;
    result.push({
      id: d.id,
      date: String(d.check_date || "").substring(0, 10),
      store: d.store_name,
      inspector: rowInspector,
      result: d.summary,
      json: d.json_data
    });
  }
  return result;
}

/* 4. 항목 설정 업데이트 (Supabase checklist_items) */
function updateChecklistItems(updates) {
  for (var u = 0; u < updates.length; u++) {
    var up = updates[u];
    try {
      supabaseUpdateByFilter("checklist_items", "item_id=eq." + encodeURIComponent(String(up.id)), {
        name: String(up.name != null ? up.name : "").trim(),
        use_flag: (up.use === true || up.use === 1 || up.use === "1" || String(up.use).toLowerCase() === "y")
      });
    } catch (e) {
      Logger.log("updateChecklistItems: " + e.message);
    }
  }
  return "SUCCESS";
}

/* =================================================================
   컴플레인 일지
   ================================================================= */

var COMPLAINT_HEADERS = ["번호", "날짜", "일시", "매장명", "작성자", "고객명", "연락처", "방문경로", "배달플랫폼", "유형", "관련메뉴", "제목", "내용", "심각도", "조치사항", "상태", "담당자", "완료일", "사진URL", "비고", "등록일시"];

function ensureComplaintSheet() {
  return null;
}

function _nextComplaintNumber(dateStr) {
  var base = (dateStr || "").replace(/-/g, "");
  if (base.length !== 8) return base + "-001";
  var max = 0;
  try {
    var list = supabaseSelectFilter("complaint_logs", "log_date=eq." + dateStr, { limit: 500 });
    for (var i = 0; i < list.length; i++) {
      var numCell = String(list[i].number || "");
      if (/^\d{8}-\d{3}$/.test(numCell)) {
        var seq = parseInt(numCell.split("-")[1], 10);
        if (seq > max) max = seq;
      }
    }
  } catch (e) {}
  var next = (max + 1).toString();
  while (next.length < 3) next = "0" + next;
  return base + "-" + next;
}

function saveComplaintLog(dataStr) {
  var data = JSON.parse(dataStr || "{}");
  var dateStr = (data.date || "").toString().trim().slice(0, 10);
  var num = _nextComplaintNumber(dateStr);
  try {
    supabaseInsert("complaint_logs", {
      number: num,
      log_date: dateStr && dateStr.length >= 10 ? dateStr : null,
      log_time: String(data.time || "").trim(),
      store_name: String(data.store || "").trim(),
      writer: String(data.writer || "").trim(),
      customer: String(data.customer || "").trim(),
      contact: String(data.contact || "").trim(),
      visit_path: String(data.visitPath || "").trim(),
      platform: String(data.platform || "").trim(),
      complaint_type: String(data.type || "").trim(),
      menu: String(data.menu || "").trim(),
      title: String(data.title || "").trim(),
      content: String(data.content || "").trim(),
      severity: String(data.severity || "").trim(),
      action: String(data.action || "").trim(),
      status: String(data.status || "접수").trim(),
      handler: String(data.handler || "").trim(),
      done_date: (data.doneDate || "").toString().trim().slice(0, 10) || null,
      photo_url: String(data.photoUrl || "").trim(),
      remark: String(data.remark || "").trim()
    });
    return "저장되었습니다.";
  } catch (e) {
    return "저장 실패: " + e.message;
  }
}

function updateComplaintLog(rowOrId, dataStr) {
  var data = JSON.parse(dataStr || "{}");
  var id = String(rowOrId).trim();
  if (!id) return "잘못된 행입니다.";
  try {
    supabaseUpdateByFilter("complaint_logs", "id=eq." + encodeURIComponent(id), {
      log_date: (data.date || "").toString().trim().slice(0, 10) || null,
      log_time: String(data.time || "").trim(),
      store_name: String(data.store || "").trim(),
      writer: String(data.writer || "").trim(),
      customer: String(data.customer || "").trim(),
      contact: String(data.contact || "").trim(),
      visit_path: String(data.visitPath || "").trim(),
      platform: String(data.platform || "").trim(),
      complaint_type: String(data.type || "").trim(),
      menu: String(data.menu || "").trim(),
      title: String(data.title || "").trim(),
      content: String(data.content || "").trim(),
      severity: String(data.severity || "").trim(),
      action: String(data.action || "").trim(),
      status: String(data.status || "접수").trim(),
      handler: String(data.handler || "").trim(),
      done_date: (data.doneDate || "").toString().trim().slice(0, 10) || null,
      photo_url: String(data.photoUrl || "").trim(),
      remark: String(data.remark || "").trim()
    });
    return "수정되었습니다.";
  } catch (e) {
    return "수정 실패: " + e.message;
  }
}

/** UI 언어 코드 → LanguageApp 번역 대상 코드 (mm→my, la→lo) */
function _complaintTargetLang(targetLang) {
  if (!targetLang) return '';
  var t = String(targetLang).toLowerCase();
  if (t === 'mm') return 'my';
  if (t === 'la') return 'lo';
  return t;
}

/** 텍스트를 선택 언어로 번역 (빈 값은 그대로, 오류 시 원문 반환) */
function _translateComplaintText(text, targetLang) {
  var s = text != null ? String(text).trim() : '';
  if (s === '') return s;
  var target = _complaintTargetLang(targetLang);
  if (!target) return s;
  try {
    return LanguageApp.translate(s, '', target);
  } catch (e) {
    return s;
  }
}

/** 관련메뉴·제목·조치 사항·비고 4개 필드를 선택 언어로 번역해 반환 */
function translateComplaintFields(menu, title, action, remark, targetLang) {
  return {
    menu: _translateComplaintText(menu, targetLang),
    title: _translateComplaintText(title, targetLang),
    action: _translateComplaintText(action, targetLang),
    remark: _translateComplaintText(remark, targetLang)
  };
}

function getComplaintLogList(startStr, endStr, storeFilter, visitPath, typeFilter, statusFilter, targetLang) {
  var filters = [];
  if (startStr) filters.push("log_date=gte." + String(startStr).substring(0, 10));
  if (endStr) filters.push("log_date=lte." + String(endStr).substring(0, 10));
  if (storeFilter && storeFilter !== "" && storeFilter !== "All") filters.push("store_name=eq." + encodeURIComponent(storeFilter));
  if (visitPath && visitPath !== "") filters.push("visit_path=eq." + encodeURIComponent(visitPath));
  if (typeFilter && typeFilter !== "") filters.push("complaint_type=eq." + encodeURIComponent(typeFilter));
  if (statusFilter && statusFilter !== "") filters.push("status=eq." + encodeURIComponent(statusFilter));
  var list = [];
  try {
    list = supabaseSelectFilter("complaint_logs", filters.length ? filters.join("&") : "id=gt.0", { order: "log_date.desc,id.desc", limit: 2000 });
  } catch (e) {
    Logger.log("getComplaintLogList: " + e.message);
    return [];
  }
  var result = [];
  for (var i = 0; i < list.length; i++) {
    var d = list[i];
    var item = {
      row: d.id,
      id: d.id,
      number: String(d.number || ""),
      date: d.log_date ? String(d.log_date).substring(0, 10) : "",
      time: String(d.log_time || ""),
      store: String(d.store_name || ""),
      writer: String(d.writer || ""),
      customer: String(d.customer || ""),
      contact: String(d.contact || ""),
      visitPath: String(d.visit_path || ""),
      platform: String(d.platform || ""),
      type: String(d.complaint_type || ""),
      menu: String(d.menu || ""),
      title: String(d.title || ""),
      content: String(d.content || ""),
      severity: String(d.severity || ""),
      action: String(d.action || ""),
      status: String(d.status || ""),
      handler: String(d.handler || ""),
      doneDate: d.done_date ? String(d.done_date).substring(0, 10) : "",
      photoUrl: String(d.photo_url || ""),
      remark: String(d.remark || "")
    };
    if (targetLang && _complaintTargetLang(targetLang)) {
      item.title = _translateComplaintText(item.title, targetLang);
    }
    result.push(item);
  }
  result.sort(function(a, b) { return (b.date + b.time).localeCompare(a.date + a.time); });
  return result;
}
