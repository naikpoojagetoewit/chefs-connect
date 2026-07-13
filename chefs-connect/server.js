require('dotenv').config();
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');

const { requireAuth, requireRole } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customer');
const waiterRoutes = require('./routes/waiter');
const chefRoutes = require('./routes/chef');

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 6 }, // 6 hours
}));

// Public auth routes (signup/login/logout)
app.use('/', authRoutes);

// Role-gated route groups
app.use('/customer', requireRole('customer'), customerRoutes);
app.use('/waiter', requireRole('waiter'), waiterRoutes);
app.use('/chef', requireRole('chef'), chefRoutes);

// Home redirects to the right dashboard based on role
app.get('/', requireAuth, (req, res) => {
  const role = req.session.user.role;
  if (role === 'customer') return res.redirect('/customer/menu');
  if (role === 'waiter') return res.redirect('/waiter/dashboard');
  if (role === 'chef') return res.redirect('/chef/kitchen');
  res.redirect('/login');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 ChefsConnect running at http://localhost:${PORT}`));
