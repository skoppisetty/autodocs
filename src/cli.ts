import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { init } from './init.js';
import { generate } from './generate.js';
import { dev } from './dev.js';
import { build } from './build.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('autodocs')
  .description('AI-powered documentation generator — no API keys required')
  .version(pkg.version);

program
  .command('init')
  .description('Create config and starter docs/')
  .action(async () => {
    await init(process.cwd());
  });

program
  .command('generate')
  .description('Generate documentation from source code')
  .option('--force', 'Regenerate all files, even manually edited ones')
  .option('--cli <name>', 'Override AI CLI (claude, codex, gemini)')
  .action(async (opts) => {
    await generate({
      force: opts.force,
      cli: opts.cli,
      cwd: process.cwd(),
    });
  });

program
  .command('dev')
  .description('Start local preview server at localhost:3000')
  .action(async () => {
    await dev(process.cwd());
  });

program
  .command('build')
  .description('Build static site for deployment')
  .action(async () => {
    await build(process.cwd());
  });

program.parseAsync().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
