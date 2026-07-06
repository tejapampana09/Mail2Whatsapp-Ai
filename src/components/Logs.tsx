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
      case 'ERROR': return 'text-red-400 font-semibold';
      case 'WARNING': return 'text-amber-400 font-semibold';
      default: return 'text-gray-400';
    }
  };

  const getTypeStyle = (type: string) => {
    switch (type) {
      case 'GEMINI_AI': return 'text-blue-400 border-blue-500/20 bg-blue-500/10';
      case 'WHATSAPP_PUSH': return 'text-emerald-400 border-emerald-500/20 bg-emerald-500/10';
      case 'GMAIL_POLL': return 'text-indigo-400 border-indigo-500/20 bg-indigo-500/10';
      default: return 'text-gray-300 border-white/10 bg-white/5';
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
      <div className="glass-panel rounded-[24px] p-5 shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-2 text-white">
            <Filter className="w-4 h-4 text-gray-400" />
            <h3 className="text-xs font-semibold tracking-wider uppercase font-mono text-gray-400">Audit Filter Panel</h3>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClear}
              className="glass-panel rounded-xl px-3.5 py-1.5 flex items-center space-x-1.5 text-xs font-semibold text-gray-300 hover:text-white hover:border-white/20 transition-all cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Console</span>
            </button>
            <button
              onClick={handleResetClick}
              className="glass-panel rounded-xl px-3.5 py-1.5 flex items-center space-x-1.5 text-xs font-semibold text-red-400 hover:text-white hover:border-red-500/20 transition-all cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Reset Sandbox</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="relative md:col-span-6">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search description, logs, system types..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="glass-input w-full pl-10 pr-4 text-xs text-white transition-all"
            />
          </div>

          <div className="md:col-span-3">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="glass-input w-full p-2.5 text-xs text-white transition-all cursor-pointer"
            >
              <option value="all" className="bg-[#121216]">All Operations</option>
              {logTypes.map((type) => (
                <option key={type} value={type} className="bg-[#121216]">{type}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="glass-input w-full p-2.5 text-xs text-white transition-all cursor-pointer"
            >
              <option value="all" className="bg-[#121216]">All Severity Levels</option>
              <option value="INFO" className="bg-[#121216]">INFO</option>
              <option value="WARNING" className="bg-[#121216]">WARNING</option>
              <option value="ERROR" className="bg-[#121216]">ERROR</option>
            </select>
          </div>
        </div>
      </div>

      {/* Terminal Display */}
      <div className="glass-panel rounded-[24px] overflow-hidden shadow-2xl flex flex-col border border-white/10">
        {/* Terminal Tab Header */}
        <div className="bg-white/5 border-b border-white/10 px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-gray-400" />
            <span className="font-mono text-xs font-semibold uppercase text-gray-300">Mail2WhatsApp-Core-Terminal v2.0.0</span>
          </div>
          <div className="flex space-x-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/25 border border-red-500/40"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500/25 border border-amber-500/40"></span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/25 border border-emerald-500/40"></span>
          </div>
        </div>

        {/* Console Log Area */}
        <div className="p-6 font-mono text-[11px] leading-relaxed overflow-y-auto max-h-[500px] space-y-3.5 bg-black/45 backdrop-blur-md">
          {filteredLogs.map((log) => (
            <div key={log.id} className="flex items-start space-x-3.5 hover:bg-white/5 p-1 rounded transition-colors duration-150">
              <span className="text-gray-500 shrink-0 select-none">[{log.time}]</span>
              <span className={`px-2.5 py-0.5 rounded text-[9px] uppercase font-mono font-medium border shrink-0 ${getTypeStyle(log.type)}`}>
                {log.type}
              </span>
              <span className={`shrink-0 ${getLevelColor(log.level)}`}>
                {log.level}:
              </span>
              <span className="text-gray-300 font-sans break-words whitespace-pre-wrap">{log.desc}</span>
            </div>
          ))}

          {filteredLogs.length === 0 && (
            <div className="py-24 text-center text-gray-500 font-mono select-none">
              Console reports no match outputs. Listening for synchronization packets...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
