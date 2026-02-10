const { supabaseSelect } = require('../../lib/supabase');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const rows = await supabaseSelect('items', { order: 'id.asc' }) || [];
    const list = rows.map((row) => ({ code: String(row.code), category: String(row.category || ''), name: String(row.name || ''), spec: String(row.spec || ''), price: Number(row.price) || 0, cost: Number(row.cost) || 0, img: String(row.image || ''), tax: (row.tax === '면세') ? '면세' : '과세' }));
    return res.status(200).json(list);
  } catch (e) { console.error('getCommonItemData:', e.message); return res.status(200).json([]); }
};
