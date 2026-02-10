const { supabaseSelectFilter, supabaseUpdate, supabaseUpdateByFilter, supabaseInsert } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const id = body.id;
    const date = body.date;
    const store = String(body.store || '').trim();
    const inspector = String(body.inspector || '').trim();
    const summary = String(body.summary || '').trim();
    const memo = String(body.memo || '').trim();
    const jsonData = String(body.jsonData || body.json_data || '').trim();

    const dateStr = (date && (date instanceof Date || typeof date === 'object')) ? new Date(date).toISOString().slice(0, 10) : String(date || '').trim().slice(0, 10);
    if (!dateStr || dateStr.length < 10) {
      return res.status(200).json({ success: false, code: 'ERROR', message: 'ERROR: 날짜 형식' });
    }

    if (id) {
      const existing = await supabaseSelectFilter('check_results', 'id=eq.' + encodeURIComponent(String(id)), { limit: 1 }) || [];
      if (existing && existing.length > 0) {
        await supabaseUpdateByFilter('check_results', 'id=eq.' + encodeURIComponent(String(id)), {
          check_date: dateStr,
          store_name: store,
          inspector,
          summary,
          memo,
          json_data: jsonData,
        });
        return res.status(200).json({ success: true, code: 'UPDATED', message: '수정되었습니다.' });
      }
    }

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const sec = String(now.getSeconds()).padStart(2, '0');
    const newId = `${y}${m}${d}${h}${min}${sec}_${store}`;
    await supabaseInsert('check_results', {
      id: newId,
      check_date: dateStr,
      store_name: store,
      inspector,
      summary,
      memo,
      json_data: jsonData,
    });
    return res.status(200).json({ success: true, code: 'SAVED', message: '저장되었습니다.' });
  } catch (e) {
    console.error('saveCheckResult:', e.message);
    return res.status(200).json({ success: false, code: 'ERROR', message: 'ERROR: ' + e.message });
  }
};
