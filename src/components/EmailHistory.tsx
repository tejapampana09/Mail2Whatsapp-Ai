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
      case 'Finance': return 'bg-amber-950/40 text-amber-400 border-amber-900/50';
      case 'Work': return 'bg-blue-950/40 text-blue-400 border-blue-900/50';
      case 'Personal': return 'bg-purple-950/40 text-purple-400 border-purple-900/50';
      case 'Shopping': return 'bg-orange-950/40 text-orange-400 border-orange-900/50';
      case 'Education': return 'bg-indigo-950/40 text-indigo-400 border-indigo-900/50';
      case 'GitHub': return 'bg-[#1a1a1a] text-stone-200 border-[#333333]';
      case 'Spam': return 'bg-rose-950/40 text-rose-400 border-rose-900/50';
      case 'Promotion': return 'bg-emerald-950/40 text-emerald-400 border-emerald-900/50';
      case 'Important': return 'bg-red-950/40 text-red-400 border-red-900/50 font-bold';
      case 'Action Required': return 'bg-amber-950/40 text-amber-300 border-amber-900/50 font-bold';
      case 'Meetings': return 'bg-teal-950/40 text-teal-400 border-teal-900/50';
      case 'Recruiters': return 'bg-zinc-900 text-zinc-300 border-zinc-700';
      default: return 'bg-neutral-900 text-neutral-400 border-neutral-800';
    }
  };

  const getImportanceStyle = (level: ImportanceLevel) => {
    switch (level) {
      case 'High': return 'bg-rose-950/40 text-rose-400 border-rose-900/50 font-bold bento-glow-red';
      case 'Medium': return 'bg-amber-950/40 text-amber-400 border-amber-900/50';
      case 'Low': return 'bg-stone-900/40 text-stone-400 border-stone-800/50';
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
      <div className="bg-[#111111] border border-[#222222] rounded-2xl p-5 shadow-lg space-y-4">
        <div className="flex items-center space-x-2 text-white">
          <Filter className="w-4 h-4 text-[#888888]" />
          <h3 className="text-sm font-semibold tracking-tight uppercase font-mono text-[#888888]">Filter Engine</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="relative md:col-span-6">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#888888]" />
            <input
              type="text"
              placeholder="Search sender, subject, summary contents..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#222222] focus:border-white focus:bg-black rounded-xl py-2.5 pl-10 pr-4 text-xs text-white transition-all outline-none"
            />
          </div>

          <div className="md:col-span-3">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#222222] focus:border-white rounded-xl p-2.5 text-xs text-white outline-none transition-all cursor-pointer"
            >
              <option value="all">All Categories</option>
              <option value="Work">Work</option>
              <option value="Finance">Finance</option>
              <option value="Personal">Personal</option>
              <option value="Shopping">Shopping</option>
              <option value="Education">Education</option>
              <option value="GitHub">GitHub</option>
              <option value="Spam">Spam</option>
              <option value="Promotion">Promotion</option>
              <option value="Important">Important</option>
              <option value="Action Required">Action Required</option>
              <option value="Meetings">Meetings</option>
              <option value="Recruiters">Recruiters</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              value={selectedImportance}
              onChange={(e) => setSelectedImportance(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#222222] focus:border-white rounded-xl p-2.5 text-xs text-white outline-none transition-all cursor-pointer"
            >
              <option value="all">All Priority Levels</option>
              <option value="High">High Importance</option>
              <option value="Medium">Medium Importance</option>
              <option value="Low">Low Importance</option>
            </select>
          </div>
        </div>
      </div>

      {/* Dynamic Grid Layout based on drawer selection */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Email list */}
        <div className={`space-y-3 ${selectedEmail ? 'lg:col-span-6' : 'lg:col-span-12'}`}>
          {isLoading ? (
            <div className="text-center py-16 bg-[#111111] border border-[#222222] rounded-2xl shadow-lg">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-xs font-mono text-[#888888]">Loading processed emails from database...</p>
            </div>
          ) : filteredEmails.length === 0 ? (
            <div className="text-center py-16 bg-[#111111] border border-[#222222] rounded-2xl shadow-lg space-y-3">
              <Search className="w-8 h-8 mx-auto text-[#888888]/40" />
              <h4 className="text-sm font-semibold text-white">No processed emails found</h4>
              <p className="text-xs text-[#888888] max-w-sm mx-auto leading-relaxed">
                No records match your filters, or you haven't synced your inbox yet. Click <strong>Sync Inbox Now</strong> in the dashboard to analyze emails.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <span className="text-[11px] font-mono font-bold text-[#888888] uppercase">
                  {filteredEmails.length} {filteredEmails.length === 1 ? 'Email Record' : 'Email Records'}
                </span>
              </div>

              {filteredEmails.map((email) => (
                <div
                  key={email.id}
                  onClick={() => setSelectedEmail(email)}
                  className={`group bg-[#111111] border rounded-2xl p-4 cursor-pointer hover:border-white transition-all duration-300 flex flex-col sm:flex-row items-start justify-between gap-4 relative overflow-hidden ${
                    selectedEmail?.id === email.id ? 'border-white shadow-lg bg-[#1a1a1a]' : 'border-[#222222] shadow-sm'
                  } ${!email.isRead ? 'border-l-4 border-l-white' : ''}`}
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    {/* Top tags row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-semibold uppercase tracking-wider ${getCategoryStyle(email.category)}`}>
                        {email.category}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-semibold uppercase tracking-wider ${getImportanceStyle(email.importance)}`}>
                        {email.importance}
                      </span>
                      {!email.isRead && (
                        <span className="bg-white text-black text-[9px] font-mono font-bold px-1.5 py-0.5 rounded">NEW</span>
                      )}
                      {email.attachments && email.attachments.length > 0 && (
                        <span className="flex items-center space-x-1 text-[9px] font-mono text-[#888888] border border-[#222222] px-1.5 py-0.5 rounded bg-neutral-900">
                          <Paperclip className="w-2.5 h-2.5" />
                          <span>{email.attachments.length}</span>
                        </span>
                      )}
                      {email.aiMetadata?.actionRequired && (
                        <span className="bg-amber-950/60 text-amber-300 border border-amber-900/50 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded">ACTION REQ</span>
                      )}
                      {email.aiMetadata?.classifications?.map((tag) => (
                        <span key={tag} className={`text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded border ${
                          tag === 'OTP' ? 'bg-emerald-950/60 text-emerald-400 border-emerald-900/50' :
                          tag === 'Invoice' ? 'bg-yellow-950/60 text-yellow-400 border-yellow-900/50' :
                          tag === 'Meeting' ? 'bg-teal-950/60 text-teal-400 border-teal-900/50' :
                          tag === 'Recruiter' ? 'bg-blue-950/60 text-blue-400 border-blue-900/50' :
                          tag === 'Scam' || tag === 'Spam' ? 'bg-rose-950/60 text-rose-400 border-rose-900/50 animate-pulse' :
                          'bg-neutral-800 text-neutral-300 border-neutral-700'
                        }`}>
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="space-y-1">
                      <h4 className={`text-sm tracking-tight text-white group-hover:text-white transition-all truncate ${!email.isRead ? 'font-bold' : 'font-semibold'}`}>
                        {email.subject}
                      </h4>
                      <p className="text-xs text-[#888888] font-medium truncate">
                        From: {email.from}
                      </p>
                    </div>

                    {/* AI summary snippet */}
                    <p className="text-xs text-stone-300 leading-relaxed font-sans line-clamp-2 bg-[#161616] p-2.5 rounded-lg border border-[#222222] group-hover:bg-[#1a1a1a] transition-all">
                      {email.summary}
                    </p>
                  </div>

                  {/* Metadata column */}
                  <div className="flex sm:flex-col items-end justify-between sm:justify-start gap-2 text-right shrink-0 self-stretch sm:self-auto">
                    <span className="text-[10px] font-mono text-[#888888]">
                      {new Date(email.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <button
                      onClick={(e) => handleDeleteClick(email.id, e)}
                      className="p-1.5 text-[#888888] hover:text-red-400 hover:bg-red-950/40 rounded-lg transition-all cursor-pointer"
                      title="Delete AI summary & original email"
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
          <div className="bg-[#111111] border-2 border-white rounded-2xl p-6 shadow-2xl lg:col-span-6 space-y-6 sticky top-24 max-h-[80vh] overflow-y-auto text-white">
            {/* Header / controls */}
            <div className="flex items-center justify-between border-b border-[#222222] pb-4">
              <div className="space-y-1">
                <span className="text-[10px] uppercase tracking-wider font-mono text-[#888888]">Analysis Drawer</span>
                <h3 className="text-base font-bold text-white">Email Deep Dive</h3>
              </div>
              <button
                onClick={() => setSelectedEmail(null)}
                className="p-1.5 text-[#888888] hover:text-white hover:bg-[#222222] rounded-lg transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* AI Summary Banner */}
            <div className="space-y-3 bg-[#161616] p-5 rounded-xl border-l-4 border-l-white border-y border-r border-[#222222]">
              <div className="flex items-center space-x-2 text-white font-mono text-xs font-semibold">
                <MessageSquare className="w-4 h-4 text-white" />
                <span>AI SUMMARY</span>
              </div>
              <p className="text-sm font-sans text-stone-200 leading-relaxed italic font-medium">
                "{selectedEmail.summary}"
              </p>
            </div>

            {/* Email Properties List */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="border border-[#222222] rounded-xl p-3 bg-[#111111]">
                <span className="text-[10px] font-mono text-[#888888] uppercase block mb-1">AI Classification</span>
                <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-mono inline-block ${getCategoryStyle(selectedEmail.category)}`}>
                  {selectedEmail.category}
                </span>
              </div>

              <div className="border border-[#222222] rounded-xl p-3 bg-[#111111]">
                <span className="text-[10px] font-mono text-[#888888] uppercase block mb-1">AI Urgency Rating</span>
                <span className={`px-2.5 py-0.5 rounded-full border text-[10px] font-mono inline-block ${getImportanceStyle(selectedEmail.importance)}`}>
                  {selectedEmail.importance}
                </span>
              </div>

              <div className="border border-[#222222] rounded-xl p-3 bg-[#111111] col-span-2">
                <span className="text-[10px] font-mono text-[#888888] uppercase block mb-1">WhatsApp Notification Status</span>
                <div className="flex items-center space-x-1.5 font-mono text-xs">
                  {selectedEmail.whatsappStatus === 'Sent' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400 font-semibold">Pushed successfully</span>
                    </>
                  ) : selectedEmail.whatsappStatus === 'Disabled' ? (
                    <span className="text-[#888888]">None (Urgency below threshold or Notifications disabled)</span>
                  ) : (
                    <span className="text-amber-400 font-semibold">{selectedEmail.whatsappStatus}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Attachments Section */}
            {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center space-x-2 text-[#888888] font-mono text-xs uppercase border-b border-[#222222] pb-1.5">
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>Attachments ({selectedEmail.attachments.length})</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedEmail.attachments.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center space-x-1.5 bg-[#1a1a1a] border border-[#222222] px-2.5 py-1.5 rounded-lg text-xs font-mono text-stone-200"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-stone-500"></span>
                      <span className="truncate max-w-[200px]" title={file}>{file}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Extra Insights Block */}
            {selectedEmail.aiMetadata && (
              <div className="space-y-4 border-t border-[#222222] pt-4 text-left">
                <div className="flex items-center space-x-2 text-[#888888] font-mono text-xs uppercase border-b border-[#222222] pb-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  <span>AI Security & Action Insights</span>
                </div>
                
                {/* Spam/Scam High Score warning */}
                {selectedEmail.aiMetadata.spamScore > 50 && (
                  <div className="bg-rose-950/20 border border-rose-900/50 rounded-xl p-3.5 flex items-start space-x-2.5">
                    <AlertTriangle className="w-4.5 h-4.5 text-rose-400 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p className="text-rose-400 font-bold">High Risk Spam/Scam Probability ({selectedEmail.aiMetadata.spamScore}%)</p>
                      <p className="text-stone-300 text-[11px] mt-0.5">Gemini detected indicators of phishing, scam, or spam contents. Exercise caution with any actions.</p>
                    </div>
                  </div>
                )}

                {/* Action Item and Deadline */}
                {selectedEmail.aiMetadata.actionRequired && (
                  <div className="bg-amber-950/20 border border-amber-900/50 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span className="text-amber-400 font-bold text-xs">Action Required Detected</span>
                    </div>
                    <div className="text-xs text-stone-200 pl-6 space-y-1">
                      <p><strong className="text-[#888888]">Task:</strong> {selectedEmail.aiMetadata.actionDetails || 'Follow up required'}</p>
                      {selectedEmail.aiMetadata.deadline && (
                        <p><strong className="text-[#888888]">Deadline:</strong> <span className="bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded font-mono text-[10px]">{selectedEmail.aiMetadata.deadline}</span></p>
                      )}
                    </div>
                  </div>
                )}

                {/* Calendar Event */}
                {selectedEmail.aiMetadata.calendarEvent && (
                  <div className="bg-teal-950/20 border border-teal-900/50 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-teal-400" />
                      <span className="text-teal-400 font-bold text-xs">Calendar Event / Meeting</span>
                    </div>
                    <div className="text-xs text-stone-200 pl-6 space-y-1">
                      <p><strong className="text-[#888888]">Event:</strong> {selectedEmail.aiMetadata.calendarEvent.title}</p>
                      <p><strong className="text-[#888888]">Time:</strong> {selectedEmail.aiMetadata.calendarEvent.start} to {selectedEmail.aiMetadata.calendarEvent.end}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Original Email details */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2 text-[#888888] font-mono text-xs uppercase border-b border-[#222222] pb-1.5">
                <User className="w-3.5 h-3.5" />
                <span>Original Message Headers</span>
              </div>
              <div className="space-y-1.5 text-xs text-stone-200">
                <p><strong className="font-mono text-[#888888]">From:</strong> {selectedEmail.from}</p>
                <p><strong className="font-mono text-[#888888]">Subject:</strong> {selectedEmail.subject}</p>
                <p><strong className="font-mono text-[#888888]">Date:</strong> {new Date(selectedEmail.date).toLocaleString()}</p>
              </div>
            </div>

            {/* Full Content Block */}
            <div className="space-y-2">
              <span className="text-[10px] uppercase font-mono tracking-wider text-[#888888] block">Full Email Content</span>
              <div className="bg-[#1a1a1a] border border-[#222222] rounded-xl p-4 text-xs text-stone-200 font-mono max-h-[25vh] overflow-y-auto whitespace-pre-wrap leading-relaxed">
                {selectedEmail.content || '(No readable body content found)'}
              </div>
            </div>

            {/* Deletion Button inside drawer */}
            <div className="flex justify-end pt-4 border-t border-[#222222]">
              <button
                onClick={(e) => handleDeleteClick(selectedEmail.id, e)}
                className="flex items-center space-x-1.5 text-xs font-semibold text-red-400 hover:text-white bg-transparent hover:bg-red-950/40 border border-red-900/50 px-4 py-2.5 rounded-xl transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Email & Analysis</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
