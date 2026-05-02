/**
 * Tests for analysis/reportPackage.mjs
 */
import assert from 'assert';
import {
  SECTION_REGISTRY,
  PRESET_CONFIGS,
  getSectionDef,
  getAvailableSections,
  buildCoverSheet,
  buildRevisionTable,
  buildReportPackage,
  snapshotPackage,
  sectionToAOA,
} from '../analysis/reportPackage.mjs';

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  ✓', name); }
  catch (err) { console.error('  ✗', name, err.message || err); process.exitCode = 1; }
}

// ---------------------------------------------------------------------------
describe('SECTION_REGISTRY', () => {
  it('has exactly 16 entries', () => {
    assert.strictEqual(SECTION_REGISTRY.length, 16);
  });

  it('every entry has required fields: key, label, group', () => {
    for (const def of SECTION_REGISTRY) {
      assert.ok(typeof def.key   === 'string' && def.key.length > 0,   `missing key in ${JSON.stringify(def)}`);
      assert.ok(typeof def.label === 'string' && def.label.length > 0, `missing label in ${def.key}`);
      assert.ok(typeof def.group === 'string' && def.group.length > 0, `missing group in ${def.key}`);
    }
  });

  it('keys are unique', () => {
    const keys = SECTION_REGISTRY.map(s => s.key);
    const unique = new Set(keys);
    assert.strictEqual(unique.size, keys.length);
  });

  it('groups are a subset of Meta, Construction, Studies', () => {
    const allowed = new Set(['Meta', 'Construction', 'Studies']);
    for (const def of SECTION_REGISTRY) {
      assert.ok(allowed.has(def.group), `unexpected group "${def.group}" for key "${def.key}"`);
    }
  });

  it('study sections have studyKey field', () => {
    const studies = SECTION_REGISTRY.filter(s => s.group === 'Studies');
    assert.ok(studies.length > 0, 'no Study sections found');
    for (const def of studies) {
      assert.ok(typeof def.studyKey === 'string', `missing studyKey for "${def.key}"`);
    }
  });
});

// ---------------------------------------------------------------------------
describe('PRESET_CONFIGS', () => {
  it('has exactly 6 presets', () => {
    assert.strictEqual(Object.keys(PRESET_CONFIGS).length, 6);
  });

  it('every preset has label, description, sections', () => {
    for (const [id, cfg] of Object.entries(PRESET_CONFIGS)) {
      assert.ok(typeof cfg.label       === 'string', `${id}: missing label`);
      assert.ok(typeof cfg.description === 'string', `${id}: missing description`);
      assert.ok(Array.isArray(cfg.sections),          `${id}: sections must be array`);
      assert.ok(cfg.sections.length > 0,              `${id}: sections must not be empty`);
    }
  });

  it('every section key in presets is a valid registry key', () => {
    const validKeys = new Set(SECTION_REGISTRY.map(s => s.key));
    for (const [id, cfg] of Object.entries(PRESET_CONFIGS)) {
      for (const key of cfg.sections) {
        assert.ok(validKeys.has(key), `Preset "${id}" references unknown section key "${key}"`);
      }
    }
  });

  it('ownerTurnover preset includes all 16 registry keys', () => {
    const all = new Set(SECTION_REGISTRY.map(s => s.key));
    const preset = new Set(PRESET_CONFIGS.ownerTurnover.sections);
    for (const key of all) {
      assert.ok(preset.has(key), `ownerTurnover missing key "${key}"`);
    }
  });

  it('electrical preset includes arcFlash and shortCircuit but not heatTrace', () => {
    const secs = new Set(PRESET_CONFIGS.electrical.sections);
    assert.ok(secs.has('arcFlash'));
    assert.ok(secs.has('shortCircuit'));
    assert.ok(!secs.has('heatTrace'));
  });

  it('construction preset includes cables and fill but not arcFlash', () => {
    const secs = new Set(PRESET_CONFIGS.construction.sections);
    assert.ok(secs.has('cables'));
    assert.ok(secs.has('fill'));
    assert.ok(!secs.has('arcFlash'));
  });
});

// ---------------------------------------------------------------------------
describe('getSectionDef', () => {
  it('returns correct def for a valid key', () => {
    const def = getSectionDef('arcFlash');
    assert.strictEqual(def.label, 'Arc Flash');
    assert.strictEqual(def.group, 'Studies');
  });

  it('returns null for an unknown key', () => {
    assert.strictEqual(getSectionDef('nonexistent'), null);
  });
});

// ---------------------------------------------------------------------------
describe('getAvailableSections', () => {
  it('always includes Meta sections even with empty project', () => {
    const avail = getAvailableSections({});
    assert.ok(avail.has('cover'));
    assert.ok(avail.has('toc'));
    assert.ok(avail.has('revisions'));
    assert.ok(avail.has('assumptions'));
  });

  it('includes cables when cables array is non-empty', () => {
    const avail = getAvailableSections({ cables: [{ id: 'C-1' }] });
    assert.ok(avail.has('cables'));
  });

  it('does not include cables when cables array is empty', () => {
    const avail = getAvailableSections({ cables: [] });
    assert.ok(!avail.has('cables'));
  });

  it('includes construction sections when trays are present', () => {
    const avail = getAvailableSections({ trays: [{ id: 'T-1' }] });
    assert.ok(avail.has('fill'));
    assert.ok(avail.has('clashes'));
    assert.ok(avail.has('spools'));
  });

  it('includes study sections when study data is present', () => {
    const avail = getAvailableSections({ studies: { arcFlash: { bus1: {} }, harmonics: {} } });
    assert.ok(avail.has('arcFlash'));
    assert.ok(avail.has('harmonics'));
    assert.ok(!avail.has('loadFlow'));
  });

  it('does not include study sections when study data is null', () => {
    const avail = getAvailableSections({ studies: { arcFlash: null } });
    assert.ok(!avail.has('arcFlash'));
  });
});

// ---------------------------------------------------------------------------
describe('buildCoverSheet', () => {
  it('returns correct shape for full input', () => {
    const cover = buildCoverSheet({
      projectName: 'Test Plant', client: 'ACME', engineer: 'J. Doe',
      license: 'PE12345', date: '2026-05-01', revisionNumber: '2', notes: 'Draft',
    });
    assert.strictEqual(cover.projectName, 'Test Plant');
    assert.strictEqual(cover.client, 'ACME');
    assert.strictEqual(cover.engineer, 'J. Doe');
    assert.strictEqual(cover.license, 'PE12345');
    assert.strictEqual(cover.date, '2026-05-01');
    assert.strictEqual(cover.revisionNumber, '2');
    assert.strictEqual(cover.notes, 'Draft');
  });

  it('falls back to defaults for missing fields', () => {
    const cover = buildCoverSheet({});
    assert.strictEqual(cover.projectName, 'Untitled Project');
    assert.strictEqual(cover.client, '');
    assert.strictEqual(cover.revisionNumber, '0');
  });

  it('handles empty call with no arguments', () => {
    const cover = buildCoverSheet();
    assert.strictEqual(cover.projectName, 'Untitled Project');
    assert.ok(typeof cover.date === 'string' && cover.date.length === 10);
  });

  it('coerces numeric revision to string', () => {
    const cover = buildCoverSheet({ revisionNumber: 3 });
    assert.strictEqual(typeof cover.revisionNumber, 'string');
    assert.strictEqual(cover.revisionNumber, '3');
  });
});

// ---------------------------------------------------------------------------
describe('buildRevisionTable', () => {
  it('returns empty array for empty input', () => {
    assert.deepStrictEqual(buildRevisionTable([]), []);
  });

  it('returns empty array for all-invalid rows', () => {
    const result = buildRevisionTable([{ description: 'no rev or date' }]);
    assert.strictEqual(result.length, 0);
  });

  it('filters out rows missing rev', () => {
    const result = buildRevisionTable([
      { rev: '1', date: '2026-01-01', description: 'Init', by: 'JD' },
      { rev: '',  date: '2026-01-02', description: 'Missing rev', by: 'JD' },
    ]);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].rev, '1');
  });

  it('sorts ascending by numeric revision number', () => {
    const result = buildRevisionTable([
      { rev: '3', date: '2026-03-01', description: 'C', by: 'JD' },
      { rev: '1', date: '2026-01-01', description: 'A', by: 'JD' },
      { rev: '2', date: '2026-02-01', description: 'B', by: 'JD' },
    ]);
    assert.deepStrictEqual(result.map(r => r.rev), ['1', '2', '3']);
  });

  it('coerces all fields to strings', () => {
    const result = buildRevisionTable([{ rev: 1, date: '2026-01-01', description: 100, by: null }]);
    assert.strictEqual(typeof result[0].rev,         'string');
    assert.strictEqual(typeof result[0].description, 'string');
    assert.strictEqual(typeof result[0].by,          'string');
  });
});

// ---------------------------------------------------------------------------
describe('buildReportPackage', () => {
  it('returns a package with id and generatedAt', () => {
    const pkg = buildReportPackage({ sections: ['cover'] }, {});
    assert.ok(typeof pkg.id === 'string' && pkg.id.startsWith('pkg-'));
    assert.ok(typeof pkg.generatedAt === 'string');
  });

  it('includes cover section when requested', () => {
    const pkg = buildReportPackage({ sections: ['cover'], coverSheet: { projectName: 'P1' } }, {});
    assert.ok(pkg.sections.cover);
    assert.strictEqual(pkg.sections.cover.data.projectName, 'P1');
  });

  it('includes toc with correct entries', () => {
    const pkg = buildReportPackage({ sections: ['cover', 'toc', 'cables'] }, {});
    assert.ok(pkg.sections.toc);
    const entryKeys = pkg.sections.toc.entries.map(e => e.key);
    // cover is the front page (not listed in TOC); toc is never self-listed
    assert.ok(entryKeys.includes('cables'));
    assert.ok(!entryKeys.includes('toc'));
    assert.ok(!entryKeys.includes('cover'));
  });

  it('includes revision section with sorted rows', () => {
    const pkg = buildReportPackage({
      sections: ['revisions'],
      revisions: [
        { rev: '2', date: '2026-02-01', description: 'B', by: 'JD' },
        { rev: '1', date: '2026-01-01', description: 'A', by: 'JD' },
      ],
    }, {});
    assert.ok(pkg.sections.revisions);
    assert.strictEqual(pkg.sections.revisions.rows[0].rev, '1');
  });

  it('includes assumptions section with text', () => {
    const pkg = buildReportPackage({ sections: ['assumptions'], assumptions: 'NEC 2023' }, {});
    assert.ok(pkg.sections.assumptions);
    assert.strictEqual(pkg.sections.assumptions.text, 'NEC 2023');
  });

  it('passes pre-built sectionData through to package sections', () => {
    const arcFlashSection = { key: 'arcFlash', title: 'Arc Flash', rows: [{ id: 'BUS-1' }] };
    const pkg = buildReportPackage(
      { sections: ['arcFlash'] },
      { arcFlash: arcFlashSection },
    );
    assert.ok(pkg.sections.arcFlash);
    assert.strictEqual(pkg.sections.arcFlash.rows[0].id, 'BUS-1');
  });

  it('omits sections not in the sections list', () => {
    const pkg = buildReportPackage({ sections: ['cover'] }, { arcFlash: { key: 'arcFlash', rows: [] } });
    assert.strictEqual(pkg.sections.arcFlash, undefined);
  });

  it('ownerTurnover-equivalent: all 16 keys can be requested without error', () => {
    const allKeys = SECTION_REGISTRY.map(s => s.key);
    const pkg = buildReportPackage({ sections: allKeys, coverSheet: { projectName: 'All' } }, {});
    assert.ok(pkg.sections.cover);
    assert.ok(pkg.sections.toc);
    assert.ok(pkg.sections.revisions);
    assert.ok(pkg.sections.assumptions);
  });

  it('stores config with normalised coverSheet and revisions', () => {
    const pkg = buildReportPackage({
      sections: ['cover'],
      coverSheet: { projectName: 'P' },
      revisions: [{ rev: '1', date: '2026-01-01' }],
    }, {});
    assert.strictEqual(pkg.config.coverSheet.projectName, 'P');
    assert.strictEqual(pkg.config.revisions[0].rev, '1');
  });
});

// ---------------------------------------------------------------------------
describe('snapshotPackage', () => {
  it('returns a JSON-round-trippable object', () => {
    const pkg  = buildReportPackage({ sections: ['cover'], coverSheet: { projectName: 'S' } }, {});
    const snap = snapshotPackage(pkg);
    const back = JSON.parse(JSON.stringify(snap));
    assert.deepStrictEqual(snap, back);
  });

  it('preserves id and generatedAt', () => {
    const pkg  = buildReportPackage({ sections: ['cover'] }, {});
    const snap = snapshotPackage(pkg);
    assert.strictEqual(snap.id, pkg.id);
    assert.strictEqual(snap.generatedAt, pkg.generatedAt);
  });
});

// ---------------------------------------------------------------------------
describe('sectionToAOA', () => {
  it('returns null for null input', () => {
    assert.strictEqual(sectionToAOA(null), null);
  });

  it('returns revision header-only row for empty revision section', () => {
    const aoa = sectionToAOA({ key: 'revisions', rows: [] });
    assert.deepStrictEqual(aoa, [['Rev', 'Date', 'Description', 'By']]);
  });

  it('returns revision rows correctly', () => {
    const aoa = sectionToAOA({
      key: 'revisions',
      rows: [{ rev: '1', date: '2026-01-01', description: 'Init', by: 'JD' }],
    });
    assert.strictEqual(aoa.length, 2);
    assert.deepStrictEqual(aoa[1], ['1', '2026-01-01', 'Init', 'JD']);
  });

  it('returns assumptions AOA', () => {
    const aoa = sectionToAOA({ key: 'assumptions', text: 'NEC 2023' });
    assert.strictEqual(aoa[0][0], 'Assumptions / Basis of Design');
    assert.strictEqual(aoa[1][0], 'NEC 2023');
  });

  it('returns null for section with no rows', () => {
    assert.strictEqual(sectionToAOA({ key: 'arcFlash', rows: [] }), null);
  });

  it('returns AOA for generic section with rows', () => {
    const aoa = sectionToAOA({
      key: 'arcFlash',
      rows: [{ id: 'BUS-1', incidentEnergy: 12.5, ppeCategory: 2 }],
    });
    assert.ok(Array.isArray(aoa));
    assert.ok(aoa[0].includes('id'));
    assert.ok(aoa[1].includes('BUS-1'));
  });
});
