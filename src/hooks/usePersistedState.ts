import { useState, useEffect, useRef, Dispatch, SetStateAction } from 'react';

export interface UsePersistedStateOptions<T> {
  debounceMs?: number;
  serialize?: (value: T) => string;
  deserialize?: (raw: string) => T;
}

/**
 * Custom React hook that synchronizes state with localStorage using debounced writes
 * to avoid main-thread JSON serialization overhead during rapid UI updates (e.g. drag-and-drop).
 */
export function usePersistedState<T>(
  storageKey: string,
  initialValue: T | (() => T),
  options?: UsePersistedStateOptions<T>
): [T, Dispatch<SetStateAction<T>>] {
  const debounceMs = options?.debounceMs ?? 250;
  const serializeRef = useRef(options?.serialize ?? ((val: T) => JSON.stringify(val)));
  const deserializeRef = useRef(options?.deserialize ?? ((raw: string) => JSON.parse(raw) as T));

  const [state, setState] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved !== null) {
        return deserializeRef.current(saved);
      }
    } catch {
      // Fallback to initialValue if localStorage is unavailable or corrupted
    }
    return typeof initialValue === 'function' ? (initialValue as () => T)() : initialValue;
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, serializeRef.current(state));
      } catch {
        // Ignore quota or private-browsing storage errors
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [storageKey, state, debounceMs]);

  return [state, setState];
}
