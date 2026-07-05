import { useState, useEffect } from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import EmailHistory from './components/EmailHistory';
import Logs from './components/Logs';
import Settings from './components/Settings';
import { ProcessedEmail, ActivityLog, SystemSettings } from './types';
import { Mail, LogIn, ShieldAlert } from 'lucide-react';

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('mail2whatsapp_token'));
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [emails, setEmails] = useState<ProcessedEmail[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isLoadingEmails, setIsLoadingEmails] = useState(true);
  const [userProfile, setUserProfile] = useState<{ email: string; name: string; avatar: string } | null>(null);

  // Parse token from URL if redirected from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');
    if (tokenParam) {
      localStorage.setItem('mail2whatsapp_token', tokenParam);
      setToken(tokenParam);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // API Request Helper with Auth Header and Auto-Logout on 401/403
  const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    if (!token) return null;
    
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`
    };

    try {
      const res = await fetch(url, { ...options, headers });
      if (res.status === 401 || res.status === 403) {
        // Token expired or invalid, log out
        localStorage.removeItem('mail2whatsapp_token');
        setToken(null);
        setUserProfile(null);
        return null;
      }
      return res;
    } catch (err) {
      console.error(`Request to ${url} failed:`, err);
      throw err;
    }
  };

  // Initial Fetch Handshake & Configs
  const fetchHandshake = async () => {
    try {
      const res = await fetch('/api/handshake');
      const data = await res.json();
      setHasApiKey(data.llmConfigured);
    } catch (err) {
      console.error('Handshake verification failed:', err);
    }
  };

  const fetchProfile = async () => {
    if (!token) return;
    try {
      const res = await authenticatedFetch('/api/auth/me');
      if (res && res.ok) {
        const data = await res.json();
        setUserProfile(data);
      }
    } catch (err) {
      console.error('Failed to load user profile:', err);
    }
  };

  const fetchEmails = async () => {
    if (!token) return;
    try {
      const res = await authenticatedFetch('/api/emails');
      if (res && res.ok) {
        const data = await res.json();
        setEmails(data);
      }
    } catch (err) {
      console.error('Failed to load processed emails:', err);
    } finally {
      setIsLoadingEmails(false);
    }
  };

  const fetchLogs = async () => {
    if (!token) return;
    try {
      const res = await authenticatedFetch('/api/logs');
      if (res && res.ok) {
        const data = await res.json();
        setLogs(data);
      }
    } catch (err) {
      console.error('Failed to load activity logs:', err);
    }
  };

  const fetchSettings = async () => {
    if (!token) return;
    try {
      const res = await authenticatedFetch('/api/settings');
      if (res && res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error('Failed to fetch system settings:', err);
    }
  };

  const handleSyncInbox = async () => {
    if (!token) return { success: false, added: 0, skipped: 0 };
    try {
      const res = await authenticatedFetch('/api/sync', { method: 'POST' });
      if (res && res.ok) {
        const data = await res.json();
        await fetchEmails();
        await fetchLogs();
        return {
          success: data.success,
          added: data.added || 0,
          skipped: data.skipped || 0,
        };
      }
      return { success: false, added: 0, skipped: 0 };
    } catch (err) {
      console.error('Manual sync triggered exception:', err);
      return { success: false, added: 0, skipped: 0 };
    }
  };

  const handleDeleteEmail = async (id: string): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await authenticatedFetch('/api/emails/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res && res.ok) {
        await fetchEmails();
        await fetchLogs();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Deletion operation failed:', err);
      return false;
    }
  };

  const handleClearLogs = async (): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await authenticatedFetch('/api/logs/clear', { method: 'POST' });
      if (res && res.ok) {
        await fetchLogs();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to purge logs:', err);
      return false;
    }
  };

  const handleResetDatabase = async (): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await authenticatedFetch('/api/reset', { method: 'POST' });
      if (res && res.ok) {
        await fetchEmails();
        await fetchLogs();
        await fetchSettings();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to reset system databases:', err);
      return false;
    }
  };

  const handleSaveSettings = async (updatedSettings: SystemSettings): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await authenticatedFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSettings),
      });
      if (res && res.ok) {
        await fetchSettings();
        await fetchLogs();
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to commit configurations:', err);
      return false;
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('mail2whatsapp_token');
    setToken(null);
    setUserProfile(null);
  };

  // Run on mount / token change
  useEffect(() => {
    fetchHandshake();
    if (token) {
      fetchProfile();
      fetchEmails();
      fetchLogs();
      fetchSettings();

      // Poll updates every 15 seconds
      const interval = setInterval(() => {
        fetchEmails();
        fetchLogs();
      }, 15000);

      return () => clearInterval(interval);
    }
  }, [token]);

  // Render Login view if not authenticated
  if (!token) {
    return (
      <div className="min-h-screen bg-[#030303] text-white flex flex-col justify-center items-center px-4 relative overflow-hidden">
        {/* Animated background blobs */}
        <div className="bg-blob bg-indigo-600/20 top-1/4 left-1/4" style={{ animationDelay: '0s' }}></div>
        <div className="bg-blob bg-purple-600/20 bottom-1/4 right-1/4" style={{ animationDelay: '-5s' }}></div>
        <div className="bg-blob bg-cyan-600/15 top-1/2 left-1/2" style={{ animationDelay: '-10s' }}></div>

        <div className="max-w-md w-full glass-panel rounded-[32px] p-8 shadow-2xl space-y-8 animate-fade-in relative overflow-hidden">
          <div className="text-center space-y-4 relative">
            <div className="w-16 h-16 mx-auto bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-white shadow-lg mb-2">
              <Mail className="w-8 h-8 text-indigo-400" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-2xl font-bold tracking-tight text-white">Mail2WhatsApp AI</h1>
              <p className="text-xs text-gray-400 font-medium max-w-xs mx-auto leading-relaxed">
                Connect your inbox to classify and summarize incoming emails instantly with AI and route critical alerts directly to WhatsApp.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <a
              href="/api/auth/google"
              className="w-full flex items-center justify-center space-x-3 bg-white hover:bg-gray-100 text-black px-5 py-3.5 rounded-xl font-semibold text-sm transition-all shadow-md active:scale-[0.98] cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Connect with Google Account</span>
            </a>
            
            <p className="text-[10px] text-center text-gray-500 font-mono leading-relaxed">
              Requires Gmail read-only scopes. Refresh tokens are secured and encrypted.
            </p>
          </div>

          {!hasApiKey && (
            <div className="flex items-start space-x-2.5 p-3.5 rounded-xl bg-amber-950/20 text-amber-300 border border-amber-900/40 text-xs">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <p className="leading-relaxed">
                <strong>Attention:</strong> OpenAI/OpenRouter key is not detected in your server's .env file. Please check environment variables.
              </p>
            </div>
          )}
        </div>
        
        <footer className="mt-8 text-center text-[10px] font-mono text-gray-600 z-10">
          MAIL2WHATSAPP AI DAEMON SECURE GATEWAY • PORT: 3000
        </footer>
      </div>
    );
  }

  // Render Dashboard Workspace
  return (
    <div className="min-h-screen bg-[#030303] text-white flex flex-col relative overflow-hidden">
      {/* Animated background blobs */}
      <div className="bg-blob bg-indigo-600/10 top-10 left-10" style={{ animationDelay: '0s' }}></div>
      <div className="bg-blob bg-purple-600/10 bottom-10 right-10" style={{ animationDelay: '-7s' }}></div>
      <div className="bg-blob bg-cyan-600/10 top-1/2 left-1/3" style={{ animationDelay: '-14s' }}></div>

      {/* Navigation Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        hasApiKey={hasApiKey}
        userProfile={userProfile}
        onLogout={handleLogout}
      />

      {/* Main Workspace Frame */}
      <main className="flex-1 max-w-7xl w-full mx-auto py-8 px-6 md:px-8 z-10">
        <div className="animate-fade-in transition-all duration-300">
          {activeTab === 'Dashboard' && (
            <Dashboard
              emails={emails}
              logs={logs}
              settings={settings}
              onSync={handleSyncInbox}
            />
          )}

          {activeTab === 'History' && (
            <EmailHistory
              emails={emails}
              isLoading={isLoadingEmails}
              onDelete={handleDeleteEmail}
            />
          )}

          {activeTab === 'Console Logs' && (
            <Logs
              logs={logs}
              onClear={handleClearLogs}
              onReset={handleResetDatabase}
            />
          )}

          {activeTab === 'Settings' && (
            <Settings
              settings={settings}
              onSave={handleSaveSettings}
            />
          )}
        </div>
      </main>

      {/* Decorative footer */}
      <footer className="py-6 text-center text-[10px] font-mono text-gray-600 border-t border-white/5 bg-black/40 backdrop-blur-md z-10">
        MAIL2WHATSAPP AI DAEMON SECURE CLOUD GATEWAY • PORT: 3000
      </footer>
    </div>
  );
}
