import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { appendHtmlChunks } from '../src/components/incrementalDom.js';

describe('incremental DOM rendering', () => {
  it('appends large row collections in bounded chunks and yields between them', async () => {
    const insertions = [];
    let yields = 0;
    const container = {
      insertAdjacentHTML(position, html) {
        insertions.push({ position, html });
      },
    };
    const appended = await appendHtmlChunks(container, ['1', '2', '3', '4', '5'], {
      chunkSize: 2,
      yieldToPaint: async () => { yields += 1; },
    });
    assert.equal(appended, 5);
    assert.deepEqual(insertions.map(insertion => insertion.html), ['12', '34', '5']);
    assert.equal(yields, 2);
  });

  it('stops when a newer render invalidates the current batch', async () => {
    let active = true;
    const insertions = [];
    const appended = await appendHtmlChunks({
      insertAdjacentHTML(_position, html) { insertions.push(html); },
    }, ['1', '2', '3'], {
      chunkSize: 1,
      shouldContinue: () => active,
      yieldToPaint: async () => { active = false; },
    });
    assert.equal(appended, 1);
    assert.deepEqual(insertions, ['1']);
  });
});
