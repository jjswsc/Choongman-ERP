const { supabaseInsert } = require('../../lib/supabase');

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
    const cart = Array.isArray(body.cart) ? body.cart : [];
    const storeName = String(body.storeName || '').trim();
    const userName = String(body.userName || '').trim();

    let sub = 0;
    cart.forEach((i) => { sub += Number(i.price) * Number(i.qty); });
    const vat = Math.round(sub * 0.07);
    const total = sub + vat;

    await supabaseInsert('orders', {
      order_date: new Date().toISOString(),
      store_name: storeName,
      user_name: userName,
      cart_json: JSON.stringify(cart),
      subtotal: sub,
      vat,
      total,
      status: 'Pending',
    });

    return res.status(200).json({ success: true, message: '✅ 주문 완료' });
  } catch (e) {
    console.error('processOrder:', e.message);
    return res.status(200).json({ success: false, message: '❌ 오류: ' + e.message });
  }
};
