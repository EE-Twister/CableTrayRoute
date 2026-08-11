export const MCC_FEEDER_BREAKER_BUCKET_SOURCES = [
  {
    label: 'Eaton low-voltage MCC design guide',
    url: 'https://www.eaton.com/content/dam/eaton/products/design-guides---consultant-audience/eaton-low-voltage-mcc-design-guide-dg043001en.pdf'
  },
  {
    label: 'Rockwell Automation CENTERLINE 2100 selection guide',
    url: 'https://literature.rockwellautomation.com/idc/groups/literature/documents/sg/2100-sg003_-en-p.pdf'
  },
  {
    label: 'Schneider Electric Model 6 MCC feeder catalog',
    url: 'https://productinfo.se.com/nadigest/5c51d645347bdf0001f1f280/Master/17717_MAIN%20%28bookmap%29_0000055870.xml/%24/topicref'
  }
];

export const CONSERVATIVE_FEEDER_BREAKER_BUCKET_ROWS = [
  { maximumFrameA: 125, heightIn: 12 },
  { maximumFrameA: 250, heightIn: 18 },
  { maximumFrameA: 400, heightIn: 30 },
  { maximumFrameA: 600, heightIn: 42 },
  { maximumFrameA: 800, heightIn: 66 },
  { maximumFrameA: 2500, fullSection: true }
];

function positiveNumber(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseBreakerAmpFrame({ breakerFrameA = '', breakerA = '' } = {}) {
  const explicitFrame = positiveNumber(breakerFrameA);
  const raw = String(breakerA ?? '').trim();
  const tripMatch = raw.match(/(\d[\d,.]*)\s*A?T\b/i);
  const loneTripMatch = raw.match(/^(\d[\d,.]*)\s*A?$/i);
  const ratings = raw.match(/\d[\d,.]*/g) || [];
  const tripA = positiveNumber(tripMatch?.[1] || loneTripMatch?.[1] || (ratings.length >= 2 ? ratings[0] : ''));
  let frameA = explicitFrame;
  let source = explicitFrame ? 'frame-field' : '';

  if (!frameA && raw) {
    const frameMatch = raw.match(/(\d[\d,.]*)\s*A?F\b/i);
    frameA = positiveNumber(frameMatch?.[1]);
    if (frameA) source = 'af-label';
  }

  if (!frameA && raw) {
    if (ratings.length >= 2) {
      frameA = positiveNumber(ratings[1]);
      source = frameA ? 'rating-pair' : '';
    }
  }

  if (!frameA) return { frameA: null, tripA, reason: 'missing-explicit-frame' };
  if (tripA !== null && tripA > frameA) return { frameA: null, tripA, reason: 'trip-above-frame' };
  return { frameA, tripA, source };
}

export function approximateFeederBreakerBucketSize({
  breakerFrameA = '',
  breakerA = '',
  unitHeightIn = 6,
  usableBucketHeightIn = 72
} = {}) {
  const parsedFrame = parseBreakerAmpFrame({ breakerFrameA, breakerA });
  if (!parsedFrame.frameA) {
    return { sizeUnits: null, heightIn: null, frameA: null, reason: parsedFrame.reason };
  }

  const unitHeight = positiveNumber(unitHeightIn);
  if (!unitHeight) return { sizeUnits: null, heightIn: null, frameA: parsedFrame.frameA, reason: 'invalid-unit-height' };

  const row = CONSERVATIVE_FEEDER_BREAKER_BUCKET_ROWS.find(candidate => parsedFrame.frameA <= candidate.maximumFrameA);
  if (!row) return { sizeUnits: null, heightIn: null, frameA: parsedFrame.frameA, reason: 'custom-size-required' };

  const usableHeight = positiveNumber(usableBucketHeightIn);
  if (!usableHeight) return { sizeUnits: null, heightIn: null, frameA: parsedFrame.frameA, reason: 'invalid-usable-height' };

  const heightIn = row.fullSection ? usableHeight : row.heightIn;
  if (heightIn > usableHeight) {
    return { sizeUnits: null, heightIn: null, frameA: parsedFrame.frameA, reason: 'lineup-too-short' };
  }

  const sizeUnits = Math.round((heightIn / unitHeight) * 100) / 100;
  return {
    sizeUnits,
    heightIn,
    frameA: parsedFrame.frameA,
    tripA: parsedFrame.tripA,
    fullSection: Boolean(row.fullSection),
    basis: `Generic conservative feeder-breaker planning allowance for ${parsedFrame.frameA} AF: ${heightIn} in. (${sizeUnits} MCC units at ${unitHeight} in./unit).`
  };
}
