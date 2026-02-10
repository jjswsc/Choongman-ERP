const { supabaseSelect, supabaseSelectFilter } = require('../../lib/supabase');

async function getCommonItemData() {
  const rows = await supabaseSelect('items', { order: 'id.asc' }) || [];
  return rows.map((row) => ({
    code: String(row.code),
    name: String(row.name || ''),
    spec: String(row.spec || '-'),
    tax: (row.tax === '면세') ? '면세' : '과세',
  }));
}

async function getStoreStock(store) {
  try {
    const storeNorm = String(store || '').toLowerCase().trim();
    const rows = await supabaseSelectFilter('stock_logs', `location=ilike.${encodeURIComponent(storeNorm)}`) || [];
    const m = {};
    for (let i = 0; i < rows.length; i++) {
      const code = rows[i].item_code;
      if (!code) continue;
      m[code] = (m[code] || 0) + Number(rows[i].qty);
    }
    return m;
  } catch (_) {
    return {};
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let startStr = '';
    let endStr = '';
    if (req.method === 'GET') {
      startStr = String(req.query.startStr || req.query.startDate || '').trim();
      endStr = String(req.query.endStr || req.query.endDate || '').trim();
    } else {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      startStr = String(body.startStr || body.startDate || '').trim();
      endStr = String(body.endStr || body.endDate || '').trim();
    }
    if (!startStr || !endStr) {
      const now = new Date();
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      startStr = first.toISOString().slice(0, 10);
      endStr = last.toISOString().slice(0, 10);
    }

    const itemList = await getCommonItemData();
    const taxMap = {};
    const specByCode = {};
    const specByName = {};
    for (let k = 0; k < itemList.length; k++) {
      const it = itemList[k];
      taxMap[it.name] = it.tax;
      specByCode[it.code] = it.spec || '-';
      specByName[it.name] = it.spec || '-';
    }

    let officeStock = await getStoreStock('본사');
    if (Object.keys(officeStock).length === 0) officeStock = await getStoreStock('Office');

    const endIso = endStr + 'T23:59:59.999Z';
    const filter = `order_date=gte.${encodeURIComponent(startStr)}&order_date=lte.${encodeURIComponent(endIso)}`;
    const orderRows = await supabaseSelectFilter('orders', filter, { order: 'order_date.desc', limit: 300 }) || [];
    const list = [];
    for (let i = 0; i < orderRows.length; i++) {
      const o = orderRows[i];
      const dateVal = o.order_date;
      const dateStr = dateVal ? String(dateVal).substring(0, 10) : '';
      const rawJson = o.cart_json;
      let items = [];
      let calcTotal = 0;
      try {
        if (rawJson) {
          const cart = JSON.parse(rawJson);
          items = cart.map((p) => {
            const code = String(p.code || '').trim();
            const name = String(p.name || '').trim();
            const spec = specByCode[code] || specByName[name] || p.spec || '-';
            const tType = taxMap[name] || '과세';
            const tRate = (tType === '과세') ? 1.07 : 1.0;
            const lTotal = Number(p.price) * Number(p.qty) * tRate;
            calcTotal += lTotal;
            return { code, name, spec, qty: p.qty, price: p.price, taxType: tType, lineTotal: lTotal };
          });
        }
      } catch (_) {}
      const summary = items.length > 0 ? items[0].name + (items.length > 1 ? ' 외 ' + (items.length - 1) + '건' : '') : '내용 없음';
      let finalTotal = items.length > 0 ? calcTotal : (Number(o.total) || 0);
      if (finalTotal > 100000000) finalTotal = 0;
      list.push({
        row: o.id,
        orderId: o.id,
        date: dateVal ? (String(dateVal).substring(0, 16).replace('T', ' ') + ' (KST)') : '',
        store: o.store_name,
        total: Math.round(finalTotal),
        status: o.status || 'Pending',
        items,
        summary,
        deliveryDate: (o.delivery_date || '').trim(),
      });
    }
    return res.status(200).json({ list, officeStock });
  } catch (e) {
    console.error('getAdminOrders:', e.message);
    return res.status(200).json({ list: [], officeStock: {} });
  }
};
