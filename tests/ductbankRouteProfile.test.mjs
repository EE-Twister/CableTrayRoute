import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDuctbankRouteProfile } from '../analysis/ductbankRouteProfile.mjs';

test('route profile calculates developed length, variable cover, bends, and structures',()=>{
  const profile=analyzeDuctbankRouteProfile({
    points:[
      {id:'P1',stationFt:0,eastingFt:0,northingFt:0,gradeElevationFt:100,coverIn:36},
      {id:'P2',stationFt:100,eastingFt:100,northingFt:0,gradeElevationFt:99,coverIn:42},
      {id:'P3',stationFt:180,eastingFt:150,northingFt:62.45,gradeElevationFt:96,coverIn:48}
    ],
    structures:[
      {id:'MH-01',type:'Manhole',stationFt:100},
      {id:'X-01',type:'Crossing',stationFt:145,note:'Water line'}
    ]
  });

  assert.equal(profile.ready,true);
  assert.equal(profile.segments.length,2);
  assert.ok(profile.summary.developedLengthFt > 180);
  assert.equal(profile.summary.minimumCoverIn,36);
  assert.equal(profile.summary.maximumCoverIn,48);
  assert.ok(profile.summary.averageCoverIn > 36);
  assert.equal(profile.summary.horizontalBends,1);
  assert.equal(profile.summary.verticalBends,1);
  assert.equal(profile.summary.structureCounts.Manhole,1);
  assert.equal(profile.summary.structureCounts.Crossing,1);
});

test('route profile uses station intervals when plan coordinates are not supplied',()=>{
  const profile=analyzeDuctbankRouteProfile({
    points:[
      {stationFt:0,gradeElevationFt:100,coverIn:36},
      {stationFt:75,gradeElevationFt:100,coverIn:36}
    ]
  });

  assert.equal(profile.ready,true);
  assert.equal(profile.summary.stationLengthFt,75);
  assert.equal(profile.summary.planLengthFt,75);
  assert.equal(profile.summary.developedLengthFt,75);
  assert.equal(profile.warnings.length,0);
});

test('route profile flags inconsistent geometry and out-of-range structures',()=>{
  const profile=analyzeDuctbankRouteProfile({
    points:[
      {id:'P1',stationFt:0,eastingFt:0,northingFt:0,gradeElevationFt:100,coverIn:36},
      {id:'P2',stationFt:100,eastingFt:50,northingFt:0,gradeElevationFt:80,coverIn:36}
    ],
    structures:[{id:'PB-02',type:'Pull box',stationFt:125}]
  });

  assert.equal(profile.ready,true);
  assert.match(profile.warnings.join(' '),/coordinate length differs/i);
  assert.match(profile.warnings.join(' '),/grade/i);
  assert.match(profile.warnings.join(' '),/beyond the last route station/i);
});
