/**
 * safeStorage — protezione difensiva contro browser mobili in cui
 * `window.localStorage` non è accessibile (Safari in navigazione privata,
 * WebView con cookie di terze parti bloccati, storage pieno / QuotaExceeded).
 *
 * In quei casi il client Supabase lancia in fase di import e l'app monta una
 * pagina bianca. Qui rileviamo il problema UNA volta e, se lo storage non è
 * utilizzabile, sostituiamo `window.localStorage` (e `sessionStorage`) con una
 * implementazione in memoria: la sessione non sopravvive al refresh, ma l'app
 * si carica e resta usabile.
 *
 * Deve essere importato PRIMA di qualunque modulo che tocchi lo storage
 * (in pratica: prima riga di `src/main.tsx`).
 */

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, String(v)),
  } as Storage;
}

function isUsable(getStore: () => Storage | undefined): boolean {
  try {
    const store = getStore();
    if (!store) return false;
    const probe = '__kroneel_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

function patch(name: 'localStorage' | 'sessionStorage') {
  if (isUsable(() => window[name])) return false;
  try {
    Object.defineProperty(window, name, {
      configurable: true,
      value: createMemoryStorage(),
    });
    return true;
  } catch {
    return false;
  }
}

export function installSafeStorage(): void {
  if (typeof window === 'undefined') return;
  const patchedLocal = patch('localStorage');
  const patchedSession = patch('sessionStorage');
  if (patchedLocal || patchedSession) {
    // Utile in debug: senza questo il fallback resta invisibile.
    console.warn(
      '[safeStorage] storage del browser non disponibile: fallback in memoria attivo',
      { localStorage: patchedLocal, sessionStorage: patchedSession },
    );
  }
}

installSafeStorage();
