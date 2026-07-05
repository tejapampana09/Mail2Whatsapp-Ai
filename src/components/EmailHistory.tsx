import React, { useState } from 'react';
import {
  Search,
  Filter,
  Trash2,
  X,
  MessageSquare,
  User,
  CheckCircle2,
  Paperclip,
  Shield,
  AlertTriangle,
  Clock,
  Calendar
} from 'lucide-react';
import { ProcessedEmail, EmailCategory, ImportanceLevel } from '../types';

interface EmailHistoryProps {
  emails: ProcessedEmail[];
  isLoading: boolean;
  onDelete: (id: string) => Promise<boolean>;
}

export default function EmailHistory({ emails, isLoading, onDelete }: EmailHistoryProps) {
  const [selectedEmail, setSelectedEmail] = useState<ProcessedEmail | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedImportance, setSelectedImportance] = useState('all');

  const getCategoryStyle = (category: EmailCategory) => {
    switch (category) {
      case 'Finance': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'Work': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'Personal': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'Shopping': return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'Education': return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      case 'GitHub': return 'bg-white/5 text-gray-200 border-white/10';
      case 'Spam': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'Promotion': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'Important': return 'bg-red-500/10 text-red-400 border-red-500/20 font-bold';
      case 'Action Required': return 'bg-amber-500/15 text-amber-300 border-amber-500/25 font-bold';
      case 'Meetings': return 'bg-teal-500/10 text-teal-400 border-teal-500/20';
      case 'Recruiters': return 'bg-gray-500/10 text-gray-300 border-gray-500/20';
      default: return 'bg-white/5 text-gray-400 border-white/5';
    }
  };

  const getImportanceStyle = (level: ImportanceLevel) => {
    switch (level) {
      case 'High': return 'bg-rose-500/10 text-rose-400 border-rose-500/20 font-bold';
      case 'Medium': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'Low': return 'bg-white/5 text-gray-400 border-white/5';
    }
  };

  const handleDeleteClick = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to permanently delete this email and its summary?')) {
      const success = await onDelete(id);
      if (success && selectedEmail?.id === id) {
        setSelectedEmail(null);
      }
    }
  };

  // Filter logic
  const filteredEmails = emails.filter((email) => {
    const matchesSearch =
      email.from.toLowerCase().includes(searchTerm.toLowerCase()) ||
      email.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
      email.summary.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = selectedCategory === 'all' || email.category === selectedCategory;
    const matchesImportance = selectedImportance === 'all' || email.importance === selectedImportance;

    return matchesSearch && matchesCategory && matchesImportance;
  });

  return (
    <div className="space-y-6" id="history-tab">
      {/* Filter and Search Bar */}
      <div className="glass-panel rounded-[24px] p-5 shadow-lg space-y-4">
        <div className="flex items-center space-x-2 text-white">
          <Filter className="w-4 h-4 text-gray-400" />
          <h3 className="text-xs font-semibold tracking-wider uppercase font-mono text-gray-400">Filter Engine</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="relative md:col-span-6">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search sender, subject, summary contents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 focus:border-white rounded-xl py-2.5 pl-10 pr-4 text-xs text-white transition-all outline-none"
            />
          </div>

          <div className="md:col-span-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-white/5 border border-white/10 focus:border-white rounded-xl p-2.5 text-xs text-white outline-none transition-all cursor-pointer"
            >
              <option value="all" className="bg-[#121216]">All Categories</option>
              <option value="Work" className="bg-[#121216]">Work</option>
              <option value="Finance" className="bg-[#121216]">Finance</option>
              <option value="Personal" className="bg-[#121216]">Personal</option>
              <option value="Shopping" className="bg-[#121216]">Shopping</option>
              <option value="Education" className="bg-[#121216]">Education</option>
              <option value="GitHub" className="bg-[#121216]">GitHub</option>
              <option value="Spam" className="bg-[#121216]">Spam</option>
              <option value="Promotion" className="bg-[#121216]">Promotion</option>
              <option value="Important" className="bg-[#121216]">Important</option>
              <option value="Action Required" className="bg-[#121216]">Action Required</option>
              <option value="Meetings" className="bg-[#121216]">Meetings</option>
              <option value="Recruiters" className="bg-[#121216]">Recruiters</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              value={selectedImportance}
              onChange={(e) => setSelectedImportance(e.target.value)}
              className="w-full bg-white/5 border border-white/10 focus:border-white rounded-xl p-2.5 text-xs text-white outline-none transition-all cursor-pointer"
            >
              <option value="all" className="bg-[#121216]">All Priority Levels</option>
              <option value="High" className="bg-[#121216]">High Importance</option>
              <option value="Medium" className="bg-[#121216]">Medium Importance</option>
              <option value="Low" className="bg-[#121216]">Low Importance</option>
            </select>
          </div>
        </div>
      </div>

      {/* Dynamic Grid Layout based on drawer selection */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Email list */}
        <div className={`space-y-3 ${selectedEmail ? 'lg:col-span-6' : 'lg:col-span-12'}`}>
          {isLoading ? (
            <div className="text-center py-16 glass-panel rounded-2xl shadow-lg">
              <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-xs font-mono text-gray-400">Loading processed emails from database...</p>
            </div>
          ) : filteredEmails.length === 0 ? (
            <div className="text-center py-16 glass-panel rounded-2xl shadow-lg space-y-3">
              <Search className="w-8 h-8 mx-auto text-gray-500/40" />
              <h4 className="text-sm font-semibold text-white">No processed emails found</h4>
              <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
                No records match your filters, or you haven't synced your inbox yet. Click <strong>Run Daemon Sync</strong> in the dashboard to analyze emails.
              </p>
            </div>
          ) : (
            <div className="space-y-3 animate-fade-in">
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-mono font-semibold text-gray-500 uppercase">
                  {filteredEmails.length} {filteredEmails.length === 1 ? 'Email Record' : 'Email Records'}
                </span>
              </div>

              {filteredEmails.map((email) => (
                <div
                  key={email.id}
                  onClick={() => setSelectedEmail(email)}
                  className={`group glass-card rounded-[22px] p-4 cursor-pointer hover:border-white/20 transition-all duration-300 flex flex-col sm:flex-row items-start justify-between gap-4 relative overflow-hidden ${
                    selectedEmail?.id === email.id ? 'border-white/30 bg-white/5 shadow-lg' : 'border-white/5 shadow-sm'
                  } ${!email.isRead ? 'border-l-4 border-l-indigo-400' : ''}`}
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    {/* Top tags row */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`px-2.5 py-0.5 rounded-full border text-[9px] font-mono font-semibold uppercase tracking-wider ${getCategoryStyle(email.category)}`}>
                        {email.category}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full border text-[9px] font-mono font-semibold uppercase tracking-wider ${getImportanceStyle(email.importance)}`}>
                        {email.importance}
                      </span>
                      {!email.isRead && (
                        <span className="bg-indigo-500 text-white text-[8px] font-mono font-bold px-1.5 py-0.5 rounded">NEW</span>
                      )}
                      {email.attachments && email.attachments.length > 0 && (
                        <span className="flex items-center space-x-1 text-[8px] font-mono text-gray-400 border border-white/10 px-1.5 py-0.5 rounded bg-black/40">
                          <Paperclip className="w-2.5 h-2.5" />
                          <span>{email.attachments.length}</span>
                        </span>
                      )}
                      {email.aiMetadata?.actionRequired && (
                        <span className="bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[8px] font-mono font-semibold px-1.5 py-0.5 rounded">ACTION REQUIRED</span>
                      )}
                      {email.aiMetadata?.classifications?.map((tag) => (
                        <span key={tag} className={`text-[8px] font-mono font-semibold px-1.5 py-0.5 rounded border ${
                          tag === 'OTP' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          tag === 'Invoice' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                          tag === 'Meeting' ? 'bg-teal-500/10 text-teal-400 border-teal-500/20' :
                          tag === 'Recruiter' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                          tag === 'Scam' || tag === 'Spam' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 animate-pulse' :
                          'bg-white/5 text-gray-300 border-white/10'
                        }`}>
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="space-y-0.5">
                      <h4 className={`text-sm tracking-tight text-white group-hover:text-white transition-all truncate ${!email.isRead ? 'font-bold' : 'font-semibold'}`}>
                        {email.subject}
                      </h4>
                      <p className="text-[11px] text-gray-400 font-medium truncate">
                        From: {email.from}
                      </p>
                    </div>

                    {/* AI summary snippet */}
                    <p className="text-xs text-gray-300 leading-relaxed font-sans line-clamp-2 bg-black/30 p-2.5 rounded-xl border border-white/5 group-hover:bg-black/50 transition-all">
                      {email.summary}
                    </p>
                  </div>

                  {/* Metadata column */}
                  <div className="flex sm:flex-col items-end justify-between sm:justify-start gap-2 text-right shrink-0 self-stretch sm:self-auto">
                    <span className="text-[10px] font-mono text-gray-500">
                      {new Date(email.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <button
                      onClick={(e) => handleDeleteClick(email.id, e)}
                      className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer"
                      title="Delete summary"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detailed Drawer (renders adjacent if an email is selected) */}
        {selectedEmail && (
          <div className="glass-panel rounded-[24px] p-6 shadow-2xl lg:col-span-6 space-y-6 sticky top-24 max-h-[80vh] overflow-y-auto text-white border border-white/10">
            {/* Header / controls */}
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="space-y-1">
                <span className="text-[9px] uppercase tracking-wider font-mono text-gray-400">Analysis Drawer</span>
                <h3 className="text-base font-bold text-white">Email Deep Dive</h3>
              </div>
              <button
                onClick={() => setSelectedEmail(null)}
                className="p-1.5 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* AI Summary Banner */}
            <div className="space-y-3 bg-indigo-500/5 p-5 rounded-2xl border-l-4 border-l-indigo-500 border-y border-r border-white/5">
              <div className="flex items-center space-x-2 text-indigo-400 font-mono text-[10px] font-semibold">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                <span>AI SUMMARY</span>
              </div>
              <p className="text-sm font-sans text-gray-200 leading-relaxed italic font-medium">
                "{selectedEmail.summary}"
              </p>
            </div>

            {/* Email Properties List */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="border border-white/5 rounded-2xl p-3.5 bg-white/2">
                <span className="text-[9px] font-mono text-gray-400 uppercase block mb-1">AI Classification</span>
                <span className={`px-2.5 py-0.5 rounded-full border text-[9px] font-mono inline-block ${getCategoryStyle(selectedEmail.category)}`}>
                  {selectedEmail.category}
                </span>
              </div>

              <div className="border border-white/5 rounded-2xl p-3.5 bg-white/2">
                <span className="text-[9px] font-mono text-gray-400 uppercase block mb-1">AI Urgency Rating</span>
                <span className={`px-2.5 py-0.5 rounded-full border text-[9px] font-mono inline-block ${getImportanceStyle(selectedEmail.importance)}`}>
                  {selectedEmail.importance}
                </span>
              </div>

              <div className="border border-white/5 rounded-2xl p-3.5 bg-white/2 col-span-2">
                <span className="text-[9px] font-mono text-gray-400 uppercase block mb-1">WhatsApp Notification Status</span>
                <div className="flex items-center space-x-1.5 font-mono text-xs mt-1">
                  {selectedEmail.whatsappStatus === 'Sent' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400 font-semibold">Pushed successfully</span>
                    </>
                  ) : selectedEmail.whatsappStatus === 'Disabled' ? (
                    <span className="text-gray-400">None (Urgency below threshold or Notifications disabled)</span>
                  ) : (
                    <span className="text-amber-400 font-semibold">{selectedEmail.whatsappStatus}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Attachments Section */}
            {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center space-x-2 text-gray-400 font-mono text-[9px] uppercase border-b border-white/5 pb-1.5">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>Attachments ({selectedEmail.attachments.length})</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedEmail.attachments.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center space-x-1.5 bg-white/5 border border-white/10 px-2.5 py-1.5 rounded-lg text-xs font-mono text-gray-200"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                      <span className="truncate max-w-[200px]" title={file}>{file}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Extra Insights Block */}
            {selectedEmail.aiMetadata && (
              <div className="space-y-4 border-t border-white/5 pt-4 text-left">
                <div className="flex items-center space-x-2 text-gray-400 font-mono text-[9px] uppercase border-b border-white/5 pb-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  <span>AI Security & Action Insights</span>
                </div>
                
                {/* Spam/Scam High Score warning */}
                {selectedEmail.aiMetadata.spamScore > 50 && (
                  <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-3.5 flex items-start space-x-2.5">
                    <AlertTriangle className="w-4.5 h-4.5 text-rose-400 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p className="text-rose-400 font-semibold">High Risk Spam/Scam Probability ({selectedEmail.aiMetadata.spamScore}%)</p>
                      <p className="text-gray-300 text-[11px] mt-0.5 leading-relaxed">AI detected indicators of phishing, scam, or spam contents. Exercise caution with any links.</p>
                    </div>
                  </div>
                )}

                {/* Action Item and Deadline */}
                {selectedEmail.aiMetadata.actionRequired && (
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-3.5 space-y-2">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span className="text-amber-400 font-semibold text-xs">Action Required Detected</span>
                    </div>
                    <div className="text-xs text-gray-300 pl-6 space-y-1">
                      <p><strong className="text-gray-400 font-normal">Task:</strong> {selectedEmail.aiMetadata.actionDetails || 'Follow up required'}</p>
                      {selectedEmail.aiMetadata.deadline && (
                        <p><strong className="text-gray-400 font-normal">Deadline:</strong> <span className="bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded font-mono text-[10px]">{selectedEmail.aiMetadata.deadline}</span></p>
                      )}
                    </div>
                  </div>
                )}

                {/* Calendar Event */}
                {selectedEmail.aiMetadata.calendarEvent && (
                  <div className="bg-teal-500/5 border border-teal-500/20 rounded-2xl p-3.5 space-y-2">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-teal-400" />
                      <span className="text-teal-400 font-semibold text-xs">Calendar Event / Meeting</span>
                    </div>
                    <div className="text-xs text-gray-300 pl-6 space-y-1">
                      <p><strong className="text-gray-400 font-normal">Event:</strong> {selectedEmail.aiMetadata.calendarEvent.title}</p>
                      <p><strong className="text-gray-400 font-normal">Time:</strong> {selectedEmail.aiMetadata.calendarEvent.start} to {selectedEmail.aiMetadata.calendarEvent.end}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Original Email details */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2 text-gray-400 font-mono text-[9px] uppercase border-b border-white/5 pb-1.5">
                <User className="w-3.5 h-3.5" />
                <span>Original Message Headers</span>
              </div>
              <div className="space-y-1.5 text-xs text-gray-200">
                <p><strong className="font-mono text-gray-500">From:</strong> {selectedEmail.from}</p>
                <p><strong className="font-mono text-gray-500">Subject:</strong> {selectedEmail.subject}</p>
                <p><strong className="font-mono text-gray-500">Date:</strong> {new Date(selectedEmail.date).toLocaleString()}</p>
              </div>
            </div>

            {/* Full Content Block */}
            <div className="space-y-2">
              <span className="text-[9px] uppercase font-mono tracking-wider text-gray-400 block">Full Email Content</span>
              <div className="bg-black/30 border border-white/5 rounded-2xl p-4 text-xs text-gray-200 font-mono max-h-[25vh] overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {selectedEmail.content || '(No readable body content found)'}
              </div>
            </div>

            {/* Deletion Button inside drawer */}
            <div className="flex justify-end pt-4 border-t border-white/5">
              <button
                onClick={(e) => handleDeleteClick(selectedEmail.id, e)}
                className="flex items-center space-x-1.5 text-xs font-semibold text-red-400 hover:text-white bg-transparent hover:bg-red-500/10 border border-red-500/20 px-4 py-2.5 rounded-xl transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Summary</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
