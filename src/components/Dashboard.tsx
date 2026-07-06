import { useState } from 'react';
import {
  Mail,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { ProcessedEmail, ActivityLog, SystemSettings } from '../types';

interface DashboardProps {
  emails: ProcessedEmail[];
  logs: ActivityLog[];
  settings: SystemSettings | null;
  onSync: () => Promise<{ success: boolean; added: number; skipped: number }>;
}

export default function Dashboard({ emails, logs, settings, onSync }: DashboardProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ added: number; skipped: number } | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  // Statistics
  const totalProcessed = emails.length;
  const highImportanceCount = emails.filter((e) => e.importance === 'High').length;
  const lastSyncTime = logs.find((l) => l.type === 'GMAIL_POLL')?.time || '';

  // Get percentage
  const getPercentage = (count: number) => {
    if (totalProcessed === 0) return 0;
    return Math.round((count / totalProcessed) * 100);
  };

  // Compute category distributions
  const categories: Record<string, number> = {};
  emails.forEach((email) => {
    categories[email.category] = (categories[email.category] || 0) + 1;
  });

  const handleSyncClick = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    setSyncFeedback(null);
    try {
      const res = await onSync();
      if (res.success) {
        setSyncResult({ added: res.added, skipped: res.skipped });
        setTimeout(() => setSyncResult(null), 6000); // clear banner after 6s
      }
    } catch (err: any) {
      setSyncFeedback(err.message || 'Sync operation failed unexpectedly.');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6" id="dashboard-tab">
      {/* Upper Statistics Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Total Processed */}
        <div className="glass-card rounded-[24px] p-6 flex items-start justify-between relative overflow-hidden">
          <div className="space-y-2 z-10">
            <p className="text-xs font-mono tracking-wider text-gray-400 uppercase">Processed Emails</p>
            <h3 className="text-4xl font-bold tracking-tight text-white">{totalProcessed}</h3>
            <p className="text-xs text-gray-500">Routed securely via AI gateway</p>
          </div>
          <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl text-indigo-400 z-10">
            <Mail className="w-6 h-6" />
          </div>
          {/* Subtle accent glow */}
          <div className="absolute -bottom-10 -right-10 w-24 h-24 rounded-full bg-indigo-500/5 filter blur-xl"></div>
        </div>

        {/* High Priority Alerts */}
        <div className="glass-card rounded-[24px] p-6 flex items-start justify-between relative overflow-hidden">
          <div className="space-y-2 z-10">
            <p className="text-xs font-mono tracking-wider text-gray-400 uppercase">High Priority Alerts</p>
            <h3 className="text-4xl font-bold tracking-tight text-white">{highImportanceCount}</h3>
            <p className="text-xs text-gray-500">
              {getPercentage(highImportanceCount)}% of overall emails processed
            </p>
          </div>
          <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl z-10">
            <AlertTriangle className="w-6 h-6" />
          </div>
          {/* Subtle accent glow */}
          <div className="absolute -bottom-10 -right-10 w-24 h-24 rounded-full bg-red-500/5 filter blur-xl"></div>
        </div>

        {/* Inbox Sync Daemon */}
        <div className="glass-card rounded-[24px] p-6 flex flex-col justify-between relative overflow-hidden sm:col-span-2 lg:col-span-1">
          <div className="flex items-start justify-between mb-4 z-10">
            <div className="space-y-1">
              <p className="text-xs font-mono tracking-wider text-gray-400 uppercase">Sync Daemon</p>
              <h4 className="text-sm font-semibold text-white">
                {settings?.aiModel ? 'Active Model Sync' : 'Sandbox AI Engine'}
              </h4>
            </div>
            <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[9px] font-mono font-medium uppercase text-emerald-400">Live</span>
            </div>
          </div>
          <div className="space-y-2 text-xs z-10">
            <div className="flex justify-between border-b border-white/5 pb-1.5 text-gray-400">
              <span>Last Sync Time:</span>
              <span className="font-mono font-medium text-white">
                {lastSyncTime || 'Never synced'}
              </span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Background Poll:</span>
              <span className="font-mono font-medium text-white">Every {settings?.gmailPollInterval || 5}m (Config)</span>
            </div>
          </div>
          {/* Subtle accent glow */}
          <div className="absolute -bottom-10 -right-10 w-24 h-24 rounded-full bg-emerald-500/5 filter blur-xl"></div>
        </div>
      </div>

      {/* Control Panel Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sync Console */}
        <div className="glass-card rounded-[28px] p-6 lg:col-span-7 flex flex-col justify-between space-y-6 relative overflow-hidden">
          <div className="space-y-2 z-10">
            <h3 className="text-lg font-bold tracking-tight text-white">AI Routing Control Panel</h3>
            <p className="text-sm text-gray-400 leading-relaxed">
              Scan, clean, and process incoming emails with high-performance LLM parsing. Gemini acts as an autonomous router — omitting noise, extracting summaries, and prioritizing tasks before they clutter your device.
            </p>
          </div>

          <div className="p-4 rounded-2xl glass-card border border-white/5 space-y-3 z-10">
            <div className="flex justify-between items-center text-xs text-gray-400">
              <span className="font-medium font-mono text-gray-400">Sync Engine:</span>
              <span className="bg-white/10 px-2.5 py-1 rounded-lg border border-white/10 font-mono font-medium text-white text-[10px]">
                {settings?.aiModel || 'gemini-3.5-flash'}
              </span>
            </div>
            {syncResult && (
              <div className="flex items-start space-x-2.5 text-xs bg-emerald-950/20 text-emerald-300 p-3 rounded-xl border border-emerald-900/40">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-emerald-200">Sync Successful!</p>
                  <p className="opacity-90 mt-0.5">
                    {syncResult.added > 0 
                      ? `Discovered, analyzed and classified ${syncResult.added} new email(s).` 
                      : 'Sync completed. Inbox is fully cleared and optimized.'}
                    {syncResult.skipped > 0 && ` (${syncResult.skipped} spam/promotion ignored)`}
                  </p>
                </div>
              </div>
            )}
            {syncFeedback && (
              <div className="flex items-start space-x-2 text-xs bg-red-950/20 text-red-300 p-3 rounded-xl border border-red-900/40">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">{syncFeedback}</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between z-10 pt-2">
            <div className="flex items-center space-x-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-mono text-gray-500">DAEMON ACTIVE</span>
            </div>

            <button
              onClick={handleSyncClick}
              disabled={isSyncing}
              className="flex items-center space-x-2 glass-panel rounded-xl border border-white/10 px-4 py-2 text-white font-medium transition-all hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Synchronizing...' : 'Run Daemon Sync'}</span>
            </button>
          </div>
        </div>

        {/* Categories Distribution */}
        <div className="glass-card rounded-[28px] p-6 lg:col-span-5 space-y-6 relative overflow-hidden">
          <div className="space-y-1.5 z-10">
            <h3 className="text-lg font-bold tracking-tight text-white">Inbox Distribution</h3>
            <p className="text-xs text-gray-400">Classified categories dynamically allocated by AI</p>
          </div>

          <div className="space-y-4 z-10 relative">
            {Object.keys(categories).length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-500 font-mono">
                No processed emails available. Run sync to build statistics.
              </div>
            ) : (
              Object.entries(categories).map(([cat, count]) => {
                const percentage = getPercentage(count);
                return (
                  <div key={cat} className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-gray-300">{cat}</span>
                      <span className="font-mono text-gray-400 font-medium">
                        {count} ({percentage}%)
                      </span>
                    </div>
                    {/* Glass progress bar */}
                    <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/5">
                      <div
                        className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Recents Widget */}
      <div className="glass-card rounded-[28px] p-6 relative overflow-hidden">
        <div className="flex items-center justify-between mb-6 z-10 relative">
          <div className="space-y-0.5">
            <h3 className="text-base font-bold tracking-tight text-white">Recent Activity</h3>
            <p className="text-xs text-gray-400">Latest raw sync transaction outputs from engine logs</p>
          </div>
        </div>

        <div className="space-y-3 z-10 relative">
          {logs.slice(0, 4).map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between text-xs p-3.5 rounded-2xl glass-card border border-white/5"
            >
              <div className="flex items-center space-x-3">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[9px] font-mono font-medium ${
                    log.level === 'ERROR'
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                      : log.level === 'WARNING'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                  }`}
                >
                  {log.level}
                </span>
                <span className="font-mono text-gray-300">{log.type}</span>
                <span className="text-gray-400 truncate max-w-[180px] sm:max-w-md">
                  {log.desc}
                </span>
              </div>
              <span className="text-[10px] font-mono text-gray-500">{log.time}</span>
            </div>
          ))}

          {logs.length === 0 && (
            <div className="py-8 text-center text-xs text-gray-500 font-mono">
              System log is empty. Wait for background events.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
