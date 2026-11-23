import { mountScheduleSummary } from './scheduleSummaryMount.js';
import { mountCrossHighlight } from './crossHighlightMount.js';

// Side-effect module for the Cable Schedule page: summary strip and raceway cross-highlighting.
document.addEventListener('DOMContentLoaded', () => {
  mountScheduleSummary('cables');
  mountCrossHighlight({ kind: 'cables', tableIds: ['cableScheduleTable'], keys: ['tag'] });
});
