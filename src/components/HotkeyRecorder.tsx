import { useEffect, useRef, useState } from 'react';
import { Keyboard, X } from 'lucide-react';
import { formatHotkeyFromEvent } from '../utils/domain.ts';

interface HotkeyRecorderProps {
  currentHotkey: string;
  onAssign: (hotkey: string) => void;
  compact?: boolean;
  ariaLabel?: string;
}

export function HotkeyRecorder({
  currentHotkey,
  onAssign,
  compact = false,
  ariaLabel = 'Snabbkommando',
}: HotkeyRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isRecording || typeof window === 'undefined') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (
        event.key === 'Escape' &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.metaKey
      ) {
        setIsRecording(false);
        return;
      }

      const formatted = formatHotkeyFromEvent(event);
      if (!formatted) {
        return;
      }

      setIsRecording(false);
      onAssign(formatted);
    };

    const handleMouseDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setIsRecording(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('mousedown', handleMouseDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('mousedown', handleMouseDown, true);
    };
  }, [isRecording, onAssign]);

  return (
    <div
      ref={containerRef}
      data-hotkey-recording={isRecording ? 'true' : undefined}
      className={`flex flex-wrap items-center gap-2 ${compact ? '' : 'justify-end'}`}
    >
      {isRecording ? (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-950/70 px-2.5 py-1.5 text-xs font-bold text-amber-200 animate-pulse">
            <Keyboard className="h-3.5 w-3.5" />
            Tryck på en tangent (Esc avbryter)...
          </span>
          <button
            type="button"
            onClick={() => setIsRecording(false)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700 cursor-pointer"
          >
            Avbryt
          </button>
        </div>
      ) : (
        <>
          <kbd
            className={`inline-flex min-w-[54px] items-center justify-center rounded-lg border px-2.5 py-1 font-mono text-xs font-bold ${
              currentHotkey
                ? 'border-blue-500/40 bg-blue-950/60 text-blue-200'
                : 'border-slate-700 bg-slate-950 text-slate-500'
            }`}
          >
            {currentHotkey || 'Obunden'}
          </kbd>
          <button
            type="button"
            aria-label={`${ariaLabel}: Byt tangent`}
            onClick={() => setIsRecording(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-200 hover:border-blue-500/50 hover:bg-slate-700 cursor-pointer"
          >
            <Keyboard className="h-3.5 w-3.5 text-blue-400" />
            {compact && !currentHotkey ? 'Bind tangent...' : 'Byt tangent...'}
          </button>
          {currentHotkey && (
            <button
              type="button"
              aria-label={`${ariaLabel}: Rensa snabbkommando`}
              onClick={() => onAssign('')}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs font-semibold text-slate-400 hover:border-red-500/50 hover:text-red-300 cursor-pointer"
              title="Rensa snabbkommando"
            >
              <X className="h-3.5 w-3.5" />
              Rensa
            </button>
          )}
        </>
      )}
    </div>
  );
}
