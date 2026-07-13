function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (req.session.user.role !== role) {
      return res.status(403).send('Forbidden: this page is only for ' + role + 's.');
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
