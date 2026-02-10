const { supabaseSelectFilter, supabaseInsert, supabaseUpdate } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const d = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const rowId = Number(d.row);
    const payload = { type: String(d.type || '').trim(), code: String(d.code || '').trim(), name: String(d.name || '').trim(), tax_id: String(d.taxId || '').trim(), ceo: String(d.ceo || '').trim(), addr: String(d.addr || '').trim(), manager: String(d.manager || '').trim(), phone: String(d.phone || '').trim(), balance: Number(d.balance) || 0, memo: String(d.memo || '').trim() };
    if (rowId === 0) {
      const existing = payload.code ? (await supabaseSelectFilter('vendors', 'code=eq.' + encodeURIComponent(payload.code)) || []) : [];
      if (payload.code && existing.length > 0) return res.status(200).json({ success: false, message: '❌ 이미 존재하는 거래처 코드입니다.' });
      await supabaseInsert('vendors', payload);
      return res.status(200).json({ success: true, message: '✅ 신규 거래처 등록 완료' });
    }
    await supabaseUpdate('vendors', rowId, payload);
    return res.status(200).json({ success: true, message: '✅ 거래처 정보 수정 완료' });
  } catch (e) {
    console.error('saveVendor:', e.message);
    return res.status(200).json({ success: false, message: '❌ 오류: ' + e.message });
  }
};
