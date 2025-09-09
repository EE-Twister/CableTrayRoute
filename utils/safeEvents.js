function emitAsync(name) {
  const fire = () => {
    try {
      if (typeof document !== 'undefined' && document?.dispatchEvent) {
        document.dispatchEvent(new Event(name));
      }
    } catch {}
  };
  if (typeof requestAnimationFrame === 'function') {
    // In Node this is usually undefined; falls back to setTimeout.
    requestAnimationFrame(() => requestAnimationFrame(fire));
  } else {
    setTimeout(fire, 0);
  }
}

// export for Node
module.exports = { emitAsync };

// and a global fallback so legacy browser code calling globalThis.emitAsync still works
if (typeof globalThis === 'object' && typeof globalThis.emitAsync !== 'function') {
  try { globalThis.emitAsync = emitAsync; } catch {}
}

