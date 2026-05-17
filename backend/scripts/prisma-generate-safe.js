const { spawn } = require('child_process');
const logger = require('./lib/logger');

const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 400;
const FORCE_KILL_FLAG = '--kill-lockers';
const isForceMode = process.argv.includes(FORCE_KILL_FLAG);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'pipe' });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function killOtherNodeProcesses() {
  if (process.platform !== 'win32') {
    return;
  }

  const powershell = [
    '-NoProfile',
    '-Command',
    `$self=${process.pid}; Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.ProcessId -ne $self } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
  ];

  const result = await runCommand('powershell', powershell);
  if (result.code === 0) {
    logger.warn('force mode: stopped other node.exe processes to release Prisma DLL lock');
  } else {
    logger.warn('force mode: attempted to stop node.exe processes, but command returned non-zero');
  }
}

function runPrismaGenerate() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['node_modules/prisma/build/index.js', 'generate'], {
      stdio: 'pipe'
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function main() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (isForceMode && attempt === 6) {
      await killOtherNodeProcesses();
      await sleep(1000);
    }

    const result = await runPrismaGenerate();
    if (result.code === 0) {
      if (attempt > 1) {
        logger.info(`prisma generate succeeded on attempt ${attempt}/${MAX_ATTEMPTS}`);
      }
      return;
    }

    const combined = `${result.stdout}\n${result.stderr}`;
    const isLockError = combined.includes('EPERM') && combined.includes('query_engine-windows.dll.node');
    if (!isLockError || attempt === MAX_ATTEMPTS) {
      process.exit(result.code || 1);
    }

    const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
    logger.warn(`prisma generate hit Windows file lock; retrying in ${delay}ms (${attempt}/${MAX_ATTEMPTS})`);
    await sleep(delay);
  }
}

main().catch((error) => {
  logger.fatal(error.message || String(error));
});

