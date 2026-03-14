import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { CACHE_DIR } from './config.js';
import { build } from './build.js';

export interface DeployOptions {
  cwd?: string;
  prod?: boolean;
}

export async function deploy(opts: DeployOptions = {}): Promise<void> {
  const cwd = opts.cwd || process.cwd();
  const appDir = path.join(cwd, CACHE_DIR);

  await build(cwd);

  // Vercel link is stored in project root, not .autodocs/
  const vercelDir = path.join(cwd, '.vercel');
  if (!fs.existsSync(vercelDir)) {
    console.log('\nFirst deploy — linking Vercel project...\n');
    try {
      execSync('npx vercel link --yes', { cwd, stdio: 'inherit' });
    } catch {
      console.error(
        '\nVercel link failed. Make sure you have:\n' +
        '  1. npm install -g vercel\n' +
        '  2. vercel login\n',
      );
      throw new Error('Deploy failed');
    }
  }

  const appVercelDir = path.join(appDir, '.vercel');
  fs.mkdirSync(appVercelDir, { recursive: true });
  for (const file of fs.readdirSync(vercelDir)) {
    fs.copyFileSync(path.join(vercelDir, file), path.join(appVercelDir, file));
  }

  console.log('\nDeploying to Vercel...\n');
  const prodFlag = opts.prod !== false ? '--prod' : '';
  try {
    execSync(`npx vercel deploy ${prodFlag} --yes`, {
      cwd: appDir,
      stdio: 'inherit',
    });
  } catch {
    throw new Error('Vercel deploy failed');
  }
}
