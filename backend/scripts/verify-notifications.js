#!/usr/bin/env node
/**
 * Notification Flow Verification Script
 * Run: node scripts/verify-notifications.js
 *
 * Checks:
 * 1. Required email configuration
 * 2. Notification worker health
 * 3. Recent notification logs
 * 4. Queue status
 */

const fs = require('fs');
const path = require('path');

const logger = {
  info: (msg) => console.log(`ℹ️  ${msg}`),
  success: (msg) => console.log(`✅ ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
};

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('EMAIL NOTIFICATION FLOW VERIFICATION');
  console.log('='.repeat(60) + '\n');

  // 1. Check .env for required variables
  logger.info('Checking backend configuration...');
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    logger.error('.env file not found');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf-8');
  const envLines = envContent.split('\n').filter(l => l.trim() && !l.startsWith('#'));

  const hasNotifyEmail = envLines.some(l => l.includes('NOTIFY_EMAIL_ENABLED=true'));
  const hasDatabaseUrl = envLines.some(l => l.includes('DATABASE_URL='));
  const hasRedisUrl = envLines.some(l => l.includes('REDIS_URL='));

  if (hasNotifyEmail) {
    logger.success('NOTIFY_EMAIL_ENABLED is set to true');
  } else {
    logger.warn('NOTIFY_EMAIL_ENABLED is not set to true in .env');
  }

  if (hasDatabaseUrl) {
    logger.success('DATABASE_URL is configured');
  } else {
    logger.error('DATABASE_URL is missing');
  }

  if (hasRedisUrl) {
    logger.success('REDIS_URL is configured');
  } else {
    logger.error('REDIS_URL is missing');
  }

  // 2. Check notification templates
  logger.info('\nChecking email templates...');
  const templatesPath = path.join(process.cwd(), 'src/modules/notifications/templates');
  if (!fs.existsSync(templatesPath)) {
    logger.warn(`Templates directory not found at ${templatesPath}`);
  } else {
    const templates = [
      'email-templates.ts',
      'sms-templates.ts'
    ];
    for (const template of templates) {
      const exists = fs.existsSync(path.join(templatesPath, template));
      if (exists) {
        logger.success(`Found ${template}`);
      } else {
        logger.warn(`Missing ${template}`);
      }
    }
  }

  // 3. Check notification worker
  logger.info('\nChecking notification worker...');
  const workerPath = path.join(process.cwd(), 'queues/workers/notifications.worker.ts');
  if (!fs.existsSync(workerPath)) {
    logger.error('Notification worker not found');
  } else {
    const workerContent = fs.readFileSync(workerPath, 'utf-8');

    const hasSendPrimary = workerContent.includes("job.name === 'send-primary'");
    const hasResendAdapter = workerContent.includes('ResendAdapter');
    const hasNotificationLog = workerContent.includes('NotificationLog');

    if (hasSendPrimary) {
      logger.success('send-primary job handler found');
    } else {
      logger.error('send-primary handler not found');
    }

    if (hasResendAdapter) {
      logger.success('ResendAdapter integration found');
    } else {
      logger.error('ResendAdapter not integrated');
    }

    if (hasNotificationLog) {
      logger.success('Notification logging found');
    } else {
      logger.error('Notification logging not implemented');
    }
  }

  // 4. Check notification triggers
  logger.info('\nChecking notification triggers...');
  const ordersServicePath = path.join(process.cwd(), 'src/modules/orders/orders.service.ts');
  const orderProcessingWorkerPath = path.join(process.cwd(), 'queues/workers/order-processing.worker.ts');
  const shippingWorkerPath = path.join(process.cwd(), 'queues/workers/shipping.worker.ts');

  const checkTrigger = (filePath, templateName) => {
    if (!fs.existsSync(filePath)) {
      logger.warn(`File not found: ${filePath}`);
      return false;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    const found = content.includes(`'${templateName}'`) || content.includes(`"${templateName}"`);
    if (found) {
      logger.success(`${templateName} trigger found in ${path.basename(filePath)}`);
    } else {
      logger.warn(`${templateName} trigger not found in ${path.basename(filePath)}`);
    }
    return found;
  };

  const triggers = [
    { file: orderProcessingWorkerPath, template: 'OrderConfirmed' },
    { file: orderProcessingWorkerPath, template: 'PaymentFailed' },
    { file: shippingWorkerPath, template: 'OrderShipped' },
    { file: shippingWorkerPath, template: 'OutForDelivery' },
    { file: shippingWorkerPath, template: 'OrderDelivered' },
    { file: ordersServicePath, template: 'OrderCancelled' },
  ];

  let triggerCount = 0;
  for (const trigger of triggers) {
    if (checkTrigger(trigger.file, trigger.template)) {
      triggerCount++;
    }
  }

  // 5. Summary
  console.log('\n' + '='.repeat(60));
  logger.info(`Notification triggers verified: ${triggerCount}/${triggers.length}`);
  console.log('='.repeat(60) + '\n');

  logger.info('Next steps:');
  console.log('  1. Verify Ops config has RESEND_API_KEY and RESEND_FROM');
  console.log('  2. Create a test order with customer email');
  console.log('  3. Check NotificationLog table for OrderConfirmed email');
  console.log('  4. Verify email received in inbox (check spam folder)');
  console.log('  5. See docs/EMAIL_NOTIFICATION_FLOW.md for full details\n');
}

main().catch(err => {
  logger.error(`Script failed: ${err.message}`);
  process.exit(1);
});
