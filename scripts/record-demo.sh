#!/bin/bash
# Record an asciinema demo of autodocs
# Run this from a clean temp directory:
#   mkdir /tmp/demo-project && cd /tmp/demo-project
#   bash /Volumes/Code/cueframe/autodocs/scripts/record-demo.sh

set -e

# Create a minimal project to demo with
mkdir -p src
cat > src/index.ts << 'TS'
export function greet(name: string): string {
  return `Hello, ${name}!`;
}

export function add(a: number, b: number): number {
  return a + b;
}
TS
echo '# My Project' > README.md
git init && git add -A && git commit -m "init" -q

echo ""
echo "=== Starting asciinema recording ==="
echo "Run these commands manually (for natural pacing):"
echo ""
echo "  npx @cueframe/autodocs init"
echo "  npx @cueframe/autodocs generate"
echo "  npx @cueframe/autodocs dev"
echo ""
echo "Then Ctrl+C the dev server and Ctrl+D to stop recording."
echo ""

asciinema rec autodocs-demo.cast \
  --title "autodocs — AI-powered docs generator" \
  --idle-time-limit 3
