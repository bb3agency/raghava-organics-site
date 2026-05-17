const net = require('net');
const logger = require('./lib/logger');

function tcpCheck(host, port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ host, port, timeout: 3000 });
    s.on('connect', () => { s.destroy(); resolve({ host, port, ok: true }); });
    s.on('error', (e) => resolve({ host, port, ok: false, err: e.message }));
    s.on('timeout', () => { s.destroy(); resolve({ host, port, ok: false, err: 'timeout' }); });
  });
}

async function main() {
  const checks = await Promise.all([
    tcpCheck('127.0.0.1', 6379),
    tcpCheck('localhost', 6379),
    tcpCheck('127.0.0.1', 5432),
    tcpCheck('localhost', 5432),
  ]);
  checks.forEach(c => {
    if (c.ok) {
      logger.success(`${c.host}:${c.port}`);
    } else {
      logger.error(`${c.host}:${c.port}${c.err ? ` — ${c.err}` : ''}`);
    }
  });
}

main();
