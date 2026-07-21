function layout(title, body, user) {
  const nav = () => {
    if (!user) return `<a href="/login">Login</a><a href="/signup">Sign up</a>`;
    if (user.role === 'customer') {
      return `<a href="/customer/menu">Menu</a><a href="/customer/cart">Cart</a><a href="/customer/orders">My Orders</a><a href="/logout">Logout</a>`;
    }
    if (user.role === 'waiter') {
      return `<a href="/waiter/dashboard">Dashboard</a><a href="/waiter/scan">Scan QR</a><a href="/logout">Logout</a>`;
    }
    if (user.role === 'chef') {
      return `<a href="/chef/kitchen">Kitchen</a><a href="/chef/menu">Menu Manager</a><a href="/logout">Logout</a>`;
    }
    return `<a href="/logout">Logout</a>`;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${title} · ChefsConnect</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f6f5f2; margin: 0; color: #2b2b2b; }
  nav { background: #7c2d12; color: #fff; padding: 14px 24px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; }
  nav .brand { font-weight: 700; font-size: 18px; letter-spacing: 0.5px; }
  nav a { color: #fff; text-decoration: none; margin-left: 16px; font-size: 14px; }
  nav a:hover { text-decoration: underline; }
  .container { max-width: 1000px; margin: 30px auto; padding: 0 20px; }
  .card { background: #fff; border-radius: 10px; padding: 22px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); margin-bottom: 20px; }
  h1, h2, h3 { margin-top: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { text-align: left; padding: 9px; border-bottom: 1px solid #eee; font-size: 13.5px; vertical-align: middle; }
  th { background: #faf5ee; }
  input, select, textarea { width: 100%; padding: 8px; margin: 5px 0 12px; border: 1px solid #ccc; border-radius: 5px; font-size: 14px; font-family: inherit; }
  label { font-size: 13px; font-weight: 600; color: #444; }
  button, .btn { background: #c2410c; color: #fff; border: none; padding: 8px 14px; border-radius: 5px; cursor: pointer; font-size: 13.5px; text-decoration: none; display: inline-block; }
  button.secondary, .btn.secondary { background: #6b7280; }
  button.success, .btn.success { background: #16a34a; }
  button.danger, .btn.danger { background: #dc2626; }
  .row { display: flex; gap: 12px; flex-wrap: wrap; }
  .msg { padding: 10px 14px; border-radius: 5px; margin-bottom: 16px; font-size: 14px; }
  .msg.error { background: #fee2e2; color: #991b1b; }
  .msg.success { background: #dcfce7; color: #166534; }
  .badge { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 600; text-transform: uppercase; }
  .badge.pending { background: #fef3c7; color: #92400e; }
  .badge.preparing { background: #dbeafe; color: #1e40af; }
  .badge.ready { background: #d1fae5; color: #065f46; }
  .badge.served { background: #e0e7ff; color: #3730a3; }
  .badge.billed { background: #fce7f3; color: #9d174d; }
  .badge.paid { background: #dcfce7; color: #166534; }
  .badge.cancelled { background: #fee2e2; color: #991b1b; }
  .badge.free { background: #dcfce7; color: #166534; }
  .badge.occupied { background: #fee2e2; color: #991b1b; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  .tile { background: #fff; border-radius: 8px; padding: 16px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .stats { display: flex; gap: 16px; flex-wrap: wrap; }
  .stat { flex: 1; min-width: 140px; background: #fff7ed; padding: 16px; border-radius: 8px; text-align: center; }
  .stat .num { font-size: 24px; font-weight: 700; color: #7c2d12; }
  form.inline { display: inline; }
  .muted { color: #777; font-size: 13px; }
</style>
</head>
<body>
<nav>
  <div class="brand">🍽️ ChefsConnect ${user ? `<span style="font-weight:400;font-size:13px;opacity:0.85;">(${user.role})</span>` : ''}</div>
  <div>${nav()}</div>
</nav>
<div class="container">${body}</div>
</body>
</html>`;
}

function msg(text, type) {
  return text ? `<div class="msg ${type}">${text}</div>` : '';
}

function badge(status) {
  return `<span class="badge ${status}">${status.replace('_', ' ')}</span>`;
}

function money(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = { layout, msg, badge, money };