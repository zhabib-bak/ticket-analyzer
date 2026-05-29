import { useState, useEffect } from 'react';
import { Command } from 'cmdk';

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, []);

  return (
    <Command.Dialog open={open} onOpenChange={setOpen} className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-black/60" onClick={() => setOpen(false)} />
      
      <div className="relative w-full max-w-[640px] mx-4 rounded-2xl bg-[#111113] border border-white/10 shadow-2xl overflow-hidden">
        <Command.Input 
          placeholder="Buscar comandos..." 
          className="w-full border-b border-white/10 bg-transparent px-5 py-4 text-lg focus:outline-none placeholder:text-zinc-500"
        />
        
        <Command.List className="max-h-[400px] overflow-auto p-2">
          <Command.Group heading="Navegación">
            <Command.Item onSelect={() => alert('Ir a Visión General')}>Ir a Visión General</Command.Item>
            <Command.Item onSelect={() => alert('Ir a Datos')}>Ir a Datos</Command.Item>
            <Command.Item onSelect={() => alert('Ir a Análisis IA')}>Ir a Análisis IA</Command.Item>
          </Command.Group>
          
          <Command.Group heading="Acciones Rápidas">
            <Command.Item onSelect={() => alert('Nuevo Análisis')}>+ Nuevo Análisis</Command.Item>
            <Command.Item onSelect={() => alert('Exportar Informe')}>Exportar Informe</Command.Item>
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}