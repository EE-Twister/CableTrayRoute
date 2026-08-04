export function scheduleNoncriticalWork(work, {
  interactionTarget = document.getElementById('palette'),
  timeoutMs = 250,
} = {}) {
  let completed = false;
  let idleHandle = null;
  const run = () => {
    if (completed) return;
    completed = true;
    if (idleHandle !== null && typeof cancelIdleCallback === 'function') cancelIdleCallback(idleHandle);
    interactionTarget?.removeEventListener('pointerenter', run);
    interactionTarget?.removeEventListener('focusin', run);
    work();
  };
  interactionTarget?.addEventListener('pointerenter', run, { once: true });
  interactionTarget?.addEventListener('focusin', run, { once: true });
  const schedule = () => {
    if (typeof requestIdleCallback === 'function') {
      idleHandle = requestIdleCallback(run, { timeout: timeoutMs });
    } else {
      setTimeout(run, 0);
    }
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(schedule);
  else schedule();
  return run;
}
