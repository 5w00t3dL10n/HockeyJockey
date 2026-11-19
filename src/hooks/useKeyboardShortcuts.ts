import { useEffect, useRef } from 'react';

export interface KeyboardShortcutsConfig {
  isModalOpen: boolean;
  fadeOutDurationMs: number;
  duckVolume: number;
  isDucked: boolean;
  onFadeOut: () => void;
  onHardStop: () => void;
  onToggleDuck: () => void;
  onModalDigit?: (digit: string) => void;
  onModalBackspace?: () => void;
  onModalEnter?: () => void;
  onModalEscape?: () => void;
}

function isEditableElementFocused(target: EventTarget | null): boolean {
  const el =
    (target instanceof HTMLElement ? target : null) ??
    (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null);

  if (!el) {
    return false;
  }

  const tag = el.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }

  return el.isContentEditable;
}

export function useKeyboardShortcuts(config: KeyboardShortcutsConfig): void {
  const latestRef = useRef(config);
  latestRef.current = config;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableElementFocused(event.target)) {
        return;
      }

      const current = latestRef.current;

      // Global shortcuts (always active outside text inputs)
      if (event.code === 'Space') {
        event.preventDefault();
        if (event.shiftKey) {
          current.onHardStop();
        } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
          current.onFadeOut();
        }
        return;
      }

      if (
        event.key.toLowerCase() === 'd' &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        current.onToggleDuck();
        return;
      }

      // Modal shortcuts when Penalty or Goal modal is open
      if (!current.isModalOpen) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        current.onModalEscape?.();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        current.onModalEnter?.();
        return;
      }

      if (event.key === 'Backspace') {
        event.preventDefault();
        current.onModalBackspace?.();
        return;
      }

      if (/^[0-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        current.onModalDigit?.(event.key);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
