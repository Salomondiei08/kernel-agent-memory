/**
 * MemoryBrowser Component
 * Displays memory entries in a table format
 */

import type { MemoryEntry } from '@/lib/types';

interface MemoryBrowserProps {
  entries: MemoryEntry[];
}

export default function MemoryBrowser({ entries }: MemoryBrowserProps) {
  const sortedEntries = [...entries].sort((a, b) => {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const recentEntries = sortedEntries.slice(0, 10);

  if (recentEntries.length === 0) {
    return (
      <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Memory Entries</h3>
        <div className="text-center py-8 text-gray-500">No memory entries yet</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Recent Memory Entries</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Agent</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Category</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Value</th>
              <th className="text-left py-3 px-4 text-gray-400 font-medium">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {recentEntries.map((entry) => (
              <tr key={entry.key} className="border-b border-gray-800 hover:bg-gray-800 transition">
                <td className="py-3 px-4 text-green-500 font-medium">{entry.agent}</td>
                <td className="py-3 px-4 text-gray-300">{entry.category || '-'}</td>
                <td className="py-3 px-4 text-gray-400 truncate max-w-xs">{entry.value}</td>
                <td className="py-3 px-4 text-gray-500 text-xs whitespace-nowrap">
                  {new Date(entry.timestamp).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 text-xs text-gray-500">
        Showing {recentEntries.length} of {entries.length} entries
      </div>
    </div>
  );
}
