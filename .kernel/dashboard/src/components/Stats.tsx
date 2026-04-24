/**
 * Stats Component
 * Displays summary statistics: total tokens, average per day, top models/agents
 */

import type { TokenStats } from '@/lib/types';

interface StatsProps {
  stats: TokenStats;
}

export default function Stats({ stats }: StatsProps) {
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(Math.round(num));
  };

  const topModel = Object.entries(stats.tokensByModel).sort((a, b) => b[1] - a[1])[0];
  const topAgent = Object.entries(stats.tokensByAgent).sort((a, b) => b[1] - a[1])[0];
  const topProject = Object.entries(stats.tokensByProject).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Total Tokens */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <div className="text-sm font-medium text-gray-400 mb-2">Total Tokens</div>
        <div className="text-3xl font-bold text-white">{formatNumber(stats.totalTokens)}</div>
        <div className="text-xs text-gray-500 mt-2">All time</div>
      </div>

      {/* Average per Day */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <div className="text-sm font-medium text-gray-400 mb-2">Avg per Day</div>
        <div className="text-3xl font-bold text-white">{formatNumber(stats.averagePerDay)}</div>
        <div className="text-xs text-gray-500 mt-2">Tokens/day</div>
      </div>

      {/* Top Model */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <div className="text-sm font-medium text-gray-400 mb-2">Top Model</div>
        <div className="text-lg font-bold text-green-500">{topModel?.[0] || 'N/A'}</div>
        <div className="text-xs text-gray-500 mt-2">{topModel ? formatNumber(topModel[1]) : '0'} tokens</div>
      </div>

      {/* Top Agent */}
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <div className="text-sm font-medium text-gray-400 mb-2">Top Agent</div>
        <div className="text-lg font-bold text-green-500">{topAgent?.[0] || 'N/A'}</div>
        <div className="text-xs text-gray-500 mt-2">{topAgent ? formatNumber(topAgent[1]) : '0'} tokens</div>
      </div>
    </div>
  );
}
