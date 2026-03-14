import fs from 'node:fs';
import path from 'node:path';
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
const COMMIT_SHA_RE = /^[0-9a-f]{4,40}$/;

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
    const { binaryPath } = require('@cueframe/cli-agents') as { binaryPath: () => string };
    return binaryPath();
  } catch {
    // fallback to PATH for cargo-install users
  }

  const which = spawnSync('which', ['cli-agents'], { encoding: 'utf-8' });
  if (which.status === 0) return which.stdout.trim();

  throw new Error(
    'cli-agents binary not found.\n' +
    'Install: npm install @cueframe/cli-agents\n' +
    'Or:      cargo install cli-agents',
  );
}

const GIT_TIMEOUT_MS = Number(process.env.AUTODOCS_GIT_TIMEOUT_MS) || 30_000;

function gitSpawn(cwd: string, args: string[]): string | null {
  const result = spawnSync('git', args, { cwd, encoding: 'utf-8', timeout: GIT_TIMEOUT_MS });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function getLastGenCommit(cwd: string): string | null {
  const markerPath = path.join(cwd, CACHE_DIR, 'last-gen-commit');
  if (!fs.existsSync(markerPath)) return null;
  const value = fs.readFileSync(markerPath, 'utf-8').trim();
  if (!COMMIT_SHA_RE.test(value)) return null;
  return value;
}

function saveLastGenCommit(cwd: string): void {
  const commit = gitSpawn(cwd, ['rev-parse', 'HEAD']);
  if (!commit) return;
  const dir = path.join(cwd, CACHE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'last-gen-commit'), commit + '\n');
}

function getChangedFiles(cwd: string, sinceCommit: string, include: string[], exclude: string[]): string[] | null {
  const committedRaw = gitSpawn(cwd, ['diff', '--name-only', sinceCommit, 'HEAD']);
  const uncommittedRaw = gitSpawn(cwd, ['diff', '--name-only', 'HEAD']);

  if (committedRaw === null && uncommittedRaw === null) return null;

  const allChanged = new Set<string>();
  for (const raw of [committedRaw, uncommittedRaw]) {
    if (raw) {
      for (const line of raw.split('\n')) {
        if (line) allChanged.add(line);
      }
    }
  }

  const isIncluded = picomatch(include);
  const isExcluded = exclude.length > 0 ? picomatch(exclude) : () => false;

  return [...allChanged].filter((file) => isIncluded(file) && !isExcluded(file));
}

export async function generate(opts: GenerateOptions = {}): Promise<void> {
  const cwd = opts.cwd || process.cwd();
  const config = loadConfig(cwd);

  const outputDir = path.resolve(cwd, config.output);
  fs.mkdirSync(outputDir, { recursive: true });

  const binaryPath = findCliAgentsBinary();
  const skill = buildSkillPrompt(cwd);

  let changeContext = '';
  let isFullGeneration = true;

  if (!opts.force) {
    const lastCommit = getLastGenCommit(cwd);
    if (lastCommit) {
      const changed = getChangedFiles(cwd, lastCommit, config.include, config.exclude);
      if (changed && changed.length === 0) {
        console.log('No source files changed since last generation. Use --force to regenerate.');
        return;
      }
      if (changed && changed.length > 0) {
        isFullGeneration = false;
        changeContext = [
          `The following source files changed since the last documentation generation:`,
          ...changed.map((f) => `  - ${f}`),
          '',
          'Only update documentation pages affected by these changes. Read the changed files to understand what changed, then update the relevant doc pages. Leave unaffected pages alone.',
        ].join('\n');
        console.log(`${changed.length} file(s) changed since last generation.\n`);
      }
    }
  }

  const configSummary = [
    `Output directory: ${config.output}/`,
    `Include patterns: ${config.include.join(', ')}`,
    `Exclude patterns: ${config.exclude.join(', ')}`,
    config.instructions ? `Additional instructions: ${config.instructions}` : '',
  ].filter(Boolean).join('\n');

  const task = [
    skill,
    '',
    '---',
    '',
    `Project root: ${cwd}`,
    configSummary,
    '',
    changeContext || (opts.force
      ? 'FORCE MODE: Regenerate ALL documentation from scratch. Do NOT read existing doc files — just overwrite them. Ignore the `generated: true` check. Only read SOURCE code files.'
      : 'Generate complete documentation for this project.'),
    '',
    'Now read the source code and generate the documentation.',
  ].filter(Boolean).join('\n');

  const args = ['--json', '--skip-permissions', '--cwd', cwd, task];
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
    if (isFullGeneration) {
      saveLastGenCommit(cwd);
    }
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
