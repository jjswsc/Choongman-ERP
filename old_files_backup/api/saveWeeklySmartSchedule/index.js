const { supabaseSelect, supabaseDelete, supabaseInsertMany } = require('../../lib/supabase');

function toScheduleDateStr(val) {
  if (!val) return '';
  if (typeof val === 'string') return val.slice(0, 10);
  const d = new Date(val);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const storeName = String(body.storeName || '').trim();
    const mondayDate = body.mondayDate || body.mondayStr;
    const scheduleArray = Array.isArray(body.scheduleArray) ? body.scheduleArray : [];

    if (!storeName) {
      return res.status(200).json({ success: false, message: '❌ 매장명이 없습니다.' });
    }

    const startDt = mondayDate ? new Date(mondayDate) : new Date();
    const startStr = startDt.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    const endDt = new Date(startDt);
    endDt.setDate(endDt.getDate() + 6);
    const endStr = endDt.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

    const data = await supabaseSelect('schedules', { order: 'schedule_date.asc' }) || [];
    for (let i = data.length - 1; i >= 0; i--) {
      const row = data[i];
      const rowStore = String(row.store_name || '').trim();
      const rowDateStr = typeof row.schedule_date === 'string' ? row.schedule_date.slice(0, 10) : toScheduleDateStr(row.schedule_date);
      if (rowStore === storeName && rowDateStr && rowDateStr >= startStr && rowDateStr <= endStr && row.id) {
        try { await supabaseDelete('schedules', row.id); } catch (e) { console.warn('delete schedule id', row.id, e.message); }
      }
    }

    if (!scheduleArray || scheduleArray.length === 0) {
      return res.status(200).json({ success: true, message: '✅ ' + storeName + ' 해당 주 시간표가 삭제되었습니다.' });
    }

    const toInsert = scheduleArray.map((s) => ({
      schedule_date: String(s.date || '').substring(0, 10),
      store_name: storeName,
      name: String(s.name || '').trim(),
      plan_in: String(s.pIn || '09:00').trim(),
      plan_out: String(s.pOut || '18:00').trim(),
      break_start: String(s.pBS || '').trim(),
      break_end: String(s.pBE || '').trim(),
      memo: (s.remark && String(s.remark).trim()) ? String(s.remark).trim() : '스마트스케줄러',
    }));

    const CHUNK = 50;
    for (let k = 0; k < toInsert.length; k += CHUNK) {
      await supabaseInsertMany('schedules', toInsert.slice(k, k + CHUNK));
    }
    return res.status(200).json({ success: true, message: '✅ ' + storeName + ' 주간 시간표가 저장되었습니다!' });
  } catch (e) {
    console.error('saveWeeklySmartSchedule:', e.message);
    return res.status(200).json({ success: false, message: '❌ 저장 실패: ' + (e && e.message ? e.message : String(e)) });
  }
};
