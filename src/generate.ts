import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import Module from 'node:module';
import { spawnSync } from 'node:child_process';
import { execa } from 'execa';
import picomatch from 'picomatch';
import ora from 'ora';
import { loadConfig, CACHE_DIR } from './config.js';

export interface GenerateOptions {
  force?: boolean;
  cli?: string;
  cwd?: string;
}

const VALID_CLI_NAMES = new Set(['claude', 'codex', 'gemini']);

const SUPPRESSED_ERRORS = [
  'Cancelled:',
  'does not exist',
  'ENOENT',
  'has not been read yet',
];

function isSuppressedError(msg: string): boolean {
  return SUPPRESSED_ERRORS.some((pattern) => msg.includes(pattern));
}

function buildSkillPrompt(cwd: string): string {
  const skillPath = path.join(cwd, '.autodocs', 'skill.md');
  if (fs.existsSync(skillPath)) {
    return fs.readFileSync(skillPath, 'utf-8');
  }
  return getBuiltinSkill();
}

function getBuiltinSkill(): string {
  const candidates = [
    path.resolve(import.meta.dirname, '..', 'skill', 'SKILL.md'),
    path.resolve(import.meta.dirname, '..', '..', 'skill', 'SKILL.md'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
  }
  throw new Error('Built-in SKILL.md not found');
}

function findCliAgentsBinary(): string {
  const envPath = process.env.AUTODOCS_CLI_AGENTS_PATH;
  if (envPath) {
    if (!fs.existsSync(envPath)) throw new Error(`AUTODOCS_CLI_AGENTS_PATH set but not found: ${envPath}`);
    return envPath;
  }

  try {
    const require = Module.createRequire(import.meta.url);
    const { binaryPath } = require('@cueframe/cli-agents') as { binaryPath: () => string };
    return binaryPath();
  } catch {
    // fallback to PATH
  }

  const which = spawnSync('which', ['cli-agents'], { encoding: 'utf-8' });
  if (which.status === 0) return which.stdout.trim();

  throw new Error(
    'cli-agents binary not found.\n' +
    'Install: npm install @cueframe/cli-agents\n' +
    'Or:      cargo install cli-agents',
  );
}

// ── Cache helpers ──

const CACHE_SUBDIR = path.join(CACHE_DIR, 'cache');

interface SourceCache {
  hashes: Record<string, string>;
}

function getCacheDir(cwd: string): string {
  const dir = path.join(cwd, CACHE_SUBDIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

function hashSourceFiles(cwd: string, include: string[], exclude: string[]): Record<string, string> {
  const isIncluded = picomatch(include);
  const isExcluded = exclude.length > 0 ? picomatch(exclude) : () => false;
  const hashes: Record<string, string> = {};

  function walk(dir: string, rel: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== 'target' && entry.name !== 'dist') {
          walk(fullPath, relPath);
        }
      } else if (isIncluded(relPath) && !isExcluded(relPath)) {
        hashes[relPath] = hashFile(fullPath);
      }
    }
  }

  walk(cwd, '');
  return hashes;
}

function loadSourceCache(cwd: string): SourceCache | null {
  const cachePath = path.join(getCacheDir(cwd), 'source-cache.json');
  if (!fs.existsSync(cachePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  } catch {
    return null;
  }
}

function saveSourceCache(cwd: string, cache: SourceCache): void {
  const cachePath = path.join(getCacheDir(cwd), 'source-cache.json');
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

function buildExistingDocsContext(outputDir: string): string {
  const pages: string[] = [];

  function walk(dir: string, rel: string) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else if (entry.name.endsWith('.mdx')) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        const frontmatter = frontmatterMatch ? frontmatterMatch[1] : '';
        const isGenerated = frontmatter.includes('generated: true');
        pages.push(`- ${relPath} (${isGenerated ? 'generated' : 'manual'}): ${frontmatter.match(/title: (.+)/)?.[1] || 'untitled'}`);
      }
    }
  }

  walk(outputDir, '');
  if (pages.length === 0) return '';
  return `Existing documentation pages:\n${pages.join('\n')}`;
}

export async function generate(opts: GenerateOptions = {}): Promise<void> {
  const cwd = opts.cwd || process.cwd();
  const config = loadConfig(cwd);

  const outputDir = path.resolve(cwd, config.output);
  fs.mkdirSync(outputDir, { recursive: true });

  if (config.sections) {
    for (const dir of config.sections) {
      fs.mkdirSync(path.join(outputDir, dir), { recursive: true });
    }
  }

  const binaryPath = findCliAgentsBinary();
  const skill = buildSkillPrompt(cwd);

  // ── Change detection via source hashing ──
  const currentHashes = hashSourceFiles(cwd, config.include, config.exclude);
  const cachedState = opts.force ? null : loadSourceCache(cwd);
  let changedFiles: string[] | null = null;
  let isFullGeneration = true;

  if (cachedState) {
    changedFiles = Object.keys(currentHashes).filter(
      (f) => currentHashes[f] !== cachedState.hashes[f],
    );
    const deletedFiles = Object.keys(cachedState.hashes).filter(
      (f) => !(f in currentHashes),
    );
    if (deletedFiles.length > 0) changedFiles.push(...deletedFiles);

    if (changedFiles.length === 0) {
      console.log('No source files changed since last generation. Use --force to regenerate.');
      return;
    }
    isFullGeneration = false;
    console.log(`${changedFiles.length} file(s) changed since last generation.\n`);
  }

  // ── Build context sections ──
  const configSummary = [
    `Output directory: ${config.output}/`,
    `Include patterns: ${config.include.join(', ')}`,
    `Exclude patterns: ${config.exclude.join(', ')}`,
    config.sections ? `Pre-created sections: ${config.sections.join(', ')} (these directories already exist, you can write directly into them)` : '',
    config.instructions ? `Additional instructions: ${config.instructions}` : '',
  ].filter(Boolean).join('\n');

  const existingDocs = buildExistingDocsContext(outputDir);

  let changeContext: string;
  if (opts.force) {
    changeContext = 'FORCE MODE: Regenerate ALL documentation from scratch. For existing files, Read them first (required by the Write tool), then overwrite with new content. Only read SOURCE code files for understanding — read doc files only to satisfy the Write tool requirement.';
  } else if (changedFiles && !isFullGeneration) {
    changeContext = [
      `The following source files changed since the last documentation generation:`,
      ...changedFiles.map((f) => `  - ${f}`),
      '',
      'Only update documentation pages affected by these changes. Read the changed files to understand what changed, then update the relevant doc pages. Leave unaffected pages alone.',
    ].join('\n');
  } else {
    changeContext = 'Generate complete documentation for this project.';
  }

  const task = [
    skill,
    '',
    '---',
    '',
    `Project root: ${cwd}`,
    configSummary,
    '',
    existingDocs,
    '',
    changeContext,
    '',
    isFullGeneration
      ? 'Now read the source code and generate the documentation.'
      : 'Now read the changed files and update the documentation.',
  ].filter(Boolean).join('\n');

  const appendPrompt = 'RULE: Before writing ANY file to a subdirectory, you MUST create the directory first with `mkdir -p <dir>`. The Write tool does NOT create parent directories and WILL fail if the directory does not exist. Always run mkdir -p before Write when the target directory might not exist.';

  const args = ['--json', '--skip-permissions', '--append-system-prompt', appendPrompt, '--cwd', cwd, task];
  if (opts.cli && VALID_CLI_NAMES.has(opts.cli)) {
    args.unshift('--cli', opts.cli);
  }

  const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
  const spinner = ora({ text: 'Starting...', discardStdin: false }).start();
  const writtenFiles = new Set<string>();
  let thinkingBuf = '';

  function flushThinking() {
    if (!thinkingBuf.trim()) return;
    for (const line of thinkingBuf.trim().split('\n')) {
      if (line.trim()) {
        spinner.stopAndPersist({ symbol: dim('>'), text: dim(line.trim()) });
      }
    }
    thinkingBuf = '';
    spinner.start();
  }

  // execa handles signal propagation, cleanup, and subprocess termination.
  // cancelSignal lets us abort cleanly; execa kills the subprocess on cancel.
  const abortController = new AbortController();
  const subprocess = execa(binaryPath, args, {
    cwd,
    cancelSignal: abortController.signal,
    gracefulCancel: true,
    lines: true,
    reject: false,
  });

  let finalResult: { success: boolean; stats?: Record<string, number>; costUsd?: number } | undefined;

  // execa's iterable stdout streams lines and properly yields to signal handlers
  for await (const line of subprocess) {
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    const type = event.type as string;

    if (type === 'thinking_delta') {
      thinkingBuf += String(event.text ?? '');
    } else if (type === 'tool_start') {
      flushThinking();
      const name = String(event.toolName ?? '');
      const eventArgs = (event.args ?? {}) as Record<string, unknown>;
      const filePath = eventArgs?.file_path ?? eventArgs?.path ?? '';
      const label = String(filePath).replace(cwd + '/', '');

      if (name === 'Write' || name === 'Edit') {
        if (label && !writtenFiles.has(label)) {
          spinner.stopAndPersist({ symbol: '\x1b[32m\u2713\x1b[0m', text: label });
          writtenFiles.add(label);
        }
        spinner.start('Writing...');
      } else if (name === 'Read' || name === 'Glob' || name === 'Grep') {
        spinner.text = label ? `Reading ${label}` : 'Reading...';
      } else if (name === 'Bash') {
        const cmd = String(eventArgs?.command ?? '').split('\n')[0];
        spinner.text = cmd ? `Running ${cmd.substring(0, 60)}` : 'Running...';
      } else {
        spinner.text = name ? `${name}...` : 'Working...';
      }
    } else if (type === 'tool_end') {
      if (!event.success && event.error) {
        const err = String(event.error);
        if (!isSuppressedError(err)) {
          spinner.stopAndPersist({ symbol: '\x1b[31m\u2717\x1b[0m', text: err.substring(0, 120) });
          spinner.start();
        }
      }
    } else if (type === 'error') {
      spinner.stopAndPersist({ symbol: '\x1b[31m\u2717\x1b[0m', text: String(event.message ?? 'Unknown error') });
      spinner.start();
    } else if (type === 'done') {
      flushThinking();
      const result = event.result as Record<string, unknown> | undefined;
      if (result) {
        finalResult = {
          success: !!result.success,
          stats: result.stats as Record<string, number> | undefined,
          costUsd: typeof result.cost_usd === 'number' ? result.cost_usd : undefined,
        };
      }
    }
  }

  const result = await subprocess;

  if (finalResult?.success || result.exitCode === 0) {
    saveSourceCache(cwd, { hashes: currentHashes });
    const parts = [`${writtenFiles.size} files`];
    if (finalResult?.stats?.duration_ms) parts.push(`${Math.round(finalResult.stats.duration_ms / 1000)}s`);
    if (finalResult?.costUsd) parts.push(`$${finalResult.costUsd.toFixed(2)}`);
    spinner.succeed(`Done \u2014 ${parts.join(' \u00b7 ')}`);
  } else if (result.isCanceled) {
    spinner.warn('Cancelled.');
  } else {
    spinner.fail('Generation failed.');
    const stderr = Array.isArray(result.stderr) ? result.stderr.join('\n') : result.stderr;
    if (stderr) throw new Error(stderr);
    throw new Error('Generation failed.');
  }
}
