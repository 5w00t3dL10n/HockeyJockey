import { useEffect, useRef } from 'react';
import { DEFAULT_KEY_BINDINGS } from '../data/defaults.ts';
import type { KeyBindings } from '../types/models.ts';
import { formatHotkeyFromEvent, resolveHotkeyMatch } from '../utils/domain.ts';

export interface KeyboardShortcutsConfig {
  isModalOpen: boolean;
  keyBindings?: KeyBindings;
  fadeOutDurationMs: number;
  duckVolume: number;
  isDucked: boolean;
  onFadeOut: () => void;
  onHardStop: () => void;
  onToggleDuck: () => void;
  onGoalHome?: () => void;
  onGoalAway?: () => void;
  onPenaltyHome?: () => void;
  onPenaltyAway?: () => void;
  onTriggerPadById?: (padId: string) => void;
  onModalDigit?: (digit: string) => void;
  onModalBackspace?: () => void;
  onModalEnter?: () => void;
  onModalEscape?: () => void;
}

function isEditableElementFocused(target: EventTarget | null): boolean {
  const el =
    (target instanceof HTMLElement ? target : null) ??
    (typeof document !== 'undefined' &&
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null);

  if (!el) {
    return false;
  }

  const tag = el.tagName.toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }

  return el.isContentEditable || el.closest('[contenteditable="true"]') !== null;
}

function isHotkeyRecordingActive(target: EventTarget | null): boolean {
  if (
    target instanceof HTMLElement &&
    target.closest('[data-hotkey-recording="true"]') !== null
  ) {
    return true;
  }
  if (typeof document === 'undefined') {
    return false;
  }
  if (
    document.activeElement instanceof HTMLElement &&
    document.activeElement.closest('[data-hotkey-recording="true"]') !== null
  ) {
    return true;
  }
  return document.querySelector('[data-hotkey-recording="true"]') !== null;
}

export function useKeyboardShortcuts(config: KeyboardShortcutsConfig): void {
  const latestRef = useRef(config);
  latestRef.current = config;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        isHotkeyRecordingActive(event.target) ||
        isEditableElementFocused(event.target)
      ) {
        return;
      }

      const current = latestRef.current;
      const bindings = current.keyBindings ?? DEFAULT_KEY_BINDINGS;

      // When Penalty or Goal modal is open, keep numpad keys (0-9, Backspace, Enter, Escape)
      // while allowing fadeOut, hardStop, and toggleDuck to work globally.
      if (current.isModalOpen) {
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

        if (
          /^[0-9]$/.test(event.key) &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          event.preventDefault();
          current.onModalDigit?.(event.key);
          return;
        }

        const pressedHotkey = formatHotkeyFromEvent(event);
        const match = pressedHotkey
          ? resolveHotkeyMatch(bindings, pressedHotkey)
          : null;
        if (match?.type === 'action') {
          if (match.id === 'fadeOut') {
            event.preventDefault();
            current.onFadeOut();
          } else if (match.id === 'hardStop') {
            event.preventDefault();
            current.onHardStop();
          } else if (match.id === 'toggleDuck') {
            event.preventDefault();
            current.onToggleDuck();
          }
        }
        return;
      }

      const pressedHotkey = formatHotkeyFromEvent(event);
      if (!pressedHotkey) {
        return;
      }

      const match = resolveHotkeyMatch(bindings, pressedHotkey);
      if (!match) {
        return;
      }

      event.preventDefault();

      if (match.type === 'action') {
        switch (match.id) {
          case 'fadeOut':
            current.onFadeOut();
            break;
          case 'hardStop':
            current.onHardStop();
            break;
          case 'toggleDuck':
            current.onToggleDuck();
            break;
          case 'goalHome':
            current.onGoalHome?.();
            break;
          case 'goalAway':
            current.onGoalAway?.();
            break;
          case 'penaltyHome':
            current.onPenaltyHome?.();
            break;
          case 'penaltyAway':
            current.onPenaltyAway?.();
            break;
        }
        return;
      }

      if (match.type === 'pad') {
        current.onTriggerPadById?.(match.id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
