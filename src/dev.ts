import path from 'node:path';
import { execa } from 'execa';
import { loadConfig, CACHE_DIR } from './config.js';
import { scaffoldFumadocsApp } from './scaffold.js';

export async function dev(cwd: string = process.cwd()): Promise<void> {
  const config = loadConfig(cwd);
  const appDir = path.join(cwd, CACHE_DIR);

  scaffoldFumadocsApp(cwd, appDir, config);

  console.log('Starting dev server at http://localhost:3000 ...\n');

  const result = await execa('npx', ['next', 'dev'], {
    cwd: appDir,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'development' },
    reject: false,
  });

  process.exit(result.exitCode ?? 0);
}
