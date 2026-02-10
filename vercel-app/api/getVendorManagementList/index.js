const { supabaseSelect } = require('../../lib/supabase');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const rows = await supabaseSelect('vendors', { order: 'id.asc' }) || [];
    const list = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.code && !r.name) continue;
      list.push({ row: r.id, type: String(r.type || ''), code: String(r.code || ''), name: String(r.name || ''), taxId: String(r.tax_id || ''), ceo: String(r.ceo || ''), addr: String(r.addr || ''), manager: String(r.manager || ''), phone: String(r.phone || ''), balance: Number(r.balance) || 0, memo: String(r.memo || '') });
    }
    return res.status(200).json(list);
  } catch (e) { console.error('getVendorManagementList:', e.message); return res.status(200).json([]); }
};
