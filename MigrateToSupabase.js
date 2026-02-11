/* =================================================================
   시트 → Supabase 일괄 이전 (한 번만 실행)
   GAS 편집기에서 migrateSheetsToSupabase() 함수 실행
   Script Properties에 ERP_SPREADSHEET_ID 가 있으면 그 시트 사용 (없으면 현재 열린/연결된 시트)
   ================================================================= */

function migrateSheetsToSupabase() {
  var ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    Logger.log("getActiveSpreadsheet 실패: " + e.message);
  }
  if (!ss) {
    var sheetId = PropertiesService.getScriptProperties().getProperty("ERP_SPREADSHEET_ID");
    if (sheetId) {
      try {
        ss = SpreadsheetApp.openById(sheetId.trim());
      } catch (e2) {
        return "스프레드시트 열기 실패. ERP_SPREADSHEET_ID를 확인하세요. " + e2.message;
      }
    }
  }
  if (!ss) {
    return "스프레드시트를 찾을 수 없습니다.\n\n해결: Script Properties에 다음을 추가하세요.\n  키: ERP_SPREADSHEET_ID\n  값: (엑셀 시트 URL의 d/ 와 /edit 사이에 있는 긴 ID)\n\n또는 데이터가 있는 스프레드시트를 연 상태에서 [확장프로그램] → [Apps Script]로 이 프로젝트를 열고 다시 실행하세요.";
  }
  var log = [];
  Logger.log("시트 이름: " + ss.getName());
  try {
    // 1. 품목
    var itemSheet = ss.getSheetByName("품목") || ss.getSheetByName("Items");
    Logger.log("품목 시트: " + (itemSheet ? "있음, 행수 " + itemSheet.getLastRow() : "없음"));
    if (itemSheet && itemSheet.getLastRow() >= 2) {
      var lastRow = itemSheet.getLastRow();
      var itemData = itemSheet.getRange(2, 1, lastRow, 10).getValues();
      var itemRows = [];
      for (var i = 0; i < itemData.length; i++) {
        var r = itemData[i];
        if (!r[0] && !r[2]) continue;
        itemRows.push({
          code: String(r[0] || "").trim(),
          category: String(r[1] || "").trim(),
          name: String(r[2] || "").trim(),
          spec: String(r[3] || "").trim(),
          price: Number(r[4]) || 0,
          cost: Number(r[5]) || 0,
          image: String(r[6] || "").trim(),
          vendor: String(r[7] || "").trim(),
          tax: (String(r[9] || "").trim() === "면세") ? "면세" : "과세"
        });
      }
      itemRows = _dedupeByKey(itemRows, "code");
      if (itemRows.length > 0) {
        _upsertChunk("items", itemRows, 50, "code");
        log.push("품목: " + itemRows.length + "건");
        Logger.log("품목 " + itemRows.length + "건 삽입 완료");
      }
    } else {
      log.push("품목 시트 없음 또는 데이터 없음");
    }

    // 2. 거래처 (K=매장명, L=위도, M=경도 포함)
    var vendorSheet = ss.getSheetByName("거래처");
    if (vendorSheet && vendorSheet.getLastRow() >= 2) {
      var vLast = vendorSheet.getLastRow();
      var vCols = Math.max(vendorSheet.getLastColumn(), 13);
      var vData = vendorSheet.getRange(2, 1, vLast, vCols).getValues();
      var vendorRows = [];
      for (var i = 0; i < vData.length; i++) {
        var r = vData[i];
        if (!r[0] && !r[2]) continue;
        var row = {
          type: String(r[0] || "").trim(),
          code: String(r[1] || "").trim(),
          name: String(r[2] || "").trim(),
          tax_id: String(r[3] || "").trim(),
          ceo: String(r[4] || "").trim(),
          addr: String(r[5] || "").trim(),
          manager: String(r[6] || "").trim(),
          phone: String(r[7] || "").trim(),
          balance: Number(r[8]) || 0,
          memo: String(r[9] != null ? r[9] : r[10] || "").trim()
        };
        if (vCols >= 13) {
          row.gps_name = String(r[10] != null ? r[10] : "").trim();
          row.lat = r[11] != null && r[11] !== "" ? String(r[11]).trim() : "";
          row.lng = r[12] != null && r[12] !== "" ? String(r[12]).trim() : "";
        }
        vendorRows.push(row);
      }
      vendorRows = _dedupeByKey(vendorRows, "code");
      if (vendorRows.length > 0) {
        _upsertChunk("vendors", vendorRows, 50, "code");
        log.push("거래처: " + vendorRows.length + "건");
      }
      // 2b. 이미 DB에 거래처가 있으면 GPS만 동기화 (code 기준)
      for (var vi = 0; vi < vData.length; vi++) {
        var r = vData[vi];
        var code = String(r[1] || "").trim();
        if (!code) continue;
        if (vCols >= 13 && (r[10] != null || r[11] != null || r[12] != null)) {
          try {
            supabaseUpdateByFilter("vendors", "code=eq." + encodeURIComponent(code), {
              gps_name: String(r[10] != null ? r[10] : "").trim(),
              lat: r[11] != null && r[11] !== "" ? String(r[11]).trim() : "",
              lng: r[12] != null && r[12] !== "" ? String(r[12]).trim() : ""
            });
          } catch (ex) {}
        }
      }
      log.push("거래처 GPS 동기화 완료");
    }

    // 3. 매장설정 (시트명: 매장설정 또는 Store Settings)
    var storeSheet = ss.getSheetByName("매장설정") || ss.getSheetByName("Store Settings");
    Logger.log("매장설정 시트: " + (storeSheet ? "있음, 행수 " + storeSheet.getLastRow() : "없음"));
    if (storeSheet && storeSheet.getLastRow() >= 2) {
      var sData = storeSheet.getRange(2, 1, storeSheet.getLastRow(), 3).getValues();
      var storeRows = [];
      for (var i = 0; i < sData.length; i++) {
        var r = sData[i];
        if (!r[0] && !r[1]) continue;
        storeRows.push({
          store: String(r[0] || "").trim(),
          code: String(r[1] || "").trim(),
          safe_qty: Number(r[2]) || 0
        });
      }
      // (store, code) 중복 제거 — 한 배치 안에 같은 키가 있으면 ON CONFLICT 오류 발생
      var storeKey = {};
      for (var j = 0; j < storeRows.length; j++) {
        var key = storeRows[j].store + "\n" + storeRows[j].code;
        storeKey[key] = storeRows[j];
      }
      var storeRowsUnique = [];
      for (var k in storeKey) storeRowsUnique.push(storeKey[k]);
      if (storeRowsUnique.length > 0) {
        _upsertChunk("store_settings", storeRowsUnique, 100, "store,code");
        log.push("매장설정: " + storeRowsUnique.length + "건" + (storeRows.length !== storeRowsUnique.length ? " (중복 " + (storeRows.length - storeRowsUnique.length) + "건 제거)" : ""));
      }
    } else {
      log.push("매장설정: 시트 없음 또는 데이터 없음");
    }

    // 4. 주문 (시트명: 주문 또는 Orders)
    var orderSheet = ss.getSheetByName("주문") || ss.getSheetByName("Orders");
    Logger.log("주문 시트: " + (orderSheet ? "있음, 행수 " + orderSheet.getLastRow() : "없음"));
    var sheetRowToOrderId = {};
    if (orderSheet && orderSheet.getLastRow() >= 2) {
      var oData = orderSheet.getRange(2, 1, orderSheet.getLastRow(), 11).getValues();
      var nextId = 1;
      for (var i = 0; i < oData.length; i++) {
        var r = oData[i];
        if (!r[1] && !r[2]) continue;
        var orderDate = r[0];
        var isoDate = orderDate && (orderDate instanceof Date || typeof orderDate === "object") ? new Date(orderDate).toISOString() : new Date().toISOString();
        var cartJson = "";
        try {
          cartJson = typeof r[3] === "string" ? r[3] : JSON.stringify(r[3] || []);
        } catch (e) {
          cartJson = "[]";
        }
        var row = {
          order_date: isoDate,
          store_name: String(r[1] || "").trim(),
          user_name: String(r[2] || "").trim(),
          cart_json: cartJson,
          subtotal: Number(r[4]) || 0,
          vat: Number(r[5]) || 0,
          total: Number(r[6]) || 0,
          status: String(r[7] || "Pending").trim(),
          delivery_status: String(r[8] || "").trim(),
          image_url: String(r[9] || "").trim(),
          delivery_date: r[10] ? String(r[10]).trim() : ""
        };
        var inserted = supabaseInsert("orders", row);
        var newId = inserted && inserted[0] && inserted[0].id ? inserted[0].id : nextId++;
        sheetRowToOrderId[String(i + 2)] = newId;
      }
      log.push("주문: " + Object.keys(sheetRowToOrderId).length + "건");
    } else {
      log.push("주문: 시트 없음 또는 데이터 없음");
    }

    // 5. 재고 (시트명: 재고 또는 Stock)
    var stockSheet = ss.getSheetByName("재고") || ss.getSheetByName("Stock");
    Logger.log("재고 시트: " + (stockSheet ? "있음, 행수 " + stockSheet.getLastRow() : "없음"));
    if (stockSheet && stockSheet.getLastRow() >= 2) {
      var stData = stockSheet.getRange(2, 1, stockSheet.getLastRow(), 10).getValues();
      var stockRows = [];
      for (var i = 0; i < stData.length; i++) {
        var r = stData[i];
        if (!r[0] && !r[1]) continue;
        var logDate = r[5];
        var logDateIso = logDate && (logDate instanceof Date || typeof logDate === "object") ? new Date(logDate).toISOString() : new Date().toISOString();
        var orderId = null;
        if (r[8] !== undefined && r[8] !== null && r[8] !== "") {
          var sheetRow = String(Number(r[8]));
          if (sheetRowToOrderId[sheetRow]) orderId = sheetRowToOrderId[sheetRow];
        }
        stockRows.push({
          location: String(r[0] || "").trim(),
          item_code: String(r[1] || "").trim(),
          item_name: String(r[2] || "").trim(),
          spec: String(r[3] || "").trim(),
          qty: Number(r[4]) || 0,
          log_date: logDateIso,
          vendor_target: String(r[6] || "").trim(),
          log_type: String(r[7] || "").trim(),
          order_id: orderId,
          delivery_status: (r[9] !== undefined && r[9] !== null && r[9] !== "") ? String(r[9]).trim() : null
        });
      }
      if (stockRows.length > 0) {
        _insertChunk("stock_logs", stockRows, 100);
        log.push("재고: " + stockRows.length + "건");
      }
    } else {
      log.push("재고 시트 없음 또는 데이터 없음");
    }

    // 6. 직원정보 (시트명: 직원정보 또는 Users) — store+name 기준 upsert
    var empSheet = ss.getSheetByName("직원정보") || ss.getSheetByName("Users");
    Logger.log("직원정보 시트: " + (empSheet ? "있음, 행수 " + empSheet.getLastRow() : "없음"));
    if (empSheet && empSheet.getLastRow() >= 2) {
      var empLast = empSheet.getLastRow();
      var empCols = Math.max(15, 19);
      var eData = empSheet.getRange(2, 1, empLast, empCols).getValues();
      var empRows = [];
      for (var i = 0; i < eData.length; i++) {
        var r = eData[i];
        if (!r[0] && !r[1]) continue;
        var birthVal = r[5]; var joinVal = r[7]; var resignVal = r[8];
        var birthIso = (birthVal && (birthVal instanceof Date || typeof birthVal === "object")) ? new Date(birthVal).toISOString().slice(0, 10) : null;
        var joinIso = (joinVal && (joinVal instanceof Date || typeof joinVal === "object")) ? new Date(joinVal).toISOString().slice(0, 10) : null;
        var resignIso = (resignVal && (resignVal instanceof Date || typeof resignVal === "object")) ? new Date(resignVal).toISOString().slice(0, 10) : null;
        // 구글 시트 열 순서: 이메일(14열) → 연차수(15) → 은행명(16) → 계좌번호(17) → 직책수당(18) → 등급(19). 직원 사진(photo)은 별도
        empRows.push({
          store: String(r[0] || "").trim(),
          name: String(r[1] || "").trim(),
          nick: String(r[2] || "").trim(),
          phone: String(r[3] || "").trim(),
          job: String(r[4] || "").trim(),
          birth: birthIso,
          nation: String(r[6] || "").trim(),
          join_date: joinIso,
          resign_date: resignIso,
          sal_type: String(r[9] || "Monthly").trim(),
          sal_amt: Number(r[10]) || 0,
          password: String(r[11] || "").trim(),
          role: String(r[12] || "Staff").trim(),
          email: String(r[13] || "").trim(),
          annual_leave_days: (r[14] != null && r[14] !== "") ? Number(r[14]) : 15,
          bank_name: (r[15] != null ? String(r[15]).trim() : "") || "",
          account_number: (r[16] != null ? String(r[16]).trim() : "") || "",
          position_allowance: (r[17] != null && r[17] !== "") ? Number(r[17]) : 0,
          grade: (r[18] != null && r[18] !== "") ? String(r[18]).trim() : "",
          photo: ""  // 직원 사진 URL은 시트에 없으면 비움
        });
      }
      var empKey = {};
      for (var j = 0; j < empRows.length; j++) {
        var key = empRows[j].store + "\n" + empRows[j].name;
        empKey[key] = empRows[j];
      }
      var empRowsUnique = [];
      for (var k in empKey) empRowsUnique.push(empKey[k]);
      if (empRowsUnique.length > 0) {
        _upsertChunk("employees", empRowsUnique, 50, "store,name");
        log.push("직원정보: " + empRowsUnique.length + "건" + (empRows.length !== empRowsUnique.length ? " (중복 제거)" : ""));
      }
    } else {
      log.push("직원정보: 시트 없음 또는 데이터 없음");
    }

    // 7. 휴가신청
    var leaveSheet = ss.getSheetByName("휴가신청");
    Logger.log("휴가신청 시트: " + (leaveSheet ? "있음, 행수 " + leaveSheet.getLastRow() : "없음"));
    if (leaveSheet && leaveSheet.getLastRow() >= 2) {
      var lData = leaveSheet.getRange(2, 1, leaveSheet.getLastRow(), 7).getValues();
      var leaveRows = [];
      for (var i = 0; i < lData.length; i++) {
        var r = lData[i];
        if (!r[1] && !r[2]) continue;
        var reqAt = r[0] && (r[0] instanceof Date || typeof r[0] === "object") ? new Date(r[0]).toISOString() : new Date().toISOString();
        var leaveDateVal = r[4];
        var leaveDateStr = leaveDateVal && (leaveDateVal instanceof Date || typeof leaveDateVal === "object") ? new Date(leaveDateVal).toISOString().slice(0, 10) : String(leaveDateVal || "").trim().slice(0, 10);
        if (!leaveDateStr || leaveDateStr.length < 10) continue;
        leaveRows.push({
          request_at: reqAt,
          store: String(r[1] || "").trim(),
          name: String(r[2] || "").trim(),
          type: String(r[3] || "").trim(),
          leave_date: leaveDateStr,
          reason: String(r[5] || "").trim(),
          status: String(r[6] || "대기").trim()
        });
      }
      leaveRows = _dedupeByKey(leaveRows, "store,name,leave_date");
      if (leaveRows.length > 0) {
        _upsertChunk("leave_requests", leaveRows, 100, "store,name,leave_date");
        log.push("휴가신청: " + leaveRows.length + "건");
      }
    } else {
      log.push("휴가신청: 시트 없음 또는 데이터 없음");
    }

    // 7b. 공지사항
    var noticeSheet = ss.getSheetByName("공지사항");
    Logger.log("공지사항 시트: " + (noticeSheet ? "있음, 행수 " + noticeSheet.getLastRow() : "없음"));
    if (noticeSheet && noticeSheet.getLastRow() >= 2) {
      var nData = noticeSheet.getRange(2, 1, noticeSheet.getLastRow(), 8).getValues();
      var noticeRows = [];
      for (var i = 0; i < nData.length; i++) {
        var r = nData[i];
        var nId = r[0] != null ? Number(r[0]) : null;
        if (nId == null || isNaN(nId)) continue;
        var createdAt = (r[1] && (r[1] instanceof Date || typeof r[1] === "object")) ? new Date(r[1]).toISOString() : new Date().toISOString();
        noticeRows.push({
          id: nId,
          created_at: createdAt,
          title: String(r[2] || "").trim(),
          content: String(r[3] || "").trim(),
          target_store: String(r[4] || "전체").trim(),
          target_role: String(r[5] || "전체").trim(),
          sender: String(r[6] || "").trim(),
          attachments: (r[7] != null && r[7] !== "") ? String(r[7]).trim() : ""
        });
      }
      if (noticeRows.length > 0) {
        for (var ni = 0; ni < noticeRows.length; ni++) {
          try {
            supabaseInsert("notices", noticeRows[ni]);
          } catch (e) {
            Logger.log("공지사항 행 삽입 스킵(중복 등): " + e.message);
          }
        }
        log.push("공지사항: " + noticeRows.length + "건");
      }
    } else {
      log.push("공지사항: 시트 없음 또는 데이터 없음");
    }

    // 7c. 공지확인
    var readSheet = ss.getSheetByName("공지확인");
    Logger.log("공지확인 시트: " + (readSheet ? "있음, 행수 " + readSheet.getLastRow() : "없음"));
    if (readSheet && readSheet.getLastRow() >= 2) {
      var rdData = readSheet.getRange(2, 1, readSheet.getLastRow(), 5).getValues();
      var readRows = [];
      for (var i = 0; i < rdData.length; i++) {
        var r = rdData[i];
        var noticeId = r[0] != null ? Number(r[0]) : null;
        if (noticeId == null || isNaN(noticeId)) continue;
        var readAt = (r[3] && (r[3] instanceof Date || typeof r[3] === "object")) ? new Date(r[3]).toISOString() : new Date().toISOString();
        readRows.push({
          notice_id: noticeId,
          store: String(r[1] || "").trim(),
          name: String(r[2] || "").trim(),
          read_at: readAt,
          status: String(r[4] != null ? r[4] : "확인").trim()
        });
      }
      if (readRows.length > 0) {
        var readKey = {};
        for (var ri = 0; ri < readRows.length; ri++) {
          var key = readRows[ri].notice_id + "\n" + (readRows[ri].store || "") + "\n" + (readRows[ri].name || "");
          readKey[key] = readRows[ri];
        }
        var readRowsUnique = [];
        for (var rk in readKey) readRowsUnique.push(readKey[rk]);
        try {
          _upsertChunk("notice_reads", readRowsUnique, 50, "notice_id,store,name");
        } catch (e) {
          Logger.log("공지확인 upsert: " + e.message);
        }
        log.push("공지확인: " + readRowsUnique.length + "건" + (readRows.length !== readRowsUnique.length ? " (중복 " + (readRows.length - readRowsUnique.length) + "건 제거)" : ""));
      }
    } else {
      log.push("공지확인: 시트 없음 또는 데이터 없음");
    }

    // 7d. 업무일지_DB
    var workSheet = ss.getSheetByName("업무일지_DB");
    Logger.log("업무일지_DB 시트: " + (workSheet ? "있음, 행수 " + workSheet.getLastRow() : "없음"));
    if (workSheet && workSheet.getLastRow() >= 2) {
      var wData = workSheet.getRange(2, 1, workSheet.getLastRow(), 10).getValues();
      var workRows = [];
      for (var i = 0; i < wData.length; i++) {
        var r = wData[i];
        var wid = (r[0] != null && String(r[0]).trim() !== "") ? String(r[0]).trim() : null;
        if (!wid) continue;
        var logDateVal = r[1];
        var logDateStr = (logDateVal && (logDateVal instanceof Date || typeof logDateVal === "object")) ? new Date(logDateVal).toISOString().slice(0, 10) : String(logDateVal || "").trim().slice(0, 10);
        if (!logDateStr || logDateStr.length < 10) continue;
        workRows.push({
          id: wid,
          log_date: logDateStr,
          dept: String(r[2] || "").trim(),
          name: String(r[3] || "").trim(),
          content: String(r[4] || "").trim(),
          progress: Number(r[5]) || 0,
          status: String(r[6] != null ? r[6] : "Today").trim(),
          priority: String(r[7] != null ? r[7] : "").trim(),
          manager_check: String(r[8] != null ? r[8] : "대기").trim(),
          manager_comment: String(r[9] != null ? r[9] : "").trim()
        });
      }
      if (workRows.length > 0) {
        for (var wi = 0; wi < workRows.length; wi++) {
          try {
            supabaseInsert("work_logs", workRows[wi]);
          } catch (e) {
            Logger.log("업무일지 행 삽입 스킵: " + e.message);
          }
        }
        log.push("업무일지_DB: " + workRows.length + "건");
      }
    } else {
      log.push("업무일지_DB: 시트 없음 또는 데이터 없음");
    }

    // 7-2. 매장방문_DB (store_visits)
    var visitSheet = ss.getSheetByName("매장방문_DB");
    Logger.log("매장방문_DB 시트: " + (visitSheet ? "있음, 행수 " + visitSheet.getLastRow() : "없음"));
    if (visitSheet && visitSheet.getLastRow() >= 2) {
      var vData = visitSheet.getRange(2, 1, visitSheet.getLastRow(), 11).getValues();
      var visitRows = [];
      for (var i = 0; i < vData.length; i++) {
        var r = vData[i];
        if (!r[0] && !r[2] && !r[3]) continue;
        var dt = r[1];
        var dateStr = (dt && (dt instanceof Date || typeof dt === "object")) ? new Date(dt).toISOString().slice(0, 10) : String(dt || "").trim().slice(0, 10);
        if (!dateStr || dateStr.length < 10) dateStr = new Date().toISOString().slice(0, 10);
        var timeVal = r[6];
        var timeStr = "";
        if (timeVal instanceof Date) {
          timeStr = Utilities.formatDate(timeVal, Session.getScriptTimeZone() || "Asia/Bangkok", "HH:mm:ss");
        } else if (timeVal != null && String(timeVal).trim() !== "") {
          timeStr = String(timeVal).trim();
        }
        visitRows.push({
          id: String(r[0] || "").trim() || ("V" + Date.now() + "_" + i),
          visit_date: dateStr,
          name: String(r[2] || "").trim(),
          store_name: String(r[3] || "").trim(),
          visit_type: String(r[4] || "").trim(),
          purpose: String(r[5] || "").trim(),
          visit_time: timeStr,
          lat: String(r[7] != null ? r[7] : "").trim(),
          lng: String(r[8] != null ? r[8] : "").trim(),
          duration_min: Number(r[9]) || 0,
          memo: String(r[10] || "").trim()
        });
      }
      if (visitRows.length > 0) {
        for (var vi = 0; vi < visitRows.length; vi += 50) {
          var chunk = visitRows.slice(vi, vi + 50);
          try {
            for (var ci = 0; ci < chunk.length; ci++) {
              try {
                supabaseInsert("store_visits", chunk[ci]);
              } catch (insErr) {
                if (String(insErr.message).indexOf("duplicate") !== -1) continue;
                Logger.log("매장방문 행 삽입 스킵: " + insErr.message);
              }
            }
          } catch (e) {
            Logger.log("매장방문 배치 오류: " + e.message);
          }
        }
        log.push("매장방문_DB: " + visitRows.length + "건");
      }
    } else {
      log.push("매장방문_DB: 시트 없음 또는 데이터 없음");
    }

    // 8. 공휴일
    var holidaySheet = ss.getSheetByName("공휴일");
    Logger.log("공휴일 시트: " + (holidaySheet ? "있음, 행수 " + holidaySheet.getLastRow() : "없음"));
    if (holidaySheet && holidaySheet.getLastRow() >= 2) {
      var hData = holidaySheet.getRange(2, 1, holidaySheet.getLastRow(), 3).getValues();
      var holidayRows = [];
      for (var i = 0; i < hData.length; i++) {
        var r = hData[i];
        var y = parseInt(r[0], 10);
        if (!y) continue;
        var d = r[1];
        var dateStr = (d && (d instanceof Date || typeof d === "object")) ? new Date(d).toISOString().slice(0, 10) : String(d || "").trim().slice(0, 10);
        if (!dateStr || dateStr.length < 10) continue;
        holidayRows.push({ year: y, date: dateStr, name: String(r[2] || "").trim() || "-" });
      }
      holidayRows = _dedupeByKey(holidayRows, "year,date");
      if (holidayRows.length > 0) {
        _upsertChunk("public_holidays", holidayRows, 100, "year,date");
        log.push("공휴일: " + holidayRows.length + "건");
      }
    } else {
      log.push("공휴일: 시트 없음 또는 데이터 없음");
    }

    // 9. 근태기록
    var attSheet = ss.getSheetByName("근태기록") || ss.getSheetByName("근태 기록");
    Logger.log("근태기록 시트: " + (attSheet ? "있음, 행수 " + attSheet.getLastRow() : "없음"));
    if (attSheet && attSheet.getLastRow() >= 2) {
      var attData = attSheet.getRange(2, 1, attSheet.getLastRow(), 14).getValues();
      var attRows = [];
      for (var i = 0; i < attData.length; i++) {
        var r = attData[i];
        if (!r[1] && !r[2]) continue;
        var logAt = r[0] && (r[0] instanceof Date || typeof r[0] === "object") ? new Date(r[0]).toISOString() : new Date().toISOString();
        attRows.push({
          log_at: logAt,
          store_name: String(r[1] || "").trim(),
          name: String(r[2] || "").trim(),
          log_type: String(r[3] || "").trim(),
          lat: String(r[4] != null ? r[4] : "").trim(),
          lng: String(r[5] != null ? r[5] : "").trim(),
          planned_time: String(r[6] != null ? r[6] : "").trim(),
          late_min: Number(r[7]) || 0,
          early_min: Number(r[8]) || 0,
          ot_min: Number(r[9]) || 0,
          break_min: Number(r[10]) || 0,
          reason: String(r[11] || "").trim(),
          status: String(r[12] || "").trim(),
          approved: String(r[13] != null ? r[13] : "").trim()
        });
      }
      if (attRows.length > 0) {
        _insertChunk("attendance_logs", attRows, 100);
        log.push("근태기록: " + attRows.length + "건");
      }
    } else {
      log.push("근태기록: 시트 없음 또는 데이터 없음");
    }

    // 10. 직원시간표 (날짜는 시트 타임존 기준으로 저장 - toISOString() 사용 시 UTC로 하루 밀림)
    var schSheet = ss.getSheetByName("직원시간표") || ss.getSheetByName("직원 시간표");
    Logger.log("직원시간표 시트: " + (schSheet ? "있음, 행수 " + schSheet.getLastRow() : "없음"));
    var schTz = ss.getSpreadsheetTimeZone() || "Asia/Bangkok";
    if (schSheet && schSheet.getLastRow() >= 2) {
      var schData = schSheet.getRange(2, 1, schSheet.getLastRow(), 9).getValues();
      var schRows = [];
      for (var i = 0; i < schData.length; i++) {
        var r = schData[i];
        if (!r[0] && !r[1] && !r[2]) continue;
        var dt = r[0];
        var dateStr;
        if (dt && (dt instanceof Date || typeof dt === "object")) {
          try {
            dateStr = Utilities.formatDate(new Date(dt), schTz, "yyyy-MM-dd");
          } catch (e) {
            dateStr = String(dt).trim().slice(0, 10);
          }
        } else {
          dateStr = String(dt || "").trim().slice(0, 10);
        }
        if (!dateStr || dateStr.length < 10) continue;
        schRows.push({
          schedule_date: dateStr,
          store_name: String(r[1] || "").trim(),
          name: String(r[2] || "").trim(),
          plan_in: String(r[3] != null ? r[3] : "").trim(),
          plan_out: String(r[4] != null ? r[4] : "").trim(),
          break_start: String(r[5] != null ? r[5] : "").trim(),
          break_end: String(r[6] != null ? r[6] : "").trim(),
          memo: String(r[7] || "").trim()
        });
      }
      schRows = _dedupeByKey(schRows, "schedule_date,store_name,name");
      if (schRows.length > 0) {
        _upsertChunk("schedules", schRows, 100, "schedule_date,store_name,name");
        log.push("직원시간표: " + schRows.length + "건");
      }
    } else {
      log.push("직원시간표: 시트 없음 또는 데이터 없음");
    }

    // 11. 급여_DB (month, store, name 기준 upsert)
    var paySheet = ss.getSheetByName("급여_DB");
    Logger.log("급여_DB 시트: " + (paySheet ? "있음, 행수 " + paySheet.getLastRow() : "없음"));
    if (paySheet && paySheet.getLastRow() >= 2) {
      var payCols = 23;
      var payData = paySheet.getRange(2, 1, paySheet.getLastRow(), payCols).getValues();
      var payRows = [];
      for (var i = 0; i < payData.length; i++) {
        var r = payData[i];
        if (!r[1] && !r[2] && !r[3]) continue;
        var monthVal = r[1];
        var monthStr = monthVal && (monthVal instanceof Date || typeof monthVal === "object") ? new Date(monthVal).toISOString().slice(0, 7) : String(monthVal || "").trim().slice(0, 7);
        if (!monthStr || monthStr.length < 7) continue;
        payRows.push({
          month: monthStr,
          store: String(r[2] || "").trim(),
          name: String(r[3] || "").trim(),
          dept: String(r[4] || "").trim(),
          role: String(r[5] || "").trim(),
          salary: Number(r[6]) || 0,
          pos_allow: Number(r[7]) || 0,
          haz_allow: Number(r[8]) || 0,
          birth_bonus: Number(r[9]) || 0,
          holiday_pay: Number(r[10]) || 0,
          spl_bonus: Number(r[11]) || 0,
          ot_15: Number(r[12]) || 0,
          ot_20: Number(r[13]) || 0,
          ot_30: Number(r[14]) || 0,
          ot_amt: Number(r[15]) || 0,
          late_min: Number(r[16]) || 0,
          late_ded: Number(r[17]) || 0,
          sso: Number(r[18]) || 0,
          tax: Number(r[19]) || 0,
          other_ded: Number(r[20]) || 0,
          net_pay: Number(r[21]) || 0,
          status: String(r[22] != null ? r[22] : "확정").trim()
        });
      }
      if (payRows.length > 0) {
        _upsertChunk("payroll_records", payRows, 50, "month,store,name");
        log.push("급여_DB: " + payRows.length + "건");
      }
    } else {
      log.push("급여_DB: 시트 없음 또는 데이터 없음");
    }

    // 12. 점검항목
    var checkItemSheet = ss.getSheetByName("점검항목");
    if (checkItemSheet && checkItemSheet.getLastRow() >= 2) {
      var ciData = checkItemSheet.getRange(2, 1, checkItemSheet.getLastRow(), 5).getValues();
      var ciRows = [];
      for (var i = 0; i < ciData.length; i++) {
        var r = ciData[i];
        if (!r[0] && !r[3]) continue;
        ciRows.push({
          item_id: Number(r[0]) || (i + 1),
          main_cat: String(r[1] || "").trim(),
          sub_cat: String(r[2] || "").trim(),
          name: String(r[3] || "").trim(),
          use_flag: (r[4] === true || r[4] === 1 || r[4] === "1" || String(r[4]).toLowerCase() === "y" || String(r[4]).toLowerCase() === "true")
        });
      }
      if (ciRows.length > 0) {
        for (var ci = 0; ci < ciRows.length; ci++) {
          try { supabaseInsert("checklist_items", ciRows[ci]); } catch (ex) { if (String(ex.message).indexOf("duplicate") === -1) Logger.log("점검항목 " + ex.message); }
        }
        log.push("점검항목: " + ciRows.length + "건");
      }
    } else { log.push("점검항목: 시트 없음 또는 데이터 없음"); }

    // 13. 점검결과
    var checkResultSheet = ss.getSheetByName("점검결과");
    if (checkResultSheet && checkResultSheet.getLastRow() >= 2) {
      var crData = checkResultSheet.getRange(2, 1, checkResultSheet.getLastRow(), 7).getValues();
      var crRows = [];
      for (var i = 0; i < crData.length; i++) {
        var r = crData[i];
        if (!r[0]) continue;
        var d = r[1];
        var dateStr = (d && (d instanceof Date || typeof d === "object")) ? new Date(d).toISOString().slice(0, 10) : String(d || "").trim().slice(0, 10);
        if (!dateStr || dateStr.length < 10) continue;
        crRows.push({
          id: String(r[0]).trim(),
          check_date: dateStr,
          store_name: String(r[2] || "").trim(),
          inspector: String(r[3] || "").trim(),
          summary: String(r[4] || "").trim(),
          memo: String(r[5] || "").trim(),
          json_data: String(r[6] || "").trim()
        });
      }
      if (crRows.length > 0) {
        for (var cr = 0; cr < crRows.length; cr++) {
          try { supabaseInsert("check_results", crRows[cr]); } catch (ex) { if (String(ex.message).indexOf("duplicate") === -1) Logger.log("점검결과 " + ex.message); }
        }
        log.push("점검결과: " + crRows.length + "건");
      }
    } else { log.push("점검결과: 시트 없음 또는 데이터 없음"); }

    // 14. 컴플레인일지
    var compSheet = ss.getSheetByName("컴플레인일지");
    if (compSheet && compSheet.getLastRow() >= 2) {
      var compCols = Math.min(compSheet.getLastColumn(), 21);
      var compData = compSheet.getRange(2, 1, compSheet.getLastRow(), compCols).getValues();
      var compRows = [];
      for (var i = 0; i < compData.length; i++) {
        var r = compData[i];
        var dateVal = r[1] != null ? r[1] : r[0];
        var dateStr = (dateVal && (dateVal instanceof Date || typeof dateVal === "object")) ? new Date(dateVal).toISOString().slice(0, 10) : String(dateVal || "").trim().slice(0, 10);
        compRows.push({
          number: String(r[0] != null ? r[0] : "").trim(),
          log_date: dateStr && dateStr.length >= 10 ? dateStr : null,
          log_time: String(r[2] != null ? r[2] : "").trim(),
          store_name: String(r[3] != null ? r[3] : "").trim(),
          writer: String(r[4] != null ? r[4] : "").trim(),
          customer: String(r[5] != null ? r[5] : "").trim(),
          contact: String(r[6] != null ? r[6] : "").trim(),
          visit_path: String(r[7] != null ? r[7] : "").trim(),
          platform: String(r[8] != null ? r[8] : "").trim(),
          complaint_type: String(r[9] != null ? r[9] : "").trim(),
          menu: String(r[10] != null ? r[10] : "").trim(),
          title: String(r[11] != null ? r[11] : "").trim(),
          content: String(r[12] != null ? r[12] : "").trim(),
          severity: String(r[13] != null ? r[13] : "").trim(),
          action: String(r[14] != null ? r[14] : "").trim(),
          status: String(r[15] != null ? r[15] : "접수").trim(),
          handler: String(r[16] != null ? r[16] : "").trim(),
          done_date: r[17] && (r[17] instanceof Date || typeof r[17] === "object") ? new Date(r[17]).toISOString().slice(0, 10) : (String(r[17] || "").trim().slice(0, 10) || null),
          photo_url: String(r[18] != null ? r[18] : "").trim(),
          remark: String(r[19] != null ? r[19] : "").trim()
        });
      }
      if (compRows.length > 0) {
        _insertChunk("complaint_logs", compRows, 50);
        log.push("컴플레인일지: " + compRows.length + "건");
      }
    } else { log.push("컴플레인일지: 시트 없음 또는 데이터 없음"); }

    // 15. 메뉴권한
    var menuSheet = ss.getSheetByName("메뉴권한");
    if (menuSheet && menuSheet.getLastRow() >= 2) {
      var menuIds = ["dashboard", "notices", "work-log", "item-manage", "vendor-manage", "outbound", "stock", "inbound", "force", "hr-employee", "attendance-manage", "payroll", "hr-leave", "store-manage", "store-visit", "store-complaint", "settings"];
      var numCols = Math.max(menuSheet.getLastColumn(), 2 + menuIds.length * 2);
      var menuData = menuSheet.getRange(2, 1, menuSheet.getLastRow(), numCols).getValues();
      var menuRows = [];
      for (var i = 0; i < menuData.length; i++) {
        var r = menuData[i];
        var store = String(r[0] || "").trim();
        var name = String(r[1] || "").trim();
        if (!store || !name) continue;
        var perm = {};
        for (var k = 0; k < menuIds.length; k++) {
          var viewCol = 2 + k * 2;
          var editCol = 2 + k * 2 + 1;
          if (r[viewCol] === 1 || r[viewCol] === "1" || r[viewCol] === true) perm[menuIds[k] + "_view"] = 1;
          if (r[editCol] === 1 || r[editCol] === "1" || r[editCol] === true) perm[menuIds[k] + "_edit"] = 1;
        }
        menuRows.push({ store: store, name: name, permissions: JSON.stringify(perm) });
      }
      if (menuRows.length > 0) {
        var menuKey = {};
        for (var mi = 0; mi < menuRows.length; mi++) {
          var mk = (menuRows[mi].store || "") + "\n" + (menuRows[mi].name || "");
          menuKey[mk] = menuRows[mi];
        }
        var menuRowsUnique = [];
        for (var mj in menuKey) menuRowsUnique.push(menuKey[mj]);
        try {
          _upsertChunk("menu_permissions", menuRowsUnique, 50, "store,name");
          log.push("메뉴권한: " + menuRowsUnique.length + "건");
        } catch (e) {
          Logger.log("메뉴권한 upsert: " + e.message);
          log.push("메뉴권한: upsert 실패 - " + menuRows.length + "건 스킵");
        }
      }
    } else { log.push("메뉴권한: 시트 없음 또는 데이터 없음"); }

    // 16. 인보이스
    var invSheet = ss.getSheetByName("인보이스");
    if (invSheet && invSheet.getLastRow() >= 2) {
      var invData = invSheet.getRange(2, 1, invSheet.getLastRow(), 4).getValues();
      var invRows = [];
      for (var i = 0; i < invData.length; i++) {
        var r = invData[i];
        if (!r[0] && !r[3]) continue;
        var d = r[0];
        var dateStr = (d && (d instanceof Date || typeof d === "object")) ? new Date(d).toISOString().slice(0, 10) : String(d || "").trim().slice(0, 10);
        if (!dateStr) continue;
        invRows.push({
          inv_date: dateStr,
          target: String(r[1] || "").trim(),
          inv_type: String(r[2] || "Order").trim(),
          invoice_no: String(r[3] || "").trim()
        });
      }
      if (invRows.length > 0) {
        var invKey = {};
        for (var iv = 0; iv < invRows.length; iv++) {
          var k = (invRows[iv].inv_date || "") + "\n" + (invRows[iv].target || "") + "\n" + (invRows[iv].inv_type || "");
          invKey[k] = invRows[iv];
        }
        var invRowsUnique = [];
        for (var ik in invKey) invRowsUnique.push(invKey[ik]);
        try {
          _upsertChunk("invoices", invRowsUnique, 100, "inv_date,target,inv_type");
          log.push("인보이스: " + invRowsUnique.length + "건" + (invRows.length !== invRowsUnique.length ? " (중복 제거)" : ""));
        } catch (e) {
          Logger.log("인보이스 upsert: " + e.message);
          log.push("인보이스: upsert 실패(중복 등) - " + invRows.length + "건 스킵");
        }
      }
    } else { log.push("인보이스: 시트 없음 또는 데이터 없음"); }

    // 17. 평가항목_주방, 평가항목_서비스
    var evalTypes = [{ type: "kitchen", sheet: "평가항목_주방" }, { type: "service", sheet: "평가항목_서비스" }];
    for (var et = 0; et < evalTypes.length; et++) {
      var es = evalTypes[et];
      var evalItemSheet = ss.getSheetByName(es.sheet);
      if (evalItemSheet && evalItemSheet.getLastRow() >= 2) {
        var eiData = evalItemSheet.getRange(2, 1, evalItemSheet.getLastRow(), 5).getValues();
        var eiRows = [];
        for (var i = 0; i < eiData.length; i++) {
          var r = eiData[i];
          if (!r[0] && !r[3]) continue;
          var useVal = r[4];
          var useFlag = (useVal === true || useVal === 1 || useVal === "1" || String(useVal).toLowerCase() === "y" || String(useVal).toLowerCase() === "true");
          eiRows.push({
            eval_type: es.type,
            item_id: Number(r[0]) || (i + 1),
            main_cat: String(r[1] || "").trim(),
            sub_cat: String(r[2] || "").trim(),
            name: String(r[3] || "").trim(),
            use_flag: useFlag,
            sort_order: i
          });
        }
        if (eiRows.length > 0) {
          for (var ei = 0; ei < eiRows.length; ei++) {
            try { supabaseInsert("evaluation_items", eiRows[ei]); } catch (ex) { if (String(ex.message).indexOf("duplicate") === -1) Logger.log("평가항목 " + ex.message); }
          }
          log.push(es.sheet + ": " + eiRows.length + "건");
        }
      }
    }

    // 18. 평가결과_주방, 평가결과_서비스
    var resultSheets = [{ type: "kitchen", sheet: "평가결과_주방" }, { type: "service", sheet: "평가결과_서비스" }];
    for (var rs = 0; rs < resultSheets.length; rs++) {
      var res = resultSheets[rs];
      var resSheet = ss.getSheetByName(res.sheet);
      if (resSheet && resSheet.getLastRow() >= 2) {
        var resData = resSheet.getRange(2, 1, resSheet.getLastRow(), 8).getValues();
        var resRows = [];
        for (var i = 0; i < resData.length; i++) {
          var r = resData[i];
          if (!r[0]) continue;
          var d = r[1];
          var dateStr = (d && (d instanceof Date || typeof d === "object")) ? new Date(d).toISOString().slice(0, 10) : String(d || "").trim().slice(0, 10);
          if (!dateStr || dateStr.length < 10) continue;
          resRows.push({
            id: String(r[0]).trim(),
            eval_type: res.type,
            eval_date: dateStr,
            store_name: String(r[2] || "").trim(),
            employee_name: String(r[3] || "").trim(),
            evaluator: String(r[4] || "").trim(),
            final_grade: String(r[5] || "").trim(),
            memo: String(r[6] || "").trim(),
            json_data: String(r[7] || "").trim()
          });
        }
        if (resRows.length > 0) {
          for (var rr = 0; rr < resRows.length; rr++) {
            try { supabaseInsert("evaluation_results", resRows[rr]); } catch (ex) { if (String(ex.message).indexOf("duplicate") === -1) Logger.log("평가결과 " + ex.message); }
          }
          log.push(res.sheet + ": " + resRows.length + "건");
        }
      }
    }

    return "이전 완료:\n" + log.join("\n");
  } catch (e) {
    Logger.log("오류: " + e.message);
    Logger.log(e.stack || "");
    return "오류: " + e.message + "\n\n" + log.join("\n");
  }
}

/** 시트 내 중복 제거 (같은 키면 마지막 행만 유지). keys: "code" 또는 "store,name,leave_date" */
function _dedupeByKey(rows, keys) {
  if (!rows || rows.length === 0) return rows;
  var keyList = String(keys || "").split(",").map(function(k) { return k.trim(); }).filter(Boolean);
  var by = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var k = keyList.length === 0 ? "" : keyList.length === 1
      ? String(row[keyList[0]] != null ? row[keyList[0]] : "").trim()
      : keyList.map(function(key) { return String(row[key] != null ? row[key] : "").trim(); }).join("\t");
    if (k !== "") by[k] = row;
  }
  return Object.keys(by).map(function(k) { return by[k]; });
}

function _insertChunk(table, rows, chunkSize) {
  for (var i = 0; i < rows.length; i += chunkSize) {
    var chunk = rows.slice(i, i + chunkSize);
    try {
      supabaseInsertMany(table, chunk);
    } catch (e) {
      Logger.log(table + " 삽입 실패: " + e.message);
      throw e;
    }
  }
}

/** upsert 사용 (같은 키 있으면 갱신). onConflict 예: "store,code" */
function _upsertChunk(table, rows, chunkSize, onConflict) {
  for (var i = 0; i < rows.length; i += chunkSize) {
    var chunk = rows.slice(i, i + chunkSize);
    try {
      supabaseUpsertMany(table, chunk, onConflict);
    } catch (e) {
      Logger.log(table + " upsert 실패: " + e.message);
      throw e;
    }
  }
}

/**
 * 재고 시트(구글 시트) → Supabase stock_logs 전부 교체
 * 기존 stock_logs 전부 삭제 후, "재고" 시트 내용으로 다시 삽입.
 * GAS 편집기에서 syncStockFromSheetToSupabase() 실행.
 */
function syncStockFromSheetToSupabase() {
  var ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    Logger.log("getActiveSpreadsheet 실패: " + e.message);
  }
  if (!ss) {
    var sheetId = PropertiesService.getScriptProperties().getProperty("ERP_SPREADSHEET_ID");
    if (sheetId) {
      try {
        ss = SpreadsheetApp.openById(sheetId.trim());
      } catch (e2) {
        return "스프레드시트 열기 실패. ERP_SPREADSHEET_ID를 확인하세요.";
      }
    }
  }
  if (!ss) {
    return "스프레드시트를 찾을 수 없습니다. ERP_SPREADSHEET_ID를 설정하거나 시트를 연 상태에서 실행하세요.";
  }

  var stockSheet = ss.getSheetByName("재고") || ss.getSheetByName("Stock");
  if (!stockSheet || stockSheet.getLastRow() < 2) {
    return "재고(또는 Stock) 시트가 없거나 데이터가 없습니다.";
  }

  // 1) 기존 stock_logs 전부 삭제 (id로 한 건씩)
  var deleted = 0;
  var batchSize = 500;
  while (true) {
    var rows = supabaseSelect("stock_logs", { select: "id", limit: batchSize });
    if (!rows || rows.length === 0) break;
    for (var i = 0; i < rows.length; i++) {
      try {
        supabaseDelete("stock_logs", rows[i].id);
        deleted++;
      } catch (ex) {
        Logger.log("stock_logs 삭제 실패 id=" + rows[i].id + ": " + ex.message);
      }
    }
    if (rows.length < batchSize) break;
  }
  Logger.log("stock_logs 기존 " + deleted + "건 삭제 완료");

  // 2) 재고 시트에서 읽어서 삽입 (migrateSheetsToSupabase와 동일 구조)
  var sheetRowToOrderId = {};
  var orderSheet = ss.getSheetByName("주문") || ss.getSheetByName("Orders");
  if (orderSheet && orderSheet.getLastRow() >= 2) {
    var oData = orderSheet.getRange(2, 1, orderSheet.getLastRow(), 1).getValues();
    for (var oi = 0; oi < oData.length; oi++) {
      var oRow = orderSheet.getRange(oi + 2, 1, oi + 2, 12).getValues()[0];
      var sheetRow = String(oi + 2);
      var orderId = null;
      try {
        var existing = supabaseSelectFilter("orders", "id=eq." + encodeURIComponent(String(oRow[0] || "").trim()), { limit: 1 });
        if (existing && existing.length > 0) orderId = existing[0].id;
      } catch (e) {}
      if (orderId) sheetRowToOrderId[sheetRow] = orderId;
    }
  }

  var stData = stockSheet.getRange(2, 1, stockSheet.getLastRow(), 10).getValues();
  var stockRows = [];
  for (var i = 0; i < stData.length; i++) {
    var r = stData[i];
    if (!r[0] && !r[1]) continue;
    var logDate = r[5];
    var logDateIso = logDate && (logDate instanceof Date || typeof logDate === "object") ? new Date(logDate).toISOString() : new Date().toISOString();
    var orderId = null;
    if (r[8] !== undefined && r[8] !== null && r[8] !== "") {
      var sheetRow = String(Number(r[8]));
      if (sheetRowToOrderId[sheetRow]) orderId = sheetRowToOrderId[sheetRow];
    }
    stockRows.push({
      location: String(r[0] || "").trim(),
      item_code: String(r[1] || "").trim(),
      item_name: String(r[2] || "").trim(),
      spec: String(r[3] || "").trim(),
      qty: Number(r[4]) || 0,
      log_date: logDateIso,
      vendor_target: String(r[6] || "").trim(),
      log_type: String(r[7] || "").trim(),
      order_id: orderId,
      delivery_status: (r[9] !== undefined && r[9] !== null && r[9] !== "") ? String(r[9]).trim() : null
    });
  }
  if (stockRows.length === 0) {
    return "재고 시트에서 읽은 데이터가 없습니다. (삭제는 완료됨: " + deleted + "건)";
  }
  _insertChunk("stock_logs", stockRows, 100);
  Logger.log("재고 시트 → stock_logs " + stockRows.length + "건 삽입 완료");
  return "완료: 기존 " + deleted + "건 삭제, 재고 시트 " + stockRows.length + "건 삽입.";
}
