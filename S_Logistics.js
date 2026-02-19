/* =================================================================
   물류 관리: 품목, 거래처, 재고, 주문
   ================================================================= */

/* =================================================================
   품목/거래처
   ================================================================= */   

   /* [Code.gs] 품목 조회 (Supabase items) */
function getAdminItemsList() {
  try {
    var rows = supabaseSelect('items', { order: 'id.asc' });
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      list.push({
        row: r.id,
        code: r.code,
        category: r.category || '',
        name: r.name,
        spec: r.spec || '',
        price: r.price,
        cost: r.cost,
        image: r.image || '',
        vendor: r.vendor || '',
        tax: (r.tax === '면세') ? '면세' : '과세',
        outbound_location: r.outbound_location || ''
      });
    }
    return list;
  } catch (e) {
    Logger.log('getAdminItemsList: ' + e.message);
    return [];
  }
}

/* [Code.gs] 품목 저장 (Supabase items) */
function saveAdminItem(data) {
  try {
    var rowId = Number(data.row);
    var taxVal = (data.tax === '면세') ? '면세' : '과세';
    var payload = {
      code: String(data.code || '').trim(),
      category: String(data.category || '').trim(),
      name: String(data.name || '').trim(),
      spec: String(data.spec || '').trim(),
      price: Number(data.price) || 0,
      cost: Number(data.cost) || 0,
      tax: taxVal,
      outbound_location: String(data.outbound_location || '').trim()
    };
    if (rowId === 0) {
      payload.image = String(data.image || '').trim();
      payload.vendor = String(data.vendor || '').trim();
      supabaseInsert('items', payload);
      return "✅ 저장 완료 (" + taxVal + ")";
    }
    supabaseUpdate('items', rowId, payload);
    return "✅ 저장 완료 (" + taxVal + ")";
  } catch (e) {
    return "❌ 오류: " + e.message;
  }
}

function deleteAdminItem(row) {
  try {
    var id = Number(row);
    if (!id) return "❌ 잘못된 행 번호";
    supabaseDelete('items', id);
    return "🗑️ 삭제 완료";
  } catch (e) {
    return "❌ 오류: " + e.message;
  }
}

/* [최종 수정] 앱 품목 조회 (칸 수 상관없이 무조건 작동하는 버전) */
function getItems(storeName) {
  return getItemsInner(storeName);
}

function getItemsInner(storeName) {
  try {
    var items = supabaseSelect('items', { order: 'id.asc' });
    var safeMap = {};
    if (storeName) {
      var storeNorm = String(storeName).toLowerCase().trim();
      var settings = supabaseSelectFilter('store_settings', "store=ilike." + encodeURIComponent(storeNorm));
      for (var i = 0; i < settings.length; i++) {
        safeMap[String(settings[i].code)] = Number(settings[i].safe_qty) || 0;
      }
    }
    var list = [];
    for (var i = 0; i < items.length; i++) {
      var row = items[i];
      if (!row || !row.code) continue;
      var taxType = (row.tax === '면세') ? '면세' : '과세';
      list.push([
        row.code, row.category, row.name, row.spec || '',
        Number(row.price) || 0, Number(row.cost) || 0,
        row.image || '', '', safeMap[row.code] || 0, taxType
      ]);
    }
    return list;
  } catch (e) {
    Logger.log('getItemsInner: ' + e.message);
    return [];
  }
}

/* [Code.gs] ★ 만능 품목 데이터 조회 (Supabase items) */
function getCommonItemData() {
  try {
    var rows = supabaseSelect('items', { order: 'id.asc' });
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      list.push({
        code: String(row.code),
        category: String(row.category || ''),
        name: String(row.name || ''),
        spec: String(row.spec || ''),
        price: Number(row.price) || 0,
        cost: Number(row.cost) || 0,
        img: String(row.image || ''),
        tax: (row.tax === '면세') ? '면세' : '과세'
      });
    }
    return list;
  } catch (e) {
    Logger.log('getCommonItemData: ' + e.message);
    return [];
  }
}

function getItemCategories() {
  try {
    var rows = supabaseSelect('items', { select: 'category' });
    var unique = {};
    for (var i = 0; i < rows.length; i++) {
      var c = rows[i].category;
      if (c && String(c).trim()) unique[String(c).trim()] = true;
    }
    return Object.keys(unique).sort();
  } catch (e) {
    return [];
  }
}

/* [Code.gs] 거래처 목록 조회 (Supabase vendors) */
function getVendorManagementList() {
  try {
    var rows = supabaseSelect('vendors', { order: 'id.asc' });
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.code && !r.name) continue;
      list.push({
        row: r.id,
        type: String(r.type || ''),
        code: String(r.code || ''),
        name: String(r.name || ''),
        taxId: String(r.tax_id || ''),
        ceo: String(r.ceo || ''),
        addr: String(r.addr || ''),
        manager: String(r.manager || ''),
        phone: String(r.phone || ''),
        balance: Number(r.balance) || 0,
        memo: String(r.memo || '')
      });
    }
    return list;
  } catch (e) {
    Logger.log('getVendorManagementList: ' + e.message);
    return [];
  }
}

function saveVendor(d) {
  try {
    var rowId = Number(d.row);
    var payload = {
      type: String(d.type || '').trim(),
      code: String(d.code || '').trim(),
      name: String(d.name || '').trim(),
      tax_id: String(d.taxId || '').trim(),
      ceo: String(d.ceo || '').trim(),
      addr: String(d.addr || '').trim(),
      manager: String(d.manager || '').trim(),
      phone: String(d.phone || '').trim(),
      balance: Number(d.balance) || 0,
      memo: String(d.memo || '').trim()
    };
    if (rowId === 0) {
      var existing = supabaseSelectFilter('vendors', "code=eq." + encodeURIComponent(payload.code));
      if (payload.code && existing && existing.length > 0) return "❌ 이미 존재하는 거래처 코드입니다.";
      supabaseInsert('vendors', payload);
      return "✅ 신규 거래처 등록 완료";
    }
    supabaseUpdate('vendors', rowId, payload);
    return "✅ 거래처 정보 수정 완료";
  } catch (e) {
    return "❌ 오류: " + e.message;
  }
}

function deleteVendor(row) {
  try {
    var id = Number(row);
    if (!id) return "❌ 잘못된 행 번호";
    supabaseDelete('vendors', id);
    return "🗑️ 삭제 완료";
  } catch (e) {
    return "❌ 오류: " + e.message;
  }
}

/* [Code.gs] 거래처 목록 가져오기 (캐시 적용 - 속도 🚀) */
function getVendorNamesByType(type) {
  // 1. 캐시(임시 저장소) 확인
  var cache = CacheService.getScriptCache();
  var cachedData = cache.get("vendor_list_" + type);
  
  // 2. 캐시에 있으면 그거 바로 줌
  if (cachedData != null) {
    return JSON.parse(cachedData);
  }

  // 3. Supabase vendors에서 type별 목록
  var list = [];
  try {
    var rows = supabaseSelectFilter("vendors", "type=eq." + encodeURIComponent(type), { limit: 2000 });
    for (var i = 0; i < (rows || []).length; i++) {
      var rowName = String(rows[i].name || "").trim();
      if (rowName !== "") list.push(rowName);
    }
  } catch (e) {
    Logger.log("getVendorListByType: " + e.message);
  }

  cache.put("vendor_list_" + type, JSON.stringify(list), 21600);
  return list;
}

// 1. 매출처(판매처) 목록만 가져오기 (Supabase vendors)
function getSalesVendorList() {
  var list = [];
  try {
    var rows = supabaseSelectFilter("vendors", "type=eq.매출처", { limit: 2000 });
    if (!rows || rows.length === 0) rows = supabaseSelectFilter("vendors", "type=eq.Sales", { limit: 2000 });
    for (var i = 0; i < (rows || []).length; i++) {
      var name = String(rows[i].name || "").trim();
      if (name) list.push(name);
    }
  } catch (e) {
    Logger.log("getSalesVendorList: " + e.message);
  }
  return list;
}

/* =================================================================
   재고/주문
   ================================================================= */  

/* [C] 앱(Page) 기능 */
function getStoreStock(store) {
  try {
    var storeNorm = String(store).toLowerCase().trim();
    var rows = supabaseSelectFilter('stock_logs', "location=ilike." + encodeURIComponent(storeNorm));
    var m = {};
    for (var i = 0; i < rows.length; i++) {
      var code = rows[i].item_code;
      if (!code) continue;
      m[code] = (m[code] || 0) + Number(rows[i].qty);
    }
    return m;
  } catch (e) {
    Logger.log('getStoreStock: ' + e.message);
    return {};
  }
}

function processOrder(data) {
  try {
    var sub = 0;
    data.cart.forEach(function(i) { sub += Number(i.price) * Number(i.qty); });
    var vat = Math.round(sub * 0.07);
    var total = sub + vat;
    supabaseInsert('orders', {
      order_date: new Date().toISOString(),
      store_name: data.storeName,
      user_name: data.userName,
      cart_json: JSON.stringify(data.cart),
      subtotal: sub,
      vat: vat,
      total: total,
      status: 'Pending'
    });
    return "✅ 주문 완료";
  } catch (e) {
    return "❌ 오류: " + e.message;
  }
}

function processUsage(data) {
  try {
    var now = new Date().toISOString();
    var userName = String(data.userName || data.user_name || '').trim();
    var rows = [];
    (data.items || []).forEach(function(k) {
      var row = {
        location: data.storeName,
        item_code: k.code,
        item_name: k.name || '',
        spec: 'Usage',
        qty: -Number(k.qty),
        log_date: now,
        vendor_target: 'Store',
        log_type: 'Usage'
      };
      if (userName) row.user_name = userName;
      rows.push(row);
    });
    if (rows.length) supabaseInsertMany('stock_logs', rows);
    return "✅ 출고 등록 완료";
  } catch (e) {
    return "❌ 오류: " + e.message;
  }
}

function processOrderDecision(row, decision, updatedCart, deliveryDate, rejectReason) {
  try {
    var orderId = Number(row);
    var orders = supabaseSelectFilter('orders', "id=eq." + orderId);
    if (!orders || orders.length === 0) return "ord_invalid_row";
    var o = orders[0];
    if (o.status === "Approved") return "ord_already_approved";
    var patch = { status: decision };
    if (decision === "Rejected" && rejectReason && String(rejectReason).trim()) patch.reject_reason = String(rejectReason).trim();
    if (updatedCart) {
      var newSub = 0;
      updatedCart.forEach(function(i) { newSub += Number(i.price) * Number(i.qty); });
      patch.cart_json = JSON.stringify(updatedCart);
      patch.subtotal = newSub;
      patch.vat = Math.round(newSub * 0.07);
      patch.total = newSub + patch.vat;
    }
    if (decision === "Approved") {
      patch.delivery_status = "배송중";
      if (deliveryDate && String(deliveryDate).trim()) patch.delivery_date = String(deliveryDate).trim();
    }
    supabaseUpdate('orders', orderId, patch);
    if (decision === "Approved") {
      var finalCart = updatedCart ? updatedCart : JSON.parse(o.cart_json || "[]");
      var today = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
      var stockRows = [];
      finalCart.forEach(function(item) {
        stockRows.push({
          location: "본사",
          item_code: item.code,
          item_name: item.name || "",
          spec: item.spec || "-",
          qty: -Number(item.qty),
          log_date: today,
          vendor_target: o.store_name,
          log_type: "Outbound",
          order_id: orderId,
          delivery_status: "배송중"
        });
      });
      if (stockRows.length) supabaseInsertMany('stock_logs', stockRows);
      return "ord_approve_done";
    }
    if (decision === "Hold") return "ord_processed_hold";
    if (decision === "Rejected") return "ord_processed_rejected";
    return "ord_processed_hold";
  } catch (e) {
    return "❌ 오류: " + e.message;
  }
}

/** 승인된 주문의 배송 일자만 변경 */
function updateOrderDeliveryDate(row, deliveryDate) {
  try {
    var orderId = Number(row);
    if (!orderId) return "ord_invalid_row";
    if (!deliveryDate || String(deliveryDate).trim() === "") return "ord_delivery_required";
    var orders = supabaseSelectFilter('orders', "id=eq." + orderId);
    if (!orders || orders.length === 0) return "ord_invalid_row";
    if (orders[0].status !== "Approved") return "ord_only_approved_change";
    supabaseUpdate('orders', orderId, { delivery_date: String(deliveryDate).trim() });
    return "ord_delivery_updated";
  } catch (e) {
    return "❌ 오류: " + e.message;
  }
}

/** 매장 수령 처리: 승인된 주문에 대해 매장 재고 증가 + 상태 '배송완료'. 사진(base64) 선택 시 Drive 저장 후 URL 저장 */
function processOrderReceive(orderRowId, imageBase64) {
  try {
    var orderId = Number(orderRowId);
    if (!orderId) return "❌ 잘못된 주문 번호입니다.";
    var orders = supabaseSelectFilter('orders', "id=eq." + orderId);
    if (!orders || orders.length === 0) return "❌ 해당 주문이 없습니다.";
    var o = orders[0];
    if (o.status !== "Approved") return "❌ 승인된 주문만 수령 처리할 수 있습니다.";
    if (o.delivery_status === "배송완료") return "❌ 이미 수령 완료된 주문입니다.";
    var cart = [];
    try { cart = JSON.parse(o.cart_json || "[]"); } catch (e) { }
    if (!cart || cart.length === 0) return "❌ 주문 품목이 없습니다.";
    var store = o.store_name;
    var today = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd");
    var imageUrl = "";
    if (imageBase64 && String(imageBase64).length > 50) {
      try {
        var raw = String(imageBase64).trim();
        var base64Data = raw.toLowerCase().indexOf("base64,") !== -1 ? raw.slice(raw.toLowerCase().indexOf("base64,") + 7) : raw.replace(/^data:image\/[^;]+;base64,?/i, "");
        base64Data = base64Data.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
        var pad = base64Data.length % 4;
        if (pad > 0) base64Data += "====".slice(0, 4 - pad);
        var decoded = Utilities.base64Decode(base64Data);
        if (decoded && decoded.length >= 10) {
          var blob = Utilities.newBlob(decoded, "image/jpeg", "receive_" + orderId + "_" + new Date().getTime() + ".jpg");
          var folders = DriveApp.getFoldersByName("ERP_ReceivePhotos");
          var folder = folders.hasNext() ? folders.next() : DriveApp.getRootFolder().createFolder("ERP_ReceivePhotos");
          imageUrl = folder.createFile(blob).getUrl();
        }
      } catch (err) {
        if (String(imageBase64).indexOf("data:image") === 0) imageUrl = String(imageBase64).trim();
      }
    }
    var inboundRows = [];
    cart.forEach(function(item) {
      inboundRows.push({
        location: store,
        item_code: item.code,
        item_name: item.name || "",
        spec: item.spec || "-",
        qty: Number(item.qty),
        log_date: today,
        vendor_target: "From HQ",
        log_type: "Inbound"
      });
    });
    if (inboundRows.length) supabaseInsertMany('stock_logs', inboundRows);
    supabaseUpdateByFilter('stock_logs', "order_id=eq." + orderId, { delivery_status: "배송완료" });
    var patch = { delivery_status: "배송완료" };
    if (imageUrl) patch.image_url = imageUrl;
    supabaseUpdate('orders', orderId, patch);
    if (imageBase64 && String(imageBase64).length > 50 && !imageUrl) return "완료되었습니다. (사진 저장 실패)";
    return "완료되었습니다.";
  } catch (e) {
    return "❌ 오류: " + e.message;
  }
}

/* [수정됨] 주문 승인 조회 (Supabase orders + items) */
function getAdminOrders(startStr, endStr) {
  try {
    var itemList = getCommonItemData();
    var taxMap = {}, specByCode = {}, specByName = {};
    for (var k = 0; k < itemList.length; k++) {
      var it = itemList[k];
      taxMap[it.name] = it.tax;
      specByCode[it.code] = it.spec || "-";
      specByName[it.name] = it.spec || "-";
    }
    var officeStock = getStoreStock("본사");
    if (Object.keys(officeStock).length === 0) officeStock = getStoreStock("Office");
    var endIso = endStr + "T23:59:59.999Z";
    var filter = "order_date=gte." + encodeURIComponent(startStr) + "&order_date=lte." + encodeURIComponent(endIso);
    var orderRows = supabaseSelectFilter('orders', filter, { order: 'order_date.desc', limit: 300 });
    var list = [];
    for (var i = 0; i < orderRows.length; i++) {
      var o = orderRows[i];
      var dateVal = o.order_date;
      var dateStr = dateVal ? dateVal.substring(0, 10) : "";
      var rawJson = o.cart_json;
      var items = [];
      var calcTotal = 0;
      try {
        if (rawJson) {
          var cart = JSON.parse(rawJson);
          items = cart.map(function(p) {
            var code = String(p.code || "").trim();
            var name = String(p.name || "").trim();
            var spec = specByCode[code] || specByName[name] || p.spec || "-";
            var tType = taxMap[name] || "과세";
            var tRate = (tType === "과세") ? 1.07 : 1.0;
            var lTotal = Number(p.price) * Number(p.qty) * tRate;
            calcTotal += lTotal;
            return { code: code, name: name, spec: spec, qty: p.qty, price: p.price, taxType: tType, lineTotal: lTotal };
          });
        }
      } catch (e) { }
      var summary = items.length > 0 ? items[0].name + (items.length > 1 ? " 외 " + (items.length - 1) + "건" : "") : "내용 없음";
      var finalTotal = items.length > 0 ? calcTotal : (Number(o.total) || 0);
      if (finalTotal > 100000000) finalTotal = 0;
      list.push({
        row: o.id,
        orderId: o.id,
        date: dateVal ? (dateVal.substring(0, 16).replace("T", " ") + " (KST)") : "",
        store: o.store_name,
        total: Math.round(finalTotal),
        status: o.status || "Pending",
        items: items,
        summary: summary,
        deliveryDate: (o.delivery_date || "").trim()
      });
    }
    return { list: list, officeStock: officeStock };
  } catch (e) {
    Logger.log('getAdminOrders: ' + e.message);
    return { list: [], officeStock: {} };
  }
}

/** Delivery Note/Tax Invoice 인쇄용 회사 정보 (Supabase vendors type=본사) */
function getInvoiceCompanyInfo() {
  try {
    var v = supabaseSelectFilter('vendors', "type=eq.본사");
    if (!v || v.length === 0) v = supabaseSelectFilter('vendors', "type=eq.Head Office");
    if (v && v.length > 0) {
      var r = v[0];
      return {
        companyName: String(r.name || "บริษัท เอสแอนด์เจ โกลบอล จำกัด (Head Office)").trim(),
        address: String(r.addr || "").trim() || "-",
        taxId: String(r.tax_id || "0105566137147").trim(),
        phone: String(r.phone || "091-072-6252").trim(),
        bankInfo: String(r.memo || "ธนาคารกสิกรไทย เลขที่ 166-2-97079-0 ชื่อบัญชี บจก. เอสแอนด์เจ โกลบอล").trim(),
        projectName: "CM True Digital Park"
      };
    }
  } catch (e) { }
  return {
    companyName: "บริษัท เอสแอนด์เจ โกลบอล จำกัด (Head Office)",
    address: "-",
    taxId: "0105566137147",
    phone: "091-072-6252",
    bankInfo: "ธนาคารกสิกรไทย เลขที่ 166-2-97079-0 ชื่อบัญชี บจก. เอสแอนด์เจ โกลบอล",
    projectName: "CM True Digital Park"
  };
}

/** 설정 페이지: 본사 정보 저장 (Supabase vendors: type='본사' 행 추가/수정, 인보이스 발행용) */
function saveHeadOfficeInfoToSheet(d) {
  try {
    var companyName = String(d.companyName || "").trim() || "본사";
    var taxId = String(d.taxId || "").trim();
    var address = String(d.address || "").trim();
    var phone = String(d.phone || "").trim();
    var bankInfo = String(d.bankInfo || "").trim();
    var existing = supabaseSelectFilter('vendors', "type=eq.본사");
    if (!existing) existing = supabaseSelectFilter('vendors', "type=eq.Head Office");
    var payload = { type: "본사", code: "", name: companyName, tax_id: taxId, addr: address, phone: phone, memo: bankInfo };
    if (existing && existing.length > 0) {
      supabaseUpdate('vendors', existing[0].id, payload);
      return "✅ 본사 정보가 수정되었습니다.";
    }
    supabaseInsert('vendors', payload);
    return "✅ 본사 정보가 등록되었습니다.";
  } catch (e) {
    return "❌ 오류: " + e.message;
  }
}

var _menuPermissionMenuIds = ["dashboard", "notices", "work-log", "item-manage", "vendor-manage", "outbound", "stock", "inbound", "force", "hr-employee", "attendance-manage", "payroll", "hr-leave", "petty-cash", "store-manage", "store-visit", "store-complaint", "settings"];

/** 메뉴권한 시트 헤더: 매장, 이름, 각 메뉴별 _view, _edit 컬럼 */
function _menuPermissionHeaders() {
  var h = ["매장", "이름"];
  _menuPermissionMenuIds.forEach(function(id) {
    h.push(id + "_view", id + "_edit");
  });
  return h;
}

function _ensureMenuPermissionSheet() {
  return null;
}

/** 메뉴별 권한 조회 (Supabase menu_permissions) */
function getMenuPermission(store, name) {
  var storeTrim = String(store || "").trim();
  var nameTrim = String(name || "").trim();
  if (!storeTrim || !nameTrim) return {};
  try {
    var rows = supabaseSelectFilter("menu_permissions", "store=eq." + encodeURIComponent(storeTrim) + "&name=eq." + encodeURIComponent(nameTrim), { limit: 1 });
    if (rows && rows.length > 0 && rows[0].permissions) {
      var p = rows[0].permissions;
      if (typeof p === "string") {
        try { return JSON.parse(p) || {}; } catch (e) { return {}; }
      }
      return p || {};
    }
  } catch (e) {
    Logger.log("getMenuPermission: " + e.message);
  }
  return {};
}

/** 메뉴별 권한 저장 (Supabase menu_permissions) */
function setMenuPermission(store, name, perm) {
  var storeTrim = String(store || "").trim();
  var nameTrim = String(name || "").trim();
  if (!storeTrim || !nameTrim) return "매장과 이름을 입력해 주세요.";
  var headers = _menuPermissionHeaders();
  var out = {};
  for (var c = 2; c < headers.length; c++) {
    if (perm && perm[headers[c]]) out[headers[c]] = 1;
  }
  try {
    supabaseUpsertMany("menu_permissions", [{ store: storeTrim, name: nameTrim, permissions: JSON.stringify(out) }], "store,name");
    return "✅ 메뉴 권한이 저장되었습니다.";
  } catch (e) {
    return "저장 실패: " + e.message;
  }
}

/** 인보이스 인쇄용: 본사 정보 + 매출처(회사명별) 정보 한 번에 반환 (Supabase vendors) */
function getInvoiceData() {
  var company = getInvoiceCompanyInfo();
  var clients = {};
  try {
    var rows = supabaseSelectFilter("vendors", "type=eq.매출처", { limit: 500 });
    if (!rows || rows.length === 0) rows = supabaseSelectFilter("vendors", "type=eq.Sales", { limit: 500 });
    for (var i = 0; i < (rows || []).length; i++) {
      var r = rows[i];
      var name = String(r.name || "").trim();
      if (!name) continue;
      clients[name] = {
        companyName: name,
        address: String(r.addr || "").trim() || "-",
        taxId: String(r.tax_id || "").trim() || "-",
        phone: String(r.phone || "").trim() || "-"
      };
    }
  } catch (e) {
    Logger.log("getInvoiceData: " + e.message);
  }
  return { company: company, clients: clients };
}

function ensureInvoiceSheet() {
  return null;
}

/** 인보이스 번호 생성/조회 (Supabase invoices). IV + yyyyMMdd + 2자리 순번. */
function getOrCreateInvoiceNo(dateStr, target, type) {
  if (!dateStr || !target) return "IV-";
  var datePart = String(dateStr).replace(/\D/g, "").slice(0, 8);
  if (datePart.length !== 8) return "IV-";
  var typeVal = (String(type).indexOf("강제") !== -1 || type === "Force") ? "Force" : "Order";
  var targetStr = String(target).trim();
  var dateNorm = String(dateStr).trim().slice(0, 10);
  try {
    var existing = supabaseSelectFilter("invoices", "inv_date=eq." + encodeURIComponent(dateNorm) + "&target=eq." + encodeURIComponent(targetStr) + "&inv_type=eq." + encodeURIComponent(typeVal), { limit: 1 });
    if (existing && existing.length > 0 && existing[0].invoice_no && String(existing[0].invoice_no).indexOf("IV") === 0) {
      return String(existing[0].invoice_no);
    }
  } catch (e) {}
  var prefix = "IV" + datePart;
  var maxSeq = 0;
  try {
    var list = supabaseSelectFilter("invoices", "inv_date=eq." + encodeURIComponent(dateNorm), { limit: 500 });
    var re = new RegExp("^IV" + datePart + "(\\d{2,5})$");
    for (var j = 0; j < list.length; j++) {
      var inv = String(list[j].invoice_no || "").trim();
      var m = inv.match(re);
      if (m) {
        var seq = parseInt(m[1], 10);
        if (seq > maxSeq) maxSeq = seq;
      }
    }
  } catch (e) {}
  var newNo = prefix + String(maxSeq + 1).padStart(2, "0");
  try {
    supabaseInsert("invoices", { inv_date: dateNorm, target: targetStr, inv_type: typeVal, invoice_no: newNo });
  } catch (e) {
    if (String(e.message).indexOf("duplicate") !== -1) {
      var ex2 = supabaseSelectFilter("invoices", "inv_date=eq." + encodeURIComponent(dateNorm) + "&target=eq." + encodeURIComponent(targetStr) + "&inv_type=eq." + encodeURIComponent(typeVal), { limit: 1 });
      if (ex2 && ex2.length > 0) return String(ex2[0].invoice_no);
    }
  }
  return newNo;
}

/* 1. 재고 현황 조회 (매장별 적정재고 포함해서 전송) */
function getStockStatusAdmin(s, d) {
  try {
    var items = supabaseSelect('items', { order: 'id.asc' });
    var safeMap = {};
    var storeNorm = String(s).toLowerCase().trim();
    var settings = supabaseSelectFilter('store_settings', "store=ilike." + encodeURIComponent(storeNorm));
    for (var k = 0; k < settings.length; k++) {
      safeMap[String(settings[k].code)] = Number(settings[k].safe_qty) || 0;
    }
    var td = d ? new Date(d) : new Date();
    td.setHours(23, 59, 59, 999);
    var cutoff = td.toISOString();
    var allLogs = supabaseSelect('stock_logs', { order: 'log_date.asc', limit: 10000 });
    var sm = {};
    var hq = (storeNorm === "본사" || storeNorm === "office");
    for (var i = 0; i < allLogs.length; i++) {
      var log = allLogs[i];
      var ld = new Date(log.log_date);
      if (ld > td) continue;
      var rsLower = String(log.location || "").toLowerCase().trim();
      var c = log.item_code;
      var q = Number(log.qty);
      if (hq) { if (rsLower === "본사" || rsLower === "office") sm[c] = (sm[c] || 0) + q; }
      else { if (rsLower === storeNorm) sm[c] = (sm[c] || 0) + q; }
    }
    return items.map(function(i) {
      var q = sm[i.code] || 0;
      var cost = Number(i.cost) || 0;
      return { code: i.code, category: i.category, name: i.name, spec: i.spec || "-", cost: cost, qty: q, total: q * cost, img: i.image || "", safe: safeMap[i.code] || 0 };
    });
  } catch (e) {
    Logger.log('getStockStatusAdmin: ' + e.message);
    return [];
  }
}

/* 2. 매장별 적정재고 저장 (Supabase store_settings) */
function saveStoreSafetyStock(store, code, qty) {
  try {
    var storeNorm = String(store).trim();
    var existing = supabaseSelectFilter('store_settings', "store=eq." + encodeURIComponent(storeNorm) + "&code=eq." + encodeURIComponent(String(code)));
    var safeQty = Number(qty) || 0;
    if (existing && existing.length > 0) {
      supabaseUpdate('store_settings', existing[0].id, { safe_qty: safeQty });
      return "수정됨";
    }
    supabaseInsert('store_settings', { store: storeNorm, code: String(code), safe_qty: safeQty });
    return "저장됨";
  } catch (e) {
    return "❌ 오류: " + e.message;
  }
}

/* [Code.gs] 입고 등록 저장 (Supabase stock_logs) */
function registerInboundBatch(list) {
  try {
    var rows = [];
    list.forEach(function(item) {
      var qty = parseFloat(String(item.qty).replace(/,/g, '')) || 0;
      var dateObj = item.date ? new Date(item.date) : new Date();
      rows.push({
        location: "입고등록",
        item_code: item.code,
        item_name: item.name || "",
        spec: item.spec || "",
        qty: qty,
        log_date: dateObj.toISOString(),
        vendor_target: item.vendor || "",
        log_type: "Inbound"
      });
    });
    if (rows.length) supabaseInsertMany('stock_logs', rows);
    return "✅ " + list.length + "건 입고 완료!";
  } catch (e) {
    return "❌ 오류: " + e.message;
  }
}

/**
 * [최종 통합] 강제 출고 실행 (Supabase stock_logs: 본사 차감 + 매장 증가)
 */
function forceOutboundBatch(l) {
  try {
    var rows = [];
    for (var i = 0; i < l.length; i++) {
      var d = l[i];
      var qty = Number(d.qty);
      var date = (d.date && (d.date instanceof Date || typeof d.date === 'string')) ? new Date(d.date) : new Date();
      var dateIso = date.toISOString();
      var deliveryDate = (d.deliveryDate && String(d.deliveryDate).trim()) ? d.deliveryDate : "";
      rows.push({ location: d.store, item_code: d.code, item_name: d.name || "", spec: "-", qty: qty, log_date: dateIso, vendor_target: "HQ", log_type: "ForcePush", delivery_status: deliveryDate || null });
      rows.push({ location: "본사", item_code: d.code, item_name: d.name || "", spec: "-", qty: -qty, log_date: dateIso, vendor_target: d.store, log_type: "ForceOutbound", delivery_status: deliveryDate || null });
    }
    if (rows.length) supabaseInsertMany('stock_logs', rows);
    return "✅ " + l.length + "건의 강제 출고 및 매장 재고 반영이 완료되었습니다.";
  } catch (e) {
    return "❌ 오류 발생: " + e.message;
  }
}

// 1. [통합] 출고 내역 조회 (Supabase stock_logs: Outbound / ForceOut / ForcePush)
function getOutboundHistory(startStr, endStr, storeFilter) {
  try {
    var allLogs = supabaseSelect('stock_logs', { order: 'log_date.desc', limit: 500 });
    var list = [];
    var startDate = new Date(startStr); startDate.setHours(0, 0, 0, 0);
    var endDate = new Date(endStr); endDate.setHours(23, 59, 59, 999);
    for (var i = 0; i < allLogs.length; i++) {
      var row = allLogs[i];
      var type = String(row.log_type || "");
      if (type !== "Outbound" && type !== "ForceOut" && type !== "ForcePush") continue;
      var rowDate = new Date(row.log_date);
      if (isNaN(rowDate.getTime()) || rowDate < startDate || rowDate > endDate) continue;
      var targetStore = String(row.vendor_target || "").replace("To ", "");
      if (storeFilter && storeFilter !== "All" && storeFilter !== "전체" && targetStore !== storeFilter) continue;
      var summary = (type === "ForceOut" || type === "ForcePush") ? "[강제] " + (row.item_name || "") : (row.item_name || "");
      list.push({ date: Utilities.formatDate(rowDate, "GMT+7", "yyyy-MM-dd"), store: targetStore, type: (type === "ForceOut" || type === "ForcePush") ? "⚡강제출고" : "📦일반출고", summary: summary, qty: Math.abs(Number(row.qty)) });
      if (list.length >= 300) break;
    }
    return list;
  } catch (e) {
    return [];
  }
}

/* [Code.gs] 입고 내역 조회 (Supabase stock_logs log_type=Inbound, From HQ 제외) */
function getInboundHistory(startStr, endStr, vendorFilter) {
  try {
    var itemList = getCommonItemData();
    var itemMap = {};
    for (var k = 0; k < itemList.length; k++) itemMap[itemList[k].code] = { spec: itemList[k].spec || "-", cost: itemList[k].cost || 0 };
    var logs = supabaseSelectFilter('stock_logs', "log_type=eq.Inbound", { order: 'log_date.desc', limit: 400 });
    var list = [];
    var startD = new Date(startStr); startD.setHours(0, 0, 0, 0);
    var endD = new Date(endStr); endD.setHours(23, 59, 59, 999);
    for (var i = 0; i < logs.length; i++) {
      var row = logs[i];
      if (String(row.vendor_target || "").trim() === "From HQ") continue;
      var rowDate = new Date(row.log_date);
      var rowDateStr = Utilities.formatDate(rowDate, "GMT+7", "yyyy-MM-dd");
      if (rowDate < startD || rowDate > endD) continue;
      var rowVendor = String(row.vendor_target || "").trim();
      if (vendorFilter && vendorFilter !== "All" && vendorFilter !== "전체 매입처" && rowVendor !== vendorFilter) continue;
      var code = String(row.item_code || "");
      var info = itemMap[code] || { spec: "-", cost: 0 };
      var qty = Number(row.qty);
      list.push({ date: rowDateStr, vendor: rowVendor, name: row.item_name || "", spec: info.spec, qty: qty, amount: info.cost * qty });
      if (list.length >= 300) break;
    }
    return list;
  } catch (e) {
    return [];
  }
}

/**
 * [매장 전용] 본사/오피스에서 해당 매장으로 보낸 입고 수령 내역 (Supabase stock_logs)
 */
function getInboundForStore(storeName, startStr, endStr) {
  try {
    var itemList = getCommonItemData();
    var itemMap = {};
    for (var k = 0; k < itemList.length; k++) itemMap[itemList[k].code] = { spec: itemList[k].spec || "-", cost: itemList[k].cost || 0 };
    var logs = supabaseSelectFilter('stock_logs', "location=eq." + encodeURIComponent(String(storeName).trim()), { order: 'log_date.desc', limit: 400 });
    var list = [];
    var startD = new Date(startStr); startD.setHours(0, 0, 0, 0);
    var endD = new Date(endStr); endD.setHours(23, 59, 59, 999);
    for (var i = 0; i < logs.length; i++) {
      var row = logs[i];
      var type = String(row.log_type || "");
      var note = String(row.vendor_target || "").trim();
      var isFromHq = (type === "ForcePush" && note === "HQ") || (type === "Inbound" && note === "From HQ");
      if (!isFromHq) continue;
      var rowDate = new Date(row.log_date);
      var rowDateStr = Utilities.formatDate(rowDate, "GMT+7", "yyyy-MM-dd");
      if (rowDate < startD || rowDate > endD) continue;
      var code = String(row.item_code || "");
      var info = itemMap[code] || { spec: "-", cost: 0 };
      list.push({ date: rowDateStr, vendor: note === "From HQ" ? "주문승인" : "본사출고", name: row.item_name || "", spec: info.spec, qty: Number(row.qty), amount: info.cost * Number(row.qty) });
      if (list.length >= 300) break;
    }
    return list;
  } catch (e) {
    return [];
  }
}

/* [Code.gs] 출고 내역 통합 조회 (Supabase stock_logs + orders) */
function getCombinedOutboundHistory(startStr, endStr, vendorFilter, typeFilter) {
  try {
    var itemList = getCommonItemData();
    var itemMap = {};
    for (var k = 0; k < itemList.length; k++) {
      itemMap[itemList[k].code] = { spec: itemList[k].spec || "-", price: itemList[k].price || 0 };
    }
    var allLogs = supabaseSelect('stock_logs', { order: 'log_date.desc', limit: 500 });
    var list = [];
    var startDate = new Date(startStr); startDate.setHours(0, 0, 0, 0);
    var endDate = new Date(endStr); endDate.setHours(23, 59, 59, 999);
    for (var i = 0; i < allLogs.length; i++) {
      var row = allLogs[i];
      var type = String(row.log_type || "");
      if (type !== "Outbound" && type !== "ForceOutbound") continue;
      var rowDate = new Date(row.log_date);
      var dateStr = Utilities.formatDate(rowDate, "GMT+7", "yyyy-MM-dd");
      if (rowDate < startDate || rowDate > endDate) continue;
      var target = String(row.vendor_target || "");
      if (vendorFilter && vendorFilter !== "All" && vendorFilter !== "전체 매출처" && target !== vendorFilter) continue;
      var typeCode = (type === "ForceOutbound") ? "Force" : "Outbound";
      var filterOk = !typeFilter || typeFilter === "All" || typeCode === typeFilter || (typeFilter === "Order" && typeCode === "Outbound");
      if (!filterOk) continue;
      var code = String(row.item_code || "");
      var info = itemMap[code] || { spec: "-", price: 0 };
      var orderRowId = (typeCode === "Outbound" && row.order_id) ? String(row.order_id) : "";
      var deliveryStatus = (row.delivery_status && String(row.delivery_status)) ? String(row.delivery_status) : (typeCode === "Outbound" ? "배송중" : "");
      var deliveryDateStr = (row.delivery_status && typeCode === "Force") ? (row.log_date ? Utilities.formatDate(new Date(row.log_date), "GMT+7", "yyyy-MM-dd HH:mm") : "") : "";
      list.push({ date: dateStr, target: target, type: typeCode, name: row.item_name || "", code: code, spec: info.spec, qty: Math.abs(Number(row.qty)), amount: info.price * Math.abs(Number(row.qty)), orderRowId: orderRowId, deliveryStatus: deliveryStatus, deliveryDate: deliveryDateStr });
      if (list.length >= 500) break;
    }
    var keyToInv = {};
    for (var g = 0; g < list.length; g++) {
      var r = list[g];
      var key = r.date + "\t" + r.target + "\t" + r.type + (r.orderRowId ? "\t" + r.orderRowId : "");
      if (keyToInv[key] === undefined) keyToInv[key] = getOrCreateInvoiceNo(r.date, r.target, r.type + (r.orderRowId ? "_" + r.orderRowId : ""));
      r.invoiceNo = keyToInv[key];
    }
    var orderRowIds = [];
    list.forEach(function(r) { if (r.orderRowId && orderRowIds.indexOf(r.orderRowId) === -1) orderRowIds.push(r.orderRowId); });
    if (orderRowIds.length > 0) {
      var orderMap = {};
      for (var j = 0; j < orderRowIds.length; j++) {
        var oid = orderRowIds[j];
        var ords = supabaseSelectFilter('orders', "id=eq." + oid);
        if (ords && ords.length > 0) {
          var o = ords[0];
          var recIdx = [];
          try { if (o.received_indices) recIdx = JSON.parse(o.received_indices); } catch (e) {}
          var cart = [];
          try { if (o.cart_json) cart = JSON.parse(o.cart_json); } catch (e2) {}
          orderMap[String(oid)] = { delivery_status: o.delivery_status, image_url: o.image_url, delivery_date: o.delivery_date, order_date: o.order_date, received_indices: recIdx, cart: cart };
        }
      }
      list.forEach(function(r) {
        var key = r.orderRowId != null ? String(r.orderRowId) : "";
        if (!key || !orderMap[key]) return;
        var o = orderMap[key];
        if (o.order_date) r.orderDate = o.order_date.substring(0, 10);
        if (o.delivery_status === "배송완료" || o.delivery_status === "일부배송완료" || o.delivery_status === "일부 배송 완료") r.deliveryStatus = (o.delivery_status === "일부 배송 완료" ? "일부배송완료" : o.delivery_status);
        if (o.image_url && (o.image_url.indexOf("http") === 0 || o.image_url.indexOf("data:image") === 0)) r.receiveImageUrl = o.image_url;
        if (o.delivery_date) r.deliveryDate = o.delivery_date.substring(0, 16);
        if (o.received_indices && o.received_indices.length > 0) { r.receivedIndices = o.received_indices; r.totalOrderItems = (o.cart && o.cart.length) ? o.cart.length : o.received_indices.length; }
      });
      if (orderRowIds.length > 0) {
        var filteredList = [];
        var usedByOrder = {};
        list.forEach(function(r) {
          var key = r.orderRowId != null ? String(r.orderRowId) : "";
          if (!key || !orderMap[key]) { filteredList.push(r); return; }
          var o = orderMap[key];
          if (!o.received_indices || o.received_indices.length === 0) { filteredList.push(r); return; }
          var cart = o.cart || [];
          var code = String(r.code || "").trim();
          var name = String(r.name || "").trim();
          var matchIdx = -1;
          for (var ci = 0; ci < cart.length; ci++) {
            if (String(cart[ci].code || "").trim() === code && String(cart[ci].name || "").trim() === name) {
              if (o.received_indices.indexOf(ci) !== -1) { matchIdx = ci; break; }
            }
          }
          if (matchIdx === -1) return;
          var uk = key + "_" + matchIdx;
          if (usedByOrder[uk]) return;
          usedByOrder[uk] = true;
          filteredList.push(r);
        });
        list = filteredList;
      }
    }
    return list;
  } catch (e) {
    return [];
  }
}

/** 출고 내역에서 수령 사진 URL 조회 (Supabase orders.image_url) */
function getOrderReceiveImageUrl(orderRowId) {
  try {
    var orderId = Number(orderRowId);
    if (!orderId) return "";
    var orders = supabaseSelectFilter('orders', "id=eq." + orderId);
    if (!orders || orders.length === 0) return "";
    var url = orders[0].image_url;
    var s = url != null ? String(url).trim() : "";
    if (s && (s.indexOf("http") === 0 || s.indexOf("data:image") === 0)) return s;
    return "";
  } catch (e) {
    return "";
  }
}

/* [Code.gs] 재고 조정 내역 조회 (Supabase stock_logs log_type=Adjustment) */
function getAdjustmentHistory(startStr, endStr, storeFilter) {
  try {
    var itemList = getCommonItemData();
    var specMap = {};
    for (var k = 0; k < itemList.length; k++) specMap[itemList[k].code] = itemList[k].spec || "-";
    var allLogs = supabaseSelectFilter('stock_logs', "log_type=eq.Adjustment", { order: 'log_date.desc', limit: 500 });
    var list = [];
    var startD = new Date(startStr); startD.setHours(0, 0, 0, 0);
    var endD = new Date(endStr); endD.setHours(23, 59, 59, 999);
    for (var i = 0; i < allLogs.length; i++) {
      var row = allLogs[i];
      var rowDate = new Date(row.log_date);
      var dateStr = Utilities.formatDate(rowDate, "GMT+7", "yyyy-MM-dd");
      if (rowDate < startD || rowDate > endD) continue;
      var store = String(row.location || "");
      if (storeFilter && storeFilter !== "All" && store !== storeFilter) continue;
      list.push({ date: dateStr, store: store, item: row.item_name || "", spec: specMap[row.item_code] || "-", diff: Number(row.qty), reason: row.vendor_target || "" });
      if (list.length >= 300) break;
    }
    return list;
  } catch (e) {
    return [];
  }
}

function getVendorStats(vendorName) {
  try {
    var itemList = getCommonItemData();
    var itemCost = {};
    for (var k = 0; k < itemList.length; k++) itemCost[itemList[k].code] = itemList[k].cost || 0;
    var logs = supabaseSelectFilter('stock_logs', "log_type=eq.Inbound&vendor_target=eq." + encodeURIComponent(vendorName), { limit: 1000 });
    var stats = { monthly: {}, total: 0, lastDate: "-" };
    for (var i = 0; i < logs.length; i++) {
      var row = logs[i];
      var date = new Date(row.log_date);
      var code = row.item_code;
      var qty = Number(row.qty);
      var cost = itemCost[code] || 0;
      var amount = qty * cost;
      stats.total += amount;
      var ym = Utilities.formatDate(date, "GMT+7", "yyyy-MM");
      stats.monthly[ym] = (stats.monthly[ym] || 0) + amount;
      var dateStr = Utilities.formatDate(date, "GMT+7", "yyyy-MM-dd");
      if (stats.lastDate === "-" || dateStr > stats.lastDate) stats.lastDate = dateStr;
    }
    return stats;
  } catch (e) {
    return { monthly: {}, total: 0, lastDate: "-" };
  }
}

function getMyOrderHistory(store, startStr, endStr) {
  try {
    var endIso = endStr + "T23:59:59.999Z";
    var filter = "store_name=eq." + encodeURIComponent(store) + "&order_date=gte." + encodeURIComponent(startStr) + "&order_date=lte." + encodeURIComponent(endIso);
    var orderRows = supabaseSelectFilter('orders', filter, { order: 'order_date.desc', limit: 300 });
    var list = [];
    for (var i = 0; i < orderRows.length; i++) {
      var o = orderRows[i];
      var cart = []; try { cart = JSON.parse(o.cart_json || "[]"); } catch (e) { }
      var receivedIndices = [];
      try { if (o.received_indices) receivedIndices = JSON.parse(o.received_indices || "[]"); } catch (e) { }
      var receivedQtyMap = {};
      try { if (o.received_qty_json) receivedQtyMap = JSON.parse(o.received_qty_json || "{}"); } catch (e) { }
      var isFullReceived = o.delivery_status === "배송완료" || o.delivery_status === "배송 완료";
      var items = cart.map(function(it, idx) {
        var origQty = Number(it.qty || 0);
        var isReceived = isFullReceived || receivedIndices.indexOf(idx) !== -1;
        var recQty = receivedQtyMap[String(idx)] ?? receivedQtyMap[idx];
        var effectiveQty = (isReceived && typeof recQty === "number") ? recQty : origQty;
        return Object.assign({}, it, { qty: origQty, receivedQty: isReceived ? effectiveQty : undefined });
      });
      var summary = cart.length > 0 ? cart[0].name + (cart.length > 1 ? " 외 " + (cart.length - 1) + "건" : "") : "Items";
      var deliveryStatus = o.delivery_status || (o.status === "Approved" ? "배송중" : "");
      var deliveryDate = (o.delivery_date || "").trim();
      var orderDate = o.order_date ? new Date(o.order_date) : new Date();
      var userName = String(o.user_name || "").trim() || undefined;
      var rejectReason = String(o.reject_reason || "").trim() || undefined;
      list.push({ id: o.id, orderRowId: o.id, date: Utilities.formatDate(orderDate, "GMT+7", "yyyy-MM-dd"), deliveryDate: deliveryDate, summary: summary, total: Number(o.total) || 0, status: o.status || "Pending", deliveryStatus: deliveryStatus, items: items, userName: userName, rejectReason: rejectReason });
    }
    return list;
  } catch (e) {
    return [];
  }
}
function getMyUsageHistory(store, startStr, endStr) {
  try {
    var itemList = getCommonItemData();
    var priceByCode = {};
    for (var k = 0; k < itemList.length; k++) priceByCode[itemList[k].code] = itemList[k].price || 0;
    var logs = supabaseSelectFilter('stock_logs', "location=eq." + encodeURIComponent(store) + "&log_type=eq.Usage", { order: 'log_date.desc', limit: 200 });
    var list = [];
    var startDate = new Date(startStr); startDate.setHours(0, 0, 0, 0);
    var endDate = new Date(endStr); endDate.setHours(23, 59, 59, 999);
    for (var i = 0; i < logs.length; i++) {
      var row = logs[i];
      var rowDate = new Date(row.log_date);
      if (rowDate < startDate || rowDate > endDate) continue;
      var dateStr = Utilities.formatDate(rowDate, "Asia/Bangkok", "yyyy-MM-dd");
      var dateTimeStr = Utilities.formatDate(rowDate, "Asia/Bangkok", "yyyy-MM-dd HH:mm");
      var code = String(row.item_code || "").trim();
      var name = String(row.item_name || "").trim();
      var qty = Math.abs(Number(row.qty) || 0);
      var price = priceByCode[code] != null ? priceByCode[code] : 0;
      var userName = String(row.user_name || "").trim() || undefined;
      list.push({ date: dateStr, dateTime: dateTimeStr, item: name, qty: qty, amount: price * qty, userName: userName });
    }
    return list;
  } catch (e) {
    return [];
  }
}

/* [Code.gs] 재고 조정 실행 (Supabase stock_logs에 Adjustment 이력 추가). 본사(Office)만 실행 가능 */
function adjustStockBatch(list, role, userStore) {
  var st = String(userStore || "").trim();
  var isOffice = (st === "Office" || st === "본사" || st === "오피스" || st.toLowerCase() === "office");
  if (!isOffice) return "❌ 재고 조정은 본사에서만 가능합니다.";
  try {
    var rows = [];
    list.forEach(function(item) {
      var valNew = parseFloat(String(item.newQty).replace(/,/g, '')) || 0;
      var valCur = parseFloat(String(item.curQty).replace(/,/g, '')) || 0;
      var diff = valNew - valCur;
      var adjDate = item.date ? new Date(item.date) : new Date();
      rows.push({
        location: item.store,
        item_code: item.code,
        item_name: item.name || "",
        spec: "",
        qty: diff,
        log_date: adjDate.toISOString(),
        vendor_target: item.reason || "",
        log_type: "Adjustment"
      });
    });
    if (rows.length) supabaseInsertMany('stock_logs', rows);
    return "✅ 재고 조정 및 반영 완료!";
  } catch (e) {
    return "❌ 서버 에러: " + e.message;
  }
}

/* [Code.gs] 강제출고 + 주문승인 내역 통합 조회 (Supabase stock_logs) */
function getForceOutboundHistory(startStr, endStr, vendorFilter) {
  try {
    var allLogs = supabaseSelect('stock_logs', { order: 'log_date.desc', limit: 500 });
    var list = [];
    var startDate = new Date(startStr); startDate.setHours(0, 0, 0, 0);
    var endDate = new Date(endStr); endDate.setHours(23, 59, 59, 999);
    for (var i = 0; i < allLogs.length; i++) {
      var row = allLogs[i];
      var type = String(row.log_type || "");
      if (type !== "ForceOut" && type !== "ForcePush" && type !== "Outbound") continue;
      var rowDate = new Date(row.log_date);
      if (isNaN(rowDate.getTime()) || rowDate < startDate || rowDate > endDate) continue;
      var targetName = String(row.vendor_target || "").replace("To ", "");
      if (vendorFilter && vendorFilter !== "All" && vendorFilter !== "전체 매출처" && targetName !== vendorFilter) continue;
      var typeName = (type === "Outbound") ? "✅주문승인" : "⚡강제출고";
      list.push({ date: Utilities.formatDate(rowDate, "GMT+7", "yyyy-MM-dd"), type: typeName, target: targetName, name: row.item_name || "", qty: Math.abs(Number(row.qty)) });
      if (list.length >= 300) break;
    }
    return list;
  } catch (e) {
    return [];
  }
}
/** [발주현황조회] 매장 출고 기준 거래처(매입처)별/품목별 발주 집계 (Supabase) */
function getOrderSummaryForPurchase(startStr, endStr, viewBy, vendorFilter, itemFilter) {
  try {
    var itemList = getCommonItemData();
    var itemMap = {};
    for (var k = 0; k < itemList.length; k++) {
      var it = itemList[k];
      itemMap[it.code] = { name: it.name, spec: it.spec || "-", vendor: "" };
    }
    var itemsWithVendor = supabaseSelect('items', { select: 'code,name,spec,vendor' });
    for (var k = 0; k < itemsWithVendor.length; k++) {
      var it = itemsWithVendor[k];
      if (it.code) itemMap[it.code] = { name: it.name || "", spec: it.spec || "-", vendor: String(it.vendor || "").trim() };
    }
    var allLogs = supabaseSelectFilter('stock_logs', "location=eq.본사", { limit: 1000 });
    var startDate = new Date(startStr); startDate.setHours(0, 0, 0, 0);
    var endDate = new Date(endStr); endDate.setHours(23, 59, 59, 999);
    var raw = [];
    for (var i = 0; i < allLogs.length; i++) {
      var row = allLogs[i];
      var type = String(row.log_type || "").trim();
      if (type !== "Outbound" && type !== "ForceOutbound") continue;
      var rowDate = new Date(row.log_date);
      if (rowDate < startDate || rowDate > endDate) continue;
      var code = String(row.item_code || "").trim();
      var name = String(row.item_name || "").trim();
      var qty = Math.abs(Number(row.qty) || 0);
      if (!code || qty <= 0) continue;
      var info = itemMap[code] || { name: name, spec: "-", vendor: "" };
      var vendor = info.vendor || "";
      if (vendorFilter && vendorFilter !== "All" && String(vendorFilter).trim() !== "" && vendor !== vendorFilter) continue;
      if (itemFilter && String(itemFilter).trim() !== "") {
        var f = String(itemFilter).trim().toLowerCase();
        if (code.toLowerCase().indexOf(f) === -1 && (info.name || name).toLowerCase().indexOf(f) === -1) continue;
      }
      raw.push({ code: code, name: info.name || name, spec: info.spec, vendor: vendor, qty: qty });
    }
    var byCode = {};
    raw.forEach(function(r) {
      if (!byCode[r.code]) byCode[r.code] = { code: r.code, name: r.name, spec: r.spec, vendor: r.vendor, qty: 0 };
      byCode[r.code].qty += r.qty;
    });
    var byItemList = [];
    for (var c in byCode) byItemList.push(byCode[c]);
    var byVendorMap = {};
    byItemList.forEach(function(row) {
      var v = row.vendor || "(미지정)";
      if (!byVendorMap[v]) byVendorMap[v] = { vendor: v, items: [], totalQty: 0 };
      byVendorMap[v].items.push({ code: row.code, name: row.name, spec: row.spec, qty: row.qty });
      byVendorMap[v].totalQty += row.qty;
    });
    var byVendorList = [];
    for (var v in byVendorMap) byVendorList.push(byVendorMap[v]);
    byVendorList.sort(function(a, b) { return (a.vendor || "").localeCompare(b.vendor || ""); });
    byItemList.sort(function(a, b) { return (a.vendor || "").localeCompare(b.vendor || "") || (a.code || "").localeCompare(b.code || ""); });
    return { viewBy: viewBy || "vendor", byVendor: byVendorList, byItem: byItemList, period: { start: startStr, end: endStr } };
  } catch (e) {
    return { viewBy: viewBy || "vendor", byVendor: [], byItem: [], period: { start: startStr, end: endStr } };
  }
}

/**
 * [창고별 출고 목록] 승인된 주문 + 강제 출고를 출고지(창고)별로 그룹핑하여 반환
 * @param {string} filterBy - 'order' | 'delivery' (주문 일자 / 배송 일자 기준)
 * @returns { byWarehouse, warehouseOrder, period, filterBy }
 */
function getOutboundByWarehouse(startStr, endStr, filterBy) {
  try {
    var filterByOrder = (filterBy !== "delivery");
    var itemRows = supabaseSelect('items', { select: 'code,name,spec,outbound_location' });
    var itemMap = {};
    for (var k = 0; k < itemRows.length; k++) {
      var it = itemRows[k];
      if (it.code) itemMap[it.code] = { name: it.name || "", spec: it.spec || "-", outbound_location: String(it.outbound_location || "").trim() };
    }
    var byWarehouse = {};
    function addRow(warehouse, store, code, name, spec, qty, deliveryDate, source) {
      var wh = warehouse || "(미지정)";
      if (!byWarehouse[wh]) byWarehouse[wh] = [];
      byWarehouse[wh].push({ store: store, code: code, name: name, spec: spec, qty: qty, deliveryDate: deliveryDate || "", source: source || "Order" });
    }
    var endIso = endStr + "T23:59:59.999Z";
    var orderFilter;
    if (filterByOrder) {
      orderFilter = "status=eq.Approved&order_date=gte." + encodeURIComponent(startStr) + "&order_date=lte." + encodeURIComponent(endIso);
    } else {
      orderFilter = "status=eq.Approved&delivery_date=gte." + encodeURIComponent(startStr) + "&delivery_date=lte." + encodeURIComponent(endIso);
    }
    var orderRows = supabaseSelectFilter('orders', orderFilter, { order: 'order_date.desc', limit: 300 });
    for (var i = 0; i < orderRows.length; i++) {
      var o = orderRows[i];
      var store = String(o.store_name || "").trim();
      var deliveryDate = (o.delivery_date || "").trim().substring(0, 10);
      var cart = [];
      try { if (o.cart_json) cart = JSON.parse(o.cart_json); } catch (e) {}
      for (var j = 0; j < cart.length; j++) {
        var p = cart[j];
        var code = String(p.code || "").trim();
        var name = String(p.name || "").trim();
        var spec = (itemMap[code] && itemMap[code].spec) ? itemMap[code].spec : (p.spec || "-");
        var qty = Number(p.qty) || 0;
        if (!code || qty <= 0) continue;
        var wh = (itemMap[code] && itemMap[code].outbound_location) ? itemMap[code].outbound_location : "(미지정)";
        addRow(wh, store, code, name, spec, qty, deliveryDate, "Order");
      }
    }
    var allLogs = supabaseSelectFilter('stock_logs', "location=eq.본사&log_type=eq.ForceOutbound", { order: 'log_date.desc', limit: 500 });
    var startDate = new Date(startStr); startDate.setHours(0, 0, 0, 0);
    var endDate = new Date(endStr); endDate.setHours(23, 59, 59, 999);
    for (var idx = 0; idx < allLogs.length; idx++) {
      var row = allLogs[idx];
      var dateToCheck;
      if (filterByOrder) {
        dateToCheck = new Date(row.log_date);
      } else {
        var dStr = (row.delivery_status && String(row.delivery_status).match(/^\d{4}-\d{2}-\d{2}/)) ? String(row.delivery_status).substring(0, 10) : "";
        if (!dStr) continue;
        dateToCheck = new Date(dStr);
        dateToCheck.setHours(12, 0, 0, 0);
      }
      if (dateToCheck < startDate || dateToCheck > endDate) continue;
      var code = String(row.item_code || "").trim();
      var name = String(row.item_name || "").trim();
      var store = String(row.vendor_target || "").trim();
      var qty = Math.abs(Number(row.qty) || 0);
      var deliveryDate = (row.delivery_status && String(row.delivery_status).match(/^\d{4}-\d{2}-\d{2}/)) ? String(row.delivery_status).substring(0, 10) : "";
      if (!code || qty <= 0) continue;
      var info = itemMap[code] || { name: name, spec: "-", outbound_location: "" };
      var wh = info.outbound_location || "(미지정)";
      addRow(wh, store, code, info.name || name, info.spec, qty, deliveryDate, "Force");
    }
    var warehouseOrder = [];
    try {
      var whRows = supabaseSelect('warehouse_locations', { order: 'sort_order.asc', limit: 50 });
      for (var w = 0; w < whRows.length; w++) {
        var wn = String(whRows[w].name || "").trim();
        if (wn && byWarehouse[wn]) warehouseOrder.push(wn);
      }
    } catch (e) {}
    for (var k in byWarehouse) {
      if (warehouseOrder.indexOf(k) === -1) warehouseOrder.push(k);
    }
    if (warehouseOrder.indexOf("(미지정)") === -1 && byWarehouse["(미지정)"]) warehouseOrder.push("(미지정)");
    return { byWarehouse: byWarehouse, warehouseOrder: warehouseOrder, period: { start: startStr, end: endStr }, filterBy: filterByOrder ? "order" : "delivery" };
  } catch (e) {
    Logger.log('getOutboundByWarehouse: ' + e.message);
    return { byWarehouse: {}, warehouseOrder: [], period: { start: startStr, end: endStr }, filterBy: filterByOrder ? "order" : "delivery" };
  }
}

/* [Code.gs] 출고 대상 목록 통합 (Supabase vendors type=판매처) */
function getAllOutboundTargets() {
  try {
    var rows = supabaseSelect('vendors', { order: 'id.asc' });
    var list = [];
    for (var i = 0; i < rows.length; i++) {
      var type = String(rows[i].type || "").trim();
      var vendorName = String(rows[i].name || "").trim();
      if (type === "판매처" && vendorName && list.indexOf(vendorName) === -1) list.push(vendorName);
    }
    return list.sort();
  } catch (e) {
    return [];
  }
}

