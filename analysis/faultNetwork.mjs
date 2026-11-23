import { fingerprintStudyValue } from './studyLifecycle.mjs';

const METHOD = 'positive-sequence-bolted-three-phase-network-v1';
const LINEAR_RESPONSE_METHOD = 'positive-sequence-unfaulted-port-response-v1';
const SQRT3 = Math.sqrt(3);
const CURRENT_RESIDUAL_TOLERANCE = 1e-9;

const complex = (re = 0, im = 0) => ({ re, im });
const cAdd = (a, b) => complex(a.re + b.re, a.im + b.im);
const cSub = (a, b) => complex(a.re - b.re, a.im - b.im);
const cMul = (a, b) => complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const cConj = (a) => complex(a.re, -a.im);
const cAbs = (a) => Math.hypot(a.re, a.im);
const cDiv = (a, b) => {
    const scale = Math.max(Math.abs(b.re), Math.abs(b.im));
    if (scale === 0 || !Number.isFinite(scale)) return complex(Number.NaN, Number.NaN);
    const br = b.re / scale;
    const bi = b.im / scale;
    const ar = a.re / scale;
    const ai = a.im / scale;
    const denominator = br * br + bi * bi;
    return complex((ar * br + ai * bi) / denominator, (ai * br - ar * bi) / denominator);
};

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isNonBlank = (value) => typeof value === 'string' && value.trim().length > 0;
const sorted = (values) => values.slice().sort((a, b) => a.localeCompare(b));

function issue(code, path, message) {
    return { code, path, message };
}

function allowedKeys(value, allowed, path, issues) {
    if (!isRecord(value)) {
        issues.push(issue('INVALID_OBJECT', path, 'Expected an object.'));
        return false;
    }
    for (const key of Object.keys(value)) {
        if (!allowed.includes(key)) issues.push(issue('UNKNOWN_FIELD', `${path}.${key}`, 'Field is not part of the fault-network input contract.'));
    }
    return true;
}

function complexField(value, path, issues) {
    if (!allowedKeys(value, ['re', 'im'], path, issues)) return null;
    if (!isFiniteNumber(value.re) || !isFiniteNumber(value.im)) {
        issues.push(issue('INVALID_COMPLEX_VALUE', path, 'Complex value requires finite numeric re and im fields.'));
        return null;
    }
    return complex(value.re, value.im);
}

function impedanceField(value, path, issues) {
    if (!allowedKeys(value, ['rOhm', 'xOhm', 'referenceBusId'], path, issues)) return null;
    if (!isFiniteNumber(value.rOhm) || value.rOhm < 0 || !isFiniteNumber(value.xOhm)) {
        issues.push(issue('INVALID_IMPEDANCE', path, 'Impedance requires finite R >= 0 ohms and finite signed X ohms.'));
        return null;
    }
    if (!Number.isFinite(Math.hypot(value.rOhm, value.xOhm))) {
        issues.push(issue('INVALID_IMPEDANCE', path, 'Impedance magnitude must be finite.'));
        return null;
    }
    if (!isNonBlank(value.referenceBusId)) {
        issues.push(issue('INVALID_REFERENCE_BUS', `${path}.referenceBusId`, 'Impedance must name the bus voltage base used for its ohmic value.'));
        return null;
    }
    return { rOhm: value.rOhm, xOhm: value.xOhm, referenceBusId: value.referenceBusId };
}

function sourceImpedanceField(value, path, issues) {
    if (!allowedKeys(value, ['rOhm', 'xOhm'], path, issues)) return null;
    if (!isFiniteNumber(value.rOhm) || value.rOhm < 0 || !isFiniteNumber(value.xOhm)) {
        issues.push(issue('INVALID_IMPEDANCE', path, 'Source impedance requires finite R >= 0 ohms and finite signed X ohms.'));
        return null;
    }
    if (!Number.isFinite(Math.hypot(value.rOhm, value.xOhm))) {
        issues.push(issue('INVALID_IMPEDANCE', path, 'Source impedance magnitude must be finite.'));
        return null;
    }
    return { rOhm: value.rOhm, xOhm: value.xOhm };
}

function numericMagnitudeIsUsable(value, path, issues) {
    if (!Number.isFinite(value) || value <= 0) {
        issues.push(issue('NUMERIC_RANGE', path, 'Derived value is zero, non-finite, or outside the representable positive range.'));
        return false;
    }
    return true;
}

function blocked(issues, limitations = []) {
    return {
        status: 'blocked',
        method: METHOD,
        scope: 'initial-symmetrical-rms-only',
        fault: null,
        sourceInventory: null,
        sourceFaultContributions: [],
        sourceTerminalCurrents: [],
        branchTerminalCurrents: [],
        busVoltages: [],
        zeroImpedanceTieCurrents: [],
        limitations,
        issues,
    };
}

function findComponents(buses, branches, busGroup) {
    const adjacency = new Map(buses.map((bus) => [bus.id, new Set()]));
    for (const branch of branches) {
        adjacency.get(branch.fromBusId).add(branch.toBusId);
        adjacency.get(branch.toBusId).add(branch.fromBusId);
    }
    const components = [];
    const visited = new Set();
    for (const busId of sorted(buses.map((bus) => bus.id))) {
        if (visited.has(busId)) continue;
        const stack = [busId];
        const component = [];
        visited.add(busId);
        while (stack.length) {
            const current = stack.pop();
            component.push(current);
            for (const next of sorted([...adjacency.get(current)])) {
                if (visited.has(next)) continue;
                visited.add(next);
                stack.push(next);
            }
        }
        components.push(component.sort((a, b) => a.localeCompare(b)));
    }
    return components.map((busIds) => ({ busIds, groupIds: new Set(busIds.map((id) => busGroup.get(id))) }));
}

function solveLinearSystem(matrix, rhs) {
    const size = rhs.length;
    if (size === 0) return [];
    const originalMatrix = matrix.map((row) => row.map((value) => complex(value.re, value.im)));
    const originalRhs = rhs.map((value) => complex(value.re, value.im));
    const a = matrix.map((row, index) => {
        const scale = Math.max(...row.map(cAbs));
        if (!Number.isFinite(scale) || scale === 0) return null;
        return [...row.map((value) => cDiv(value, complex(scale, 0))), cDiv(rhs[index], complex(scale, 0))];
    });
    if (a.some((row) => row === null || row.some((value) => !finiteComplex(value)))) return null;
    for (let column = 0; column < size; column += 1) {
        let pivotRow = column;
        let pivotRatio = -1;
        for (let row = column; row < size; row += 1) {
            const rowMagnitude = Math.max(...a[row].slice(column, size).map(cAbs));
            const ratio = rowMagnitude === 0 ? 0 : cAbs(a[row][column]) / rowMagnitude;
            if (ratio > pivotRatio) {
                pivotRatio = ratio;
                pivotRow = row;
            }
        }
        if (!Number.isFinite(pivotRatio) || pivotRatio <= Number.EPSILON * 64) return null;
        if (pivotRow !== column) [a[pivotRow], a[column]] = [a[column], a[pivotRow]];
        const pivot = a[column][column];
        for (let j = column; j <= size; j += 1) a[column][j] = cDiv(a[column][j], pivot);
        for (let row = 0; row < size; row += 1) {
            if (row === column) continue;
            const factor = a[row][column];
            if (factor.re === 0 && factor.im === 0) continue;
            for (let j = column; j <= size; j += 1) a[row][j] = cSub(a[row][j], cMul(factor, a[column][j]));
        }
    }
    const solution = a.map((row) => row[size]);
    for (let row = 0; row < size; row += 1) {
        let lhs = complex();
        let residualScale = cAbs(originalRhs[row]);
        for (let column = 0; column < size; column += 1) {
            const term = cMul(originalMatrix[row][column], solution[column]);
            if (!finiteComplex(term)) return null;
            lhs = cAdd(lhs, term);
            residualScale += cAbs(term);
        }
        const residual = cAbs(cSub(lhs, originalRhs[row]));
        if (!Number.isFinite(residualScale) || !Number.isFinite(residual) || (residual !== 0 && !(residualScale > 0 && residual <= residualScale * CURRENT_RESIDUAL_TOLERANCE))) return null;
    }
    return solution;
}

function finiteComplex(value) {
    return Number.isFinite(value.re) && Number.isFinite(value.im);
}

function finiteMagnitude(value) {
    return finiteComplex(value) && Number.isFinite(cAbs(value));
}

function relativeResidualPass(residual, scale) {
    if (!Number.isFinite(residual) || !Number.isFinite(scale)) return false;
    return residual === 0 || (scale > 0 && residual <= scale * CURRENT_RESIDUAL_TOLERANCE);
}

function currentRecord(value) {
    return { re: value.re, im: value.im, magnitude: cAbs(value) };
}

function currentPuToKA(valuePu, currentBaseA) {
    const amperes = cMul(valuePu, complex(currentBaseA, 0));
    const kiloamperes = complex(amperes.re / 1000, amperes.im / 1000);
    if (!finiteMagnitude(amperes) || !finiteMagnitude(kiloamperes)) return null;
    if (cAbs(valuePu) > 0 && (cAbs(amperes) === 0 || cAbs(kiloamperes) === 0)) return null;
    return kiloamperes;
}

function buildNodalAdmittanceMatrix(preparedBranches, preparedSources, nodeIds, excludedNodeId = null, activeSourceIds = null) {
    const unknownNodes = nodeIds.filter((id) => id !== excludedNodeId);
    const indexByNode = new Map(unknownNodes.map((id, index) => [id, index]));
    const matrix = unknownNodes.map(() => unknownNodes.map(() => complex()));
    const rhs = unknownNodes.map(() => complex());
    const addMatrix = (rowNode, columnNode, value) => {
        const row = indexByNode.get(rowNode);
        const column = indexByNode.get(columnNode);
        if (row !== undefined && column !== undefined) matrix[row][column] = cAdd(matrix[row][column], value);
    };
    for (const branch of preparedBranches) {
        const y = cDiv(complex(1, 0), branch.zPu);
        const tap = branch.tapPu;
        const tapMagnitudeSquared = tap.re * tap.re + tap.im * tap.im;
        const yff = complex(y.re / tapMagnitudeSquared, y.im / tapMagnitudeSquared);
        const yft = cMul(complex(-1, 0), cDiv(y, cConj(tap)));
        const ytf = cMul(complex(-1, 0), cDiv(y, tap));
        addMatrix(branch.fromGroup, branch.fromGroup, yff);
        addMatrix(branch.fromGroup, branch.toGroup, yft);
        addMatrix(branch.toGroup, branch.fromGroup, ytf);
        addMatrix(branch.toGroup, branch.toGroup, y);
    }
    for (const source of preparedSources) {
        addMatrix(source.group, source.group, source.admittancePu);
        if (activeSourceIds?.has(source.id)) {
            const row = indexByNode.get(source.group);
            if (row !== undefined) rhs[row] = cAdd(rhs[row], source.nortonInjectionPu);
        }
    }
    return { unknownNodes, indexByNode, matrix, rhs };
}

function solveLinearSystemMultiple(matrix, rightHandSides) {
    const size = matrix.length;
    if (size === 0 || !Array.isArray(rightHandSides) || !rightHandSides.length || rightHandSides.some(rhs => rhs.length !== size)) return null;
    const originalMatrix = matrix.map(row => row.map(value => complex(value.re, value.im)));
    const originalRightHandSides = rightHandSides.map(rhs => rhs.map(value => complex(value.re, value.im)));
    const augmented = matrix.map((row, index) => {
        const scale = Math.max(...row.map(cAbs));
        if (!Number.isFinite(scale) || scale === 0) return null;
        return [...row.map(value => cDiv(value, complex(scale, 0))), ...rightHandSides.map(rhs => cDiv(rhs[index], complex(scale, 0)))];
    });
    if (augmented.some(row => row === null || row.some(value => !finiteComplex(value)))) return null;
    for (let column = 0; column < size; column += 1) {
        let pivotRow = column;
        let pivotRatio = -1;
        for (let row = column; row < size; row += 1) {
            const rowMagnitude = Math.max(...augmented[row].slice(column, size).map(cAbs));
            const ratio = rowMagnitude === 0 ? 0 : cAbs(augmented[row][column]) / rowMagnitude;
            if (ratio > pivotRatio) {
                pivotRatio = ratio;
                pivotRow = row;
            }
        }
        if (!Number.isFinite(pivotRatio) || pivotRatio <= Number.EPSILON * 64) return null;
        if (pivotRow !== column) [augmented[pivotRow], augmented[column]] = [augmented[column], augmented[pivotRow]];
        const pivot = augmented[column][column];
        for (let j = column; j < size + rightHandSides.length; j += 1) augmented[column][j] = cDiv(augmented[column][j], pivot);
        for (let row = 0; row < size; row += 1) {
            if (row === column) continue;
            const factor = augmented[row][column];
            if (factor.re === 0 && factor.im === 0) continue;
            for (let j = column; j < size + rightHandSides.length; j += 1) augmented[row][j] = cSub(augmented[row][j], cMul(factor, augmented[column][j]));
        }
    }
    const solutions = rightHandSides.map((_, index) => augmented.map(row => row[size + index]));
    for (let column = 0; column < solutions.length; column += 1) {
        const solution = solutions[column];
        for (let row = 0; row < size; row += 1) {
            let lhs = complex();
            let residualScale = cAbs(originalRightHandSides[column][row]);
            for (let index = 0; index < size; index += 1) {
                const term = cMul(originalMatrix[row][index], solution[index]);
                if (!finiteComplex(term)) return null;
                lhs = cAdd(lhs, term);
                residualScale += cAbs(term);
            }
            const residual = cAbs(cSub(lhs, originalRightHandSides[column][row]));
            if (!Number.isFinite(residualScale) || !Number.isFinite(residual) || (residual !== 0 && !(residualScale > 0 && residual <= residualScale * CURRENT_RESIDUAL_TOLERANCE))) return null;
        }
    }
    return solutions;
}

function branchCurrentPuById(preparedBranches, voltageByGroup) {
    const currents = new Map();
    for (const branch of preparedBranches) {
        const vf = voltageByGroup.get(branch.fromGroup);
        const vt = voltageByGroup.get(branch.toGroup);
        const through = cMul(cDiv(complex(1, 0), branch.zPu), cSub(cDiv(vf, branch.tapPu), vt));
        const from = cDiv(through, cConj(branch.tapPu));
        const to = cMul(complex(-1, 0), through);
        if (!finiteComplex(from) || !finiteComplex(to)) return null;
        currents.set(branch.id, { from, to });
    }
    return currents;
}

function recoverIdealTieCurrentsPu(buses, zeroTies, busResidual) {
    const adjacency = new Map(buses.map(bus => [bus.id, []]));
    for (const tie of zeroTies) {
        adjacency.get(tie.fromBusId).push({ neighbor: tie.toBusId, branch: tie });
        adjacency.get(tie.toBusId).push({ neighbor: tie.fromBusId, branch: tie });
    }
    const terminalByBus = new Map(buses.map(bus => [bus.id, complex()]));
    const currents = new Map();
    const visited = new Set();
    for (const startBusId of sorted(buses.map(bus => bus.id))) {
        if (visited.has(startBusId) || adjacency.get(startBusId).length === 0) continue;
        const parentBus = new Map([[startBusId, null]]);
        const parentEdge = new Map();
        const order = [startBusId];
        visited.add(startBusId);
        for (let index = 0; index < order.length; index += 1) {
            const current = order[index];
            for (const edge of adjacency.get(current).slice().sort((a, b) => a.branch.id.localeCompare(b.branch.id))) {
                if (parentBus.get(current) === edge.neighbor || visited.has(edge.neighbor)) continue;
                visited.add(edge.neighbor);
                parentBus.set(edge.neighbor, current);
                parentEdge.set(edge.neighbor, edge.branch);
                order.push(edge.neighbor);
            }
        }
        const subtree = new Map(order.map(busId => [busId, busResidual.get(busId)]));
        for (let index = order.length - 1; index > 0; index -= 1) {
            const child = order[index];
            const parentId = parentBus.get(child);
            const subtreeCurrent = subtree.get(child);
            const edge = parentEdge.get(child);
            const parentToChild = cMul(complex(-1, 0), subtreeCurrent);
            const fromTo = edge.fromBusId === parentId ? parentToChild : cMul(complex(-1, 0), parentToChild);
            terminalByBus.set(edge.fromBusId, cAdd(terminalByBus.get(edge.fromBusId), fromTo));
            terminalByBus.set(edge.toBusId, cSub(terminalByBus.get(edge.toBusId), fromTo));
            currents.set(edge.id, { from: fromTo, to: complex(-fromTo.re, -fromTo.im) });
            subtree.set(parentId, cAdd(subtree.get(parentId), subtreeCurrent));
        }
    }
    return { terminalByBus, currents };
}

function evaluatePositiveSequenceLinearResponse({ input, buses, branches, sources, busById, busGroup, groupIds, busBases, preparedBranches, preparedSources, responseBusIds, targetBranchIds }) {
    const issues = [];
    if (!Array.isArray(responseBusIds) || responseBusIds.length < 1 || responseBusIds.length > 250
        || responseBusIds.some(id => !isNonBlank(id)) || new Set(responseBusIds).size !== responseBusIds.length) {
        issues.push(issue('INVALID_RESPONSE_BUS_IDS', '$.responseBusIds', 'Provide one to 250 unique nonblank original bus IDs for response ports.'));
    }
    if (!Array.isArray(targetBranchIds) || targetBranchIds.length > 1000
        || targetBranchIds.some(id => !isNonBlank(id)) || new Set(targetBranchIds).size !== targetBranchIds.length) {
        issues.push(issue('INVALID_TARGET_BRANCH_IDS', '$.targetBranchIds', 'Provide zero to 1,000 unique nonblank branch IDs for current responses.'));
    }
    if (Array.isArray(responseBusIds)) for (const id of responseBusIds) if (!busById.has(id)) issues.push(issue('UNKNOWN_RESPONSE_BUS', `$.responseBusIds.${id}`, 'Every response port must identify an original validated bus.'));
    const branchById = new Map(branches.map(branch => [branch.id, branch]));
    if (Array.isArray(targetBranchIds)) for (const id of targetBranchIds) if (!branchById.has(id)) issues.push(issue('UNKNOWN_TARGET_BRANCH', `$.targetBranchIds.${id}`, 'Every target must identify an original validated branch.'));
    if (issues.length) return blocked(issues);

    const responseIds = responseBusIds.slice().sort((left, right) => left.localeCompare(right));
    const targetIds = targetBranchIds.slice().sort((left, right) => left.localeCompare(right));
    const built = buildNodalAdmittanceMatrix(preparedBranches, preparedSources, groupIds);
    const matrix = built.matrix;
    if (matrix.some(row => row.some(value => !finiteComplex(value)))) return blocked([issue('LINEAR_RESPONSE_MATRIX_RANGE', '$', 'Unfaulted network admittance matrix contains a non-finite value.')]);

    const sourceColumns = preparedSources.map(source => ({ source, rhs: groupIds.map(group => group === source.group ? source.nortonInjectionPu : complex()) }));
    const injectionColumns = responseIds.map(injectionBusId => ({ injectionBusId, rhs: groupIds.map(group => group === busGroup.get(injectionBusId) ? complex(1, 0) : complex()) }));
    const rightHandSides = [...sourceColumns.map(column => column.rhs), ...injectionColumns.map(column => column.rhs)];
    const solutions = solveLinearSystemMultiple(matrix, rightHandSides);
    if (!solutions || solutions.some(column => column.some(value => !finiteComplex(value)))) return blocked([issue('LINEAR_RESPONSE_SOLVER_BLOCKED', '$', 'Unfaulted linear-response matrix was singular, numerically unstable, or outside the finite residual tolerance.')]);
    const voltageByColumn = solutions.map(solution => new Map(groupIds.map((groupId, index) => [groupId, solution[index]])));
    const zeroTies = branches.filter(branch => branch.zeroZ).slice().sort((left, right) => left.id.localeCompare(right.id));
    const responseForColumn = (voltageByGroup, { sourceId = null, injectionBusId = null } = {}) => {
        const allFiniteCurrents = branchCurrentPuById(preparedBranches, voltageByGroup);
        if (!allFiniteCurrents) return null;
        const finiteCurrents = new Map([...allFiniteCurrents].filter(([id]) => targetIds.includes(id)));
        const sourceCurrents = new Map(preparedSources.map(source => {
            const emf = source.id === sourceId ? source.emfPu : complex();
            return [source.id, cDiv(cSub(emf, voltageByGroup.get(source.group)), source.zPu)];
        }));
        if ([...sourceCurrents.values()].some(current => !finiteComplex(current))) return null;
        const busResidual = new Map(buses.map(bus => [bus.id, complex()]));
        for (const source of preparedSources) busResidual.set(source.busId, cAdd(busResidual.get(source.busId), sourceCurrents.get(source.id)));
        if (injectionBusId !== null) busResidual.set(injectionBusId, cAdd(busResidual.get(injectionBusId), complex(1, 0)));
        for (const branch of preparedBranches) {
            const terminal = allFiniteCurrents.get(branch.id);
            busResidual.set(branch.fromBusId, cSub(busResidual.get(branch.fromBusId), terminal.from));
            busResidual.set(branch.toBusId, cSub(busResidual.get(branch.toBusId), terminal.to));
        }
        const ties = recoverIdealTieCurrentsPu(buses, zeroTies, busResidual);
        const branchCurrents = new Map(finiteCurrents);
        for (const [id, row] of ties.currents) if (targetIds.includes(id)) branchCurrents.set(id, row);
        const residualScaleByBus = new Map(buses.map(bus => [bus.id, cAbs(ties.terminalByBus.get(bus.id))]));
        for (const source of preparedSources) {
            const emf = source.id === sourceId ? source.emfPu : complex();
            residualScaleByBus.set(source.busId, residualScaleByBus.get(source.busId) + (cAbs(emf) + cAbs(voltageByGroup.get(source.group))) / cAbs(source.zPu));
        }
        for (const branch of preparedBranches) {
            const vf = voltageByGroup.get(branch.fromGroup);
            const vt = voltageByGroup.get(branch.toGroup);
            const fromVoltageOverTap = cDiv(vf, branch.tapPu);
            const seriesAdmittanceMagnitude = 1 / cAbs(branch.zPu);
            const tapMagnitude = cAbs(branch.tapPu);
            residualScaleByBus.set(branch.fromBusId, residualScaleByBus.get(branch.fromBusId) + seriesAdmittanceMagnitude * (cAbs(fromVoltageOverTap) + cAbs(vt)) / tapMagnitude);
            residualScaleByBus.set(branch.toBusId, residualScaleByBus.get(branch.toBusId) + seriesAdmittanceMagnitude * (cAbs(fromVoltageOverTap) + cAbs(vt)));
        }
        if (injectionBusId !== null) residualScaleByBus.set(injectionBusId, residualScaleByBus.get(injectionBusId) + 1);
        for (const bus of buses) {
            const residual = cAbs(cSub(busResidual.get(bus.id), ties.terminalByBus.get(bus.id)));
            if (!relativeResidualPass(residual, residualScaleByBus.get(bus.id))) return null;
        }
        if (targetIds.some(id => !branchCurrents.has(id))) return null;
        return branchCurrents;
    };

    const sourceResponses = [];
    const sourceColumnIndex = new Map(sourceColumns.map((column, index) => [column.source.id, index]));
    for (const source of sources) {
        const columnIndex = sourceColumnIndex.get(source.id);
        const voltageByGroup = columnIndex === undefined ? new Map(groupIds.map(groupId => [groupId, complex()])) : voltageByColumn[columnIndex];
        const branchCurrents = columnIndex === undefined ? new Map(targetIds.map(id => [id, { from: complex(), to: complex() }])) : responseForColumn(voltageByGroup, { sourceId: source.id });
        if (!branchCurrents) return blocked([issue('LINEAR_RESPONSE_SOURCE_CURRENT', `$.sources.${source.id}`, 'Source contribution to requested target branch currents failed finite or KCL validation.')]);
        sourceResponses.push({ sourceId: source.id, inService: source.inService, contributionStatus: source.inService ? 'unit-emf-multiplier' : 'out-of-service-zero',
            sourceEmfPhasePu: source.inService ? complex(source.emfPhaseV.re / busBases.get(source.busId).phaseBaseV, source.emfPhaseV.im / busBases.get(source.busId).phaseBaseV) : complex(),
            voltagePuByBusId: Object.fromEntries(responseIds.map(id => [id, voltageByGroup.get(busGroup.get(id))])),
            targetBranchCurrentsPu: targetIds.map(id => { const branch = branchById.get(id); const row = branchCurrents.get(id); return { branchId: id, fromBusId: branch.fromBusId, toBusId: branch.toBusId, fromCurrentIntoBranchPu: row.from, toCurrentIntoBranchPu: row.to }; }) });
    }

    const unitCurrentInjectionResponses = [];
    for (let index = 0; index < injectionColumns.length; index += 1) {
        const { injectionBusId } = injectionColumns[index];
        const columnIndex = sourceColumns.length + index;
        const voltageByGroup = voltageByColumn[columnIndex];
        const branchCurrents = responseForColumn(voltageByGroup, { injectionBusId });
        if (!branchCurrents) return blocked([issue('LINEAR_RESPONSE_INJECTION_CURRENT', `$.responseBusIds.${injectionBusId}`, 'Unit current-injection response to requested target branch currents failed finite or KCL validation.')]);
        unitCurrentInjectionResponses.push({ injectionBusId, contractedGroupId: busGroup.get(injectionBusId), currentInjectionPu: complex(1, 0),
            voltagePuByBusId: Object.fromEntries(responseIds.map(id => [id, voltageByGroup.get(busGroup.get(id))])),
            targetBranchCurrentsPu: targetIds.map(id => { const branch = branchById.get(id); const row = branchCurrents.get(id); return { branchId: id, fromBusId: branch.fromBusId, toBusId: branch.toBusId, fromCurrentIntoBranchPu: row.from, toCurrentIntoBranchPu: row.to }; }) });
    }
    const networkFingerprint = fingerprintStudyValue({ method: LINEAR_RESPONSE_METHOD, networkBaseMVA: input.networkBaseMVA,
        buses: buses.map(bus => ({ id: bus.id, voltageLLV: bus.voltageLLV })),
        branches: branches.map(branch => ({ id: branch.id, fromBusId: branch.fromBusId, toBusId: branch.toBusId, impedance: branch.impedance, tapPu: branch.tapPu })),
        sources: sources.map(source => ({ id: source.id, busId: source.busId, emfPhaseV: source.emfPhaseV, impedance: source.impedance, inService: source.inService, reference: source.reference })),
        responseBusIds: responseIds, targetBranchIds: targetIds });
    return { status: 'evaluated', method: LINEAR_RESPONSE_METHOD, scope: 'unfaulted-positive-sequence-network-linear-response', networkBaseMVA: input.networkBaseMVA,
        networkFingerprint,
        sourceInventory: { status: input.sourceInventory.status, reference: input.sourceInventory.reference, verificationStatus: 'not-verified' },
        responseBusIds: responseIds, targetBranchIds: targetIds,
        busGroups: groupIds.map(id => ({ id, busIds: buses.filter(bus => busGroup.get(bus.id) === id).map(bus => bus.id) })),
        busBasesById: Object.fromEntries([...busBases.entries()].map(([id, base]) => [id, { voltageLLV: busById.get(id).voltageLLV, phaseBaseV: base.phaseBaseV, currentBaseA: base.currentBaseA, zBaseOhm: base.zBaseOhm }])),
        sourceResponses, unitCurrentInjectionResponses, issues: [],
        limitations: ['Unfaulted positive-sequence linear response only; responses are pu quantities on the listed bus bases.', 'Ideal-tie branch-current responses use original injection-bus locations and exact KCL recovery over the validated tie forest.'] };
}

function solvePositiveSequenceNetwork(input = {}, responseMode = false) {
    const issues = [];
    const allowedInputKeys = responseMode
        ? ['networkBaseMVA', 'buses', 'branches', 'sources', 'sourceInventory', 'responseBusIds', 'targetBranchIds']
        : ['networkBaseMVA', 'buses', 'branches', 'sources', 'fault', 'sourceInventory', 'includeSourceFaultContributions'];
    if (!allowedKeys(input, allowedInputKeys, '$', issues)) return blocked(issues);

    const { networkBaseMVA, buses: rawBuses, branches: rawBranches, sources: rawSources, fault: rawFault, sourceInventory: rawInventory } = input;
    const includeSourceFaultContributions = input.includeSourceFaultContributions !== false;
    if (Object.hasOwn(input, 'includeSourceFaultContributions') && typeof input.includeSourceFaultContributions !== 'boolean') {
        return blocked([issue('INVALID_OPTION', '$.includeSourceFaultContributions', 'includeSourceFaultContributions must be a boolean when supplied.')]);
    }
    if (!isFiniteNumber(networkBaseMVA) || networkBaseMVA <= 0 || networkBaseMVA > 1e6) {
        issues.push(issue('INVALID_NETWORK_BASE', '$.networkBaseMVA', 'networkBaseMVA must be a finite positive value no greater than 1,000,000 MVA.'));
    }
    if (!Array.isArray(rawBuses) || rawBuses.length < 1 || rawBuses.length > 250) {
        issues.push(issue('INVALID_BUS_LIST', '$.buses', 'Provide between 1 and 250 buses.'));
    }
    if (!Array.isArray(rawBranches) || rawBranches.length > 1000) {
        issues.push(issue('INVALID_BRANCH_LIST', '$.branches', 'Provide an array of no more than 1,000 branches.'));
    }
    if (!Array.isArray(rawSources) || rawSources.length > 250) {
        issues.push(issue('INVALID_SOURCE_LIST', '$.sources', 'Provide an array of no more than 250 sources.'));
    }
    if (!responseMode) {
        if (!allowedKeys(rawFault, ['busId', 'type'], '$.fault', issues)) return blocked(issues);
        if (rawFault.type !== 'three-phase-bolted' || !isNonBlank(rawFault.busId)) {
            issues.push(issue('INVALID_FAULT', '$.fault', 'Fault requires a busId and type "three-phase-bolted".'));
        }
    }
    if (!allowedKeys(rawInventory, ['status', 'reference'], '$.sourceInventory', issues)) return blocked(issues);
    if (!['complete', 'partial', 'unknown'].includes(rawInventory.status) || !isNonBlank(rawInventory.reference)) {
        issues.push(issue('INVALID_SOURCE_INVENTORY', '$.sourceInventory', 'Provide status complete, partial, or unknown and a nonblank inventory reference.'));
    }
    if (issues.length) return blocked(issues);

    const buses = [];
    const busById = new Map();
    rawBuses.forEach((raw, index) => {
        const path = `$.buses[${index}]`;
        if (!allowedKeys(raw, ['id', 'voltageLLV'], path, issues)) return;
        if (!isNonBlank(raw.id) || !isFiniteNumber(raw.voltageLLV) || raw.voltageLLV <= 0 || raw.voltageLLV > 1e6) {
            issues.push(issue('INVALID_BUS', path, 'Bus requires a nonblank id and finite positive line-to-line voltage no greater than 1,000,000 V.'));
            return;
        }
        if (busById.has(raw.id)) {
            issues.push(issue('DUPLICATE_BUS_ID', `${path}.id`, `Bus id ${raw.id} is duplicated.`));
            return;
        }
        const bus = { id: raw.id, voltageLLV: raw.voltageLLV };
        buses.push(bus);
        busById.set(bus.id, bus);
    });

    const branches = [];
    const branchIds = new Set();
    rawBranches.forEach((raw, index) => {
        const path = `$.branches[${index}]`;
        if (!allowedKeys(raw, ['id', 'fromBusId', 'toBusId', 'impedance', 'tapPu'], path, issues)) return;
        const impedance = impedanceField(raw.impedance, `${path}.impedance`, issues);
        const tap = complexField(raw.tapPu, `${path}.tapPu`, issues);
        if (!isNonBlank(raw.id) || !isNonBlank(raw.fromBusId) || !isNonBlank(raw.toBusId) || raw.fromBusId === raw.toBusId) {
            issues.push(issue('INVALID_BRANCH', path, 'Branch requires a unique id and distinct fromBusId/toBusId endpoints.'));
            return;
        }
        if (branchIds.has(raw.id)) issues.push(issue('DUPLICATE_BRANCH_ID', `${path}.id`, `Branch id ${raw.id} is duplicated.`));
        branchIds.add(raw.id);
        if (!impedance || !tap) return;
        const tapMagnitude = cAbs(tap);
        if (!numericMagnitudeIsUsable(tapMagnitude, `${path}.tapPu`, issues) || tapMagnitude > 1e6) {
            if (tapMagnitude > 1e6) issues.push(issue('TAP_RANGE', `${path}.tapPu`, 'Tap magnitude may not exceed 1,000,000 pu.'));
            return;
        }
        const zeroZ = impedance.rOhm === 0 && impedance.xOhm === 0;
        branches.push({ id: raw.id, fromBusId: raw.fromBusId, toBusId: raw.toBusId, impedance, tapPu: tap, zeroZ });
    });

    const sources = [];
    const sourceIds = new Set();
    rawSources.forEach((raw, index) => {
        const path = `$.sources[${index}]`;
        if (!allowedKeys(raw, ['id', 'busId', 'emfPhaseV', 'impedance', 'inService', 'reference'], path, issues)) return;
        const emf = complexField(raw.emfPhaseV, `${path}.emfPhaseV`, issues);
        const impedance = sourceImpedanceField(raw.impedance, `${path}.impedance`, issues);
        if (!isNonBlank(raw.id) || !isNonBlank(raw.busId) || !isNonBlank(raw.reference) || typeof raw.inService !== 'boolean') {
            issues.push(issue('INVALID_SOURCE', path, 'Source requires id, busId, explicit inService boolean, and a nonblank reference.'));
            return;
        }
        if (sourceIds.has(raw.id)) issues.push(issue('DUPLICATE_SOURCE_ID', `${path}.id`, `Source id ${raw.id} is duplicated.`));
        sourceIds.add(raw.id);
        if (emf && !finiteMagnitude(emf)) issues.push(issue('INVALID_SOURCE_EMF', `${path}.emfPhaseV`, 'Source EMF magnitude must be finite.'));
        // A zero EMF may represent a deliberately suppressed source profile;
        // the source remains connected through its nonzero internal impedance.
        if (impedance && impedance.rOhm === 0 && impedance.xOhm === 0) issues.push(issue('INVALID_SOURCE_IMPEDANCE', `${path}.impedance`, 'Ideal voltage sources require nonzero internal impedance.'));
        if (!emf || !impedance) return;
        sources.push({ id: raw.id, busId: raw.busId, emfPhaseV: emf, impedance, inService: raw.inService, reference: raw.reference });
    });

    if (issues.length) return blocked(issues);
    buses.sort((a, b) => a.id.localeCompare(b.id));
    branches.sort((a, b) => a.id.localeCompare(b.id));
    sources.sort((a, b) => a.id.localeCompare(b.id));
    for (const branch of branches) {
        if (!busById.has(branch.fromBusId) || !busById.has(branch.toBusId)) issues.push(issue('UNKNOWN_BRANCH_ENDPOINT', `$.branches[${branch.id}]`, 'Branch endpoint does not identify a supplied bus.'));
        if (!busById.has(branch.impedance.referenceBusId) || ![branch.fromBusId, branch.toBusId].includes(branch.impedance.referenceBusId)) {
            issues.push(issue('INVALID_BRANCH_IMPEDANCE_BASE', `$.branches[${branch.id}].impedance.referenceBusId`, 'Branch impedance referenceBusId must be one of its endpoints.'));
        }
        if (branch.zeroZ) {
            const from = busById.get(branch.fromBusId);
            const to = busById.get(branch.toBusId);
            if (!from || !to || from.voltageLLV !== to.voltageLLV || branch.tapPu.re !== 1 || branch.tapPu.im !== 0) {
                issues.push(issue('UNSUPPORTED_IDEAL_BRANCH', `$.branches[${branch.id}]`, 'Zero-impedance branches are supported only as same-voltage unity-tap ideal ties.'));
            }
        }
    }
    for (const source of sources) {
        if (!busById.has(source.busId)) issues.push(issue('UNKNOWN_SOURCE_BUS', `$.sources[${source.id}].busId`, 'Source bus does not identify a supplied bus.'));
    }
    if (!responseMode && !busById.has(rawFault.busId)) issues.push(issue('UNKNOWN_FAULT_BUS', '$.fault.busId', 'Fault bus does not identify a supplied bus.'));
    if (issues.length) return blocked(issues);

    const parent = new Map(buses.map((bus) => [bus.id, bus.id]));
    const find = (value) => {
        let current = value;
        while (parent.get(current) !== current) current = parent.get(current);
        let node = value;
        while (parent.get(node) !== node) {
            const next = parent.get(node);
            parent.set(node, current);
            node = next;
        }
        return current;
    };
    const zeroTies = branches.filter((branch) => branch.zeroZ).slice().sort((a, b) => a.id.localeCompare(b.id));
    for (const tie of zeroTies) {
        const left = find(tie.fromBusId);
        const right = find(tie.toBusId);
        if (left === right) {
            issues.push(issue('IDEAL_TIE_CYCLE', `$.branches[${tie.id}]`, 'Ideal zero-impedance ties form a cycle, so individual tie currents are indeterminate.'));
        } else {
            const [first, second] = sorted([left, right]);
            parent.set(second, first);
        }
    }
    if (issues.length) return blocked(issues);

    const busGroup = new Map(buses.map((bus) => [bus.id, find(bus.id)]));
    const groupIds = sorted([...new Set(busGroup.values())]);
    const faultGroup = responseMode ? null : busGroup.get(rawFault.busId);
    const components = findComponents(buses, branches, busGroup);
    for (const component of components) {
        if (!sources.some((source) => source.inService && component.busIds.includes(source.busId))) {
            issues.push(issue('UNFED_ISLAND', `$.buses[${component.busIds[0]}]`, `Electrical island containing ${component.busIds.join(', ')} has no in-service source.`));
        }
    }
    if (!responseMode) {
        const faultComponent = components.find((component) => component.busIds.includes(rawFault.busId));
        if (!faultComponent || !sources.some((source) => source.inService && faultComponent.busIds.includes(source.busId))) {
            issues.push(issue('FAULT_NOT_FED', '$.fault.busId', 'The faulted electrical island has no in-service source.'));
        }
    }
    if (issues.length) return blocked(issues);

    const busBases = new Map();
    for (const bus of buses) {
        const zBaseOhm = bus.voltageLLV ** 2 / (networkBaseMVA * 1e6);
        const phaseBaseV = bus.voltageLLV / SQRT3;
        const currentBaseA = networkBaseMVA * 1e6 / (SQRT3 * bus.voltageLLV);
        if (!numericMagnitudeIsUsable(zBaseOhm, `$.buses[${bus.id}].zBaseOhm`, issues)
            || !numericMagnitudeIsUsable(phaseBaseV, `$.buses[${bus.id}].phaseBaseV`, issues)
            || !numericMagnitudeIsUsable(currentBaseA, `$.buses[${bus.id}].currentBaseA`, issues)) continue;
        busBases.set(bus.id, { zBaseOhm, phaseBaseV, currentBaseA });
    }

    const preparedBranches = [];
    for (const branch of branches.filter((item) => !item.zeroZ)) {
        const referenceBase = busBases.get(branch.impedance.referenceBusId);
        const fromBase = busBases.get(branch.fromBusId);
        const toBase = busBases.get(branch.toBusId);
        if (!referenceBase || !fromBase || !toBase) continue;
        const zOhm = complex(branch.impedance.rOhm, branch.impedance.xOhm);
        const zPu = complex(zOhm.re / referenceBase.zBaseOhm, zOhm.im / referenceBase.zBaseOhm);
        if (!finiteMagnitude(zPu) || cAbs(zPu) === 0) issues.push(issue('INVALID_PER_UNIT_BRANCH_IMPEDANCE', `$.branches[${branch.id}].impedance`, 'Branch impedance could not be represented as finite, nonzero per-unit impedance.'));
        preparedBranches.push({ ...branch, fromGroup: busGroup.get(branch.fromBusId), toGroup: busGroup.get(branch.toBusId), zPu, fromBase, toBase });
    }
    const preparedSources = [];
    for (const source of sources.filter((item) => item.inService)) {
        const bus = busById.get(source.busId);
        const base = busBases.get(source.busId);
        if (!bus || !base) continue;
        const zPu = complex(source.impedance.rOhm / base.zBaseOhm, source.impedance.xOhm / base.zBaseOhm);
        const emfPu = complex(source.emfPhaseV.re / base.phaseBaseV, source.emfPhaseV.im / base.phaseBaseV);
        if (!finiteMagnitude(zPu) || cAbs(zPu) === 0) issues.push(issue('INVALID_PER_UNIT_SOURCE_IMPEDANCE', `$.sources[${source.id}].impedance`, 'Source impedance could not be represented as finite, nonzero per-unit impedance.'));
        if (!finiteMagnitude(emfPu) || (cAbs(source.emfPhaseV) > 0 && cAbs(emfPu) === 0)) issues.push(issue('INVALID_PER_UNIT_SOURCE_EMF', `$.sources[${source.id}].emfPhaseV`, 'Nonzero source EMF could not be represented as finite, nonzero per-unit voltage.'));
        const admittancePu = cDiv(complex(1, 0), zPu);
        const nortonInjectionPu = cMul(admittancePu, emfPu);
        if (!finiteMagnitude(admittancePu) || cAbs(admittancePu) === 0) issues.push(issue('SOURCE_ADMITTANCE_UNREPRESENTABLE', `$.sources[${source.id}].impedance`, 'Source per-unit admittance is zero or outside the representable finite range.'));
        if (cAbs(source.emfPhaseV) > 0 && (!finiteMagnitude(nortonInjectionPu) || cAbs(nortonInjectionPu) === 0)) issues.push(issue('SOURCE_NORTON_INJECTION_UNREPRESENTABLE', `$.sources[${source.id}]`, 'Nonzero source EMF divided by its impedance produced a zero or non-finite per-unit Norton injection.'));
        preparedSources.push({ ...source, group: busGroup.get(source.busId), base, zPu, emfPu, admittancePu, nortonInjectionPu });
    }
    if (issues.length || busBases.size !== buses.length || preparedBranches.length !== branches.filter((item) => !item.zeroZ).length || preparedSources.length !== sources.filter((item) => item.inService).length) return blocked(issues);

    if (responseMode) return evaluatePositiveSequenceLinearResponse({ input, buses, branches, sources, busById, busGroup, groupIds, busBases, preparedBranches, preparedSources,
        responseBusIds: input.responseBusIds, targetBranchIds: input.targetBranchIds });

    const solveCase = (activeSourceIds) => {
        const { unknownNodes: unknownGroups, indexByNode: indexByGroup, matrix, rhs } = buildNodalAdmittanceMatrix(preparedBranches, preparedSources, groupIds, faultGroup, activeSourceIds);
        if (matrix.some((row) => row.some((value) => !finiteComplex(value))) || rhs.some((value) => !finiteComplex(value))) return null;
        const values = solveLinearSystem(matrix, rhs);
        if (!values || values.some((value) => !finiteComplex(value))) return null;
        const voltageByGroup = new Map([[faultGroup, complex(0, 0)]]);
        unknownGroups.forEach((group, index) => voltageByGroup.set(group, values[index]));
        const sourceCurrentsPu = new Map(preparedSources.map((source) => [source.id,
            cDiv(cSub(activeSourceIds.has(source.id) ? source.emfPu : complex(), voltageByGroup.get(source.group)), source.zPu),
        ]));
        // Keep a relative roundoff budget from the terms before subtraction.
        // Terminal currents can be tiny after cancellation even when the
        // voltage terms used to calculate them are large.
        const sourceCurrentErrorScalePu = new Map(preparedSources.map((source) => {
            const emf = activeSourceIds.has(source.id) ? source.emfPu : complex();
            const voltage = voltageByGroup.get(source.group);
            const impedanceMagnitude = cAbs(source.zPu);
            return [source.id, (cAbs(emf) + cAbs(voltage)) / impedanceMagnitude];
        }));
        const branchCurrentsPu = new Map();
        const branchCurrentErrorScalePu = new Map();
        for (const branch of preparedBranches) {
            const vf = voltageByGroup.get(branch.fromGroup);
            const vt = voltageByGroup.get(branch.toGroup);
            const fromVoltageOverTap = cDiv(vf, branch.tapPu);
            const through = cMul(cDiv(complex(1, 0), branch.zPu), cSub(cDiv(vf, branch.tapPu), vt));
            const from = cDiv(through, cConj(branch.tapPu));
            const to = cMul(complex(-1, 0), through);
            if (!finiteComplex(from) || !finiteComplex(to)) return null;
            branchCurrentsPu.set(branch.id, { from, to });
            const seriesAdmittanceMagnitude = 1 / cAbs(branch.zPu);
            const tapMagnitude = cAbs(branch.tapPu);
            branchCurrentErrorScalePu.set(branch.id, {
                from: seriesAdmittanceMagnitude * (cAbs(fromVoltageOverTap) + cAbs(vt)) / tapMagnitude,
                to: seriesAdmittanceMagnitude * (cAbs(fromVoltageOverTap) + cAbs(vt)),
            });
        }
        const faultSourcePu = preparedSources
            .filter((source) => source.group === faultGroup)
            .reduce((total, source) => cAdd(total, sourceCurrentsPu.get(source.id)), complex());
        const faultBranchPu = preparedBranches
            .filter((branch) => branch.fromGroup === faultGroup || branch.toGroup === faultGroup)
            .reduce((total, branch) => {
                const terminal = branch.fromGroup === faultGroup ? branchCurrentsPu.get(branch.id).from : branchCurrentsPu.get(branch.id).to;
                return cAdd(total, terminal);
            }, complex());
        const faultCurrentPu = cSub(faultSourcePu, faultBranchPu);
        if (!finiteComplex(faultCurrentPu)) return null;
        return { voltageByGroup, sourceCurrentsPu, sourceCurrentErrorScalePu, branchCurrentsPu, branchCurrentErrorScalePu, faultCurrentPu };
    };

    const activeSourceIds = new Set(preparedSources.map((source) => source.id));
    const totalScenario = solveCase(activeSourceIds);
    if (!totalScenario) return blocked([issue('SINGULAR_OR_UNSTABLE_NETWORK', '$', 'The source-connected network equations are singular or numerically unstable; no epsilon impedance was added.')]);
    const contributions = [];
    if (includeSourceFaultContributions) {
        for (const source of preparedSources) {
            const scenario = solveCase(new Set([source.id]));
            if (!scenario) return blocked([issue('SINGULAR_OR_UNSTABLE_NETWORK', `$.sources[${source.id}]`, 'Source-superposition equations are singular or numerically unstable; no epsilon impedance was added.')]);
            const currentKA = currentPuToKA(scenario.faultCurrentPu, busBases.get(rawFault.busId).currentBaseA);
            if (!currentKA) return blocked([issue('NONFINITE_RESULT', `$.sources[${source.id}]`, 'Fault contribution exceeded the finite numeric result range or underflowed during per-unit to kA conversion.')]);
            contributions.push({ sourceId: source.id, currentKA: currentRecord(currentKA) });
        }
        contributions.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
    }
    const faultCurrentKA = currentPuToKA(totalScenario.faultCurrentPu, busBases.get(rawFault.busId).currentBaseA);
    if (!faultCurrentKA) return blocked([issue('NONFINITE_RESULT', '$.fault', 'Fault current exceeded the finite numeric result range or underflowed during per-unit to kA conversion.')]);
    if (includeSourceFaultContributions) {
        const contributionSum = contributions.reduce((total, item) => cAdd(total, complex(item.currentKA.re, item.currentKA.im)), complex());
        if (!finiteMagnitude(contributionSum)) return blocked([issue('NONFINITE_RESULT', '$.fault', 'Fault current exceeded the finite numeric result range or underflowed during per-unit to kA conversion.')]);
        const conservationError = cAbs(cSub(contributionSum, faultCurrentKA));
        // A near-canceling source set can have a tiny vector sum while each
        // superposition contribution remains large. Scale by the summed terms.
        const contributionScale = contributions.reduce((sum, item) => sum + cAbs(complex(item.currentKA.re, item.currentKA.im)), cAbs(faultCurrentKA));
        if (!relativeResidualPass(conservationError, contributionScale)) {
            return blocked([issue('SUPERPOSITION_RESIDUAL', '$.sourceFaultContributions', 'Per-source fault contributions did not sum to the total complex fault current within numerical tolerance.')]);
        }
    }

    const sourceTerminalCurrents = [];
    for (const source of sources) {
        if (!source.inService) {
            sourceTerminalCurrents.push({ sourceId: source.id, busId: source.busId, currentKA: currentRecord(complex()) });
            continue;
        }
        const prepared = preparedSources.find((item) => item.id === source.id);
        const pu = totalScenario.sourceCurrentsPu.get(source.id);
        const kA = currentPuToKA(pu, prepared.base.currentBaseA);
        if (!kA) return blocked([issue('NONFINITE_RESULT', `$.sources[${source.id}]`, 'Source terminal current exceeded the finite numeric result range or underflowed during per-unit to kA conversion.')]);
        sourceTerminalCurrents.push({ sourceId: source.id, busId: source.busId, currentKA: currentRecord(kA) });
    }
    sourceTerminalCurrents.sort((a, b) => a.sourceId.localeCompare(b.sourceId));

    const branchTerminalCurrents = preparedBranches.map((branch) => {
        const currents = totalScenario.branchCurrentsPu.get(branch.id);
        const fromKA = currentPuToKA(currents.from, branch.fromBase.currentBaseA);
        const toKA = currentPuToKA(currents.to, branch.toBase.currentBaseA);
        return {
            branchId: branch.id,
            fromBusId: branch.fromBusId,
            toBusId: branch.toBusId,
            fromCurrentIntoBranchKA: fromKA ? currentRecord(fromKA) : null,
            toCurrentIntoBranchKA: toKA ? currentRecord(toKA) : null,
        };
    }).sort((a, b) => a.branchId.localeCompare(b.branchId));
    if (branchTerminalCurrents.some((item) => !item.fromCurrentIntoBranchKA || !item.toCurrentIntoBranchKA)) {
        return blocked([issue('NONFINITE_RESULT', '$.branches', 'Branch terminal current exceeded the finite numeric result range or underflowed during per-unit to kA conversion.')]);
    }

    const busVoltages = buses.map((bus) => {
        const voltagePu = totalScenario.voltageByGroup.get(busGroup.get(bus.id));
        const voltageV = cMul(voltagePu, complex(busBases.get(bus.id).phaseBaseV, 0));
        if (!finiteMagnitude(voltagePu) || !finiteMagnitude(voltageV)) return null;
        return {
            busId: bus.id,
            voltagePhasePu: { re: voltagePu.re, im: voltagePu.im },
            voltagePhaseV: { re: voltageV.re, im: voltageV.im },
        };
    }).sort((a, b) => a.busId.localeCompare(b.busId));
    if (busVoltages.some((item) => item === null)) return blocked([issue('NONFINITE_RESULT', '$.buses', 'Bus voltage exceeded the finite numeric result range.')]);

    const nonTieBranchPuById = totalScenario.branchCurrentsPu;
    const nonTieCurrentIntoAtBus = (branch, busId) => {
        const currents = nonTieBranchPuById.get(branch.id);
        return branch.fromBusId === busId ? currents.from : currents.to;
    };
    const tieAdjacency = new Map(buses.map((bus) => [bus.id, []]));
    for (const tie of zeroTies) {
        tieAdjacency.get(tie.fromBusId).push({ neighbor: tie.toBusId, branch: tie });
        tieAdjacency.get(tie.toBusId).push({ neighbor: tie.fromBusId, branch: tie });
    }
    const busResidual = new Map(buses.map((bus) => [bus.id, complex()]));
    for (const source of preparedSources) {
        const currentPu = totalScenario.sourceCurrentsPu.get(source.id);
        busResidual.set(source.busId, cAdd(busResidual.get(source.busId), currentPu));
    }
    for (const branch of preparedBranches) {
        busResidual.set(branch.fromBusId, cSub(busResidual.get(branch.fromBusId), nonTieCurrentIntoAtBus(branch, branch.fromBusId)));
        busResidual.set(branch.toBusId, cSub(busResidual.get(branch.toBusId), nonTieCurrentIntoAtBus(branch, branch.toBusId)));
    }
    busResidual.set(rawFault.busId, cSub(busResidual.get(rawFault.busId), totalScenario.faultCurrentPu));
    const tieTerminalPuByBus = new Map(buses.map((bus) => [bus.id, complex()]));
    const tieCurrents = [];
    const visitedTieBus = new Set();
    for (const startBusId of sorted(buses.map((bus) => bus.id))) {
        if (visitedTieBus.has(startBusId) || tieAdjacency.get(startBusId).length === 0) continue;
        const parentBus = new Map([[startBusId, null]]);
        const parentEdge = new Map();
        const order = [startBusId];
        visitedTieBus.add(startBusId);
        for (let index = 0; index < order.length; index += 1) {
            const current = order[index];
            for (const edge of tieAdjacency.get(current).slice().sort((a, b) => a.branch.id.localeCompare(b.branch.id))) {
                if (parentBus.get(current) === edge.neighbor || visitedTieBus.has(edge.neighbor)) continue;
                visitedTieBus.add(edge.neighbor);
                parentBus.set(edge.neighbor, current);
                parentEdge.set(edge.neighbor, edge.branch);
                order.push(edge.neighbor);
            }
        }
        const subtree = new Map(order.map((busId) => [busId, busResidual.get(busId)]));
        for (let index = order.length - 1; index > 0; index -= 1) {
            const child = order[index];
            const parentId = parentBus.get(child);
            const subtreeCurrent = subtree.get(child);
            const edge = parentEdge.get(child);
            const parentToChild = cMul(complex(-1, 0), subtreeCurrent);
            const fromTo = edge.fromBusId === parentId ? parentToChild : cMul(complex(-1, 0), parentToChild);
            tieTerminalPuByBus.set(edge.fromBusId, cAdd(tieTerminalPuByBus.get(edge.fromBusId), fromTo));
            tieTerminalPuByBus.set(edge.toBusId, cSub(tieTerminalPuByBus.get(edge.toBusId), fromTo));
            const currentKA = currentPuToKA(fromTo, busBases.get(edge.fromBusId).currentBaseA);
            if (!currentKA) return blocked([issue('NONFINITE_RESULT', `$.branches[${edge.id}]`, 'Recovered ideal-tie current exceeded the finite numeric result range or underflowed during per-unit to kA conversion.')]);
            const oppositeKA = complex(-currentKA.re, -currentKA.im);
            tieCurrents.push({
                branchId: edge.id,
                fromBusId: edge.fromBusId,
                toBusId: edge.toBusId,
                fromCurrentIntoBranchKA: currentRecord(currentKA),
                toCurrentIntoBranchKA: currentRecord(oppositeKA),
            });
            subtree.set(parentId, cAdd(subtree.get(parentId), subtreeCurrent));
        }
    }
    tieCurrents.sort((a, b) => a.branchId.localeCompare(b.branchId));

    for (const bus of buses) {
        let scale = cAbs(tieTerminalPuByBus.get(bus.id));
        for (const source of preparedSources.filter((item) => item.busId === bus.id)) scale += totalScenario.sourceCurrentErrorScalePu.get(source.id);
        for (const branch of preparedBranches) {
            const branchScale = totalScenario.branchCurrentErrorScalePu.get(branch.id);
            if (branch.fromBusId === bus.id) scale += branchScale.from;
            if (branch.toBusId === bus.id) scale += branchScale.to;
        }
        if (bus.id === rawFault.busId) scale += cAbs(totalScenario.faultCurrentPu);
        const residual = cAbs(cSub(busResidual.get(bus.id), tieTerminalPuByBus.get(bus.id)));
        if (!relativeResidualPass(residual, scale)) {
            return blocked([issue('KCL_RESIDUAL', `$.buses[${bus.id}]`, 'Source, branch, fault, and recovered ideal-tie currents do not satisfy the bus current balance within relative numerical tolerance.')]);
        }
    }

    const residualByGroup = new Map(groupIds.map((id) => [id, complex()]));
    const scaleByGroup = new Map(groupIds.map((id) => [id, 0]));
    for (const bus of buses) residualByGroup.set(busGroup.get(bus.id), cAdd(residualByGroup.get(busGroup.get(bus.id)), busResidual.get(bus.id)));
    for (const source of preparedSources) scaleByGroup.set(source.group, scaleByGroup.get(source.group) + totalScenario.sourceCurrentErrorScalePu.get(source.id));
    for (const branch of preparedBranches) {
        const branchScale = totalScenario.branchCurrentErrorScalePu.get(branch.id);
        scaleByGroup.set(branch.fromGroup, scaleByGroup.get(branch.fromGroup) + branchScale.from);
        scaleByGroup.set(branch.toGroup, scaleByGroup.get(branch.toGroup) + branchScale.to);
    }
    for (const groupId of groupIds) {
        if (groupId === faultGroup) continue;
        const residual = cAbs(residualByGroup.get(groupId));
        if (!relativeResidualPass(residual, scaleByGroup.get(groupId))) {
            return blocked([issue('GROUP_KCL_RESIDUAL', `$.groups[${groupId}]`, 'Aggregated nonfault bus currents do not satisfy group current balance within relative numerical tolerance.')]);
        }
    }

    return {
        status: 'evaluated',
        method: METHOD,
        scope: 'initial-symmetrical-rms-only',
        fault: {
            busId: rawFault.busId,
            type: rawFault.type,
            totalFaultCurrentKA: currentRecord(faultCurrentKA),
            faultCurrentRmsKA: cAbs(faultCurrentKA),
        },
        sourceInventory: { ...rawInventory, verificationStatus: 'not-verified' },
        sourceFaultContributions: contributions,
        sourceTerminalCurrents,
        branchTerminalCurrents,
        busVoltages,
        zeroImpedanceTieCurrents: tieCurrents,
        limitations: [
            'Balanced positive-sequence, three-phase bolted fault; results are initial symmetrical RMS values for the explicitly modeled network only.',
            'Does not calculate minimum or maximum studies, peak or interrupting duty, thermal duty, protective clearing, motor decay, or code compliance.',
            'Source inventory status and reference are supplied metadata and have not been independently verified.',
            'Branch tapPu is an ideal complex tap on the from side; branch impedance is per unit on its stated nominal bus-voltage base and the series element is on the to side.',
            'Zero-impedance same-voltage unity-tap ties are contracted exactly; their currents are recovered by KCL. Individual currents in ideal tie cycles are indeterminate and are rejected.',
        ],
        issues: [],
    };
}

export function solvePositiveSequenceBoltedFault(input = {}) { return solvePositiveSequenceNetwork(input, false); }

export function preparePositiveSequenceNetworkLinearResponse(input = {}) {
    const result = solvePositiveSequenceNetwork(input, true);
    return result.status === 'blocked'
        ? { ...result, method: LINEAR_RESPONSE_METHOD, scope: 'unfaulted-positive-sequence-network-linear-response' }
        : result;
}
