const { supabaseSelect } = require('../../lib/supabase');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const rows = await supabaseSelect('items', { order: 'id.asc' }) || [];
    const unique = {};
    for (let i = 0; i < rows.length; i++) { const c = rows[i].category; if (c && String(c).trim()) unique[String(c).trim()] = true; }
    return res.status(200).json(Object.keys(unique).sort());
  } catch (e) { return res.status(200).json([]); }
};
