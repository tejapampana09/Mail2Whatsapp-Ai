import { useState } from 'react';
import {
  Mail,
  AlertTriangle,
  RefreshCw,
  Layers,
  Clock,
  ArrowRight,
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
        <div className="bg-[#111111] border border-[#222222] rounded-2xl p-6 shadow-md hover:shadow-lg transition-all duration-300 flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs font-mono tracking-wider text-[#888888] uppercase">Processed Emails</p>
            <h3 className="text-4xl font-sans font-bold tracking-tight text-white">{totalProcessed}</h3>
            <p className="text-xs text-[#888888]">Routed securely via Gemini AI</p>
          </div>
          <div className="p-3 bg-[#1a1a1a] rounded-xl text-white">
            <Mail className="w-6 h-6 text-white" />
          </div>
        </div>

        {/* High Priority Alerts */}
        <div className="bg-[#111111] border border-[#222222] rounded-2xl p-6 shadow-md hover:shadow-lg transition-all duration-300 flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-xs font-mono tracking-wider text-[#888888] uppercase">High Priority Alerts</p>
            <h3 className="text-4xl font-sans font-bold tracking-tight text-white">{highImportanceCount}</h3>
            <p className="text-xs text-[#888888]">
              {getPercentage(highImportanceCount)}% of overall emails processed
            </p>
          </div>
          <div className="p-3 bg-red-950/40 text-red-400 rounded-xl border border-red-900/50 bento-glow-red">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        {/* Inbox Sync Daemon */}
        <div className="bg-[#111111] border border-[#222222] rounded-2xl p-6 shadow-md hover:shadow-lg transition-all duration-300 sm:col-span-2 lg:col-span-1 flex flex-col justify-between">
          <div className="flex items-start justify-between mb-4">
            <div className="space-y-1">
              <p className="text-xs font-mono tracking-wider text-[#888888] uppercase">Sync Daemon</p>
              <h4 className="text-sm font-semibold text-white">
                {settings?.aiModel ? 'Active Model Sync' : 'Sandbox AI Engine'}
              </h4>
            </div>
            <div className="flex items-center space-x-1.5 px-2 py-1 rounded-full bg-[#1a1a1a] border border-[#222222] bento-glow-green">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span className="text-[10px] font-mono font-semibold uppercase text-white">Live</span>
            </div>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between border-b border-[#222222] pb-1.5 text-[#888888]">
              <span>Last Sync Time:</span>
              <span className="font-mono font-medium text-white">
                {lastSyncTime || 'Never synced'}
              </span>
            </div>
            <div className="flex justify-between text-[#888888]">
              <span>Background Poll:</span>
              <span className="font-mono font-medium text-white">Every {settings?.gmailPollInterval || 5}m (Config)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Control Panel Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sync Console */}
        <div className="bg-[#111111] border border-[#222222] rounded-2xl p-6 shadow-md lg:col-span-7 flex flex-col justify-between space-y-6">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold tracking-tight text-white">AI Routing Control Panel</h3>
            <p className="text-sm text-[#888888] leading-relaxed">
              Scan, clean, and process incoming emails with high-performance LLM parsing. Gemini acts as an autonomous router — omitting noise, extracting summaries, and prioritizing tasks before they clutter your device.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-[#1a1a1a] border border-[#222222] space-y-3">
            <div className="flex justify-between items-center text-xs text-[#888888]">
              <span className="font-medium font-mono text-[#888888]">Sync Engine:</span>
              <span className="bg-[#222222] px-2.5 py-1 rounded border border-[#333333] font-mono font-medium text-white text-[11px]">
                {settings?.aiModel || 'gemini-3.5-flash'}
              </span>
            </div>
            {syncResult && (
              <div className="flex items-start space-x-2 text-xs bg-emerald-950/20 text-emerald-300 p-2.5 rounded-lg border border-emerald-900/50">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-emerald-200">Sync Successful!</p>
                  <p className="opacity-90">
                    {syncResult.added > 0 
                      ? `Discovered, analyzed and classified ${syncResult.added} new email(s).` 
                      : 'Sync completed. Inbox is fully cleared and optimized.'}
                    {syncResult.skipped > 0 && ` (${syncResult.skipped} spam/promotion ignored)`}
                  </p>
                </div>
              </div>
            )}
            {syncFeedback && (
              <p className="text-xs text-red-400 bg-red-950/20 p-2 rounded border border-red-900/50">{syncFeedback}</p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-4">
            <button
              onClick={handleSyncClick}
              disabled={isSyncing}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-white hover:bg-neutral-200 active:scale-98 text-black px-5 py-3 rounded-xl font-semibold text-sm transition-all shadow-sm disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
              id="btn-sync-inbox"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Synchronizing Inbox...' : 'Sync Inbox Now'}</span>
            </button>
            <span className="text-[11px] font-mono text-[#888888] text-center sm:text-left">
              Emails processed through the <strong>Gemini parser</strong>
            </span>
          </div>
        </div>

        {/* Category distribution */}
        <div className="bg-[#111111] border border-[#222222] rounded-2xl p-6 shadow-md lg:col-span-5 flex flex-col justify-between">
          <div className="space-y-1 mb-4">
            <h3 className="text-lg font-semibold tracking-tight text-white">AI Classification Distribution</h3>
            <p className="text-xs text-[#888888]">How Gemini categorizes incoming messages</p>
          </div>

          <div className="space-y-3 flex-1 flex flex-col justify-center">
            {totalProcessed === 0 ? (
              <div className="text-center py-8 text-[#888888] space-y-2">
                <Layers className="w-8 h-8 mx-auto text-[#222222]" />
                <p className="text-xs">No email categories recorded yet.</p>
              </div>
            ) : (
              Object.entries(categories).map(([category, count]) => {
                const percentage = getPercentage(count);
                return (
                  <div key={category} className="space-y-1">
                    <div className="flex justify-between items-center text-xs font-medium">
                      <span className="text-white font-mono">{category}</span>
                      <span className="text-[#888888] font-mono">
                        {count} {count === 1 ? 'email' : 'emails'} ({percentage}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-[#1a1a1a] rounded-full overflow-hidden border border-[#222222]">
                      <div
                        className="h-full bg-white rounded-full transition-all duration-500"
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

      {/* Activity Logs row */}
      <div className="bg-[#111111] border border-[#222222] rounded-2xl p-6 shadow-md">
        <div className="flex items-center justify-between mb-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold tracking-tight text-white">Live Router Outcomes</h3>
            <p className="text-xs text-[#888888]">Chronological audit log of Gemini's decisions</p>
          </div>
          <Clock className="w-5 h-5 text-[#888888]" />
        </div>

        <div className="divide-y divide-[#222222] border-t border-[#222222]">
          {logs.length === 0 ? (
            <div className="text-center py-6 text-xs text-[#888888]">
              No activity logged yet. Trigger a sync to view.
            </div>
          ) : (
            logs.slice(0, 5).map((act) => (
              <div key={act.id} className="py-3.5 flex items-center justify-between text-xs hover:bg-[#1a1a1a]/60 px-2 rounded-lg transition-all">
                <div className="flex items-center space-x-3 truncate">
                  <span className="text-[#888888] font-mono min-w-[70px]">{act.time}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-mono font-bold border ${
                    act.level === 'ERROR'
                      ? 'bg-red-950/40 border-red-900/50 text-red-400'
                      : act.level === 'WARNING'
                      ? 'bg-amber-950/40 border-amber-900/50 text-amber-400'
                      : 'bg-[#222222] border-[#333333] text-stone-300'
                  }`}>
                    {act.type}
                  </span>
                  <span className="text-white font-sans truncate font-medium">{act.desc}</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-[#888888] shrink-0" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
