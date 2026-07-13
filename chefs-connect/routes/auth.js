const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { layout, msg } = require('../utils/layout');

const router = express.Router();

router.get('/signup', (req, res) => {
  res.send(layout('Sign Up', `
    <div class="card" style="max-width:420px;margin:60px auto;">
      <h2>Create Account</h2>
      ${msg(req.query.error, 'error')}
      <form method="POST" action="/signup">
        <label>I am a</label>
        <select name="role" required>
          <option value="customer">Customer</option>
          <option value="waiter">Waiter</option>
          <option value="chef">Chef</option>
        </select>
        <label>Username</label>
        <input name="username" required />
        <label>Email</label>
        <input type="email" name="email" required />
        <label>Password</label>
        <input type="password" name="password" required minlength="6" />
        <button type="submit">Sign Up</button>
      </form>
      <p style="margin-top:14px;font-size:13px;">Already have an account? <a href="/login">Log in</a></p>
    </div>
  `));
});

router.post('/signup', async (req, res) => {
  const { username, email, password, role } = req.body;
  if (!['customer', 'waiter', 'chef'].includes(role)) {
    return res.redirect('/signup?error=Invalid role selected');
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, role) VALUES ($1,$2,$3,$4) RETURNING id, username, role`,
      [username, email, hash, role]
    );
    req.session.user = result.rows[0];
    res.redirect('/');
  } catch (err) {
    const errMsg = err.code === '23505' ? 'Username or email already exists.' : 'Signup failed.';
    res.redirect('/signup?error=' + encodeURIComponent(errMsg));
  }
});

router.get('/login', (req, res) => {
  res.send(layout('Login', `
    <div class="card" style="max-width:420px;margin:60px auto;">
      <h2>Login</h2>
      ${msg(req.query.error, 'error')}
      <form method="POST" action="/login">
        <label>Username</label>
        <input name="username" required />
        <label>Password</label>
        <input type="password" name="password" required />
        <button type="submit">Login</button>
      </form>
      <p style="margin-top:14px;font-size:13px;">No account? <a href="/signup">Sign up</a></p>
    </div>
  `));
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user) return res.redirect('/login?error=Invalid credentials');
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.redirect('/login?error=Invalid credentials');
    req.session.user = { id: user.id, username: user.username, role: user.role };
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.redirect('/login?error=Something went wrong');
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
