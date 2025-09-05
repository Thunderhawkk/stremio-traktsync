import React from 'react';
import { createRoot } from 'react-dom/client';

interface AnalyticsData {
  totalWatched: number;
  avgRating: number;
  timeSpent: number;
  topGenre: string;
  recentActivity: {
    watchedThisMonth: number;
    ratedThisMonth: number;
    listsCreated: number;
  };
  error?: string;
}

// Simple analytics component
function AnalyticsApp() {
  const [stats, setStats] = React.useState<AnalyticsData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const response = await fetch('/api/analytics', {
        credentials: 'include',
        cache: 'no-store'
      });
      
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else if (response.status === 401) {
        const error = await response.json();
        console.error('Authentication error:', error);
        // Fallback to mock data for demo
        setStats({
          totalWatched: 0,
          avgRating: 0,
          timeSpent: 0,
          topGenre: 'Connect Trakt account',
          recentActivity: {
            watchedThisMonth: 0,
            ratedThisMonth: 0,
            listsCreated: 0
          },
          error: 'Please connect your Trakt account to view analytics'
        });
      } else {
        throw new Error('Failed to fetch analytics');
      }
    } catch (error) {
      console.error('Failed to load analytics:', error);
      // Fallback data on error
      setStats({
        totalWatched: 0,
        avgRating: 0,
        timeSpent: 0,
        topGenre: 'Error loading data',
        recentActivity: {
          watchedThisMonth: 0,
          ratedThisMonth: 0,
          listsCreated: 0
        },
        error: 'Unable to load analytics data'
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-surface-0)'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid var(--color-surface-2)',
          borderTop: '4px solid var(--color-primary)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <style>
          {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
        </style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      padding: '2rem',
      background: 'var(--color-surface-0)'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        {/* Header */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{
            fontSize: '2rem',
            fontWeight: 'bold',
            marginBottom: '0.5rem',
            color: 'inherit'
          }}>
            TraktSync Analytics
          </h1>
          <p style={{
            color: 'var(--color-text-muted, #888)',
            marginBottom: '2rem'
          }}>
            Comprehensive analytics for your Trakt activity and recommendations
          </p>
          <div style={{
            borderBottom: '1px solid var(--color-surface-2)',
            paddingBottom: '1rem'
          }}>
            <a
              href="/dashboard"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: 'var(--color-surface-2)',
                borderRadius: '0.5rem',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'background-color 0.2s',
                border: 'none',
                cursor: 'pointer'
              }}
              onMouseOver={(e: React.MouseEvent<HTMLAnchorElement>) => {
                const target = e.target as HTMLAnchorElement;
                target.style.backgroundColor = 'var(--color-surface-3)';
              }}
              onMouseOut={(e: React.MouseEvent<HTMLAnchorElement>) => {
                const target = e.target as HTMLAnchorElement;
                target.style.backgroundColor = 'var(--color-surface-2)';
              }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                />
              </svg>
              Back to Dashboard
            </a>
          </div>
        </div>

        {/* Main Content */}
        <div style={{
          padding: '4rem 2rem',
          textAlign: 'center',
          backgroundColor: 'var(--color-surface-1)',
          borderRadius: '1rem',
          border: '1px solid var(--color-surface-2)'
        }}>
          <h2 style={{ marginBottom: '1rem', color: 'inherit' }}>Analytics Dashboard</h2>
          <p style={{
            color: 'var(--color-text-muted, #888)',
            marginBottom: '2rem'
          }}>
            Your Trakt activity statistics and insights
          </p>
          
          {stats && !stats.error && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
              marginTop: '2rem'
            }}>
              {[
                ['Total Watched', stats.totalWatched.toLocaleString(), 'Movies & Series'],
                ['Avg Rating', stats.avgRating > 0 ? `${stats.avgRating}/10` : 'No ratings yet', 'Your ratings'],
                ['Time Spent', `${stats.timeSpent} hours`, 'Total watch time'],
                ['Top Genre', stats.topGenre, 'Most watched']
              ].map((stat, i) => (
                <div
                  key={i}
                  style={{
                    padding: '1.5rem',
                    backgroundColor: 'var(--color-surface-2)',
                    borderRadius: '0.5rem',
                    textAlign: 'center'
                  }}
                >
                  <div style={{
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    marginBottom: '0.5rem',
                    color: 'inherit'
                  }}>
                    {stat[1]}
                  </div>
                  <div style={{
                    fontWeight: '500',
                    marginBottom: '0.25rem',
                    color: 'inherit'
                  }}>
                    {stat[0]}
                  </div>
                  <div style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-text-muted, #888)'
                  }}>
                    {stat[2]}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {stats && stats.error && (
            <div style={{
              padding: '2rem',
              backgroundColor: 'var(--color-surface-2)',
              borderRadius: '0.5rem',
              textAlign: 'center',
              marginTop: '2rem',
              border: '1px solid rgba(255, 193, 7, 0.3)'
            }}>
              <div style={{
                fontSize: '1.2rem',
                fontWeight: 'bold',
                marginBottom: '0.5rem',
                color: '#ffc107'
              }}>
                ⚠️ {stats.error}
              </div>
              <p style={{
                color: 'var(--color-text-muted, #888)',
                margin: 0
              }}>
                Connect your Trakt account in the dashboard to view real analytics data.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const container = document.getElementById('analytics-root');
if (container) {
  const root = createRoot(container);
  root.render(<AnalyticsApp />);
}