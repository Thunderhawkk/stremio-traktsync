// Watchlist Analytics API Routes
const express = require('express');
const { authRequired } = require('../middleware/auth');
const { repo } = require('../db/repo');
const { logger } = require('../utils/logger');

const router = express.Router();
router.use(authRequired);

// GET /api/watchlist/analytics - Get comprehensive watchlist analytics
router.get('/analytics', async (req, res) => {
  try {
    const userId = req.user.id;
    const { timeRange = '30d' } = req.query;
    
    const analytics = await getWatchlistAnalytics(userId, timeRange);
    res.json(analytics);
  } catch (error) {
    logger.error('Error fetching watchlist analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// GET /api/watchlist/stats - Get watchlist statistics
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id;
    const stats = await getWatchlistStats(userId);
    res.json(stats);
  } catch (error) {
    logger.error('Error fetching watchlist stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/watchlist/trends - Get watchlist trends over time
router.get('/trends', async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = 'weekly', limit = 12 } = req.query;
    
    const trends = await getWatchlistTrends(userId, period, parseInt(limit));
    res.json({ trends });
  } catch (error) {
    logger.error('Error fetching watchlist trends:', error);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// GET /api/watchlist/completion-rate - Get completion rate analytics
router.get('/completion-rate', async (req, res) => {
  try {
    const userId = req.user.id;
    const completionData = await getCompletionRateAnalytics(userId);
    res.json(completionData);
  } catch (error) {
    logger.error('Error fetching completion rate:', error);
    res.status(500).json({ error: 'Failed to fetch completion rate' });
  }
});

// GET /api/watchlist/genre-analysis - Get genre distribution and trends
router.get('/genre-analysis', async (req, res) => {
  try {
    const userId = req.user.id;
    const genreAnalysis = await getGenreAnalysis(userId);
    res.json(genreAnalysis);
  } catch (error) {
    logger.error('Error fetching genre analysis:', error);
    res.status(500).json({ error: 'Failed to fetch genre analysis' });
  }
});

// GET /api/watchlist/time-insights - Get time-based viewing insights
router.get('/time-insights', async (req, res) => {
  try {
    const userId = req.user.id;
    const insights = await getTimeInsights(userId);
    res.json(insights);
  } catch (error) {
    logger.error('Error fetching time insights:', error);
    res.status(500).json({ error: 'Failed to fetch time insights' });
  }
});

// GET /api/watchlist/recommendations-impact - Get recommendations impact on watchlist
router.get('/recommendations-impact', async (req, res) => {
  try {
    const userId = req.user.id;
    const impact = await getRecommendationsImpact(userId);
    res.json(impact);
  } catch (error) {
    logger.error('Error fetching recommendations impact:', error);
    res.status(500).json({ error: 'Failed to fetch impact data' });
  }
});

// Implementation functions
async function getWatchlistAnalytics(userId, timeRange) {
  // Mock comprehensive analytics data
  const baseDate = new Date();
  const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 365;
  
  return {
    overview: {
      totalItems: 156,
      watchedItems: 89,
      currentlyWatching: 12,
      planToWatch: 55,
      dropped: 8,
      onHold: 3,
      completionRate: 0.57,
      averageRating: 7.8,
      totalWatchTime: 4320, // minutes
      averageWatchTime: 48.5 // minutes per item
    },
    trends: {
      addedThisWeek: 8,
      watchedThisWeek: 5,
      addedThisMonth: 23,
      watchedThisMonth: 18,
      longestStreak: 12,
      currentStreak: 3
    },
    predictions: {
      estimatedCompletionDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString(),
      recommendedDailyWatching: 1.2,
      backlogClearanceTime: 78 // days
    },
    recentActivity: generateRecentActivity(7),
    topGenres: [
      { genre: 'Drama', count: 34, percentage: 22 },
      { genre: 'Action', count: 28, percentage: 18 },
      { genre: 'Comedy', count: 25, percentage: 16 },
      { genre: 'Sci-Fi', count: 22, percentage: 14 },
      { genre: 'Thriller', count: 20, percentage: 13 }
    ],
    yearDistribution: generateYearDistribution(),
    ratingDistribution: [
      { rating: '9-10', count: 23, percentage: 26 },
      { rating: '8-8.9', count: 31, percentage: 35 },
      { rating: '7-7.9', count: 21, percentage: 24 },
      { rating: '6-6.9', count: 9, percentage: 10 },
      { rating: '5-5.9', count: 4, percentage: 4 },
      { rating: 'Unrated', count: 1, percentage: 1 }
    ]
  };
}

async function getWatchlistStats(userId) {
  return {
    totalItems: 156,
    byStatus: {
      planToWatch: 55,
      watching: 12,
      completed: 89,
      onHold: 3,
      dropped: 8
    },
    byType: {
      movies: 94,
      series: 62
    },
    byPriority: {
      high: 23,
      medium: 67,
      low: 66
    },
    averages: {
      rating: 7.8,
      watchTime: 48.5,
      addedPerWeek: 4.2,
      completedPerWeek: 2.8
    },
    streaks: {
      currentWatching: 3,
      longestWatching: 12,
      currentAdding: 2,
      longestAdding: 8
    }
  };
}

async function getWatchlistTrends(userId, period, limit) {
  const trends = [];
  const now = new Date();
  
  for (let i = limit - 1; i >= 0; i--) {
    const date = new Date(now);
    if (period === 'daily') {
      date.setDate(date.getDate() - i);
    } else if (period === 'weekly') {
      date.setDate(date.getDate() - (i * 7));
    } else {
      date.setMonth(date.getMonth() - i);
    }
    
    trends.push({
      period: date.toISOString().split('T')[0],
      itemsAdded: Math.floor(Math.random() * 8) + 1,
      itemsWatched: Math.floor(Math.random() * 6) + 1,
      itemsDropped: Math.floor(Math.random() * 2),
      totalWatchTime: Math.floor(Math.random() * 300) + 50,
      averageRating: (Math.random() * 2 + 7).toFixed(1)
    });
  }
  
  return trends;
}

async function getCompletionRateAnalytics(userId) {
  return {
    overall: {
      completionRate: 0.57,
      averageCompletionTime: 18.5, // days
      fastestCompletion: 2.1,
      slowestCompletion: 127.3
    },
    byGenre: [
      { genre: 'Comedy', completionRate: 0.73, averageTime: 12.3 },
      { genre: 'Action', completionRate: 0.68, averageTime: 15.7 },
      { genre: 'Drama', completionRate: 0.52, averageTime: 24.8 },
      { genre: 'Sci-Fi', completionRate: 0.45, averageTime: 28.2 },
      { genre: 'Horror', completionRate: 0.61, averageTime: 16.9 }
    ],
    byType: {
      movies: { completionRate: 0.82, averageTime: 3.2 },
      series: { completionRate: 0.34, averageTime: 45.7 }
    },
    byDecade: [
      { decade: '2020s', completionRate: 0.71, count: 45 },
      { decade: '2010s', completionRate: 0.58, count: 67 },
      { decade: '2000s', completionRate: 0.43, count: 28 },
      { decade: '1990s', completionRate: 0.38, count: 16 }
    ],
    monthlyTrend: generateMonthlyCompletionTrend()
  };
}

async function getGenreAnalysis(userId) {
  return {
    distribution: [
      { genre: 'Drama', count: 34, percentage: 22, avgRating: 8.1, completionRate: 0.52 },
      { genre: 'Action', count: 28, percentage: 18, avgRating: 7.6, completionRate: 0.68 },
      { genre: 'Comedy', count: 25, percentage: 16, avgRating: 7.9, completionRate: 0.73 },
      { genre: 'Sci-Fi', count: 22, percentage: 14, avgRating: 8.3, completionRate: 0.45 },
      { genre: 'Thriller', count: 20, percentage: 13, avgRating: 7.8, completionRate: 0.61 },
      { genre: 'Romance', count: 15, percentage: 10, avgRating: 7.4, completionRate: 0.58 },
      { genre: 'Horror', count: 12, percentage: 8, avgRating: 7.2, completionRate: 0.61 }
    ],
    trends: {
      growing: ['Sci-Fi', 'Drama', 'Documentary'],
      declining: ['Action', 'Comedy'],
      stable: ['Thriller', 'Romance', 'Horror']
    },
    preferences: {
      favoriteGenre: 'Sci-Fi',
      leastFavorite: 'Horror',
      mostCompleted: 'Comedy',
      leastCompleted: 'Sci-Fi',
      highestRated: 'Sci-Fi',
      lowestRated: 'Horror'
    },
    correlations: [
      { genreA: 'Sci-Fi', genreB: 'Thriller', correlation: 0.67 },
      { genreA: 'Action', genreB: 'Adventure', correlation: 0.84 },
      { genreA: 'Drama', genreB: 'Romance', correlation: 0.45 }
    ]
  };
}

async function getTimeInsights(userId) {
  return {
    watchingPatterns: {
      preferredWatchingTime: 'Evening (7-10 PM)',
      averageSessionLength: 94, // minutes
      bingingTendency: 0.34, // 0-1 scale
      weekdayVsWeekend: {
        weekday: 62, // percentage
        weekend: 38
      }
    },
    seasonality: {
      mostActiveMonth: 'December',
      leastActiveMonth: 'June',
      monthlyActivity: generateMonthlyActivity()
    },
    addingPatterns: {
      mostCommonAddingTime: 'Sunday Evening',
      averageTimeBetweenAddAndWatch: 12.5, // days
      impulseAdding: 0.28 // percentage of items watched within 24h of adding
    },
    lifecycle: {
      averageItemLifespan: 45.2, // days from add to completion/drop
      fastestTurnover: 'Comedy',
      slowestTurnover: 'Drama',
      abandonmentRate: 0.15 // percentage of items never watched
    }
  };
}

async function getRecommendationsImpact(userId) {
  return {
    overview: {
      itemsFromRecommendations: 34,
      recommendationAccuracy: 0.68,
      averageRatingFromRecs: 8.1,
      completionRateFromRecs: 0.71
    },
    sources: [
      { source: 'Algorithm', count: 18, accuracy: 0.72, avgRating: 8.2 },
      { source: 'Friends', count: 8, accuracy: 0.65, avgRating: 7.9 },
      { source: 'Trending', count: 5, accuracy: 0.60, avgRating: 7.8 },
      { source: 'Similar Items', count: 3, accuracy: 0.77, avgRating: 8.4 }
    ],
    impact: {
      diversityIncrease: 0.23, // how much recommendations increased genre diversity
      discoveryRate: 0.31, // percentage of recs that were new discoveries
      satisfactionRate: 0.74 // percentage of recs rated positively
    },
    feedback: {
      positiveReactions: 23,
      negativeReactions: 7,
      neutralReactions: 4,
      feedbackResponseRate: 0.85
    }
  };
}

// Helper functions
function generateRecentActivity(days) {
  const activities = [];
  const activityTypes = ['added', 'watched', 'rated', 'removed', 'status_changed'];
  
  for (let i = 0; i < days * 3; i++) {
    const date = new Date(Date.now() - Math.random() * days * 24 * 60 * 60 * 1000);
    activities.push({
      id: `activity_${i}`,
      type: activityTypes[Math.floor(Math.random() * activityTypes.length)],
      title: `Sample Title ${i + 1}`,
      timestamp: date.toISOString(),
      details: `Sample activity details for item ${i + 1}`
    });
  }
  
  return activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function generateYearDistribution() {
  const currentYear = new Date().getFullYear();
  const distribution = [];
  
  for (let year = currentYear; year >= currentYear - 10; year--) {
    distribution.push({
      year: year.toString(),
      count: Math.floor(Math.random() * 20) + 2,
      avgRating: (Math.random() * 2 + 7).toFixed(1)
    });
  }
  
  return distribution;
}

function generateMonthlyCompletionTrend() {
  const trend = [];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  months.forEach(month => {
    trend.push({
      month,
      completionRate: (Math.random() * 0.4 + 0.4).toFixed(2),
      itemsCompleted: Math.floor(Math.random() * 15) + 3
    });
  });
  
  return trend;
}

function generateMonthlyActivity() {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.map(month => ({
    month,
    activity: Math.floor(Math.random() * 40) + 20,
    watchingTime: Math.floor(Math.random() * 500) + 200
  }));
}

module.exports = router;