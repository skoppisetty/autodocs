import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { AutodocsConfig } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getTemplateDir(): string {
  const candidates = [
    path.resolve(__dirname, '..', 'templates', 'fumadocs'),
    path.resolve(__dirname, '..', '..', 'templates', 'fumadocs'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
  }
  throw new Error(
    `Fumadocs template not found. Searched:\n` +
    candidates.map((d) => `  - ${d}`).join('\n') +
    `\nEnsure the autodocs package is installed correctly.`,
  );
}

function copyRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function depsChanged(appDir: string): boolean {
  const nodeModules = path.join(appDir, 'node_modules');
  if (!fs.existsSync(nodeModules)) return true;

  const lockfile = path.join(appDir, 'package-lock.json');
  if (!fs.existsSync(lockfile)) return true;

  const pkgPath = path.join(appDir, 'package.json');
  const pkgMtime = fs.statSync(pkgPath).mtimeMs;
  const lockMtime = fs.statSync(lockfile).mtimeMs;
  return pkgMtime > lockMtime;
}

export function scaffoldFumadocsApp(
  projectCwd: string,
  appDir: string,
  config: AutodocsConfig,
): void {
  const templateDir = getTemplateDir();

  fs.mkdirSync(appDir, { recursive: true });
  copyRecursive(templateDir, appDir);

  const docsSource = path.resolve(projectCwd, config.output);
  const docsDest = path.join(appDir, 'content', 'docs');

  fs.mkdirSync(path.dirname(docsDest), { recursive: true });

  try {
    const existing = fs.lstatSync(docsDest);
    if (existing.isSymbolicLink()) {
      fs.unlinkSync(docsDest);
    } else {
      fs.rmSync(docsDest, { recursive: true, force: true });
    }
  } catch {
    // docsDest doesn't exist yet — nothing to remove
  }

  try {
    fs.symlinkSync(docsSource, docsDest, 'dir');
  } catch {
    copyRecursive(docsSource, docsDest);
  }

  const globalCss = path.join(appDir, 'app', 'global.css');
  fs.writeFileSync(globalCss, [
    `@import 'tailwindcss';`,
    `@import 'fumadocs-ui/css/${config.theme}.css';`,
    `@import 'fumadocs-ui/css/preset.css';`,
    '',
  ].join('\n'));

  const needsInstall = depsChanged(appDir);
  if (needsInstall) {
    console.log('Installing documentation framework dependencies...');
    try {
      execSync('npm install --no-audit --no-fund', { cwd: appDir, stdio: 'inherit' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to install documentation framework: ${msg}`);
    }
  } else {
    try {
      execSync('npx fumadocs-mdx', { cwd: appDir, stdio: 'inherit' });
    } catch {
      // fumadocs-mdx regeneration is best-effort
    }
  }
}
