const csurf = require('csurf');

// For form endpoints/pages
const csrfProtection = csurf({ cookie: { httpOnly: true, sameSite: 'lax', secure: false } });

module.exports = { csrfProtection };
