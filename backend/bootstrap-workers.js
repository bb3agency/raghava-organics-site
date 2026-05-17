const tsConfigPaths = require('tsconfig-paths');
const logger = require('./scripts/lib/logger');

const config = tsConfigPaths.loadConfig('tsconfig.production.json');
if (config.resultType === 'success') {
  tsConfigPaths.register({ baseUrl: config.absoluteBaseUrl, paths: config.paths });
} else {
  logger.error('Failed to load tsconfig.production.json', { config });
  process.exit(1);
}
require('./dist/queues/workers/index.js');
