export function classifySafetyRatio(ratio) {
  if (!Number.isFinite(ratio)) return 'pending';
  if (ratio > 1) return 'fail';
  if (ratio >= 0.85) return 'warning';
  return 'pass';
}

export function formatMarginPct(ratio) {
  if (!Number.isFinite(ratio)) return null;
  return (100 * (1 - ratio));
}

export function getGroundGridSafetyMetrics(result) {
  if (!result) {
    return {
      hasAnalysis: false,
      touchRatio: null,
      stepRatio: null,
      gprRatio: null,
      touchMarginPct: null,
      stepMarginPct: null,
      gprMarginPct: null,
      touchStatus: 'pending',
      stepStatus: 'pending',
      gprStatus: 'pending',
      designStatus: 'pending',
    };
  }

  const touchRatio = result.Em / Math.max(result.Etouch, 1);
  const stepRatio = result.Es / Math.max(result.Estep, 1);
  const gprRatio = result.GPR / Math.max(result.Etouch, 1);
  const touchStatus = classifySafetyRatio(touchRatio);
  const stepStatus = classifySafetyRatio(stepRatio);
  const gprStatus = classifySafetyRatio(gprRatio);
  const designStatus = touchStatus === 'fail' || stepStatus === 'fail'
    ? 'fail'
    : gprStatus === 'fail' || touchStatus === 'warning' || stepStatus === 'warning'
      ? 'review'
      : 'pass';

  return {
    hasAnalysis: true,
    touchRatio,
    stepRatio,
    gprRatio,
    touchMarginPct: formatMarginPct(touchRatio),
    stepMarginPct: formatMarginPct(stepRatio),
    gprMarginPct: formatMarginPct(gprRatio),
    touchStatus,
    stepStatus,
    gprStatus,
    designStatus,
  };
}

export function buildGroundGridRecommendations({
  result = null,
  metrics = getGroundGridSafetyMetrics(result),
  hasRods = false,
  hasSurfaceLayer = false,
} = {}) {
  if (!result || !metrics.hasAnalysis) {
    return [{
      title: 'Run the IEEE 80 analysis',
      detail: 'The geometry preview is live, but safety margins require the calculated mesh and step voltages.',
      tone: 'info',
    }];
  }

  const recommendations = [];

  if (metrics.touchStatus === 'fail' || metrics.stepStatus === 'fail') {
    recommendations.push({
      title: 'Reduce conductor spacing or add grid conductors',
      detail: 'A denser grid usually lowers mesh and step voltage by improving the effective buried conductor network.',
      tone: 'critical',
    });
    recommendations.push({
      title: 'Increase the grid footprint where practical',
      detail: 'A larger grid area lowers grid resistance and reduces voltage gradients near the grid perimeter.',
      tone: 'critical',
    });
  }

  if (!hasRods && (metrics.touchStatus !== 'pass' || metrics.stepStatus !== 'pass')) {
    recommendations.push({
      title: 'Add perimeter or corner ground rods',
      detail: 'Rods increase effective buried length and can improve resistance and voltage performance.',
      tone: 'warning',
    });
  }

  if (!hasSurfaceLayer && (metrics.touchStatus !== 'pass' || metrics.stepStatus !== 'pass')) {
    recommendations.push({
      title: 'Add a high-resistivity surface layer',
      detail: 'Crushed stone increases tolerable touch and step voltage by reducing current through a person.',
      tone: 'warning',
    });
  }

  if (metrics.gprStatus === 'fail') {
    recommendations.push({
      title: 'Review transferred-voltage exposure',
      detail: 'GPR exceeds the touch-voltage limit. Check fences, communications, remote grounds, and external metallic paths.',
      tone: 'critical',
    });
  }

  if (metrics.touchStatus === 'warning' || metrics.stepStatus === 'warning') {
    recommendations.push({
      title: 'Add margin before issuing for design',
      detail: 'One or more voltage ratios are within 15% of the tolerable limit. Confirm soil data, fault current, and clearing time.',
      tone: 'warning',
    });
  }

  recommendations.push({
    title: 'Confirm fault-current basis',
    detail: 'Verify grid current includes the correct split factor, fault duration, and worst-case system configuration.',
    tone: 'info',
  });

  if (recommendations.length === 1 && metrics.designStatus === 'pass') {
    recommendations.unshift({
      title: 'Design passes the current IEEE 80 checks',
      detail: 'Touch and step voltage are within tolerable limits for the entered assumptions. Keep soil data and current basis with the design package.',
      tone: 'success',
    });
  }

  return recommendations.slice(0, 5);
}
