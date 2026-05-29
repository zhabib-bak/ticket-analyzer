import { motion } from 'framer-motion';
import { TrendingUp, Users, Clock, Award } from 'lucide-react';

export function Dashboard() {
  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10">
          <h1 className="text-4xl font-semibold tracking-tighter">Visión General</h1>
          <p className="text-zinc-400 mt-2">Resumen de tus tickets y análisis de IA</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
          {[
            { icon: TrendingUp, label: "Tickets Analizados", value: "1,284", change: "+12%" },
            { icon: Users, label: "Precisión IA", value: "94.2%", change: "+3.1%" },
            { icon: Clock, label: "Tiempo Promedio", value: "1.8s", change: "-0.4s" },
            { icon: Award, label: "Puntuación", value: "4.9", change: "+0.2" },
          ].map((metric, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="premium-card glass rounded-3xl p-6 border border-white/10"
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-sm text-zinc-400">{metric.label}</div>
                  <div className="text-4xl font-semibold mt-3 tracking-tighter">{metric.value}</div>
                </div>
                <metric.icon className="w-8 h-8 text-indigo-400" />
              </div>
              <div className="text-emerald-500 text-sm mt-4 font-medium">{metric.change}</div>
            </motion.div>
          ))}
        </div>

        <div className="glass rounded-3xl p-8 border border-white/10">
          <div className="flex justify-between items-center mb-8">
            <div>
              <div className="text-xl font-semibold">Actividad Reciente</div>
              <div className="text-sm text-zinc-400">Últimas 24 horas</div>
            </div>
            <button className="text-sm text-indigo-400 hover:text-indigo-300">Ver todo →</button>
          </div>

          <div className="space-y-4">
            {[1,2,3].map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-2xl hover:bg-white/5">
                <div className="w-10 h-10 rounded-2xl bg-zinc-800" />
                <div className="flex-1">
                  <div className="font-medium">Análisis completado</div>
                  <div className="text-sm text-zinc-400">CSV procesado • 1.2s</div>
                </div>
                <div className="text-xs text-emerald-500 font-medium">hace 12m</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}