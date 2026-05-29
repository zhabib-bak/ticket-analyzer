import { FileText, Upload } from 'lucide-react';

export function EmptyState({ 
  title = "No hay datos aún", 
  description = "Sube tu primer archivo CSV para comenzar a analizar", 
  actionLabel = "Subir CSV",
  onAction 
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-20 h-20 rounded-3xl bg-white/5 flex items-center justify-center mb-6">
        <FileText className="w-10 h-10 text-zinc-400" />
      </div>
      
      <h3 className="text-2xl font-semibold tracking-tight mb-3">{title}</h3>
      <p className="text-zinc-400 max-w-xs mb-8">{description}</p>
      
      {onAction && (
        <button 
          onClick={onAction}
          className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-2xl font-semibold text-sm hover:bg-zinc-200 active:scale-[0.985] transition-all"
        >
          <Upload className="w-4 h-4" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}