const { supabaseSelectFilter, supabaseUpdate } = require('../../lib/supabase');

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
    const row = body.row != null ? Number(body.row) : NaN;
    const deliveryDate = String(body.deliveryDate || '').trim();

    const orderId = row;
    if (!orderId || isNaN(orderId)) {
      return res.status(200).json({ success: false, code: 'ord_invalid_row', message: '잘못된 주문' });
    }
    if (!deliveryDate) {
      return res.status(200).json({ success: false, code: 'ord_delivery_required', message: '배송일을 입력하세요.' });
    }

    const orders = await supabaseSelectFilter('orders', 'id=eq.' + orderId);
    if (!orders || orders.length === 0) {
      return res.status(200).json({ success: false, code: 'ord_invalid_row', message: '해당 주문 없음' });
    }
    if (orders[0].status !== 'Approved') {
      return res.status(200).json({ success: false, code: 'ord_only_approved_change', message: '승인된 주문만 배송일 변경 가능' });
    }

    await supabaseUpdate('orders', orderId, { delivery_date: deliveryDate });
    return res.status(200).json({ success: true, code: 'ord_delivery_updated', message: '배송일이 변경되었습니다.' });
  } catch (e) {
    console.error('updateOrderDeliveryDate:', e.message);
    return res.status(200).json({ success: false, message: '❌ 오류: ' + e.message });
  }
};
