const express = require('express');
const pool = require('../db');
const { layout, msg, badge, money } = require('../utils/layout');

const router = express.Router();

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
    ${bill ? `
    <div class="card">
      <h2>Bill</h2>
      <table>
        <tr><td>Subtotal</td><td>${money(bill.subtotal)}</td></tr>
        <tr><td>Tax (5%)</td><td>${money(bill.tax)}</td></tr>
        <tr><td>Discount</td><td>-${money(bill.discount)}</td></tr>
        <tr><td><strong>Total</strong></td><td><strong>${money(bill.total)}</strong></td></tr>
      </table>
      <p class="muted">${bill.paid_at ? 'Paid via ' + bill.payment_method + ' on ' + new Date(bill.paid_at).toLocaleString('en-IN') : 'Payment pending'}</p>
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

module.exports = router;
