const { supabaseSelectFilter } = require('../../lib/supabase');

const TZ = 'Asia/Bangkok';

function formatVisitTimeForDisplay(visitTime, createdAt) {
  let t = String(visitTime != null ? visitTime : '').trim();
  if (t.length >= 5) {
    if (t.indexOf('T') >= 0) {
      const iso = t.substring(t.indexOf('T') + 1);
      return iso.length >= 5 ? iso.substring(0, 5) : iso.substring(0, 8);
    }
    return t.length >= 8 ? t.substring(0, 5) : t.substring(0, 5);
  }
  if (createdAt) {
    const isoStr = typeof createdAt === 'string' ? createdAt : (createdAt.toISOString ? createdAt.toISOString() : '');
    if (isoStr && isoStr.indexOf('T') >= 0) {
      const timePart = isoStr.substring(isoStr.indexOf('T') + 1);
      return timePart.length >= 5 ? timePart.substring(0, 5) : timePart.substring(0, 8);
    }
  }
  return '';
}

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
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
    const list = await supabaseSelectFilter('store_visits', 'visit_date=eq.' + todayStr + '&name=eq.' + encodeURIComponent(userName), { order: 'visit_time.desc', limit: 20 }) || [];
    const result = list.map((row) => ({
      time: formatVisitTimeForDisplay(row.visit_time, row.created_at) || String(row.visit_time || ''),
      store: row.store_name,
      type: row.visit_type,
      duration: row.duration_min,
    }));
    return res.status(200).json(result);
  } catch (e) {
    console.error('getTodayMyVisits:', e.message);
    return res.status(200).json([]);
  }
};
