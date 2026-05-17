import bcrypt from 'bcryptjs';
import logger from './scripts/lib/logger.mjs';

logger.info(`bcrypt keys: ${Object.keys(bcrypt).join(', ')}`);
logger.info(`compare: ${typeof bcrypt.compare}`);
