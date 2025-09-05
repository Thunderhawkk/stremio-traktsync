// src/middleware/adminAuth.js
// Middleware to check if user has admin role

function requireAdmin(req, res, next) {
  // Check if user is authenticated
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      error: 'authentication_required',
      message: 'Authentication required'
    });
  }

  // Check if user has admin role
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({
      error: 'access_denied',
      message: 'Admin access required'
    });
  }

  next();
}

function requireAdminForPage(req, res, next) {
  // Check if user is authenticated
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }

  // Check if user has admin role - redirect to dashboard for non-admins
  if (req.session.user.role !== 'admin') {
    return res.redirect('/dashboard');
  }

  next();
}

module.exports = {
  requireAdmin,
  requireAdminForPage
};