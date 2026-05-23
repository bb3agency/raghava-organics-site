#!/usr/bin/env node
const { isOpsConfigCandidateKey } = require('./ops-config-contract-drift-check.js');
const { ENV_RUNTIME_CONTRACT } = require('./env-runtime-contract.js');

const keys = ENV_RUNTIME_CONTRACT.envExampleRequired.map(e => e.key);
const candidates = keys.filter(isOpsConfigCandidateKey);
const nonCandidates = keys.filter(k => !isOpsConfigCandidateKey(k));

process.stdout.write('Candidate (must be in ops contract): ' + candidates.length + '\n');
process.stdout.write('Non-candidate: ' + nonCandidates.join(', ') + '\n');
