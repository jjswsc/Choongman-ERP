const { supabaseSelectFilter } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let rows = await supabaseSelectFilter('vendors', 'type=eq.매출처', { limit: 2000 }) || [];
    if (!rows.length) rows = await supabaseSelectFilter('vendors', 'type=eq.Sales', { limit: 2000 }) || [];
    const list = rows.map((r) => String(r.name || '').trim()).filter(Boolean);
    return res.status(200).json(list);
  } catch (e) {
    return res.status(200).json([]);
  }
};
