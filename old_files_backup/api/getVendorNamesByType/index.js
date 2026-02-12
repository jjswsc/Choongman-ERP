const { supabaseSelectFilter } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const type = req.method === 'GET' ? (req.query.type || '') : (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})).type || '';
    const rows = await supabaseSelectFilter('vendors', 'type=eq.' + encodeURIComponent(type), { limit: 2000 }) || [];
    const list = rows.map((r) => String(r.name || '').trim()).filter(Boolean);
    return res.status(200).json(list);
  } catch (e) {
    console.error('getVendorNamesByType:', e.message);
    return res.status(200).json([]);
  }
};
