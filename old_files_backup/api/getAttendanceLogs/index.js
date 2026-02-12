const { supabaseSelect } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const rows = await supabaseSelect('attendance_logs', { order: 'log_at.asc' }) || [];
    const out = rows.map((r) => [
      r.log_at ? new Date(r.log_at) : null,
      r.store_name || '',
      r.name || '',
      r.log_type || '',
      r.lat || '',
      r.lng || '',
      r.planned_time || '',
      Number(r.late_min) || 0,
      Number(r.early_min) || 0,
      Number(r.ot_min) || 0,
      Number(r.break_min) || 0,
      r.reason || '',
      r.status || '',
      r.approved || '',
      r.id,
    ]);
    return res.status(200).json(out);
  } catch (e) {
    console.error('getAttendanceLogs:', e.message);
    return res.status(200).json([]);
  }
};
