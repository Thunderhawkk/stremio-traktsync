const express = require('express');
const path = require('path');
const { csrfProtection } = require('../middleware/csrf');

const router = express.Router();

// Minimal pages with CSRF
router.get('/login', csrfProtection, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'login.html'));
});

router.get('/register', csrfProtection, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'register.html'));
});

router.get('/dashboard', csrfProtection, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'views', 'dashboard.html'));
});

module.exports = router;
