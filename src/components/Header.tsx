import { Bell, Search, User } from 'lucide-react';

export function Header() {
  return (
    <header className="h-16 border-b border-white/10 bg-[#0A0A0C]/80 backdrop-blur-xl flex items-center justify-between px-8 sticky top-0 z-40">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500" />
          <div className="font-semibold text-lg tracking-tight">Ticket Analyzer</div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative w-80">
          <input 
            type="text" 
            placeholder="Buscar tickets..." 
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-indigo-500/50"
          />
          <Search className="absolute left-4 top-3 w-4 h-4 text-zinc-400" />
        </div>

        <button className="p-2.5 rounded-2xl hover:bg-white/5 transition-colors">
          <Bell className="w-5 h-5 text-zinc-400" />
        </button>

        <div className="flex items-center gap-2 pl-4 border-l border-white/10">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800" />
          <span className="text-sm font-medium">Jawad</span>
        </div>
      </div>
    </header>
  );
}