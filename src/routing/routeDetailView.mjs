import { escapeAttr, escapeHtml, isSafeUrl } from '../htmlSafety.mjs';

export function buildRouteDetailMarkup(result, screeningSummary, renderers) {
  let html = renderers.explanation(result);
  html += renderers.screening(result, screeningSummary);
  if (result.mismatched_records?.length) {
    html += '<p class="exclusions-title"><strong>Mismatched Raceways:</strong></p><ul class="exclusions-list">';
    result.mismatched_records.forEach(record => {
      const id = record.tray_id || record.id || 'unknown';
      const reason = record.reason.replace(/_/g, ' ');
      const cable = record.cable_id ? ` (cable ${record.cable_id})` : '';
      const link = record.filter && isSafeUrl(record.filter) ? ` <a href="${escapeAttr(record.filter)}">Filter</a>` : '';
      html += `<li>${escapeHtml(id)}: ${escapeHtml(reason)}${escapeHtml(cable)}${link}</li>`;
    });
    html += '</ul>';
  }
  if (result.breakdown?.length) {
    html += '<div class="table-scroll"><table class="sticky-table route-segment-table"><thead><tr><th>Segment</th><th>Raceway ID</th><th>Conduit</th><th>Type</th><th>From</th><th>To</th><th>Length</th><th>Recommended Raceway</th><th>Fill</th></tr></thead><tbody>';
    result.breakdown.forEach(segment => {
      let link = '';
      let racewayId = segment.tray_id || '';
      let conduit = '';
      if (segment.type === 'field') {
        link = `<button class="conduit-fill-btn" data-seg="${escapeAttr(segment.segment_key || '')}">Open</button>`;
      } else if (segment.ductbankTag) {
        racewayId = segment.ductbankTag;
        conduit = segment.conduit_id || '';
        link = `<button class="ductbank-fill-btn" data-ductbank="${escapeAttr(segment.ductbankTag)}" data-conduit="${escapeAttr(segment.conduit_id || '')}">Fill</button>`;
      } else if (segment.tray_id && segment.tray_id !== 'Field Route' && segment.tray_id !== 'N/A') {
        link = `<button class="tray-fill-btn" data-tray="${escapeAttr(segment.tray_id)}">Fill</button>`;
      }
      html += `<tr><td>${escapeHtml(segment.segment)}</td><td>${escapeHtml(racewayId)}</td><td>${escapeHtml(conduit)}</td><td>${escapeHtml(segment.type)}</td><td>${escapeHtml(segment.from)}</td><td>${escapeHtml(segment.to)}</td><td>${escapeHtml(segment.length)}</td><td>${escapeHtml(segment.raceway || '')}</td><td>${link}</td></tr>`;
    });
    html += '</tbody></table></div>';
  }
  return html;
}

export function bindRouteDetailActions(root, actions) {
  root.querySelectorAll('.conduit-fill-btn').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      actions.openConduit(button.dataset.seg);
    });
  });
  root.querySelectorAll('.tray-fill-btn').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      actions.openTray(button.dataset.tray);
    });
  });
  root.querySelectorAll('.ductbank-fill-btn').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      actions.openDuctbank(button.dataset.ductbank, button.dataset.conduit);
    });
  });
}
