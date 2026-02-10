const { supabaseSelectFilter } = require('../../lib/supabase');

function toDateStr(val) {
  if (!val) return '';
  if (typeof val === 'string') return val.slice(0, 10);
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

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
    let name = '';
    if (req.method === 'GET') {
      store = String(req.query.store || '').trim();
      name = String(req.query.name || '').trim();
    } else {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      store = String(body.store || '').trim();
      name = String(body.name || '').trim();
    }

    const filter = 'store=eq.' + encodeURIComponent(store) + '&name=eq.' + encodeURIComponent(name);
    const rows = await supabaseSelectFilter('leave_requests', filter, { order: 'leave_date.desc' }) || [];
    const thisYear = new Date().getFullYear();
    let usedAnn = 0, usedSick = 0;
    const history = rows.map((r) => {
      const dateStr = toDateStr(r.leave_date);
      const status = String(r.status || '').trim();
      const type = String(r.type || '').trim();
      if ((status === '승인' || status === 'Approved') && dateStr && parseInt(dateStr.slice(0, 4), 10) === thisYear) {
        const val = type.indexOf('반차') !== -1 ? 0.5 : 1.0;
        if (type.indexOf('병가') !== -1) usedSick += val; else usedAnn += val;
      }
      return { date: dateStr, type, reason: r.reason || '', status };
    });

    return res.status(200).json({
      history,
      stats: { usedAnn, usedSick, remain: 6 - usedAnn },
    });
  } catch (e) {
    console.error('getMyLeaveInfo:', e.message);
    return res.status(200).json({ history: [], stats: { usedAnn: 0, usedSick: 0, remain: 6 } });
  }
};
