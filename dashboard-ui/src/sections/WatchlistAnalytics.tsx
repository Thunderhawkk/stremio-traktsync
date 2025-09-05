import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useNotify } from '../context/notify';
import { useWebSocket } from '../hooks/useWebSocket';

interface WatchlistAnalytics {
  overview: {
    totalItems: number;
    watchedItems: number;
    currentlyWatching: number;
    planToWatch: number;
    dropped: number;
    onHold: number;
    completionRate: number;
    averageRating: number;
    totalWatchTime: number;
    averageWatchTime: number;
  };
  trends: {
    addedThisWeek: number;
    watchedThisWeek: number;
    addedThisMonth: number;
    watchedThisMonth: number;
    longestStreak: number;
    currentStreak: number;
  };
  topGenres: Array<{
    genre: string;
    count: number;
    percentage: number;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    title: string;
    timestamp: string;
  }>;
}

export default function WatchlistAnalytics() {
  const [analytics, setAnalytics] = useState<WatchlistAnalytics | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [timeRange, setTimeRange] = useState('30d');
  const [isLoading, setIsLoading] = useState(false);
  
  const { show } = useNotify();
  const { status } = useWebSocket();

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/watchlist/analytics?timeRange=${timeRange}`);
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch (error) {
      show({ kind: 'err', text: 'Failed to load watchlist analytics' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Watchlist Analytics</h1>
          <p className="text-muted">Deep insights into your viewing patterns and preferences</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${status.connected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-muted">
              {status.connected ? 'Live data' : 'Offline mode'}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{analytics.overview.totalItems}</div>
              <p className="text-xs text-muted">
                {analytics.overview.watchedItems} watched ({Math.round((analytics.overview.watchedItems / analytics.overview.totalItems) * 100)}%)
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.round(analytics.overview.completionRate * 100)}%</div>
              <p className="text-xs text-muted">
                {analytics.trends.currentStreak} day current streak
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Average Rating</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">★ {analytics.overview.averageRating}</div>
              <p className="text-xs text-muted">
                For completed items
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Watch Time</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Math.round(analytics.overview.totalWatchTime / 60)}h</div>
              <p className="text-xs text-muted">
                {analytics.overview.averageWatchTime}min avg per item
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="genres">Genres</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <OverviewTab analytics={analytics} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="trends" className="space-y-6">
          <TrendsTab analytics={analytics} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="genres" className="space-y-6">
          <GenresTab analytics={analytics} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="insights" className="space-y-6">
          <InsightsTab analytics={analytics} isLoading={isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function OverviewTab({ analytics, isLoading }: { analytics: WatchlistAnalytics | null; isLoading: boolean }) {
  if (isLoading || !analytics) return <div>Loading overview...</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Watchlist Status</CardTitle>
          <CardDescription>Distribution of items by watching status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { label: 'Plan to Watch', value: analytics.overview.planToWatch, color: 'bg-blue-500' },
              { label: 'Currently Watching', value: analytics.overview.currentlyWatching, color: 'bg-orange-500' },
              { label: 'Completed', value: analytics.overview.watchedItems, color: 'bg-green-500' },
              { label: 'On Hold', value: analytics.overview.onHold, color: 'bg-yellow-500' },
              { label: 'Dropped', value: analytics.overview.dropped, color: 'bg-red-500' }
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-sm">{label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{value}</span>
                  <div className="w-20 bg-muted rounded-full h-2">
                    <div 
                      className={`${color} h-2 rounded-full`}
                      style={{ width: `${(value / analytics.overview.totalItems) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Your latest watchlist actions</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {analytics.recentActivity.slice(0, 8).map((activity) => (
              <div key={activity.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                <div className="w-2 h-2 rounded-full mt-2 bg-primary" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{activity.title}</p>
                  <p className="text-xs text-muted capitalize">{activity.type.replace('_', ' ')}</p>
                  <p className="text-xs text-muted">{new Date(activity.timestamp).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function TrendsTab({ analytics, isLoading }: { analytics: WatchlistAnalytics | null; isLoading: boolean }) {
  if (isLoading || !analytics) return <div>Loading trends...</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Activity Summary</CardTitle>
          <CardDescription>Your watchlist activity breakdown</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{analytics.trends.addedThisWeek}</div>
              <div className="text-xs text-muted">Added this week</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{analytics.trends.watchedThisWeek}</div>
              <div className="text-xs text-muted">Watched this week</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">{analytics.trends.addedThisMonth}</div>
              <div className="text-xs text-muted">Added this month</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">{analytics.trends.watchedThisMonth}</div>
              <div className="text-xs text-muted">Watched this month</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Viewing Streaks</CardTitle>
          <CardDescription>Your consistency metrics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm">Current Streak</span>
              <span className="text-xl font-bold text-orange-500">{analytics.trends.currentStreak} days</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="bg-orange-500 h-2 rounded-full"
                style={{ width: `${Math.min((analytics.trends.currentStreak / analytics.trends.longestStreak) * 100, 100)}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm">Longest Streak</span>
              <span className="text-xl font-bold text-purple-500">{analytics.trends.longestStreak} days</span>
            </div>
            <p className="text-xs text-muted">Your personal record</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function GenresTab({ analytics, isLoading }: { analytics: WatchlistAnalytics | null; isLoading: boolean }) {
  if (isLoading || !analytics) return <div>Loading genre analysis...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Genre Preferences</CardTitle>
        <CardDescription>Your most watched genres</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {analytics.topGenres.map((genre, index) => (
            <div key={genre.genre} className="flex items-center gap-3">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-medium">
                {index + 1}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">{genre.genre}</span>
                  <span className="text-sm">{genre.count} ({genre.percentage}%)</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full"
                    style={{ width: `${genre.percentage}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function InsightsTab({ analytics, isLoading }: { analytics: WatchlistAnalytics | null; isLoading: boolean }) {
  if (isLoading || !analytics) return <div>Loading insights...</div>;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Key Insights</CardTitle>
          <CardDescription>Personalized recommendations based on your data</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-1">•</span>
              <span>You complete {Math.round(analytics.overview.completionRate * 100)}% of items you start watching</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              <span>Your favorite genre is {analytics.topGenres[0]?.genre} with {analytics.topGenres[0]?.count} items</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-500 mt-1">•</span>
              <span>You're on a {analytics.trends.currentStreak} day watching streak</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-orange-500 mt-1">•</span>
              <span>You added {analytics.trends.addedThisWeek} items to your watchlist this week</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recommendations</CardTitle>
          <CardDescription>Tips to improve your viewing experience</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="text-green-500 mt-1">•</span>
              <span>Consider exploring new genres to diversify your watchlist</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-1">•</span>
              <span>Set a daily watching goal to maintain your streak</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-purple-500 mt-1">•</span>
              <span>Review and clean up items you're unlikely to watch</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-orange-500 mt-1">•</span>
              <span>Rate content to get better recommendations</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}