export function emitAsync(name) {
  // Fire after DOM updates; no-op in Node if no document exists.
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
    setTimeout(fire, 0);
  }
}

// Defensive global for legacy call-sites
if (typeof globalThis.emitAsync !== 'function') {
  globalThis.emitAsync = emitAsync;
}
