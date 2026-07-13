const express = require('express');
const pool = require('../db');
const { layout, badge, money } = require('../utils/layout');

const router = express.Router();

router.get('/kitchen', async (req, res) => {
  const result = await pool.query(`
    SELECT oi.*, o.order_type, o.created_at AS order_created_at, t.table_number
    FROM order_items oi
    JOIN orders o ON oi.order_id = o.id
    LEFT JOIN tables t ON o.table_id = t.id
    WHERE oi.item_status IN ('pending','preparing') AND o.status NOT IN ('cancelled')
    ORDER BY o.created_at ASC
  `);

  const rows = result.rows.map(i => `
    <tr>
      <td>#${i.order_id}</td>
      <td>${i.order_type === 'dine_in' ? 'Table ' + i.table_number : 'Takeaway'}</td>
      <td>${i.item_name}</td>
      <td>${i.quantity}</td>
      <td>${badge(i.item_status)}</td>
      <td>
        ${i.item_status === 'pending' ? `<form class="inline" method="POST" action="/chef/items/${i.id}/start"><button style="padding:5px 10px;font-size:12px;">Start Preparing</button></form>` : ''}
        ${i.item_status === 'preparing' ? `<form class="inline" method="POST" action="/chef/items/${i.id}/ready"><button class="success" style="padding:5px 10px;font-size:12px;">Mark Ready</button></form>` : ''}
      </td>
    </tr>`).join('');

  res.send(layout('Kitchen', `
    <h1>Kitchen Queue</h1>
    <div class="card">
      <table>
        <tr><th>Order</th><th>Where</th><th>Item</th><th>Qty</th><th>Status</th><th>Action</th></tr>
        ${rows || '<tr><td colspan="6">No pending items — kitchen is clear! 🎉</td></tr>'}
      </table>
    </div>
  `, req.session.user));
});

router.post('/items/:id/start', async (req, res) => {
  await pool.query(`UPDATE order_items SET item_status = 'preparing' WHERE id = $1 AND item_status = 'pending'`, [req.params.id]);
  const item = (await pool.query('SELECT order_id FROM order_items WHERE id = $1', [req.params.id])).rows[0];
  if (item) {
    await pool.query(`UPDATE orders SET status = 'preparing' WHERE id = $1 AND status = 'pending'`, [item.order_id]);
  }
  res.redirect('/chef/kitchen');
});

router.post('/items/:id/ready', async (req, res) => {
  await pool.query(`UPDATE order_items SET item_status = 'ready' WHERE id = $1`, [req.params.id]);
  const item = (await pool.query('SELECT order_id FROM order_items WHERE id = $1', [req.params.id])).rows[0];
  if (item) {
    const remaining = await pool.query(
      `SELECT COUNT(*) FROM order_items WHERE order_id = $1 AND item_status != 'ready'`,
      [item.order_id]
    );
    if (parseInt(remaining.rows[0].count) === 0) {
      await pool.query(`UPDATE orders SET status = 'ready' WHERE id = $1`, [item.order_id]);
    }
  }
  res.redirect('/chef/kitchen');
});

router.get('/menu', async (req, res) => {
  const categories = await pool.query('SELECT * FROM menu_categories ORDER BY name');
  const items = await pool.query(`
    SELECT mi.*, mc.name AS category_name FROM menu_items mi
    LEFT JOIN menu_categories mc ON mi.category_id = mc.id
    ORDER BY mc.name, mi.name
  `);

  const rows = items.rows.map(i => `
    <tr>
      <td>${i.name}</td>
      <td>${i.category_name || '-'}</td>
      <td>${money(i.price)}</td>
      <td>${i.is_available ? '<span class="badge free">available</span>' : '<span class="badge occupied">unavailable</span>'}</td>
      <td>
        <form class="inline" method="POST" action="/chef/menu/items/${i.id}/toggle">
          <button class="${i.is_available ? 'danger' : 'success'}" style="padding:5px 10px;font-size:12px;">
            ${i.is_available ? 'Mark Unavailable' : 'Mark Available'}
          </button>
        </form>
      </td>
    </tr>`).join('');

  res.send(layout('Menu Manager', `
    <h1>Menu Manager</h1>
    <div class="card">
      <h2>Add New Item</h2>
      <form method="POST" action="/chef/menu/items">
        <div class="row">
          <div style="flex:1"><label>Name</label><input name="name" required /></div>
          <div style="flex:1"><label>Price (₹)</label><input type="number" step="0.01" name="price" required /></div>
        </div>
        <label>Category</label>
        <select name="category_id">
          ${categories.rows.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
        <label>Description</label>
        <input name="description" placeholder="optional" />
        <button type="submit">Add Item</button>
      </form>
    </div>
    <div class="card">
      <h2>All Menu Items</h2>
      <table>
        <tr><th>Name</th><th>Category</th><th>Price</th><th>Status</th><th>Action</th></tr>
        ${rows}
      </table>
    </div>
  `, req.session.user));
});

router.post('/menu/items', async (req, res) => {
  const { name, description, price, category_id } = req.body;
  await pool.query(
    `INSERT INTO menu_items (category_id, name, description, price) VALUES ($1,$2,$3,$4)`,
    [category_id || null, name, description, price]
  );
  res.redirect('/chef/menu');
});

router.post('/menu/items/:id/toggle', async (req, res) => {
  await pool.query('UPDATE menu_items SET is_available = NOT is_available WHERE id = $1', [req.params.id]);
  res.redirect('/chef/menu');
});

module.exports = router;
