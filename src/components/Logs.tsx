import { useState } from 'react';
import {
  Terminal,
  Trash2,
  AlertTriangle,
  Search,
  Filter,
} from 'lucide-react';
import { ActivityLog } from '../types';

interface LogsProps {
  logs: ActivityLog[];
  onClear: () => Promise<boolean>;
  onReset: () => Promise<boolean>;
}

export default function Logs({ logs, onClear, onReset }: LogsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterLevel, setFilterLevel] = useState('all');

  // Extract unique log types for filter dropdown
  const logTypes = Array.from(new Set(logs.map((l) => l.type)));

  // Filter logs
  const filteredLogs = logs.filter((log) => {
    const matchesSearch = log.desc.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || log.type === filterType;
    const matchesLevel = filterLevel === 'all' || log.level === filterLevel;

    return matchesSearch && matchesType && matchesLevel;
  });

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'ERROR': return 'text-red-500 font-bold';
      case 'WARNING': return 'text-amber-500 font-medium';
      default: return 'text-zinc-400';
    }
  };

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'GEMINI_AI': return 'text-blue-400 border-blue-900/50 bg-blue-950/10';
      case 'WHATSAPP_PUSH': return 'text-emerald-400 border-emerald-900/50 bg-emerald-950/10';
      case 'GMAIL_POLL': return 'text-indigo-400 border-indigo-900/50 bg-indigo-950/10';
      default: return 'text-stone-300 border-stone-800 bg-stone-900/10';
    }
  };

  const handleResetClick = async () => {
    if (confirm('CRITICAL WARNING: This will permanently wipe all email history, activity logs, and return your settings to initial factory defaults. Proceed with system reset?')) {
      const success = await onReset();
      if (success) {
        alert('Database has been successfully wiped and reset to template seeds.');
      }
    }
  };

  return (
    <div className="space-y-6" id="logs-tab">
      {/* Controls */}
      <div className="bg-[#111111] border border-[#222222] rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-white">
            <Filter className="w-4 h-4 text-[#888888]" />
            <h3 className="text-sm font-semibold tracking-tight uppercase font-mono text-[#888888]">Audit Filter Panel</h3>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClear}
              className="flex items-center space-x-1.5 text-xs text-[#888888] hover:text-white hover:bg-[#222222] px-3.5 py-1.5 rounded-xl transition-all border border-[#222222] cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Console</span>
            </button>
            <button
              onClick={handleResetClick}
              className="flex items-center space-x-1.5 text-xs text-red-400 hover:text-white hover:bg-red-950/40 px-3.5 py-1.5 rounded-xl transition-all border border-red-900/30 cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Reset Sandbox</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="relative md:col-span-6">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#888888]" />
            <input
              type="text"
              placeholder="Search description, logs, system types..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#222222] focus:border-white focus:bg-black rounded-xl py-2.5 pl-10 pr-4 text-xs text-white transition-all outline-none"
            />
          </div>

          <div className="md:col-span-3">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#222222] focus:border-white rounded-xl p-2.5 text-xs text-white outline-none transition-all cursor-pointer"
            >
              <option value="all">All Operations</option>
              {logTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#222222] focus:border-white rounded-xl p-2.5 text-xs text-white outline-none transition-all cursor-pointer"
            >
              <option value="all">All Severity Levels</option>
              <option value="INFO">INFO</option>
              <option value="WARNING">WARNING</option>
              <option value="ERROR">ERROR</option>
            </select>
          </div>
        </div>
      </div>

      {/* Terminal Display */}
      <div className="bg-black border border-[#222222] rounded-2xl overflow-hidden shadow-2xl flex flex-col">
        {/* Terminal Tab Header */}
        <div className="bg-[#111111] border-b border-[#222222] px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-neutral-400" />
            <span className="font-mono text-xs font-bold uppercase text-neutral-300">Mail2WhatsApp-Core-Terminal v1.1.0</span>
          </div>
          <div className="flex space-x-1.5">
            <span className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/40"></span>
            <span className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/40"></span>
            <span className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/40"></span>
          </div>
        </div>

        {/* Terminal Body */}
        <div className="p-6 font-mono text-xs overflow-y-auto max-h-[60vh] space-y-3 min-h-[350px] bg-black text-stone-200">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-20 text-[#888888]">
              <span className="block mb-2 font-mono">~$ ./daemon_logs --empty</span>
              No operational events matching filters recorded in terminal index.
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="flex items-start space-x-3.5 py-1 hover:bg-[#111111]/40 px-2 rounded transition-all">
                {/* Time Indicator */}
                <span className="text-[#888888] shrink-0 font-medium">{log.time}</span>
                
                {/* Severity Badge */}
                <span className={`shrink-0 select-none ${getLevelColor(log.level)}`}>
                  [{log.level}]
                </span>

                {/* Subsystem Identifier */}
                <span className={`shrink-0 border px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-tight font-mono ${getTypeStyle(log.type)}`}>
                  {log.type}
                </span>

                {/* Action Descriptor */}
                <span className="text-stone-300 font-mono break-all flex-1 select-text">
                  {log.desc}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
