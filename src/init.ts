import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createDefaultConfig, writeConfig, getConfigPath, CONFIG_FILENAME } from './config.js';

const STARTER_INDEX = `---
title: Welcome
description: Project documentation
generated: true
---

## Welcome

This documentation was generated with [autodocs](https://github.com/cueframe/autodocs).

Run \`npx autodocs generate\` to generate documentation from your source code.
`;

const STARTER_META = `{
  "title": "Documentation",
  "pages": ["index", "..."]
}
`;

export async function init(cwd: string): Promise<void> {
  const nodeVersion = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeVersion < 18) {
    throw new Error(`Node >= 18 required (found ${process.versions.node})`);
  }

  const cliNames = ['claude', 'codex', 'gemini'] as const;
  const found: { name: string; path: string }[] = [];
  for (const name of cliNames) {
    const result = spawnSync('which', [name], { encoding: 'utf-8' });
    if (result.status === 0) found.push({ name, path: result.stdout.trim() });
  }

  if (found.length === 0) {
    throw new Error(
      'No AI CLIs found. Install one of:\n' +
      '  claude  → npm install -g @anthropic-ai/claude-code\n' +
      '  codex   → npm install -g @openai/codex\n' +
      '  gemini  → npm install -g @google/gemini-cli',
    );
  }

  for (const cli of found) {
    console.log(`\u2713 Found ${cli.name} CLI at ${cli.path}`);
  }

  const hasTree = spawnSync('which', ['tree'], { encoding: 'utf-8' }).status === 0;
  if (!hasTree) {
    console.log('\n  Optional: install "tree" for better codebase exploration');
    console.log('    brew install tree    (macOS)');
    console.log('    apt install tree     (Linux)\n');
  }

  const configPath = getConfigPath(cwd);
  if (fs.existsSync(configPath)) {
    console.log(`\u2713 ${CONFIG_FILENAME} already exists`);
  } else {
    writeConfig(cwd, createDefaultConfig());
    console.log(`\u2713 Created ${CONFIG_FILENAME}`);
  }

  const docsDir = path.join(cwd, 'docs');
  fs.mkdirSync(docsDir, { recursive: true });

  const indexPath = path.join(docsDir, 'index.mdx');
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, STARTER_INDEX);
    console.log('\u2713 Created docs/index.mdx');
  } else {
    console.log('\u2713 docs/index.mdx already exists');
  }

  const metaPath = path.join(docsDir, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    fs.writeFileSync(metaPath, STARTER_META);
    console.log('\u2713 Created docs/meta.json');
  }

  // Add .autodocs to .gitignore if not already there
  const gitignorePath = path.join(cwd, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (!content.includes('.autodocs')) {
      fs.appendFileSync(gitignorePath, '\n# autodocs build cache\n.autodocs/\n');
      console.log('\u2713 Added .autodocs/ to .gitignore');
    }
  }

  console.log('\nNext steps:');
  console.log('  npx autodocs generate       # Generate docs');
  console.log('  npx autodocs dev             # Preview at localhost:3000');
}
