import fs from 'node:fs';
import path from 'node:path';
import picomatch from 'picomatch';

export const CONFIG_FILENAME = 'autodocs.config.json';
export const OUTPUT_DEFAULT = 'docs';
export const CACHE_DIR = '.autodocs';

export const VALID_THEMES = [
  'black', 'neutral', 'vitepress', 'dusk', 'catppuccin',
  'ocean', 'purple', 'solar', 'emerald', 'ruby', 'aspen',
] as const;

export type Theme = typeof VALID_THEMES[number];

export interface AutodocsConfig {
  output: string;
  include: string[];
  exclude: string[];
  theme: Theme;
  title?: string;
  github?: { user: string; repo: string; branch?: string };
  instructions?: string;
}

const DEFAULT_CONFIG: AutodocsConfig = {
  output: OUTPUT_DEFAULT,
  include: ['src/**'],
  exclude: ['**/test*', '**/bench*', '**/target/**', '**/node_modules/**', '**/dist/**'],
  theme: 'black',
};

export function getConfigPath(cwd: string): string {
  return path.join(cwd, CONFIG_FILENAME);
}

export function loadConfig(cwd: string): AutodocsConfig {
  const configPath = getConfigPath(cwd);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}\nRun "autodocs init" first.`);
  }
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    throw new Error(`Invalid JSON in ${configPath}. Fix or delete the file and run "autodocs init".`);
  }
  const config: AutodocsConfig = { ...DEFAULT_CONFIG, ...raw };
  validateGlobs('include', config.include, configPath);
  validateGlobs('exclude', config.exclude, configPath);
  if (!VALID_THEMES.includes(config.theme as Theme)) {
    throw new Error(
      `Invalid theme "${config.theme}" in ${configPath}.\n` +
      `Valid themes: ${VALID_THEMES.join(', ')}`,
    );
  }
  return config;
}

function validateGlobs(field: string, patterns: string[], configPath: string): void {
  for (const pattern of patterns) {
    try {
      picomatch(pattern);
    } catch {
      throw new Error(`Invalid glob in "${field}": "${pattern}" (in ${configPath})`);
    }
  }
}

export function createDefaultConfig(): AutodocsConfig {
  return { ...DEFAULT_CONFIG };
}

export function writeConfig(cwd: string, config: AutodocsConfig): void {
  const configPath = getConfigPath(cwd);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}
