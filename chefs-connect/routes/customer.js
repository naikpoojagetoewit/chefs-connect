const express = require('express');
const crypto = require('crypto');
const QRCode = require('qrcode');
const Razorpay = require('razorpay');
const pool = require('../db');
const { layout, msg, badge, money } = require('../utils/layout');

const router = express.Router();

// Razorpay client is created lazily (only when a payment route is actually
// hit) so the app doesn't crash on startup if keys aren't set yet.
let razorpayClient = null;
function getRazorpay() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay keys are not configured (set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).');
  }
  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayClient;
}

// Cart lives in session: [{ menu_item_id, name, price, qty }]
function getCart(req) {
  if (!req.session.cart) req.session.cart = [];
  return req.session.cart;
}

router.get('/menu', async (req, res) => {
  const categories = await pool.query('SELECT * FROM menu_categories ORDER BY id');
  const items = await pool.query('SELECT * FROM menu_items WHERE is_available = true ORDER BY category_id, name');
  const cart = getCart(req);
  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);

  const sections = categories.rows.map(cat => {
    const catItems = items.rows.filter(i => i.category_id === cat.id);
    if (catItems.length === 0) return '';
    const rows = catItems.map(item => `
      <tr>
        <td><strong>${item.name}</strong><br/><span class="muted">${item.description || ''}</span></td>
        <td>${money(item.price)}</td>
        <td style="width:140px;">
          <form method="POST" action="/customer/cart/add" class="row" style="gap:6px;">
            <input type="hidden" name="menu_item_id" value="${item.id}" />
            <input type="number" name="qty" value="1" min="1" style="width:60px;margin:0;" />
            <button type="submit" style="padding:6px 10px;">Add</button>
          </form>
        </td>
      </tr>`).join('');
    return `<div class="card"><h3>${cat.name}</h3><table>${rows}</table></div>`;
  }).join('');

  res.send(layout('Menu', `
    <h1>Menu</h1>
    <p class="muted">🛒 ${cartCount} item(s) in cart — <a href="/customer/cart">view cart</a></p>
    ${sections}
  `, req.session.user));
});

router.post('/cart/add', async (req, res) => {
  const { menu_item_id, qty } = req.body;
  const result = await pool.query('SELECT * FROM menu_items WHERE id = $1 AND is_available = true', [menu_item_id]);
  const item = result.rows[0];
  if (!item) return res.redirect('/customer/menu');

  const cart = getCart(req);
  const existing = cart.find(c => c.menu_item_id === item.id);
  const addQty = Math.max(1, parseInt(qty) || 1);
  if (existing) {
    existing.qty += addQty;
  } else {
    cart.push({ menu_item_id: item.id, name: item.name, price: Number(item.price), qty: addQty });
  }
  res.redirect('/customer/menu');
});

router.post('/cart/remove/:index', (req, res) => {
  const cart = getCart(req);
  cart.splice(parseInt(req.params.index), 1);
  res.redirect('/customer/cart');
});

router.get('/cart', async (req, res) => {
  const cart = getCart(req);
  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const tables = await pool.query('SELECT * FROM tables ORDER BY table_number');

  const rows = cart.map((i, idx) => `
    <tr>
      <td>${i.name}</td>
      <td>${i.qty}</td>
      <td>${money(i.price)}</td>
      <td>${money(i.price * i.qty)}</td>
      <td>
        <form method="POST" action="/customer/cart/remove/${idx}">
          <button class="danger" style="padding:5px 10px;font-size:12px;" type="submit">Remove</button>
        </form>
      </td>
    </tr>`).join('');

  res.send(layout('Cart', `
    <h1>Your Cart</h1>
    <div class="card">
      ${cart.length === 0 ? '<p class="muted">Your cart is empty. <a href="/customer/menu">Browse the menu</a></p>' : `
      <table>
        <tr><th>Item</th><th>Qty</th><th>Price</th><th>Subtotal</th><th></th></tr>
        ${rows}
      </table>
      <h3>Total: ${money(total)}</h3>
      `}
    </div>
    ${cart.length > 0 ? `
    <div class="card">
      <h2>Checkout</h2>
      <form method="POST" action="/customer/checkout">
        <label>Order Type</label>
        <select name="order_type" id="order_type" onchange="document.getElementById('table_field').style.display = this.value === 'dine_in' ? 'block' : 'none';">
          <option value="dine_in">Dine-in</option>
          <option value="takeaway">Takeaway</option>
        </select>
        <div id="table_field">
          <label>Table Number</label>
          <select name="table_number">
            ${tables.rows.map(t => `<option value="${t.table_number}" ${t.status === 'occupied' ? 'disabled' : ''}>Table ${t.table_number} (${t.capacity} seats) ${t.status === 'occupied' ? '- occupied' : ''}</option>`).join('')}
          </select>
        </div>
        <button type="submit" class="success">Place Order</button>
      </form>
    </div>` : ''}
  `, req.session.user));
});

router.post('/checkout', async (req, res) => {
  const cart = getCart(req);
  if (cart.length === 0) return res.redirect('/customer/cart');
  const { order_type, table_number } = req.body;
  const customerId = req.session.user.id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let tableId = null;
    if (order_type === 'dine_in') {
      const tableResult = await client.query('SELECT * FROM tables WHERE table_number = $1', [table_number]);
      const table = tableResult.rows[0];
      if (!table || table.status === 'occupied') {
        await client.query('ROLLBACK');
        return res.redirect('/customer/cart');
      }
      tableId = table.id;
      await client.query('UPDATE tables SET status = $1 WHERE id = $2', ['occupied', tableId]);
    }

    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, table_id, order_type, status) VALUES ($1,$2,$3,'pending') RETURNING id`,
      [customerId, tableId, order_type]
    );
    const orderId = orderResult.rows[0].id;

    for (const item of cart) {
      await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, item_name, quantity, price_at_order)
         VALUES ($1,$2,$3,$4,$5)`,
        [orderId, item.menu_item_id, item.name, item.qty, item.price]
      );
    }

    await client.query('COMMIT');
    req.session.cart = [];
    res.redirect(`/customer/orders/${orderId}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.redirect('/customer/cart');
  } finally {
    client.release();
  }
});

router.get('/orders', async (req, res) => {
  const result = await pool.query(
    `SELECT o.*, t.table_number FROM orders o LEFT JOIN tables t ON o.table_id = t.id
     WHERE o.customer_id = $1 ORDER BY o.created_at DESC`,
    [req.session.user.id]
  );
  const rows = result.rows.map(o => `
    <tr>
      <td>#${o.id}</td>
      <td>${o.order_type === 'dine_in' ? 'Dine-in (Table ' + o.table_number + ')' : 'Takeaway'}</td>
      <td>${badge(o.status)}</td>
      <td>${new Date(o.created_at).toLocaleString('en-IN')}</td>
      <td><a class="btn" style="padding:5px 10px;font-size:12px;" href="/customer/orders/${o.id}">View</a></td>
    </tr>`).join('');

  res.send(layout('My Orders', `
    <h1>My Orders</h1>
    <div class="card">
      <table>
        <tr><th>Order</th><th>Type</th><th>Status</th><th>Placed</th><th></th></tr>
        ${rows || '<tr><td colspan="5">No orders yet.</td></tr>'}
      </table>
    </div>
  `, req.session.user));
});

router.get('/orders/:id', async (req, res) => {
  const orderResult = await pool.query(
    `SELECT o.*, t.table_number FROM orders o LEFT JOIN tables t ON o.table_id = t.id
     WHERE o.id = $1 AND o.customer_id = $2`,
    [req.params.id, req.session.user.id]
  );
  const order = orderResult.rows[0];
  if (!order) return res.redirect('/customer/orders');

  const itemsResult = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [order.id]);
  const billResult = await pool.query('SELECT * FROM bills WHERE order_id = $1', [order.id]);
  const bill = billResult.rows[0];
  const feedbackResult = await pool.query('SELECT * FROM feedback WHERE order_id = $1', [order.id]);
  const hasFeedback = feedbackResult.rows.length > 0;

  const qrDataUrl = await QRCode.toDataURL(order.qr_token, { width: 220, margin: 1 });

  const itemRows = itemsResult.rows.map(i => `
    <tr><td>${i.item_name}</td><td>${i.quantity}</td><td>${money(i.price_at_order)}</td><td>${badge(i.item_status)}</td></tr>
  `).join('');

  res.send(layout('Order #' + order.id, `
    <h1>Order #${order.id} ${badge(order.status)}</h1>
    <p class="muted">${order.order_type === 'dine_in' ? 'Dine-in · Table ' + order.table_number : 'Takeaway'} · Placed ${new Date(order.created_at).toLocaleString('en-IN')}</p>
    <div class="card">
      <h2>Items</h2>
      <table>
        <tr><th>Item</th><th>Qty</th><th>Price</th><th>Kitchen Status</th></tr>
        ${itemRows}
      </table>
    </div>
    ${!['paid', 'cancelled'].includes(order.status) ? `
    <div class="card" style="text-align:center;">
      <h2>Your Delivery QR</h2>
      <p class="muted">Show this to your waiter when your order arrives — they'll scan it to verify and confirm delivery.</p>
      <img src="${qrDataUrl}" alt="Order verification QR" style="border-radius:8px;" />
      <p class="muted">Order #${order.id} · keep this open until served</p>
    </div>` : ''}
    ${bill ? `
    <div class="card">
      <h2>Bill</h2>
      <table>
        <tr><td>Subtotal</td><td>${money(bill.subtotal)}</td></tr>
        <tr><td>Tax (5%)</td><td>${money(bill.tax)}</td></tr>
        <tr><td>Discount</td><td>-${money(bill.discount)}</td></tr>
        <tr><td><strong>Total</strong></td><td><strong>${money(bill.total)}</strong></td></tr>
      </table>
      ${bill.paid_at ? `
      <p class="muted">✅ Paid via ${bill.payment_method} on ${new Date(bill.paid_at).toLocaleString('en-IN')}</p>` : `
      <p class="muted">Payment pending — pay in person with your waiter, or pay online now:</p>
      <button id="rzp-pay-btn" class="success">Pay Online (Razorpay)</button>
      <p id="rzp-status" class="muted"></p>
      <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
      <script>
        document.getElementById('rzp-pay-btn').addEventListener('click', async function () {
          const statusEl = document.getElementById('rzp-status');
          statusEl.textContent = 'Starting payment...';
          try {
            const createRes = await fetch('/customer/orders/${order.id}/pay/create', { method: 'POST' });
            const createData = await createRes.json();
            if (!createRes.ok) { statusEl.textContent = createData.error || 'Could not start payment.'; return; }

            const rzp = new Razorpay({
              key: createData.key,
              amount: createData.amount,
              currency: 'INR',
              name: 'ChefsConnect',
              description: 'Order #${order.id}',
              order_id: createData.orderId,
              handler: async function (response) {
                statusEl.textContent = 'Verifying payment...';
                const verifyRes = await fetch('/customer/orders/${order.id}/pay/verify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(response),
                });
                const verifyData = await verifyRes.json();
                if (verifyRes.ok && verifyData.success) {
                  window.location.reload();
                } else {
                  statusEl.textContent = verifyData.error || 'Payment verification failed.';
                }
              },
              modal: { ondismiss: function () { statusEl.textContent = 'Payment cancelled.'; } },
              theme: { color: '#c2410c' },
            });
            rzp.on('payment.failed', function (resp) {
              statusEl.textContent = 'Payment failed: ' + resp.error.description;
            });
            rzp.open();
          } catch (err) {
            statusEl.textContent = 'Something went wrong starting payment.';
          }
        });
      </script>`}
    </div>` : ''}
    ${order.status === 'paid' && !hasFeedback ? `
    <div class="card">
      <h2>Leave Feedback</h2>
      <form method="POST" action="/customer/orders/${order.id}/feedback">
        <label>Rating (1-5)</label>
        <input type="number" name="rating" min="1" max="5" required />
        <label>Comment</label>
        <textarea name="comment" rows="3"></textarea>
        <button type="submit">Submit Feedback</button>
      </form>
    </div>` : ''}
    ${hasFeedback ? `<div class="card"><h2>Your Feedback</h2><p>⭐ ${feedbackResult.rows[0].rating}/5</p><p>${feedbackResult.rows[0].comment || ''}</p></div>` : ''}
  `, req.session.user));
});

router.post('/orders/:id/feedback', async (req, res) => {
  const { rating, comment } = req.body;
  const orderResult = await pool.query('SELECT * FROM orders WHERE id = $1 AND customer_id = $2', [req.params.id, req.session.user.id]);
  const order = orderResult.rows[0];
  if (!order || order.status !== 'paid') return res.redirect('/customer/orders');

  await pool.query(
    `INSERT INTO feedback (order_id, customer_id, rating, comment) VALUES ($1,$2,$3,$4)
     ON CONFLICT (order_id) DO NOTHING`,
    [order.id, req.session.user.id, rating, comment]
  );
  res.redirect('/customer/orders/' + order.id);
});

router.post('/orders/:id/pay/create', async (req, res) => {
  const orderResult = await pool.query(
    'SELECT * FROM orders WHERE id = $1 AND customer_id = $2', [req.params.id, req.session.user.id]
  );
  const order = orderResult.rows[0];
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  const billResult = await pool.query('SELECT * FROM bills WHERE order_id = $1', [order.id]);
  const bill = billResult.rows[0];
  if (!bill) return res.status(400).json({ error: 'No bill generated yet — ask your waiter to generate the bill first.' });
  if (bill.paid_at) return res.status(400).json({ error: 'This bill is already paid.' });

  try {
    const razorpay = getRazorpay();
    const rzpOrder = await razorpay.orders.create({
      amount: Math.round(Number(bill.total) * 100), // paise
      currency: 'INR',
      receipt: `chefsconnect_order_${order.id}`,
    });
    await pool.query('UPDATE bills SET gateway_order_id = $1 WHERE id = $2', [rzpOrder.id, bill.id]);
    res.json({ orderId: rzpOrder.id, amount: rzpOrder.amount, key: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('Razorpay order creation failed:', err.message);
    res.status(500).json({ error: 'Online payment isn\'t set up yet. Please pay via your waiter instead.' });
  }
});

router.post('/orders/:id/pay/verify', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment details.' });
  }

  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ error: 'Payment signature verification failed.' });
  }

  const orderResult = await pool.query(
    'SELECT * FROM orders WHERE id = $1 AND customer_id = $2', [req.params.id, req.session.user.id]
  );
  const order = orderResult.rows[0];
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  const billResult = await pool.query(
    'SELECT * FROM bills WHERE order_id = $1 AND gateway_order_id = $2', [order.id, razorpay_order_id]
  );
  const bill = billResult.rows[0];
  if (!bill) return res.status(404).json({ error: 'Bill not found for this payment.' });

  await pool.query(
    `UPDATE bills SET payment_method = 'online', gateway_payment_id = $1, paid_at = NOW() WHERE id = $2`,
    [razorpay_payment_id, bill.id]
  );
  await pool.query(`UPDATE orders SET status = 'paid' WHERE id = $1`, [order.id]);
  if (order.table_id) {
    await pool.query(`UPDATE tables SET status = 'free' WHERE id = $1`, [order.table_id]);
  }

  res.json({ success: true });
});

module.exports = router;