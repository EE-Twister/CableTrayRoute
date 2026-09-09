import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { escapeAttr, escapeHtml } from '../src/htmlSafety.mjs';
import {
    buildCableTableMarkup,
    buildManualTrayTableMarkup
} from '../src/routing/manualEntryView.mjs';
import {
    buildPullGroupAnalysisMarkup,
    buildPullReviewMarkup
} from '../src/routing/pullReviewView.mjs';

describe('routing manual-entry views', () => {
    it('renders editable tray fields and shape choices without owning tray state', () => {
        const html = buildManualTrayTableMarkup([{
            tray_id: 'TR-1" unsafe',
            start_x: 0,
            start_y: 1,
            start_z: 2,
            end_x: 3,
            end_y: 4,
            end_z: 5,
            width: 12,
            height: 4,
            current_fill: 8,
            allowed_cable_group: 'Power',
            shape: '90B'
        }], { shapeCodes: ['STR', '90B'], escapeAttr });

        assert.match(html, /id="trayTable"/);
        assert.match(html, /value="TR-1&quot; unsafe"/);
        assert.match(html, /class="tray-start-input"/);
        assert.match(html, /value="90B" selected/);
        assert.match(html, /class="[^"]*dup-tray"/);
    });

    it('renders cable physical inputs, manual path, and route lock actions', () => {
        const html = buildCableTableMarkup([{
            name: 'C-1',
            start_tag: 'MCC-1',
            end_tag: 'LOAD-1',
            cable_type: 'Power',
            conductors: 3,
            conductor_size: '#12 AWG',
            diameter: 0.5,
            weight: 0.25,
            allowed_cable_group: 'Power',
            start: [0, 0, 0],
            end: [10, 0, 0],
            manual_path: 'TR-1',
            locked: true,
            route_segments: [{ type: 'tray' }]
        }], { escapeAttr });

        assert.match(html, /id="cables-panel"/);
        assert.match(html, /class="cable-size-select"/);
        assert.match(html, /value="#12 AWG" selected/);
        assert.match(html, /value="TR-1" placeholder=/);
        assert.match(html, /class="unlock-cable"/);
    });
});

describe('pull-review view', () => {
    it('summarizes setup and missing-input review counts', () => {
        const results = [
            {
                cable: 'C-1',
                pull_check: {
                    status: 'setups-required',
                    direction: 'forward',
                    directionLabel: 'From → To',
                    sections: [
                        { index: 1, startDistance: 0, endDistance: 50, length: 50, maxTension: 120 },
                        { index: 2, startDistance: 50, endDistance: 100, length: 50, maxTension: 130 }
                    ],
                    equipment: { counts: { reels: 2, tuggers: 2 } },
                    constructability: {
                        status: 'blocked',
                        signature: 'AB12CD34',
                        sources: {
                            cableLimits: 'Manufacturer pull sheet MPS-101 Rev 2',
                            equipmentRatings: 'Pulling equipment register PER-12'
                        },
                        pullPoints: {
                            requiredCount: 3,
                            confirmedCount: 1,
                            records: [
                                { id: 'point-1', type: 'reel', label: 'Reel / pull start', point: [0, 0, 0], distanceFt: 0, status: 'confirmed', source: 'Site access walkdown SAW-03', notes: 'Pad clear' },
                                { id: 'point-2', type: 'intermediate', label: 'Intermediate setup 1', point: [50, 0, 0], distanceFt: 50, status: 'pending', source: '', notes: '' },
                                { id: 'point-3', type: 'receiving', label: 'Receiving / pull end', point: [100, 0, 0], distanceFt: 100, status: 'blocked', source: 'Site access walkdown SAW-03', notes: 'Scaffold conflict' }
                            ]
                        },
                        issues: [{ message: 'Cable minimum bend radius is missing.' }]
                    }
                }
            },
            {
                cable: 'C-2',
                pull_check: {
                    status: 'inputs-required',
                    missingInputs: ['weight'],
                    sections: []
                }
            }
        ];
        const review = buildPullReviewMarkup(results, {
            selectedRouteIndex: 0,
            formatDistance: value => `${value} ft`,
            escapeHtml,
            escapeAttr
        });

        assert.equal(review.setupCount, 1);
        assert.equal(review.reviewCount, 2);
        assert.match(review.html, /2 cable pull plans/);
        assert.match(review.html, /Show 2 setup locations/);
        assert.match(review.html, /Missing: weight/);
        assert.match(review.html, /Evidence incomplete/);
        assert.match(review.html, /Constructability evidence: incomplete/);
        assert.match(review.html, /Signature AB12CD34/);
        assert.match(review.html, /1\/3 points confirmed/);
        assert.match(review.html, /Per-point access evidence/);
        assert.match(review.html, /Intermediate setup 1/);
        assert.match(review.html, /data-save-pull-access="0"/);
        assert.match(review.html, /Cable minimum bend radius is missing/);
        assert.match(review.html, /data-pull-route-index="0"/);
    });

    it('renders pull-group decisions and expanded detail from injected UI state', () => {
        const group = {
            id: 'group-1',
            status: 'suggested',
            label: 'Route A',
            className: 'Power',
            cableCount: 2,
            cableNames: ['C-1', 'C-2'],
            routeLengthFt: 100,
            combinedWeightLbsFt: 0.5,
            equivalentDiameterIn: 1.25,
            reasons: ['Same complete route'],
            plan: { sections: [{ index: 1 }], maxTension: 250, equipment: { weakestLink: { label: 'Cable' } } },
            fieldEquipment: { payoffStations: 1, cableReels: 2, tuggers: 1 },
            equipmentSavings: { pullOperations: 1 }
        };
        const html = buildPullGroupAnalysisMarkup({
            suggestions: [group],
            reviewGroups: [],
            separate: [],
            summary: { suggestedGroups: 1, suggestedCables: 2, separateCables: 0 }
        }, {
            decisions: { 'group-1': 'together' },
            expandedGroupIds: new Set(['group-1']),
            escapeHtml,
            escapeAttr
        });

        assert.match(html, /is-together is-expanded/);
        assert.match(html, /Planned together/);
        assert.match(html, /data-pull-group-decision="together"/);
        assert.match(html, /Avoids 1 separate pull operation/);
    });
});
