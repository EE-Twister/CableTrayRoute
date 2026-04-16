import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runCathodicProtectionAnalysis } from '../../cathodicprotection.js';

const FIXTURE_DIRECTORY = new URL('./fixtures/', import.meta.url);

function loadFixture(fileName) {
  const fixturePath = new URL(fileName, FIXTURE_DIRECTORY);
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

function assertWithinTolerance(actual, expected, tolerance, label) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label} expected ${expected} ±${tolerance} but received ${actual}`
  );
}

(function testDeterministicFixtures() {
  const fixtureFiles = fs.readdirSync(FIXTURE_DIRECTORY).filter((name) => name.endsWith('.json')).sort();
  assert.deepEqual(fixtureFiles, [
    'baseline-sizing.fixture.json',
    'geometry-attenuation-edge.fixture.json',
    'high-interference-risk.fixture.json',
    'high-resistivity-soil.fixture.json'
  ]);

  fixtureFiles.forEach((fixtureFile) => {
    const fixture = loadFixture(fixtureFile);
    const result = runCathodicProtectionAnalysis(fixture.input);

    if (Number.isFinite(fixture.expected.designCurrentDensityMaM2)) {
      assertWithinTolerance(result.designCurrentDensityMaM2, fixture.expected.designCurrentDensityMaM2, 0.001, `${fixture.id}: design density`);
    }

    if (Number.isFinite(fixture.expected.requiredCurrentA)) {
      assertWithinTolerance(result.requiredCurrentA, fixture.expected.requiredCurrentA, 0.0001, `${fixture.id}: required current`);
    }

    if (Number.isFinite(fixture.expected.minimumAnodeMassKg)) {
      assertWithinTolerance(result.minimumAnodeMassKg, fixture.expected.minimumAnodeMassKg, 0.001, `${fixture.id}: minimum anode mass`);
    }

    if (Number.isFinite(fixture.expected.predictedLifeYears)) {
      assertWithinTolerance(result.predictedLifeYears, fixture.expected.predictedLifeYears, 0.01, `${fixture.id}: predicted life`);
    }

    if (Number.isFinite(fixture.expected.distributionGlobalAttenuationFactor)) {
      assertWithinTolerance(
        result.distributionModel.globalAttenuationFactor,
        fixture.expected.distributionGlobalAttenuationFactor,
        0.001,
        `${fixture.id}: attenuation factor`
      );
    }

    if (fixture.expected.criteriaOverallStatus) {
      assert.equal(result.criteriaCheckEvidence.overallStatus, fixture.expected.criteriaOverallStatus);
    }

    if (fixture.expected.interferenceRiskLevel) {
      assert.equal(result.interferenceAssessment.riskLevel, fixture.expected.interferenceRiskLevel);
    }

    if (Number.isFinite(fixture.expected.interferenceScore)) {
      assert.equal(result.interferenceAssessment.score, fixture.expected.interferenceScore);
    }

    if (typeof fixture.expected.unresolvedHighRisk === 'boolean') {
      assert.equal(result.interferenceAssessment.unresolvedHighRisk, fixture.expected.unresolvedHighRisk);
    }

    if (Number.isFinite(fixture.expected.missingMitigationsCount)) {
      assert.equal(result.interferenceAssessment.missingMitigations.length, fixture.expected.missingMitigationsCount);
    }

    if (Number.isFinite(fixture.expected.averageEffectivenessFactor)) {
      assertWithinTolerance(
        result.distributionModel.averageEffectivenessFactor,
        fixture.expected.averageEffectivenessFactor,
        0.001,
        `${fixture.id}: average effectiveness`
      );
    }

    if (Number.isFinite(fixture.expected.edgeEffectivenessFactor)) {
      assert.equal(result.distributionModel.segments[0].effectivenessFactor, fixture.expected.edgeEffectivenessFactor);
    }

    if (fixture.expected.worstCaseSegmentLabel) {
      assert.equal(result.sensitivity[1].worstCaseSegmentLabel, fixture.expected.worstCaseSegmentLabel);
    }
  });
})();

console.log('✓ cp fixture regression tests passed');
