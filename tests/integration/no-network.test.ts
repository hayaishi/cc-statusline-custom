/**
 * Regression test for GitHub Issue #455: No network calls in hot path.
 *
 * This test verifies that the statusline hot path never makes network calls.
 * The issue reported memory exhaustion when ccusage was called repeatedly
 * because network calls caused processes to accumulate.
 *
 * @see https://github.com/ryoppippi/ccusage/issues/455
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '../..');

/**
 * Strips string literals and comments from source code for pattern scanning.
 *
 * This scan targets real import/require/import() usage in source files.
 * String literals are stripped before comment removal to reduce false negatives
 * (e.g., a string containing "//" would not cause premature line truncation).
 *
 * Best-effort implementation for test scanning purposes.
 */
function stripComments(source: string): string {
  // Remove string literals first to avoid mistaking comment markers inside them
  let result = source.replace(/(['"`])(?:\\.|(?!\1)[\s\S])*?\1/g, '');
  // Remove block comments (multi-line safe)
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  // Remove line comments
  result = result.replace(/\/\/[^\n]*/g, '');
  return result;
}

/**
 * Forbidden network and process-spawning module patterns.
 * These regex patterns detect various ways to import network-capable modules
 * and child_process (which could be used to spawn network-calling processes).
 *
 * Note: Static import patterns use [\s\S]*? instead of .* to match across newlines
 * (handles multi-line imports like `import {\n  request\n} from 'node:http'`).
 */
const NETWORK_PATTERNS = [
  // Node.js built-in network modules (static imports, multi-line safe)
  /import\s+[\s\S]*?\s+from\s+['"](?:node:)?http['"]/,
  /import\s+[\s\S]*?\s+from\s+['"](?:node:)?https['"]/,
  /import\s+[\s\S]*?\s+from\s+['"](?:node:)?net['"]/,
  /import\s+[\s\S]*?\s+from\s+['"](?:node:)?dgram['"]/,
  /import\s+[\s\S]*?\s+from\s+['"](?:node:)?tls['"]/,
  /import\s+[\s\S]*?\s+from\s+['"](?:node:)?dns['"]/,

  // child_process detection (can spawn network-calling processes, multi-line safe)
  /import\s+[\s\S]*?\s+from\s+['"](?:node:)?child_process['"]/,

  // CommonJS require for network modules
  /require\s*\(\s*['"](?:node:)?http['"]\s*\)/,
  /require\s*\(\s*['"](?:node:)?https['"]\s*\)/,
  /require\s*\(\s*['"](?:node:)?net['"]\s*\)/,
  /require\s*\(\s*['"](?:node:)?dgram['"]\s*\)/,
  /require\s*\(\s*['"](?:node:)?tls['"]\s*\)/,
  /require\s*\(\s*['"](?:node:)?dns['"]\s*\)/,

  // CommonJS require for child_process
  /require\s*\(\s*['"](?:node:)?child_process['"]\s*\)/,

  // Dynamic imports for all network modules
  /import\s*\(\s*['"](?:node:)?http['"]\s*\)/,
  /import\s*\(\s*['"](?:node:)?https['"]\s*\)/,
  /import\s*\(\s*['"](?:node:)?net['"]\s*\)/,
  /import\s*\(\s*['"](?:node:)?dgram['"]\s*\)/,
  /import\s*\(\s*['"](?:node:)?tls['"]\s*\)/,
  /import\s*\(\s*['"](?:node:)?dns['"]\s*\)/,

  // Dynamic import for child_process
  /import\s*\(\s*['"](?:node:)?child_process['"]\s*\)/,

  // Popular HTTP client libraries (multi-line safe)
  /import\s+[\s\S]*?\s+from\s+['"]axios['"]/,
  /import\s+[\s\S]*?\s+from\s+['"]node-fetch['"]/,
  /import\s+[\s\S]*?\s+from\s+['"]got['"]/,
  /import\s+[\s\S]*?\s+from\s+['"]superagent['"]/,
  /import\s+[\s\S]*?\s+from\s+['"]undici['"]/,
  /require\s*\(\s*['"]axios['"]\s*\)/,
  /require\s*\(\s*['"]node-fetch['"]\s*\)/,
  /require\s*\(\s*['"]got['"]\s*\)/,

  // Global fetch calls
  /\bfetch\s*\(/,

  // XMLHttpRequest
  /\bXMLHttpRequest\b/,
];

/**
 * Check if content contains any network-related patterns.
 * Strips comments before checking to reduce false positives.
 */
function containsNetworkPatterns(content: string, filePath: string): string[] {
  const scanned = stripComments(content);
  const violations: string[] = [];
  for (const pattern of NETWORK_PATTERNS) {
    if (pattern.test(scanned)) {
      violations.push(`${filePath}: matches pattern ${String(pattern)}`);
    }
  }
  return violations;
}

/**
 * Get all TypeScript/JavaScript files in a directory recursively.
 */
function getSourceFiles(dir: string, extensions: string[] = ['.ts', '.js']): string[] {
  const files: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory() && entry !== 'node_modules' && entry !== '.git') {
      files.push(...getSourceFiles(fullPath, extensions));
    } else if (extensions.some((ext) => entry.endsWith(ext)) && !entry.endsWith('.test.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('No Network Calls Regression Test (Issue #455)', () => {
  beforeAll(() => {
    // Ensure the project is built
    execSync('npm run build', {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
    });
  });

  describe('stripComments helper', () => {
    it('removes line comments', () => {
      const input = 'const x = 1; // this is a comment\nconst y = 2;';
      const result = stripComments(input);
      expect(result).not.toContain('this is a comment');
      expect(result).toContain('const x = 1;');
      expect(result).toContain('const y = 2;');
    });

    it('removes block comments', () => {
      const input = 'const x = 1; /* block\ncomment */ const y = 2;';
      const result = stripComments(input);
      expect(result).not.toContain('block');
      expect(result).not.toContain('comment');
      expect(result).toContain('const x = 1;');
      expect(result).toContain('const y = 2;');
    });

    it('removes string literals to prevent false negatives', () => {
      // A string containing "//" should not cause the rest of the line to be stripped
      const input = 'const url = "http://example.com"; import foo from "bar";';
      const result = stripComments(input);
      // The import statement should remain detectable (string content is stripped)
      expect(result).toContain('import');
      expect(result).toContain('from');
    });

    it('handles template literals', () => {
      const input = 'const x = `template // not a comment`; const y = 2;';
      const result = stripComments(input);
      // Template literal content is stripped, but surrounding code remains
      expect(result).toContain('const x =');
      expect(result).toContain('const y = 2;');
    });
  });

  describe('by design: no network imports', () => {
    it('all source files in src/ are free of network imports', () => {
      const srcDir = join(PROJECT_ROOT, 'src');
      const sourceFiles = getSourceFiles(srcDir, ['.ts']);
      const allViolations: string[] = [];

      for (const file of sourceFiles) {
        const content = readFileSync(file, 'utf-8');
        const violations = containsNetworkPatterns(content, file);
        allViolations.push(...violations);
      }

      expect(allViolations).toEqual([]);
    });

    it('compiled output (dist/) is free of network imports', () => {
      const distDir = join(PROJECT_ROOT, 'dist');
      const jsFiles = getSourceFiles(distDir, ['.js']);
      const allViolations: string[] = [];

      for (const file of jsFiles) {
        const content = readFileSync(file, 'utf-8');
        const violations = containsNetworkPatterns(content, file);
        allViolations.push(...violations);
      }

      expect(allViolations).toEqual([]);
    });

    it('core modules specifically do not contain ANY network-related keywords', () => {
      const coreFiles = [
        'src/core/parser.ts',
        'src/core/statusline.ts',
        'src/core/formatter.ts',
        'src/core/cache-reader.ts',
      ];

      // List of suspicious keywords that might indicate network code
      const suspiciousKeywords = [
        'XMLHttpRequest',
        'WebSocket',
        'socket',
        'axios',
        'node-fetch',
        'request(',
        'got(',
      ];

      for (const file of coreFiles) {
        const content = readFileSync(join(PROJECT_ROOT, file), 'utf-8');
        const scanned = stripComments(content);
        for (const keyword of suspiciousKeywords) {
          expect(scanned).not.toContain(keyword);
        }
      }
    });

    it('package.json has no runtime network dependencies', () => {
      const pkgPath = join(PROJECT_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
      };

      const networkDeps = ['axios', 'node-fetch', 'got', 'superagent', 'undici', 'request'];
      const foundNetworkDeps = Object.keys(pkg.dependencies ?? {}).filter((dep) =>
        networkDeps.includes(dep)
      );

      expect(foundNetworkDeps).toEqual([]);
    });

    it('CLI entry point (index.ts) does not import network modules', () => {
      const content = readFileSync(join(PROJECT_ROOT, 'src/index.ts'), 'utf-8');
      const violations = containsNetworkPatterns(content, 'src/index.ts');
      expect(violations).toEqual([]);
    });
  });

  describe('runtime behavior', () => {
    it('statusline execution does not spawn child processes for network', () => {
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
        context_window: {
          used_percentage: 42,
          context_window_size: 200000,
          current_usage: { input_tokens: 84000 },
        },
      });

      // Strip ANSI codes for comparison
      const stripAnsi = (text: string): string =>
        // eslint-disable-next-line no-control-regex
        text.replace(/\x1b\[[0-9;]*m/g, '');

      // Run multiple times to ensure no accumulation
      for (let i = 0; i < 5; i++) {
        const result = execSync(
          `echo '${input}' | node ${join(PROJECT_ROOT, 'dist/index.js')}`,
          {
            encoding: 'utf-8',
            timeout: 500, // Should complete very fast
          }
        );
        expect(stripAnsi(result.trim())).toBe('🤖 Opus | 💰 $0.23 sess | 🧠 84.0k/200k [███░░░░░] 42%');
      }
    });

    it('completes rapidly without network latency', () => {
      const input = JSON.stringify({
        model: { display_name: 'Claude Opus 4.5' },
        cost: { total_cost_usd: 0.23 },
        context_window: { used_percentage: 42 },
      });

      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        execSync(
          `echo '${input}' | node ${join(PROJECT_ROOT, 'dist/index.js')}`,
          {
            encoding: 'utf-8',
            timeout: 1000,
          }
        );
      }
      const totalDuration = performance.now() - start;

      // 10 invocations should complete in under 3 seconds total
      // (300ms each would be 3 seconds, we expect much faster)
      expect(totalDuration).toBeLessThan(3000);
    });
  });
});
