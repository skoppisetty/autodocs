import path from 'node:path';
import { execSync } from 'node:child_process';
import { loadConfig, CACHE_DIR } from './config.js';
import { scaffoldFumadocsApp } from './scaffold.js';

export async function build(cwd: string = process.cwd()): Promise<void> {
  const config = loadConfig(cwd);
  const appDir = path.join(cwd, CACHE_DIR);

  scaffoldFumadocsApp(cwd, appDir, config);

  console.log('Building documentation site...\n');

  try {
    execSync('npx next build', {
      cwd: appDir,
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'production' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Build failed: ${msg}`);
  }

  console.log(`\nBuild complete: ${path.relative(cwd, path.join(appDir, '.next'))}`);
}
