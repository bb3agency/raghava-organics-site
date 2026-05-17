import logger from './lib/logger.mjs';

logger.error('ops-bootstrap has been deprecated. Use: npm run ops:newuser -- --email=<email> --name="Ops User" --ip-allowlist="<cidr>" --setup-base-url="https://client.com" --yes');
process.exitCode = 1;
