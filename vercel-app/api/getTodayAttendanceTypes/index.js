const { supabaseSelect } = require('../../lib/supabase');

const TZ = 'Asia/Bangkok';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let storeName = '', name = '';
    if (req.method === 'GET') { storeName = req.query.storeName || req.query.store || ''; name = req.query.name || ''; }
    else { const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}); storeName = b.storeName || b.store || ''; name = b.name || ''; }
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
    const data = await supabaseSelect('attendance_logs', { order: 'log_at.asc' }) || [];
    const types = [];
    const storeStr = String(storeName || '').trim();
    const nameStr = String(name || '').trim();
    for (let i = 0; i < data.length; i++) {
      const rowDate = data[i].log_at ? new Date(data[i].log_at).toLocaleDateString('en-CA', { timeZone: TZ }) : '';
      if (rowDate !== todayStr) continue;
      if (String(data[i].store_name || '').trim() !== storeStr || String(data[i].name || '').trim() !== nameStr) continue;
      const typ = String(data[i].log_type || '').trim();
      if (typ && types.indexOf(typ) === -1) types.push(typ);
    }
    return res.status(200).json(types);
  } catch (e) {
    console.error('getTodayAttendanceTypes:', e.message);
    return res.status(200).json([]);
  }
};
