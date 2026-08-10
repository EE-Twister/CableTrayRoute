export function createAutoSaveScheduler({
  getHandle,
  writer,
  markClean = () => {},
  setFlag = () => {},
  warn = () => {},
  intervalMs,
  schedule = (callback, delay) => setInterval(callback, delay),
  cancel = id => clearInterval(id)
} = {}) {
  let timerId = null;

  async function run() {
    const handle = typeof getHandle === 'function' ? getHandle() : undefined;
    if (!handle) {
      setFlag?.(false);
      warn?.();
      return false;
    }
    setFlag?.(true);
    let saved = false;
    try {
      saved = await writer(handle);
      if (saved) markClean?.();
    } catch (error) {
      console.error('Autosave execution failed', error);
    } finally {
      setFlag?.(false);
    }
    return saved;
  }

  function start() {
    if (timerId !== null) return;
    timerId = schedule(run, intervalMs);
  }

  function stop() {
    if (timerId === null) return;
    cancel(timerId);
    timerId = null;
  }

  return { start, stop, run };
}
