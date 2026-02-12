const { supabaseSelect, supabaseSelectFilter } = require('../../lib/supabase');

/** GAS getItems: items + store_settings(safe_qty) → 배열 [code, category, name, spec, price, cost, image, '', safeQty, taxType] */
async function getItems(storeName) {
  try {
    const items = await supabaseSelect('items', { order: 'id.asc' });
    let safeMap = {};
    if (storeName) {
      const storeNorm = String(storeName).toLowerCase().trim();
      const settings = await supabaseSelectFilter('store_settings', `store=ilike.${encodeURIComponent(storeNorm)}`);
      for (let i = 0; i < (settings || []).length; i++) {
        safeMap[String(settings[i].code)] = Number(settings[i].safe_qty) || 0;
      }
    }
    const list = [];
    for (let i = 0; i < (items || []).length; i++) {
      const row = items[i];
      if (!row || !row.code) continue;
      const taxType = (row.tax === '면세') ? '면세' : '과세';
      list.push([
        row.code,
        row.category || '',
        row.name || '',
        row.spec || '',
        Number(row.price) || 0,
        Number(row.cost) || 0,
        row.image || '',
        '',
        safeMap[row.code] || 0,
        taxType,
      ]);
    }
    return list;
  } catch (e) {
    console.error('getAppData getItems:', e.message);
    return [];
  }
}

/** GAS getStoreStock: stock_logs location=store → { item_code: sum(qty) } */
async function getStoreStock(store) {
  try {
    const storeNorm = String(store || '').toLowerCase().trim();
    const rows = await supabaseSelectFilter('stock_logs', `location=ilike.${encodeURIComponent(storeNorm)}`);
    const m = {};
    for (let i = 0; i < (rows || []).length; i++) {
      const code = rows[i].item_code;
      if (!code) continue;
      m[code] = (m[code] || 0) + Number(rows[i].qty);
    }
    return m;
  } catch (e) {
    console.error('getAppData getStoreStock:', e.message);
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
    let storeName = '';
    if (req.method === 'GET') {
      storeName = String(req.query.storeName || req.query.store || '').trim();
    } else {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      storeName = String(body.storeName || body.store || '').trim();
    }

    const [items, stock] = await Promise.all([
      getItems(storeName),
      getStoreStock(storeName),
    ]);

    return res.status(200).json({ items, stock });
  } catch (e) {
    console.error('getAppData:', e.message);
    return res.status(200).json({ items: [], stock: {} });
  }
};
