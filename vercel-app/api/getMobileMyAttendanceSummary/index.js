/**
 * [모바일] 내 근태 월별 요약
 * POST body: { storeName, userName, yearMonth }  (yearMonth: "yyyy-MM")
 * 반환: { normalDays, otHours, otDays, lateMinutes, lateDays }
 */
const { supabaseSelect } = require('../../lib/supabase');

function toDateStr(val) {
  if (!val) return '';
  const d = typeof val === 'string' ? new Date(val) : val;
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    let storeName = '', userName = '', yearMonth = '';
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      storeName = String(body.storeName || body.store || '').trim();
      userName = String(body.userName || body.name || '').trim();
      yearMonth = String(body.yearMonth || '').trim();
    } else {
      storeName = String(req.query.storeName || req.query.store || '').trim();
      userName = String(req.query.userName || req.query.name || '').trim();
      yearMonth = String(req.query.yearMonth || '').trim();
    }
    if (!storeName || !userName || !yearMonth) {
      return res.status(200).json({ normalDays: 0, otHours: 0, otDays: 0, lateMinutes: 0, lateDays: 0 });
    }
    const m = yearMonth.match(/^(\d{4})-(\d{1,2})/);
    if (!m) {
      return res.status(200).json({ normalDays: 0, otHours: 0, otDays: 0, lateMinutes: 0, lateDays: 0 });
    }
    const startStr = m[1] + '-' + m[2].padStart(2, '0') + '-01';
    const lastDay = new Date(parseInt(m[1], 10), parseInt(m[2], 10), 0);
    const endStr = m[1] + '-' + String(lastDay.getMonth() + 1).padStart(2, '0') + '-' + String(lastDay.getDate()).padStart(2, '0');

    const rows = await supabaseSelect('attendance_logs', { order: 'log_at.asc' }) || [];
    const byKey = {};
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rowStore = String(r.store_name || '').trim();
      const rowName = String(r.name || '').trim();
      if (rowStore !== storeName || rowName !== userName) continue;
      const dateStr = toDateStr(r.log_at);
      if (!dateStr || dateStr < startStr || dateStr > endStr) continue;
      const key = dateStr;
      if (!byKey[key]) {
        byKey[key] = { date: dateStr, lateMin: 0, otMin: 0, onlyIn: true, outTimeStr: '미기록' };
      }
      const rec = byKey[key];
      const type = String(r.log_type || '').trim();
      if (type === '출근' || type === 'In') {
        if (Number(r.late_min) > 0) rec.lateMin = Number(r.late_min) || 0;
      } else if (type === '퇴근' || type === 'Out') {
        rec.onlyIn = false;
        rec.outTimeStr = '기록';
      }
      rec.otMin += Number(r.ot_min) || 0;
    }

    let normalDays = 0, otMinutes = 0, otDays = 0, lateMinutes = 0, lateDays = 0;
    Object.keys(byKey).forEach((key) => {
      const rec = byKey[key];
      const late = Number(rec.lateMin) || 0;
      const ot = Number(rec.otMin) || 0;
      const hasOut = rec.onlyIn !== true && rec.outTimeStr !== '미기록';
      if (late > 0) { lateMinutes += late; lateDays++; }
      if (ot > 0) { otMinutes += ot; otDays++; }
      if (hasOut && late === 0) normalDays++;
    });

    return res.status(200).json({
      normalDays,
      otHours: Math.round((otMinutes / 60) * 10) / 10,
      otDays,
      lateMinutes,
      lateDays,
    });
  } catch (e) {
    console.error('getMobileMyAttendanceSummary:', e.message);
    return res.status(200).json({ normalDays: 0, otHours: 0, otDays: 0, lateMinutes: 0, lateDays: 0 });
  }
};
