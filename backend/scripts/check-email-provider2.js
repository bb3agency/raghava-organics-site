#!/usr/bin/env node
const { isOpsConfigCandidateKey } = require('./ops-config-contract-drift-check.js');
const { ENV_RUNTIME_CONTRACT } = require('./env-runtime-contract.js');
const fs = require('fs');
const path = require('path');

const keys = ENV_RUNTIME_CONTRACT.envExampleRequired.map(e => e.key);
const candidates = keys.filter(isOpsConfigCandidateKey);
const nonCandidates = keys.filter(k => !isOpsConfigCandidateKey(k));

const out = [
  'Candidate keys (must be in ops contract): ' + candidates.length,
  candidates.join(', '),
  '',
  'Non-candidate keys: ' + nonCandidates.length,
  nonCandidates.join(', ')
].join('\n');

fs.writeFileSync(path.join(__dirname, '..', 'check-result.txt'), out, 'utf8');
