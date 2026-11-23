import "./workflowStatus.js";
import "../site.js";
import "../iec60287.js";
import { initCableThermalPanel } from './components/cableThermalPanel.js';

const initDetailedThermalPanel = async () => {
  try {
    const response = await fetch('data/cableThermalReferenceProfiles.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const sourceById = new Map((data.sources || []).map(source => [source.id, source]));
    const profiles = (data.profiles || []).map(profile => {
      const sources = (profile.sourceIds || []).map(id => sourceById.get(id)).filter(Boolean);
      return {
        ...profile,
        reference: { ...(profile.reference || {}), urls: sources.map(source => source.url).filter(Boolean), sourceRecords: sources },
        cable: { ...profile.cable, source: { ...(profile.cable?.source || {}), urls: sources.map(source => source.url).filter(Boolean), sourceRecords: sources } },
      };
    });
    const manufacturerRecords = (data.manufacturerRecords || []).map(record => ({ ...record, sourceUrl: sourceById.get(record.sourceId)?.url || '' }));
    initCableThermalPanel({ profiles, manufacturerRecords, manufacturerRecordConditions: data.manufacturerRecordConditions });
  } catch (error) {
    console.warn('[cable-thermal] published reference profiles unavailable:', error?.message || error);
    initCableThermalPanel({ profiles: [] });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initDetailedThermalPanel, { once: true });
} else {
  initDetailedThermalPanel();
}
