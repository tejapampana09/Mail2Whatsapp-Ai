import { Shield, LogOut, User } from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  hasApiKey: boolean;
  userProfile: { email: string; name: string; avatar: string } | null;
  onLogout: () => void;
}

export default function Header({ activeTab, setActiveTab, hasApiKey, userProfile, onLogout }: HeaderProps) {
  return (
    <header className="sticky top-4 z-50 mx-auto max-w-7xl w-[95%] sm:w-full mt-4 glass-panel rounded-2xl py-3 px-6 md:px-8 shadow-xl">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Branding Logo */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 border border-white/10 rounded-xl overflow-hidden shadow-md flex items-center justify-center bg-black/40">
            <img src="/app_icon.png" alt="Mail2WhatsApp Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold tracking-tight text-white">Mail2WhatsApp AI</h1>
              <span className="px-2 py-0.5 rounded-full text-[8px] font-mono font-semibold bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                v2.0.0
              </span>
            </div>
            <p className="text-[10px] text-gray-400 font-medium">Intelligent Router & Summarization Daemon</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center glass-panel rounded-xl p-1 shadow-inner gap-1">
          {['Dashboard', 'History', 'Console Logs', 'Settings'].map((tab) => {
            const isTabActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 flex items-center justify-center py-1.5 rounded-lg text-xs font-medium transition-all duration-300 cursor-pointer ${
                  isTabActive
                    ? 'bg-white/20 text-white shadow-md font-semibold'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
                id={`tab-${tab.toLowerCase().replace(' ', '-')}`}
              >
                {tab}
              </button>
            );
          })}
        </nav>

        {/* API / Sync Daemon Status & Profile */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl">
            <Shield className={`w-3.5 h-3.5 ${hasApiKey ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span className="text-[10px] font-mono font-medium uppercase tracking-wider text-gray-300">
              {hasApiKey ? 'LLM Engine Active' : 'Fallback Eng.'}
            </span>
          </div>

          {userProfile && (
            <div className="flex items-center space-x-3 pl-2 border-l border-white/10">
              {userProfile.avatar ? (
                <img
                  src={userProfile.avatar}
                  alt={userProfile.name}
                  className="w-7 h-7 rounded-full border border-white/10 shadow"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
              
              <div className="hidden sm:block text-left">
                <p className="text-xs font-semibold text-white leading-tight truncate max-w-[120px]">
                  {userProfile.name}
                </p>
                <p className="text-[9px] font-mono text-gray-500 leading-tight truncate max-w-[120px]">
                  {userProfile.email}
                </p>
              </div>

              <button
                onClick={onLogout}
                className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer border border-transparent"
                title="Logout Session"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
