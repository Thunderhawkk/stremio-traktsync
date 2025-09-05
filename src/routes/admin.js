// src/routes/admin.js
const express = require('express');
const { authRequired, requireRole } = require('../middleware/auth');
const scheduler = require('../jobs/scheduler');
const { repo, optimized } = require('../db/repo');
const databaseMonitor = require('../services/databaseMonitor');

const router = express.Router();
router.use(authRequired, requireRole('admin'));

router.post('/jobs/prewarm', async (_req,res)=>{
  scheduler.prewarmPopularCatalogs().catch(()=>{});
  res.status(202).json({ ok:true, started:true, job:'prewarm' });
});

router.post('/jobs/refresh-tokens', async (_req,res)=>{
  try{
    const summary = await scheduler.refreshAllTokens();
    res.json({ ok:true, ...summary });
  }catch(e){
    res.status(500).json({ ok:false, error:String(e&&e.message||e) });
  }
});

router.get('/users', async (_req,res)=>{
  const users = await repo.listUsers();
  res.json({ users: (users||[]).map(u=>({ id:u.id, username:u.username, role:u.role, createdAt:u.created_at||u.createdAt })) });
});

router.get('/cache-health', async (_req,res)=>{
  // Optional: return cache stats from your cache layer
  res.json({ keys: 0, hits: 0, misses: 0, lastWarmAt: null });
});

router.get('/quality-report', async (_req,res)=>{
  // Optional: compute and return quality report
  res.json({ ok:true, message:'No report implemented' });
});

// Database monitoring and optimization routes
router.get('/database/status', async (_req, res) => {
  try {
    const status = await databaseMonitor.getStatus();
    res.json({ ok: true, ...status });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/database/metrics', async (_req, res) => {
  try {
    const metrics = databaseMonitor.getMetrics();
    res.json({ ok: true, metrics });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post('/database/maintenance', async (_req, res) => {
  try {
    const result = await databaseMonitor.forceMaintenance();
    res.json({ ok: true, maintenance: result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/users/stats', async (_req, res) => {
  try {
    const stats = await optimized.getUserStatistics();
    res.json({ ok: true, stats });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/users/activity', async (req, res) => {
  try {
    const days = parseInt(req.query.days || '30', 10);
    const activity = await optimized.getUserActivitySummary(days);
    res.json({ ok: true, activity, days });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/users/search', async (req, res) => {
  try {
    const { q: searchTerm, page = 1, limit = 20, role, provider } = req.query;
    
    if (searchTerm) {
      const users = await optimized.searchUsers(searchTerm, parseInt(limit, 10));
      res.json({ ok: true, users, searchTerm });
    } else {
      const result = await optimized.findUsersWithPagination({
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        role,
        provider
      });
      res.json({ ok: true, ...result });
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get('/tokens/stats', async (_req, res) => {
  try {
    const stats = await optimized.getRefreshTokenStats();
    res.json({ ok: true, stats });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
