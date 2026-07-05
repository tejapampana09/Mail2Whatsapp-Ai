import { Mail, Shield, LogOut, User } from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  hasApiKey: boolean;
  userProfile: { email: string; name: string; avatar: string } | null;
  onLogout: () => void;
}

export default function Header({ activeTab, setActiveTab, hasApiKey, userProfile, onLogout }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 backdrop-blur-md bg-black/80 border-b border-[#222222] py-4 px-6 md:px-8">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Branding Logo */}
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 border border-[#333333] rounded-xl overflow-hidden shadow-md flex items-center justify-center bg-black">
            <img src="/app_icon.png" alt="Mail2WhatsApp Logo" className="w-full h-full object-cover" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg font-bold tracking-tight text-white font-sans">Mail2WhatsApp AI</h1>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider bg-white/10 border border-white/20 text-stone-200">
                v1.2.0
              </span>
            </div>
            <p className="text-[11px] text-neutral-400 font-medium">Intelligent Router & Summarization Daemon</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex items-center bg-[#111111] border border-[#222222] rounded-xl p-1 shadow-inner gap-1">
          {['Dashboard', 'History', 'Console Logs', 'Settings'].map((tab) => {
            const isTabActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-300 cursor-pointer ${
                  isTabActive
                    ? 'bg-white text-black shadow-md font-bold'
                    : 'text-neutral-400 hover:text-white hover:bg-[#1a1a1a]'
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
          <div className="flex items-center space-x-2 bg-[#111111] border border-[#222222] px-3.5 py-1.5 rounded-xl">
            <Shield className={`w-3.5 h-3.5 ${hasApiKey ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-neutral-300">
              {hasApiKey ? 'LLM Engine Active' : 'Fallback Eng.'}
            </span>
          </div>

          {userProfile && (
            <div className="flex items-center space-x-3 pl-2 border-l border-[#222222]">
              {userProfile.avatar ? (
                <img
                  src={userProfile.avatar}
                  alt={userProfile.name}
                  className="w-8 h-8 rounded-full border border-[#333333] shadow"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-neutral-900 border border-[#333333] flex items-center justify-center text-white">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
              
              <div className="hidden sm:block text-left">
                <p className="text-xs font-semibold text-white leading-tight truncate max-w-[120px]">
                  {userProfile.name}
                </p>
                <p className="text-[9px] font-mono text-[#888888] leading-tight truncate max-w-[120px]">
                  {userProfile.email}
                </p>
              </div>

              <button
                onClick={onLogout}
                className="p-2 text-[#888888] hover:text-red-400 hover:bg-red-950/20 rounded-lg transition-all cursor-pointer border border-transparent hover:border-red-900/30"
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
