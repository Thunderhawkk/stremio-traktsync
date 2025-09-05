const express = require('express');
const router = express.Router();
const { ensureValidToken } = require('../services/traktService');
const { authRequired } = require('../middleware/auth');
const { logger } = require('../utils/logger');
// Removed personalizedLists dependency
const axios = require('axios');

// Get user's analytics data from Trakt
router.get('/analytics', authRequired, async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Check if user has Trakt token
    const accessToken = await ensureValidToken(userId);
    if (!accessToken) {
      return res.status(401).json({ error: 'Trakt authentication required. Please connect your Trakt account first.' });
    }

    const headers = {
      'Content-Type': 'application/json',
      'trakt-api-version': '2',
      'trakt-api-key': process.env.TRAKT_CLIENT_ID || '',
      'Authorization': `Bearer ${accessToken}`
    };

    // Fetch analytics data from Trakt API
    const [statsResponse, historyResponse, ratingsResponse] = await Promise.allSettled([
      axios.get('https://api.trakt.tv/users/me/stats', { headers }),
      axios.get('https://api.trakt.tv/users/me/history?limit=100', { headers }),
      axios.get('https://api.trakt.tv/users/me/ratings?limit=100', { headers })
    ]);

    let analytics = {
      totalWatched: 0,
      avgRating: 0,
      timeSpent: 0,
      topGenre: 'Unknown',
      recentActivity: {
        watchedThisMonth: 0,
        ratedThisMonth: 0,
        listsCreated: 0
      },
      breakdown: {
        movies: 0,
        episodes: 0,
        totalTime: 0
      },
      topGenres: [],
      ratings: {
        total: 0,
        average: 0,
        distribution: {}
      }
    };

    // Process stats data
    if (statsResponse.status === 'fulfilled' && statsResponse.value.status === 200) {
      const stats = statsResponse.value.data;
      analytics.totalWatched = (stats.movies?.watched || 0) + (stats.episodes?.watched || 0);
      analytics.breakdown.movies = stats.movies?.watched || 0;
      analytics.breakdown.episodes = stats.episodes?.watched || 0;
      analytics.timeSpent = Math.round((stats.movies?.minutes || 0) / 60); // Convert to hours
      analytics.breakdown.totalTime = stats.movies?.minutes || 0;
      
      // Get top genres from stats if available
      if (stats.movies?.genres && Array.isArray(stats.movies.genres)) {
        analytics.topGenres = stats.movies.genres.slice(0, 5).map(g => g.name);
        analytics.topGenre = analytics.topGenres[0] || 'Unknown';
      }
    }

    // Process history data for recent activity
    if (historyResponse.status === 'fulfilled' && historyResponse.value.status === 200) {
      const history = historyResponse.value.data;
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      
      analytics.recentActivity.watchedThisMonth = history.filter(item => 
        new Date(item.watched_at) > oneMonthAgo
      ).length;
    }

    // Process ratings data
    if (ratingsResponse.status === 'fulfilled' && ratingsResponse.value.status === 200) {
      const ratings = ratingsResponse.value.data;
      analytics.ratings.total = ratings.length;
      
      if (ratings.length > 0) {
        const totalRating = ratings.reduce((sum, item) => sum + (item.rating || 0), 0);
        analytics.avgRating = Math.round((totalRating / ratings.length) * 10) / 10;
        analytics.ratings.average = analytics.avgRating;
        
        // Count ratings this month
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        analytics.recentActivity.ratedThisMonth = ratings.filter(item => 
          new Date(item.rated_at) > oneMonthAgo
        ).length;
        
        // Rating distribution
        const distribution = {};
        ratings.forEach(item => {
          const rating = item.rating || 0;
          distribution[rating] = (distribution[rating] || 0) + 1;
        });
        analytics.ratings.distribution = distribution;
      }
    }

    // Lists created tracking removed
    analytics.recentActivity.listsCreated = 0;

    res.json(analytics);
  } catch (error) {
    logger.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
});

module.exports = router;