const { supabaseSelectFilter, supabaseUpdate, supabaseInsertMany } = require('../../lib/supabase');

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
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
    const row = body.row != null ? Number(body.row) : NaN;
    const decision = String(body.decision || '').trim();
    const updatedCart = Array.isArray(body.updatedCart) ? body.updatedCart : null;
    const deliveryDate = String(body.deliveryDate || '').trim();

    const orderId = row;
    if (!orderId || isNaN(orderId)) {
      return res.status(200).json({ success: false, code: 'ord_invalid_row', message: '❌ 오류: 잘못된 주문' });
    }

    const orders = await supabaseSelectFilter('orders', 'id=eq.' + orderId);
    if (!orders || orders.length === 0) {
      return res.status(200).json({ success: false, code: 'ord_invalid_row', message: '❌ 오류: 해당 주문 없음' });
    }
    const o = orders[0];
    if (o.status === 'Approved') {
      return res.status(200).json({ success: false, code: 'ord_already_approved', message: '이미 승인된 주문입니다.' });
    }

    const patch = { status: decision };
    if (updatedCart && updatedCart.length > 0) {
      let newSub = 0;
      updatedCart.forEach((i) => { newSub += Number(i.price) * Number(i.qty); });
      patch.cart_json = JSON.stringify(updatedCart);
      patch.subtotal = newSub;
      patch.vat = Math.round(newSub * 0.07);
      patch.total = newSub + patch.vat;
    }
    if (decision === 'Approved') {
      patch.delivery_status = '배송중';
      if (deliveryDate) patch.delivery_date = deliveryDate;
    }

    await supabaseUpdate('orders', orderId, patch);

    if (decision === 'Approved') {
      const finalCart = updatedCart && updatedCart.length > 0 ? updatedCart : JSON.parse(o.cart_json || '[]');
      const today = todayStr();
      const stockRows = finalCart.map((item) => ({
        location: '본사',
        item_code: item.code,
        item_name: item.name || '',
        spec: item.spec || '-',
        qty: -Number(item.qty),
        log_date: today,
        vendor_target: o.store_name,
        log_type: 'Outbound',
        order_id: orderId,
        delivery_status: '배송중',
      }));
      if (stockRows.length) await supabaseInsertMany('stock_logs', stockRows);
      return res.status(200).json({ success: true, code: 'ord_approve_done', message: '승인 처리되었습니다.' });
    }
    if (decision === 'Hold') {
      return res.status(200).json({ success: true, code: 'ord_processed_hold', message: '보류 처리되었습니다.' });
    }
    if (decision === 'Rejected') {
      return res.status(200).json({ success: true, code: 'ord_processed_rejected', message: '반려 처리되었습니다.' });
    }
    return res.status(200).json({ success: true, code: 'ord_processed_hold', message: '처리되었습니다.' });
  } catch (e) {
    console.error('processOrderDecision:', e.message);
    return res.status(200).json({ success: false, message: '❌ 오류: ' + e.message });
  }
};
