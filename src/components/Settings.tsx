import { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Save,
  MessageSquare,
  ListFilter,
  Check,
  Link,
  Unlink,
  CheckCircle,
  XCircle,
  Cpu,
  Trash2,
  Plus
} from 'lucide-react';
import { SystemSettings } from '../types';

interface SettingsProps {
  settings: SystemSettings | null;
  onSave: (settings: SystemSettings) => Promise<boolean>;
}

interface ConnectedAccount {
  id: string;
  email: string;
  connectedAt: string;
  isPrimary: boolean;
}

export default function Settings({ settings, onSave }: SettingsProps) {
  const [aiModel, setAiModel] = useState('openrouter/free');
  const [aiProvider, setAiProvider] = useState('openrouter');
  const [language, setLanguage] = useState('English');
  const [gmailPollInterval, setGmailPollInterval] = useState(5);
  const [importanceThreshold, setImportanceThreshold] = useState('Medium');
  const [ignoredCategories, setIgnoredCategories] = useState<string[]>([]);
  const [whatsappNotificationsEnabled, setWhatsappNotificationsEnabled] = useState(true);
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [analyzeLimit, setAnalyzeLimit] = useState(10);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Multi-Gmail accounts state
  const [gmailAccounts, setGmailAccounts] = useState<ConnectedAccount[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);

  const fetchConnectedAccounts = async () => {
    setIsLoadingAccounts(true);
    try {
      const res = await fetch('/api/gmail/accounts', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('mail2whatsapp_token')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setGmailAccounts(data);
      }
    } catch (err) {
      console.error('Failed to fetch connected accounts:', err);
    } finally {
      setIsLoadingAccounts(false);
    }
  };

  // Sync state with incoming props on load
  useEffect(() => {
    if (settings) {
      setAiModel(settings.aiModel);
      setAiProvider(settings.aiProvider || 'openrouter');
      setLanguage(settings.language);
      setGmailPollInterval(settings.gmailPollInterval);
      setImportanceThreshold(settings.importanceThreshold);
      setIgnoredCategories(settings.ignoredCategories || []);
      setWhatsappNotificationsEnabled(settings.whatsappNotificationsEnabled);
      setWhatsappNumber(settings.whatsappNumber || '');
      setAnalyzeLimit(settings.analyzeLimit || 10);
      setGoogleConnected(!!settings.googleConnected);
      setWhatsappConnected(!!settings.whatsappConnected);
    }
    fetchConnectedAccounts();
  }, [settings]);

  const toggleCategory = (cat: string) => {
    if (ignoredCategories.includes(cat)) {
      setIgnoredCategories(ignoredCategories.filter((c) => c !== cat));
    } else {
      setIgnoredCategories([...ignoredCategories, cat]);
    }
  };

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    const updatedSettings: SystemSettings = {
      aiModel,
      aiProvider,
      language,
      gmailPollInterval: Number(gmailPollInterval),
      importanceThreshold: importanceThreshold as any,
      ignoredCategories,
      whatsappNotificationsEnabled,
      whatsappNumber,
      analyzeLimit: Number(analyzeLimit)
    };

    const success = await onSave(updatedSettings);
    if (success) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 5000);
    }
    setIsSaving(false);
  };

  const handleDisconnectGoogle = async () => {
    if (confirm('Are you sure you want to disconnect your primary Google Account? This will disable Gmail syncing.')) {
      try {
        const res = await fetch('/api/reset', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('mail2whatsapp_token')}`
          }
        });
        if (res.ok) {
          alert('Google account disconnected successfully.');
          window.location.reload();
        }
      } catch (err) {
        console.error('Failed to disconnect Google account:', err);
      }
    }
  };

  const handleDeleteAccount = async (tokenId: string, email: string) => {
    if (confirm(`Disconnect Gmail inbox for ${email}?`)) {
      try {
        const res = await fetch(`/api/gmail/accounts/${tokenId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('mail2whatsapp_token')}`
          }
        });
        if (res.ok) {
          fetchConnectedAccounts();
        }
      } catch (err) {
        console.error('Failed to remove account:', err);
      }
    }
  };

  const handleAddAccountClick = () => {
    const token = localStorage.getItem('mail2whatsapp_token');
    window.location.href = `/api/auth/google/add-account?token=${token}`;
  };

  const categories = [
    'Work',
    'Finance',
    'Personal',
    'Shopping',
    'Education',
    'GitHub',
    'Spam',
    'Promotion',
    'Important',
    'Action Required',
    'Meetings',
    'Recruiters'
  ];

  return (
    <div className="max-w-3xl mx-auto" id="settings-tab">
      <form onSubmit={handleSaveSubmit} className="space-y-6">
        
        {/* Connection Integrations Card */}
        <div className="glass-panel rounded-[28px] p-6 shadow-xl space-y-6">
          <div className="flex items-center space-x-2 border-b border-white/5 pb-4">
            <Link className="w-5 h-5 text-gray-400" />
            <div>
              <h3 className="text-base font-bold text-white">Integrations & Connections</h3>
              <p className="text-xs text-gray-400">Manage OAuth access and alert channels</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Google OAuth Connection */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-mono text-gray-400 uppercase block">Inbox Sync Link</span>
                  <span className="text-sm font-semibold text-white">Google Gmail API</span>
                </div>
                <div className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-black/40 border border-white/5">
                  {googleConnected ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="text-[9px] font-mono font-semibold uppercase text-emerald-400">ACTIVE</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                      <span className="text-[9px] font-mono font-semibold uppercase text-red-400">OFFLINE</span>
                    </>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Connect your Google account to grant Mail2WhatsApp access to poll and summarize your Gmail inbox.
              </p>
              <div>
                {googleConnected ? (
                  <button
                    type="button"
                    onClick={handleDisconnectGoogle}
                    className="flex items-center space-x-1.5 text-xs font-semibold text-red-400 hover:text-white bg-white/5 hover:bg-red-500/10 border border-white/10 px-3 py-2 rounded-lg transition-all cursor-pointer"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    <span>Disconnect Google</span>
                  </button>
                ) : (
                  <a
                    href="/api/auth/google"
                    className="inline-flex items-center space-x-1.5 text-xs font-semibold text-black bg-white hover:bg-gray-100 px-3 py-2 rounded-lg transition-all"
                  >
                    <Link className="w-3.5 h-3.5" />
                    <span>Connect Google</span>
                  </a>
                )}
              </div>
            </div>

            {/* WhatsApp Integration Status */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between space-y-4">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-mono text-gray-400 uppercase block">Alert Push Channel</span>
                  <span className="text-sm font-semibold text-white">WhatsApp Cloud API</span>
                </div>
                <div className="flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-black/40 border border-white/5">
                  {whatsappConnected ? (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="text-[9px] font-mono font-semibold uppercase text-emerald-400">READY</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="text-[9px] font-mono font-semibold uppercase text-amber-400">UNCONFIGURED</span>
                    </>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Requires <code>WHATSAPP_ACCESS_TOKEN</code> and <code>WHATSAPP_PHONE_NUMBER_ID</code> environment variables to send alerts.
              </p>
              <div className="text-[10px] font-mono text-gray-500">
                {whatsappConnected ? '✓ Meta Cloud Gateway is live.' : '⚠ Configure .env variables on backend.'}
              </div>
            </div>
          </div>

          {/* Connected Gmail Accounts (Multi-Account) */}
          {googleConnected && (
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-mono text-gray-400 uppercase">Connected Gmail Inboxes</h4>
                <button
                  type="button"
                  onClick={handleAddAccountClick}
                  className="flex items-center space-x-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Connect Another</span>
                </button>
              </div>

              <div className="space-y-2">
                {gmailAccounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="flex justify-between items-center text-xs p-3 rounded-xl bg-white/5 border border-white/10 animate-fade-in"
                  >
                    <div className="flex items-center space-x-2.5">
                      <span className="font-semibold text-white">{acc.email}</span>
                      {acc.isPrimary && (
                        <span className="px-2 py-0.5 rounded-full text-[8px] bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 font-mono font-semibold uppercase">
                          PRIMARY
                        </span>
                      )}
                    </div>
                    
                    {!acc.isPrimary && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAccount(acc.id, acc.email)}
                        className="p-1.5 text-gray-500 hover:text-red-400 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}

                {isLoadingAccounts && (
                  <div className="py-4 text-center text-xs text-gray-500 font-mono">
                    Loading account indexes...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* AI LLM Settings Card */}
        <div className="glass-panel rounded-[28px] p-6 shadow-xl space-y-6">
          <div className="flex items-center space-x-2 border-b border-white/5 pb-4">
            <Cpu className="w-5 h-5 text-gray-400" />
            <div>
              <h3 className="text-base font-bold text-white">AI LLM Engine Settings</h3>
              <p className="text-xs text-gray-400">Choose provider, endpoints, and select model versions</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            {/* AI Provider */}
            <div className="space-y-2">
              <label className="text-[11px] font-mono tracking-wider text-gray-400 uppercase block">
                LLM Provider API
              </label>
              <select
                value={aiProvider}
                onChange={(e) => {
                  const provider = e.target.value;
                  setAiProvider(provider);
                  if (provider === 'google') {
                    setAiModel('gemini-1.5-flash');
                  } else if (provider === 'openai') {
                    setAiModel('gpt-4o-mini');
                  } else {
                    setAiModel('openrouter/free');
                  }
                }}
                className="w-full bg-white/5 border border-white/10 focus:border-white rounded-xl p-3 text-white outline-none cursor-pointer font-sans transition-all"
              >
                <option value="openrouter" className="bg-[#121216]">OpenRouter (Default API)</option>
                <option value="openai" className="bg-[#121216]">OpenAI (Official API)</option>
                <option value="google" className="bg-[#121216]">Google Gemini (AI Studio)</option>
              </select>
              <p className="text-[10px] text-gray-500">
                Choose provider. Ensure API keys are updated in the backend .env configuration.
              </p>
            </div>

            {/* AI Model Name */}
            <div className="space-y-2">
              <label className="text-[11px] font-mono tracking-wider text-gray-400 uppercase block">
                Model Identifier
              </label>
              <input
                type="text"
                value={aiModel}
                onChange={(e) => setAiModel(e.target.value)}
                placeholder={aiProvider === 'openai' ? 'gpt-4o-mini' : aiProvider === 'google' ? 'gemini-1.5-flash' : 'openrouter/free'}
                className="w-full bg-white/5 border border-white/10 focus:border-white rounded-xl p-3 text-xs text-white transition-all outline-none"
                required
              />
              <p className="text-[10px] text-gray-500">
                Provide model identifier e.g. <code>gpt-4o-mini</code>, <code>gemini-1.5-flash</code>, or <code>openrouter/free</code>.
              </p>
            </div>
          </div>
        </div>

        {/* Core Configuration Card */}
        <div className="glass-panel rounded-[28px] p-6 shadow-xl space-y-6">
          <div className="flex items-center space-x-2 border-b border-white/5 pb-4">
            <SettingsIcon className="w-5 h-5 text-gray-400" />
            <div>
              <h3 className="text-base font-bold text-white">System Settings</h3>
              <p className="text-xs text-gray-400">Configure AI and polling parameters for your inbox router</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
            {/* Language Output */}
            <div className="space-y-2">
              <label className="text-[11px] font-mono tracking-wider text-gray-400 uppercase block">
                AI Output Language
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full bg-white/5 border border-white/10 focus:border-white rounded-xl p-3 text-white outline-none cursor-pointer font-sans transition-all"
              >
                <option value="English" className="bg-[#121216]">English</option>
                <option value="Spanish" className="bg-[#121216]">Spanish (Español)</option>
                <option value="French" className="bg-[#121216]">French (Français)</option>
                <option value="German" className="bg-[#121216]">German (Deutsch)</option>
                <option value="Italian" className="bg-[#121216]">Italian (Italiano)</option>
                <option value="Portuguese" className="bg-[#121216]">Portuguese (Português)</option>
              </select>
              <p className="text-[10px] text-gray-500">
                Summaries will be written directly in this language.
              </p>
            </div>

            {/* Polling Interval */}
            <div className="space-y-2 col-span-1">
              <label className="text-[11px] font-mono tracking-wider text-gray-400 uppercase block">
                Inbox Poll Frequency
              </label>
              <select
                value={gmailPollInterval}
                onChange={(e) => setGmailPollInterval(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 focus:border-white rounded-xl p-3 text-white outline-none cursor-pointer font-sans transition-all"
              >
                <option value={1} className="bg-[#121216]">Every 1 Minute (High Precision)</option>
                <option value={5} className="bg-[#121216]">Every 5 Minutes (Standard)</option>
                <option value={10} className="bg-[#121216]">Every 10 Minutes</option>
                <option value={15} className="bg-[#121216]">Every 15 Minutes</option>
                <option value={30} className="bg-[#121216]">Every 30 Minutes</option>
              </select>
              <p className="text-[10px] text-gray-500">
                Background sync check frequency for new emails.
              </p>
            </div>

            {/* Importance Urgency Threshold */}
            <div className="space-y-2 col-span-1">
              <label className="text-[11px] font-mono tracking-wider text-gray-400 uppercase block">
                Alert Urgency Threshold
              </label>
              <select
                value={importanceThreshold}
                onChange={(e) => setImportanceThreshold(e.target.value)}
                className="w-full bg-white/5 border border-white/10 focus:border-white rounded-xl p-3 text-white outline-none cursor-pointer font-sans transition-all"
              >
                <option value="High" className="bg-[#121216]">High Urgency Only</option>
                <option value="Medium" className="bg-[#121216]">Medium & High Urgency</option>
                <option value="Low" className="bg-[#121216]">Low, Medium, & High (All Alerts)</option>
              </select>
              <p className="text-[10px] text-gray-500">
                Minimum parsed priority required to trigger WhatsApp alerts.
              </p>
            </div>

            {/* Sync Limit */}
            <div className="space-y-2 col-span-1">
              <label className="text-[11px] font-mono tracking-wider text-gray-400 uppercase block">
                Inbox Sync Limit
              </label>
              <select
                value={analyzeLimit}
                onChange={(e) => setAnalyzeLimit(Number(e.target.value))}
                className="w-full bg-white/5 border border-white/10 focus:border-white rounded-xl p-3 text-white outline-none cursor-pointer font-sans transition-all"
              >
                <option value={5} className="bg-[#121216]">Max 5 Emails</option>
                <option value={10} className="bg-[#121216]">Max 10 Emails (Recommended)</option>
                <option value={20} className="bg-[#121216]">Max 20 Emails</option>
                <option value={50} className="bg-[#121216]">Max 50 Emails</option>
              </select>
              <p className="text-[10px] text-gray-500">
                Maximum number of emails scanned during each manual or automated polling task.
              </p>
            </div>
          </div>
        </div>

        {/* Category Blacklist Card */}
        <div className="glass-panel rounded-[28px] p-6 shadow-xl space-y-6">
          <div className="flex items-center space-x-2 border-b border-white/5 pb-4">
            <ListFilter className="w-5 h-5 text-gray-400" />
            <div>
              <h3 className="text-base font-bold text-white">Omitted Categories</h3>
              <p className="text-xs text-gray-400">Omit certain email classifications entirely from processing</p>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Emails classified as checked categories will be blocked on ingress. The router logs them as <code>OMIT_FILTER</code> actions and discards them before archiving or forwarding, saving tokens and routing credits.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              {categories.map((cat) => {
                const isIgnored = ignoredCategories.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className={`flex items-center justify-between p-3 rounded-xl border text-xs font-semibold text-left transition-all cursor-pointer ${
                      isIgnored
                        ? 'bg-red-500/10 text-red-400 border-red-500/25'
                        : 'bg-white/5 border-white/10 text-gray-300 hover:border-white/20'
                    }`}
                  >
                    <span>{cat}</span>
                    {isIgnored && <Check className="w-4 h-4 text-red-400" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* WhatsApp Forwarder Routing Card */}
        <div className="glass-panel rounded-[28px] p-6 shadow-xl space-y-6">
          <div className="flex items-center space-x-2 border-b border-white/5 pb-4">
            <MessageSquare className="w-5 h-5 text-gray-400" />
            <div>
              <h3 className="text-base font-bold text-white">WhatsApp Alert Routing</h3>
              <p className="text-xs text-gray-400">Configure destination alert cell line</p>
            </div>
          </div>

          <div className="space-y-4 text-xs">
            {/* Toggle notifications */}
            <div className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/10">
              <div className="space-y-1 pr-4">
                <span className="font-semibold text-white block">Forwarding Dispatch Status</span>
                <span className="text-[11px] text-gray-400">
                  When active, urgent summaries are dispatched immediately to WhatsApp.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setWhatsappNotificationsEnabled(!whatsappNotificationsEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  whatsappNotificationsEnabled ? 'bg-white' : 'bg-white/10'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full shadow ring-0 transition duration-200 ease-in-out ${
                    whatsappNotificationsEnabled ? 'translate-x-5 bg-black' : 'translate-x-0 bg-gray-400'
                  }`}
                />
              </button>
            </div>

            {/* Target Phone number */}
            {whatsappNotificationsEnabled && (
              <div className="space-y-2 pt-2 animate-fade-in">
                <label className="text-[11px] font-mono tracking-wider text-gray-400 uppercase block">
                  Alert Telephone Number
                </label>
                <input
                  type="text"
                  placeholder="+1 (555) 019-2834"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 focus:border-white rounded-xl py-3 px-4 text-xs text-white transition-all outline-none"
                  required={whatsappNotificationsEnabled}
                />
                <p className="text-[10px] text-gray-500">
                  Enter target alert line in E.164 international formats for simulated secure push.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Form Action Submit */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/5 border border-white/10 rounded-2xl p-5">
          {saveSuccess ? (
            <span className="text-xs text-emerald-400 font-semibold font-mono">
              ✓ Parameters committed & synchronization daemon updated.
            </span>
          ) : (
            <span className="text-[10px] font-mono text-gray-500">
              Ensure all parameters are accurate before committing updates.
            </span>
          )}

          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-white hover:bg-gray-100 active:scale-98 text-black font-bold text-xs py-3 px-6 rounded-xl transition-all cursor-pointer shadow disabled:opacity-50"
            id="btn-save-settings"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving Configurations...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
