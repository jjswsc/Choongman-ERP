const { supabaseSelectFilter } = require('../../lib/supabase');

const TZ = 'Asia/Bangkok';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    let userName = '';
    if (req.method === 'GET') userName = String(req.query.userName || '').trim();
    else {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      userName = String(body.userName || '').trim();
    }
    const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
    const list = await supabaseSelectFilter('store_visits', 'visit_date=eq.' + today + '&name=eq.' + encodeURIComponent(userName), { order: 'visit_time.desc', limit: 50 }) || [];
    for (let i = 0; i < list.length; i++) {
      if (list[i].visit_type === '방문시작') {
        return res.status(200).json({ active: true, storeName: list[i].store_name, purpose: list[i].purpose });
      }
      if (list[i].visit_type === '방문종료') {
        return res.status(200).json({ active: false });
      }
    }
    return res.status(200).json({ active: false });
  } catch (e) {
    console.error('checkUserVisitStatus:', e.message);
    return res.status(200).json({ active: false });
  }
};
