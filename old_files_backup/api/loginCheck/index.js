const { supabaseSelectFilter } = require('../../lib/supabase');

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
    const store = String(body.store || '').trim();
    const name = String(body.name || '').trim();
    const pw = String(body.pw || '').trim();
    const isAdminPage = body.isAdminPage !== false;

    if (!store || !name) {
      return res.status(200).json({ success: false, message: 'Login Failed' });
    }

    const filter = `store=eq.${encodeURIComponent(store)}&name=eq.${encodeURIComponent(name)}`;
    const rows = await supabaseSelectFilter('employees', filter);
    if (!rows || rows.length === 0) {
      return res.status(200).json({ success: false, message: 'Login Failed' });
    }

    const row = rows[0];
    const sheetPw = String(row.password || '').trim();
    if (sheetPw !== pw) {
      return res.status(200).json({ success: false, message: 'Login Failed' });
    }

    let rawRole = String(row.role || '').toLowerCase().replace(/\./g, '');
    let finalRole = 'staff';
    if (rawRole.includes('director') || rawRole.includes('ceo') || rawRole.includes('대표')) finalRole = 'director';
    else if (rawRole.includes('officer') || rawRole.includes('총괄') || rawRole.includes('오피스')) finalRole = 'officer';
    else if (rawRole.includes('manager') || rawRole.includes('점장') || rawRole.includes('매니저')) finalRole = 'manager';

    const storeCol = String(row.store || '').trim();
    if ((storeCol === 'Office' || storeCol === '본사' || storeCol === '오피스' || storeCol.toLowerCase() === 'office') && finalRole !== 'director') {
      finalRole = 'officer';
    }

    if (isAdminPage && finalRole !== 'director' && finalRole !== 'officer' && finalRole !== 'manager') {
      return res.status(200).json({ success: false, message: '권한 없음' });
    }

    return res.status(200).json({
      success: true,
      storeName: row.store,
      userName: row.name,
      role: finalRole,
    });
  } catch (e) {
    console.error('loginCheck:', e.message);
    return res.status(200).json({ success: false, message: 'Login Failed' });
  }
};
