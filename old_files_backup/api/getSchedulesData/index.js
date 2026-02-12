const { supabaseSelect } = require('../../lib/supabase');

function toScheduleDateStr(val) {
  if (!val) return '';
  if (typeof val === 'string') return val.slice(0, 10);
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const rows = await supabaseSelect('schedules', { order: 'schedule_date.asc' }) || [];
    const out = rows.map((r) => {
      const dateStr = toScheduleDateStr(r.schedule_date) || (typeof r.schedule_date === 'string' ? r.schedule_date.substring(0, 10) : '');
      return [ dateStr, r.store_name || '', r.name || '', r.plan_in || '', r.plan_out || '', r.break_start || '', r.break_end || '', r.memo || '', r.id ];
    });
    return res.status(200).json(out);
  } catch (e) {
    console.error('getSchedulesData:', e.message);
    return res.status(200).json([]);
  }
};
