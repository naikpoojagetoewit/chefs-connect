const express = require('express');
const pool = require('../db');
const { layout, badge, money } = require('../utils/layout');

const router = express.Router();

router.get('/dashboard', async (req, res) => {
  const tables = await pool.query('SELECT * FROM tables ORDER BY table_number');
  const orders = await pool.query(`
    SELECT o.*, u.username AS customer_name, w.username AS waiter_name, t.table_number
    FROM orders o
    JOIN users u ON o.customer_id = u.id
    LEFT JOIN users w ON o.waiter_id = w.id
    LEFT JOIN tables t ON o.table_id = t.id
    WHERE o.status NOT IN ('paid','cancelled')
    ORDER BY o.created_at ASC
  `);

  const tableTiles = tables.rows.map(t => `
    <div class="tile">
      <div style="font-size:20px;font-weight:700;">Table ${t.table_number}</div>
      <div class="muted">${t.capacity} seats</div>
      ${badge(t.status)}
    </div>`).join('');

  const orderRows = orders.rows.map(o => `
    <tr>
      <td>#${o.id}</td>
      <td>${o.customer_name}</td>
      <td>${o.order_type === 'dine_in' ? 'Table ' + o.table_number : 'Takeaway'}</td>
      <td>${badge(o.status)}</td>
      <td>${o.waiter_name || '<span class="muted">unassigned</span>'}</td>
      <td>
        ${!o.waiter_id ? `<form class="inline" method="POST" action="/waiter/orders/${o.id}/assign"><button style="padding:5px 10px;font-size:12px;">Assign to me</button></form>` : ''}
        ${o.status === 'ready' ? `<form class="inline" method="POST" action="/waiter/orders/${o.id}/serve"><button class="success" style="padding:5px 10px;font-size:12px;">Mark Served</button></form>` : ''}
        ${o.status === 'served' ? `<a class="btn" style="padding:5px 10px;font-size:12px;" href="/waiter/orders/${o.id}/bill">Generate Bill</a>` : ''}
        ${o.status === 'billed' ? `<a class="btn success" style="padding:5px 10px;font-size:12px;" href="/waiter/orders/${o.id}/bill">View Bill / Pay</a>` : ''}
      </td>
    </tr>`).join('');

  res.send(layout('Waiter Dashboard', `
    <h1>Tables</h1>
    <div class="grid">${tableTiles}</div>
    <h1 style="margin-top:30px;">Active Orders</h1>
    <div class="card">
      <table>
        <tr><th>Order</th><th>Customer</th><th>Where</th><th>Status</th><th>Waiter</th><th>Actions</th></tr>
        ${orderRows || '<tr><td colspan="6">No active orders right now.</td></tr>'}
      </table>
    </div>
  `, req.session.user));
});

router.post('/orders/:id/assign', async (req, res) => {
  await pool.query('UPDATE orders SET waiter_id = $1 WHERE id = $2 AND waiter_id IS NULL', [req.session.user.id, req.params.id]);
  res.redirect('/waiter/dashboard');
});

router.post('/orders/:id/serve', async (req, res) => {
  await pool.query(`UPDATE orders SET status = 'served' WHERE id = $1 AND status = 'ready'`, [req.params.id]);
  res.redirect('/waiter/dashboard');
});

router.get('/orders/:id/bill', async (req, res) => {
  const orderResult = await pool.query(
    `SELECT o.*, u.username AS customer_name, t.table_number FROM orders o
     JOIN users u ON o.customer_id = u.id LEFT JOIN tables t ON o.table_id = t.id
     WHERE o.id = $1`, [req.params.id]
  );
  const order = orderResult.rows[0];
  if (!order) return res.redirect('/waiter/dashboard');

  const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
  const billResult = await pool.query('SELECT * FROM bills WHERE order_id = $1', [order.id]);
  const bill = billResult.rows[0];

  const subtotal = itemsResult.rows.reduce((sum, i) => sum + Number(i.price_at_order) * i.quantity, 0);

  const itemRows = itemsResult.rows.map(i => `
    <tr><td>${i.item_name}</td><td>${i.quantity}</td><td>${money(i.price_at_order)}</td><td>${money(i.price_at_order * i.quantity)}</td></tr>
  `).join('');

  res.send(layout('Bill · Order #' + order.id, `
    <h1>Order #${order.id} — ${order.customer_name}</h1>
    <p class="muted">${order.order_type === 'dine_in' ? 'Table ' + order.table_number : 'Takeaway'}</p>
    <div class="card">
      <h2>Items</h2>
      <table><tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr>${itemRows}</table>
      <h3>Subtotal: ${money(subtotal)}</h3>
    </div>
    ${!bill ? `
    <div class="card">
      <h2>Generate Bill</h2>
      <form method="POST" action="/waiter/orders/${order.id}/bill">
        <label>Discount (₹, optional)</label>
        <input type="number" step="0.01" name="discount" value="0" min="0" />
        <p class="muted">Tax is automatically calculated at 5% of subtotal.</p>
        <button type="submit">Generate Bill</button>
      </form>
    </div>` : `
    <div class="card">
      <h2>Bill</h2>
      <table>
        <tr><td>Subtotal</td><td>${money(bill.subtotal)}</td></tr>
        <tr><td>Tax (5%)</td><td>${money(bill.tax)}</td></tr>
        <tr><td>Discount</td><td>-${money(bill.discount)}</td></tr>
        <tr><td><strong>Total</strong></td><td><strong>${money(bill.total)}</strong></td></tr>
      </table>
      ${bill.paid_at ? `<p class="muted">✅ Paid via ${bill.payment_method} on ${new Date(bill.paid_at).toLocaleString('en-IN')}</p>` : `
      <form method="POST" action="/waiter/bills/${bill.id}/pay">
        <label>Payment Method</label>
        <select name="payment_method">
          <option value="cash">Cash</option>
          <option value="card">Card</option>
          <option value="upi">UPI</option>
        </select>
        <button type="submit" class="success">Mark as Paid</button>
      </form>`}
    </div>`}
    <a class="btn secondary" href="/waiter/dashboard">Back to Dashboard</a>
  `, req.session.user));
});

router.post('/orders/:id/bill', async (req, res) => {
  const { discount } = req.body;
  const order = (await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id])).rows[0];
  if (!order) return res.redirect('/waiter/dashboard');

  const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
  const subtotal = itemsResult.rows.reduce((sum, i) => sum + Number(i.price_at_order) * i.quantity, 0);
  const tax = Math.round(subtotal * 0.05 * 100) / 100;
  const disc = Math.max(0, parseFloat(discount) || 0);
  const total = Math.round((subtotal + tax - disc) * 100) / 100;

  await pool.query(
    `INSERT INTO bills (order_id, subtotal, tax, discount, total) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (order_id) DO NOTHING`,
    [order.id, subtotal, tax, disc, total]
  );
  await pool.query(`UPDATE orders SET status = 'billed' WHERE id = $1`, [order.id]);
  res.redirect(`/waiter/orders/${order.id}/bill`);
});

router.post('/bills/:id/pay', async (req, res) => {
  const { payment_method } = req.body;
  const billResult = await pool.query('SELECT * FROM bills WHERE id = $1', [req.params.id]);
  const bill = billResult.rows[0];
  if (!bill) return res.redirect('/waiter/dashboard');

  await pool.query(`UPDATE bills SET payment_method = $1, paid_at = NOW() WHERE id = $2`, [payment_method, bill.id]);
  const order = (await pool.query('SELECT * FROM orders WHERE id = $1', [bill.order_id])).rows[0];
  await pool.query(`UPDATE orders SET status = 'paid' WHERE id = $1`, [order.id]);
  if (order.table_id) {
    await pool.query(`UPDATE tables SET status = 'free' WHERE id = $1`, [order.table_id]);
  }
  res.redirect(`/waiter/orders/${order.id}/bill`);
});

module.exports = router;
