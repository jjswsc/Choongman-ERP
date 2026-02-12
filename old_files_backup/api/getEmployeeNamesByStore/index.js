const { supabaseSelectFilter } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let store = '';
    if (req.method === 'GET') store = String(req.query.store || '').trim();
    else {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      store = String(body.store || '').trim();
    }
    if (!store) return res.status(200).json([]);

    const filter = 'store=ilike.' + encodeURIComponent(store);
    const rows = await supabaseSelectFilter('employees', filter) || [];
    const list = rows.map((r) => ({ name: String(r.name || '').trim(), store: r.store })).filter((x) => x.name);
    return res.status(200).json(list);
  } catch (e) {
    console.error('getEmployeeNamesByStore:', e.message);
    return res.status(200).json([]);
  }
};
