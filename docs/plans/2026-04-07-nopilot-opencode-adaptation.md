# NoPilot OpenCode 适配实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 OpenCode 从 experimental 提升为 active 状态，使其与 Codex 共享 `~/.agents/skills/` 目录，支持 `nopilot init` 自动安装技能。

**Architecture:** 修改平台注册表配置，添加安装去重逻辑，更新 CLI 输出，补充测试覆盖。

**Tech Stack:** TypeScript, vitest, Node.js

---

## 文件结构

| 文件 | 责任 |
|------|------|
| `src/skill-engine/platform-registry.ts` | 平台配置注册表 |
| `src/skill-engine/skill-installer.ts` | 技能安装逻辑（含去重） |
| `src/nopilot-cli.ts` | CLI 命令实现 |
| `src/skill-engine/__tests__/platform-registry.test.ts` | 注册表单元测试 |
| `src/skill-engine/__tests__/skill-installer.test.ts` | 安装器单元测试 |
| `tests/nopilot-cli.test.ts` | CLI 集成测试 |

---

### Task 1: 更新 platform-registry.ts 配置

**Files:**
- Modify: `src/skill-engine/platform-registry.ts:40-45`

- [ ] **Step 1: 修改 opencode 平台配置**

```typescript
  {
    name: 'opencode',
    status: 'active',
    skillsDir: `${home}/.agents/skills/`,
    legacyDir: null,
    placeholderMap: {
      CRITIC_PATH: `${home}/.agents/skills/critic/SKILL.md`,
      SUPERVISOR_PATH: `${home}/.agents/skills/supervisor/SKILL.md`,
    },
  },
```

- [ ] **Step 2: 编译检查**

Run: `pnpm build`
Expected: 编译成功

- [ ] **Step 3: Commit**

```bash
git add src/skill-engine/platform-registry.ts
git commit -m "feat: enable opencode as active platform sharing .agents/skills with codex"
```

---

### Task 2: 添加 skill-installer.ts 去重逻辑

**Files:**
- Modify: `src/skill-engine/skill-installer.ts:80-124`

- [ ] **Step 1: 修改 installAllPlatforms 添加去重**

```typescript
export function installAllPlatforms(
  sourceDir: string,
  force: boolean,
  platforms?: PlatformAdapter[],
): InstallResult[] {
  const activePlatforms = platforms ?? getActivePlatforms();
  const results: InstallResult[] = [];
  const installedDirs = new Set<string>();

  for (const platform of activePlatforms) {
    const result: InstallResult = {
      platform: platform.name,
      success: true,
      filesWritten: 0,
      errors: [],
    };

    // Skip if this skillsDir was already installed by a previous platform
    if (installedDirs.has(platform.skillsDir)) {
      results.push(result);
      continue;
    }

    try {
      const skills = scanSourceSkills(sourceDir);

      for (const skill of skills) {
        if (skill.type === 'directory') {
          for (const relFile of skill.files) {
            const srcFile = path.join(skill.sourcePath, relFile);
            const destFile = path.join(platform.skillsDir, skill.name, relFile);
            writeRenderedFile(srcFile, destFile, platform, result);
            if (!result.success) break;
          }
        } else {
          const srcFile = skill.sourcePath;
          const destFile = path.join(platform.skillsDir, skill.name, 'SKILL.md');
          writeRenderedFile(srcFile, destFile, platform, result);
        }

        if (!result.success) break;
      }

      installedDirs.add(platform.skillsDir);
    } catch (err) {
      result.success = false;
      result.errors.push((err as Error).message);
    }

    results.push(result);
  }

  return results;
}
```

- [ ] **Step 2: 编译检查**

Run: `pnpm build`
Expected: 编译成功

- [ ] **Step 3: Commit**

```bash
git add src/skill-engine/skill-installer.ts
git commit -m "feat: add deduplication logic for platforms sharing skillsDir"
```

---

### Task 3: 更新 nopilot-cli.ts 输出逻辑

**Files:**
- Modify: `src/nopilot-cli.ts:108-115`

- [ ] **Step 1: 读取当前代码上下文**

Read: `src/nopilot-cli.ts:95-120`

- [ ] **Step 2: 修改输出逻辑**

```typescript
    if (existsSync(sourceDir)) {
      const results = installAllPlatforms(sourceDir, force, platformsWithVersion);
      for (const result of results) {
        if (!result.success) {
          console.error(`Failed to install skills for ${result.platform}: ${result.errors.join(', ')}`);
        } else if (result.filesWritten === 0) {
          // Skipped platform (shares directory with another)
          const skippedPlatform = getPlatform(result.platform);
          const sharedWith = platformsWithVersion.find(
            p => p.name !== result.platform && p.skillsDir === skippedPlatform?.skillsDir,
          );
          console.log(`Skipped ${result.platform} (shares skill directory with ${sharedWith?.name})`);
        } else {
          console.log(`Installed ${result.filesWritten} skill file(s) for ${result.platform}`);
        }
      }
    }
```

- [ ] **Step 3: 编译检查**

Run: `pnpm build`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add src/nopilot-cli.ts
git commit -m "feat: update CLI output to show skipped platforms sharing directories"
```

---

### Task 4: 更新 platform-registry.test.ts

**Files:**
- Modify: `src/skill-engine/__tests__/platform-registry.test.ts:16-25`
- Add: `src/skill-engine/__tests__/platform-registry.test.ts:68-72` (new test after TEST-015)

- [ ] **Step 1: 更新 TEST-011**

```typescript
  it('TEST-011: returns claude, codex, and opencode (active platforms)', () => {
    const active = getActivePlatforms();
    const names = active.map((p) => p.name);
    expect(names).toContain('claude');
    expect(names).toContain('codex');
    expect(names).toContain('opencode');
    expect(names).not.toContain('gemini');
    expect(active.every((p) => p.status === 'active')).toBe(true);
    expect(active).toHaveLength(3);
  });
```

- [ ] **Step 2: 添加 TEST-016（原 TEST-015 后）**

```typescript
  it('TEST-016: returns correct config for opencode', () => {
    const platform = getPlatform('opencode');
    expect(platform).toBeDefined();
    expect(platform!.name).toBe('opencode');
    expect(platform!.status).toBe('active');
    expect(platform!.skillsDir).toBe(`${home}/.agents/skills/`);
    expect(platform!.legacyDir).toBeNull();
    expect(platform!.placeholderMap['CRITIC_PATH']).toBe(
      `${home}/.agents/skills/critic/SKILL.md`,
    );
    expect(platform!.placeholderMap['SUPERVISOR_PATH']).toBe(
      `${home}/.agents/skills/supervisor/SKILL.md`,
    );
  });
```

- [ ] **Step 3: 重编号后续测试（TEST-015 → TEST-017, 等）**

- [ ] **Step 4: 运行测试**

Run: `pnpm test src/skill-engine/__tests__/platform-registry.test.ts`
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add src/skill-engine/__tests__/platform-registry.test.ts
git commit -m "test: update platform-registry tests for opencode as active platform"
```

---

### Task 5: 添加 skill-installer.test.ts 去重测试

**Files:**
- Modify: `src/skill-engine/__tests__/skill-installer.test.ts` (add after TEST-023)

- [ ] **Step 1: 添加 TEST-024**

```typescript
// ---------------------------------------------------------------------------
// TEST-024: installAllPlatforms skips platforms sharing skillsDir
// ---------------------------------------------------------------------------

describe('installAllPlatforms — shared directory deduplication', () => {
  it('TEST-024: skips installation for second platform sharing same skillsDir', () => {
    const sourceDir = path.join(tmpDir, 'source');
    const sharedSkillsDir = path.join(tmpDir, 'shared-skills');

    writeFile(path.join(sourceDir, 'simple.md'), '# Simple');

    const platforms: PlatformAdapter[] = [
      makePlatform('codex', sharedSkillsDir, {}),
      makePlatform('opencode', sharedSkillsDir, {}),
    ];

    const results = installAllPlatforms(sourceDir, false, platforms);

    expect(results).toHaveLength(2);

    // First platform installs
    expect(results[0].platform).toBe('codex');
    expect(results[0].success).toBe(true);
    expect(results[0].filesWritten).toBe(1);

    // Second platform skipped
    expect(results[1].platform).toBe('opencode');
    expect(results[1].success).toBe(true);
    expect(results[1].filesWritten).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `pnpm test src/skill-engine/__tests__/skill-installer.test.ts`
Expected: 所有测试通过

- [ ] **Step 3: Commit**

```bash
git add src/skill-engine/__tests__/skill-installer.test.ts
git commit -m "test: add TEST-024 for shared directory deduplication"
```

---

### Task 6: 更新 nopilot-cli.test.ts

**Files:**
- Modify: `tests/nopilot-cli.test.ts:74-85`
- Modify: `tests/nopilot-cli.test.ts:171-183`

- [ ] **Step 1: 更新 init 测试名称和断言**

```typescript
  it('installs skills to Claude, Codex, and OpenCode (shared)', () => {
    runCli(['init', tmpDir], undefined, { HOME: tmpHome });

    const claudeSkills = join(tmpHome, '.claude', 'skills');
    const codexSkills = join(tmpHome, '.agents', 'skills');

    expect(existsSync(claudeSkills)).toBe(true);
    expect(existsSync(codexSkills)).toBe(true);
    expect(readdirSync(claudeSkills).length).toBeGreaterThan(0);
    expect(readdirSync(codexSkills).length).toBeGreaterThan(0);
    // OpenCode shares codexSkills directory, no separate check needed
  });
```

- [ ] **Step 2: 更新 paths 测试**

```typescript
  it('reports Claude, Codex, and OpenCode skill install locations', () => {
    const output = runCli(['paths']);
    const paths = JSON.parse(output);
    expect(paths.source_skill_location).toEqual(resolve(PACKAGE_ROOT, 'commands'));
    expect(paths.installed_skills).toEqual({
      claude: join(homedir(), '.claude', 'skills/'),
      codex: join(homedir(), '.agents', 'skills/'),
      opencode: join(homedir(), '.agents', 'skills/'),
    });
    expect(paths.legacy_dirs).toEqual({
      claude: join(homedir(), '.claude', 'commands/'),
      codex: join(homedir(), '.codex', 'prompts/'),
      opencode: null,
    });
  });
```

- [ ] **Step 3: 运行测试**

Run: `pnpm test tests/nopilot-cli.test.ts`
Expected: 所有测试通过

- [ ] **Step 4: Commit**

```bash
git add tests/nopilot-cli.test.ts
git commit -m "test: update nopilot-cli tests for opencode support"
```

---

### Task 7: 全量测试验证

**Files:** N/A (verification only)

- [ ] **Step 1: 运行全量测试**

Run: `pnpm test`
Expected: 所有测试通过

- [ ] **Step 2: 运行类型检查**

Run: `pnpm lint`
Expected: 无类型错误

- [ ] **Step 3: 手动验证 nopilot init**

Run: `pnpm build && node dist/nopilot-cli.js init /tmp/test-nopilot-init`
Expected: 输出包含 "Skipped opencode (shares skill directory with codex)"

- [ ] **Step 4: 验证 nopilot paths**

Run: `node dist/nopilot-cli.js paths`
Expected: JSON 输出包含 opencode 条目

---

### Task 8: 清理废弃 spec 目录

**Files:**
- Delete: `specs/features/feat-universal-skill-engine/`

- [ ] **Step 1: 删除废弃目录**

Run: `rm -rf specs/features/feat-universal-skill-engine/`

- [ ] **Step 2: Commit**

```bash
git add -A specs/features/feat-universal-skill-engine/
git commit -m "chore: remove deprecated feat-universal-skill-engine spec directory"
```

---

## Self-Review

**1. Spec coverage:**
- ✅ platform-registry.ts 修改 → Task 1
- ✅ skill-installer.ts 去重 → Task 2
- ✅ nopilot-cli.ts 输出 → Task 3
- ✅ platform-registry.test.ts 更新 → Task 4
- ✅ skill-installer.test.ts 新增 → Task 5
- ✅ nopilot-cli.test.ts 更新 → Task 6
- ✅ 全量验证 → Task 7
- ✅ 清理废弃 spec → Task 8

**2. Placeholder scan:** 无 TODO/TBD/模糊描述

**3. Type consistency:** 所有函数签名与现有代码一致

---

**Plan complete and saved to `docs/superpowers/plans/2026-04-07-nopilot-opencode-adaptation.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** - Fresh subagent per task, review between tasks

**2. Inline Execution** - Execute tasks in this session with checkpoints

**Which approach?**
