import React from 'react';
import { useApi } from '../hooks/useApi';
import { dashboardAPI } from '../lib/api';
import { MetricCard } from '../components/MetricCard';
import { FeedAnalyticsCard } from '../components/FeedAnalyticsCard';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { ErrorMessage } from '../components/ErrorMessage';

export function Dashboard() {
  const { data: metrics, loading, error, refetch } = useApi(
    () => dashboardAPI.getMetrics(),
    []
  );
  const {
    data: feedAnalysis,
    loading: feedLoading,
    error: feedError,
    refetch: refetchFeedAnalysis
  } = useApi(
    () => dashboardAPI.getFeedAnalysis(),
    []
  );

  const refreshDashboard = () => {
    refetch();
    refetchFeedAnalysis();
  };

  if (loading) return <LoadingSpinner message="Loading dashboard..." />;
  if (error) return <ErrorMessage message={error} onRetry={refetch} />;
  if (!metrics?.data) return <ErrorMessage message="No data available" />;

  const m = metrics.data;
  const feedData = feedAnalysis?.data;
  const distributionEntries = Object.entries(m.feedTypeDistribution || {});

  return (
    <div className="space-y-8">
      <section className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-blue-700 uppercase">Feed Analytics</p>
            <h1 className="text-3xl font-bold text-gray-900 mt-1">
              Wonder Milk NIR Analytics Dashboard
            </h1>
            <p className="text-gray-500 mt-2">
              {m.totalSamples} samples across {m.feedTypeCount} feed types
            </p>
          </div>

          <button
            onClick={refreshDashboard}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
          >
            Refresh
          </button>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Overview</h2>
          <p className="text-gray-500 mt-1">Live summary of sample volume and core nutrient averages</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard title="Total Samples" value={m.totalSamples} icon="Samples" />
          <MetricCard title="Feed Types" value={m.feedTypeCount} icon="Types" />
          <MetricCard title="Average CP" value={m.averageCP} unit="%" icon="CP" />
          <MetricCard title="Average NDF" value={m.averageNDF} unit="%" icon="NDF" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard title="Average ADF" value={m.averageADF} unit="%" icon="ADF" />
          <MetricCard title="Average Starch" value={m.averageStarch} unit="%" icon="Starch" />
          <MetricCard title="Average Fat" value={m.averageFat} unit="%" icon="Fat" />
          <MetricCard title="Average Ash" value={m.averageAsh} unit="%" icon="Ash" />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Feed Analytics Cards</h2>
          <p className="text-gray-500 mt-1">
            Feed-type counts and nutrient averages from /api/dashboard/feed-analysis
          </p>
        </div>

        {feedLoading && (
          <div className="bg-white border border-gray-200 rounded-lg p-6 text-gray-500">
            Loading feed analytics...
          </div>
        )}

        {feedError && <ErrorMessage message={feedError} onRetry={refetchFeedAnalysis} />}

        {!feedLoading && !feedError && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(feedData?.feedTypes || []).map((feedType) => (
              <FeedAnalyticsCard
                key={feedType.feedType}
                feedType={feedType}
                nutrients={feedData?.nutrients}
              />
            ))}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Feed Type Distribution</h2>
          <div className="space-y-4">
            {distributionEntries.map(([type, count]) => {
              const percentage = m.totalSamples ? ((count / m.totalSamples) * 100).toFixed(1) : '0.0';

              return (
                <div key={type} className="flex items-center justify-between gap-4">
                  <span className="font-medium text-gray-700 w-36 truncate">{type}</span>
                  <div className="flex-1 bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-blue-600 h-3 rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600 w-24 text-right">
                    {count} ({percentage}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Feed Type Summary</h2>

          <div className="overflow-x-auto">
            <table className="min-w-full border border-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  <th className="px-4 py-2 border text-left">Feed Type</th>
                  <th className="px-4 py-2 border text-right">Samples</th>
                  <th className="px-4 py-2 border text-right">Share</th>
                </tr>
              </thead>

              <tbody>
                {distributionEntries.map(([type, count]) => (
                  <tr key={type}>
                    <td className="px-4 py-2 border">{type}</td>
                    <td className="px-4 py-2 border text-right">{count}</td>
                    <td className="px-4 py-2 border text-right">
                      {m.totalSamples ? ((count / m.totalSamples) * 100).toFixed(1) : '0.0'}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <div className="text-center text-sm text-gray-500">
        Last updated: {new Date(m.lastUpdated).toLocaleString()}
      </div>
    </div>
  );
}
