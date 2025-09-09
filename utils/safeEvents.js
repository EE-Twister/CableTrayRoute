export function emitAsync(name) {
  // Fire after DOM changes; harmless no-op in Node.
  const fire = () => {
    try {
      if (typeof document !== 'undefined' && document?.dispatchEvent) {
        document.dispatchEvent(new Event(name));
      }
    } catch {}
  };
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => requestAnimationFrame(fire));
  } else {
    setTimeout(fire, 0); // Node/test fallback
  }
}

// Defensive global for legacy call sites:
if (typeof globalThis.emitAsync !== 'function') {
  globalThis.emitAsync = emitAsync;
}
