// src/routes/admin.js
const express = require('express');
const { authRequired, requireRole } = require('../middleware/auth');
const scheduler = require('../jobs/scheduler');
const { repo } = require('../db/repo');

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

module.exports = router;
