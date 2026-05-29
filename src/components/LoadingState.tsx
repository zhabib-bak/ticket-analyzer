import { motion } from 'framer-motion';

export function LoadingState({ message = "Procesando..." }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="relative w-16 h-16">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
          className="absolute inset-0 border-4 border-white/10 border-t-indigo-500 rounded-full"
        />
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="absolute inset-2 border-4 border-white/10 border-b-violet-500 rounded-full"
        />
      </div>
      <p className="mt-6 text-sm text-zinc-400 font-medium">{message}</p>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="premium-card glass rounded-3xl p-6 border border-white/10 animate-pulse">
      <div className="h-4 w-24 bg-white/10 rounded mb-4" />
      <div className="h-8 w-16 bg-white/10 rounded mb-6" />
      <div className="h-3 w-full bg-white/10 rounded" />
    </div>
  );
}