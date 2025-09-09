export function emitAsync(name) {
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

// also expose globally (defensive)
if (typeof globalThis.emitAsync !== 'function') globalThis.emitAsync = emitAsync;

