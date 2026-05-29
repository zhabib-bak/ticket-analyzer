import { motion } from 'framer-motion';
import { BarChart3, Upload, Bot, FileText, Plus } from 'lucide-react';

export function Sidebar({ activeTab, onTabChange }: { activeTab: string; onTabChange: (tab: string) => void }) {
  const navItems = [
    { icon: BarChart3, label: 'Visión General', id: 'overview' },
    { icon: Upload, label: 'Datos', id: 'data' },
    { icon: Bot, label: 'Análisis IA', id: 'ai' },
    { icon: FileText, label: 'Informes', id: 'reports' },
  ];

  return (
    <div className="w-72 h-screen border-r border-white/10 bg-[#0A0A0C] flex flex-col">
      <div className="p-6 flex items-center gap-3 border-b border-white/10">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 flex items-center justify-center">
          <span className="text-white font-bold text-2xl">T</span>
        </div>
        <div>
          <div className="font-semibold text-xl tracking-tighter">Ticket Analyzer</div>
          <div className="text-[10px] text-emerald-500 font-medium -mt-1">PROFESSIONAL</div>
        </div>
      </div>

      <div className="px-4 py-8 flex-1">
        <div className="px-3 mb-3 text-xs font-semibold text-zinc-500 tracking-[2px]">PRINCIPAL</div>
        
        <div className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <motion.button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                whileHover={{ x: 6 }}
                className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-3xl text-left transition-all ${isActive ? 'bg-white/5 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-white'}`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : ''}`} />
                <span className="font-medium text-[15px]">{item.label}</span>
                {isActive && <div className="ml-auto w-2 h-2 rounded-full bg-indigo-500" />}
              </motion.button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pb-6">
        <button className="w-full flex items-center justify-center gap-2 py-3.5 rounded-3xl bg-white text-black font-semibold text-sm active:scale-[0.985]">
          <Plus className="w-4 h-4" /> Nuevo Análisis
        </button>
      </div>

      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 rounded-2xl hover:bg-white/5">
          <div className="w-9 h-9 rounded-full bg-zinc-800" />
          <div>
            <div className="text-sm font-semibold">Jawad Habib</div>
            <div className="text-xs text-emerald-500">Plan Pro</div>
          </div>
        </div>
      </div>
    </div>
  );
}