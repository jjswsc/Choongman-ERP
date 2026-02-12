const { supabaseSelect } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let department = '';
    if (req.method === 'GET') department = String(req.query.department || '').trim();
    else { const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); department = String(b.department || '').trim(); }
    if (!department || department === 'All') return res.status(200).json([]);
    const data = await supabaseSelect('employees', { order: 'id.asc' }) || [];
    const names = [];
    for (let i = 0; i < data.length; i++) {
      const st = String(data[i].store || '').toLowerCase();
      if (st.indexOf('office') === -1 && st !== '본사' && st !== '오피스') continue;
      const rowDept = String(data[i].job || '').trim() || 'Staff';
      if (rowDept !== department) continue;
      const n = String(data[i].nick || '').trim() || String(data[i].name || '').trim();
      if (n && names.indexOf(n) === -1) names.push(n);
    }
    return res.status(200).json(names);
  } catch (e) {
    console.error('getOfficeNamesByDept:', e.message);
    return res.status(200).json([]);
  }
};
