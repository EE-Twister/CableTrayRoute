function nextPaint() {
  if (typeof requestAnimationFrame === 'function') {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  }
  return Promise.resolve();
}

export async function appendHtmlChunks(container, htmlChunks, options = {}) {
  if (!container || !Array.isArray(htmlChunks) || htmlChunks.length === 0) return 0;
  const chunkSize = Math.max(1, Number(options.chunkSize) || 40);
  const shouldContinue = typeof options.shouldContinue === 'function'
    ? options.shouldContinue
    : () => true;
  const yieldToPaint = typeof options.yieldToPaint === 'function'
    ? options.yieldToPaint
    : nextPaint;
  let appended = 0;
  for (let index = 0; index < htmlChunks.length; index += chunkSize) {
    if (!shouldContinue()) break;
    const chunk = htmlChunks.slice(index, index + chunkSize).join('');
    container.insertAdjacentHTML('beforeend', chunk);
    appended += Math.min(chunkSize, htmlChunks.length - index);
    if (index + chunkSize < htmlChunks.length) await yieldToPaint();
  }
  return appended;
}
