/**
 * Codebase scanner — extracts tech stack, structure, and status from an existing project.
 * Output supplements (never replaces) profile L0/L1/L3 data.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as child_process from 'node:child_process';
import type {
  ProfileL0Infra,
  ProfileL1Arch,
  ProfileL3Status,
  ScanResult,
  HasExistingCodeResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function walkFiles(dir: string, ignorePatterns: string[] = []): string[] {
  const results: string[] = [];

  function walk(current: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const rel = path.relative(dir, fullPath);

      const shouldIgnore = ignorePatterns.some(
        (p) => rel === p || rel.startsWith(p + path.sep) || entry.name === p
      );
      if (shouldIgnore) continue;

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

const DEFAULT_IGNORE = ['node_modules', '.git', 'dist', 'build', '.nopilot', 'coverage'];

// ---------------------------------------------------------------------------
// hasExistingCode
// ---------------------------------------------------------------------------

export function hasExistingCode(rootDir: string): HasExistingCodeResult {
  const indicators: string[] = [];

  const dependencyFiles = [
    'package.json',
    'go.mod',
    'Cargo.toml',
    'pyproject.toml',
    'requirements.txt',
    'Gemfile',
    'pom.xml',
    'build.gradle',
    'composer.json',
  ];

  // Check git history
  if (fs.existsSync(path.join(rootDir, '.git'))) {
    indicators.push('git_history');
  }

  // Check dependency files
  for (const file of dependencyFiles) {
    if (fs.existsSync(path.join(rootDir, file))) {
      indicators.push(file);
    }
  }

  return {
    hasCode: indicators.length > 0,
    indicators,
  };
}

// ---------------------------------------------------------------------------
// detectTechStack
// ---------------------------------------------------------------------------

export function detectTechStack(rootDir: string): Partial<ProfileL0Infra> {
  const result: Partial<ProfileL0Infra> = {
    languages: [],
    frameworks: [],
    package_manager: null,
    runtime: null,
    build_tools: [],
    ci: null,
    test_framework: null,
  };

  // Detect languages from common config files and extensions
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const buildTools = new Set<string>();

  // TypeScript / JavaScript
  if (fs.existsSync(path.join(rootDir, 'tsconfig.json'))) {
    languages.add('TypeScript');
    buildTools.add('tsc');
  }
  if (
    fs.existsSync(path.join(rootDir, 'package.json')) &&
    !languages.has('TypeScript')
  ) {
    languages.add('JavaScript');
  }

  // Go
  if (fs.existsSync(path.join(rootDir, 'go.mod'))) {
    languages.add('Go');
  }

  // Rust
  if (fs.existsSync(path.join(rootDir, 'Cargo.toml'))) {
    languages.add('Rust');
  }

  // Python
  if (
    fs.existsSync(path.join(rootDir, 'pyproject.toml')) ||
    fs.existsSync(path.join(rootDir, 'requirements.txt')) ||
    fs.existsSync(path.join(rootDir, 'setup.py'))
  ) {
    languages.add('Python');
  }

  // Ruby
  if (fs.existsSync(path.join(rootDir, 'Gemfile'))) {
    languages.add('Ruby');
  }

  // Java / Kotlin
  if (
    fs.existsSync(path.join(rootDir, 'pom.xml')) ||
    fs.existsSync(path.join(rootDir, 'build.gradle'))
  ) {
    languages.add('Java');
  }

  // Package manager (JS/TS)
  if (fs.existsSync(path.join(rootDir, 'pnpm-lock.yaml'))) {
    result.package_manager = 'pnpm';
  } else if (fs.existsSync(path.join(rootDir, 'yarn.lock'))) {
    result.package_manager = 'yarn';
  } else if (fs.existsSync(path.join(rootDir, 'bun.lockb'))) {
    result.package_manager = 'bun';
  } else if (fs.existsSync(path.join(rootDir, 'package-lock.json'))) {
    result.package_manager = 'npm';
  }

  // Frameworks from package.json
  const pkgJsonPath = path.join(rootDir, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        scripts?: Record<string, string>;
        engines?: Record<string, string>;
      };
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };

      if (allDeps['react']) frameworks.add('React');
      if (allDeps['vue'] || allDeps['@vue/core']) frameworks.add('Vue');
      if (allDeps['@angular/core']) frameworks.add('Angular');
      if (allDeps['next']) frameworks.add('Next.js');
      if (allDeps['nuxt']) frameworks.add('Nuxt');
      if (allDeps['svelte']) frameworks.add('Svelte');
      if (allDeps['express']) frameworks.add('Express');
      if (allDeps['fastify']) frameworks.add('Fastify');
      if (allDeps['hono']) frameworks.add('Hono');
      if (allDeps['commander']) frameworks.add('Commander');

      // Build tools
      if (allDeps['vite'] || allDeps['@vitejs/plugin-react']) buildTools.add('vite');
      if (allDeps['esbuild']) buildTools.add('esbuild');
      if (allDeps['webpack']) buildTools.add('webpack');
      if (allDeps['rollup']) buildTools.add('rollup');

      // Test framework
      if (allDeps['vitest']) {
        result.test_framework = 'vitest';
      } else if (allDeps['jest'] || allDeps['@jest/core']) {
        result.test_framework = 'jest';
      } else if (allDeps['mocha']) {
        result.test_framework = 'mocha';
      } else if (allDeps['@playwright/test']) {
        result.test_framework = 'playwright';
      }

      // Runtime from engines field
      if (pkg.engines?.['node']) {
        result.runtime = `Node.js ${pkg.engines['node']}`;
      }
    } catch {
      // ignore parse errors
    }
  }

  // Vite config
  if (
    fs.existsSync(path.join(rootDir, 'vite.config.ts')) ||
    fs.existsSync(path.join(rootDir, 'vite.config.js'))
  ) {
    buildTools.add('vite');
  }

  // CI detection
  if (fs.existsSync(path.join(rootDir, '.github', 'workflows'))) {
    const workflowFiles = fs.readdirSync(path.join(rootDir, '.github', 'workflows'));
    if (workflowFiles.length > 0) {
      result.ci = {
        provider: 'github-actions',
        config_path: `.github/workflows/${workflowFiles[0]}`,
      };
    }
  } else if (fs.existsSync(path.join(rootDir, '.gitlab-ci.yml'))) {
    result.ci = { provider: 'gitlab-ci', config_path: '.gitlab-ci.yml' };
  } else if (fs.existsSync(path.join(rootDir, 'Jenkinsfile'))) {
    result.ci = { provider: 'jenkins', config_path: 'Jenkinsfile' };
  } else if (fs.existsSync(path.join(rootDir, '.circleci', 'config.yml'))) {
    result.ci = { provider: 'circleci', config_path: '.circleci/config.yml' };
  }

  result.languages = Array.from(languages);
  result.frameworks = Array.from(frameworks);
  result.build_tools = Array.from(buildTools);

  return result;
}

// ---------------------------------------------------------------------------
// detectStructure
// ---------------------------------------------------------------------------

export function detectStructure(rootDir: string): Partial<ProfileL1Arch> {
  const directoryStructure: Record<string, string> = {};
  const modules: { name: string; path: string; responsibility: string }[] = [];

  // Top-level directory scan
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return {};
  }

  const KNOWN_DIR_DESCRIPTIONS: Record<string, string> = {
    src: 'Source code',
    lib: 'Library code',
    test: 'Tests',
    tests: 'Tests',
    __tests__: 'Tests',
    spec: 'Specs',
    docs: 'Documentation',
    scripts: 'Build/utility scripts',
    config: 'Configuration',
    public: 'Static assets',
    assets: 'Assets',
    dist: 'Build output',
    build: 'Build output',
    schemas: 'JSON Schema definitions',
    commands: 'CLI commands',
    workflow: 'Workflow definitions',
  };

  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      const desc = KNOWN_DIR_DESCRIPTIONS[entry.name] ?? 'Project directory';
      directoryStructure[`${entry.name}/`] = desc;
    }
  }

  // Detect modules from src/ subdirectories
  const srcDir = path.join(rootDir, 'src');
  if (fs.existsSync(srcDir)) {
    let srcEntries: fs.Dirent[];
    try {
      srcEntries = fs.readdirSync(srcDir, { withFileTypes: true });
    } catch {
      srcEntries = [];
    }

    for (const entry of srcEntries) {
      if (entry.isDirectory()) {
        modules.push({
          name: entry.name,
          path: `src/${entry.name}`,
          responsibility: KNOWN_DIR_DESCRIPTIONS[entry.name] ?? 'Module',
        });
      }
    }
  }

  return {
    directory_structure: directoryStructure,
    modules,
    dependency_directions: [],
    communication_patterns: [],
    design_patterns: [],
  };
}

// ---------------------------------------------------------------------------
// scanCodebase
// ---------------------------------------------------------------------------

export function scanCodebase(
  rootDir: string,
  config: { scanThresholdFiles?: number } = {}
): ScanResult {
  const threshold = config.scanThresholdFiles ?? 500;

  // Count files (excluding common noise)
  const files = walkFiles(rootDir, DEFAULT_IGNORE);
  const fileCount = files.length;
  const parallelized = fileCount > threshold;

  const l0Partial = detectTechStack(rootDir);
  const l1Partial = detectStructure(rootDir);

  // L3 partial: test coverage from test file count
  const testFiles = files.filter((f) => {
    const rel = path.relative(rootDir, f);
    return (
      rel.includes('__tests__') ||
      rel.includes('.test.') ||
      rel.includes('.spec.') ||
      rel.includes('/test/') ||
      rel.includes('/tests/')
    );
  });

  // Detect change hotspots via git log
  const changeHotspots: string[] = [];
  try {
    const result = child_process.execSync(
      'git log --name-only --format="" -100 | sort | uniq -c | sort -rn | head -10',
      { cwd: rootDir, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const lines = result.toString().trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 2) {
        const filePath = parts.slice(1).join(' ');
        const dir = path.dirname(filePath);
        if (dir !== '.' && !changeHotspots.includes(dir)) {
          changeHotspots.push(dir);
        }
      }
    }
  } catch {
    // Not a git repo or git not available — skip
  }

  const l3Partial: Partial<ProfileL3Status> = {
    test_coverage: {
      total_tests: testFiles.length,
      framework: l0Partial.test_framework ?? 'unknown',
    },
    change_hotspots: changeHotspots.slice(0, 5),
  };

  return {
    fileCount,
    parallelized,
    l0Partial,
    l1Partial,
    l3Partial,
  };
}
