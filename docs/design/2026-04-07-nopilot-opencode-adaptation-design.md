# NoPilot OpenCode 适配设计方案

**日期**: 2026-04-07
**状态**: 待审批（审阅后修订版 v2）

## 背景

NoPilot 框架的 Lash 已完整支持 OpenCode 作为 Worker 平台，但 NoPilot 框架本身（discover/spec/build 等命令）对 OpenCode 的支持仍处于实验性状态。

**注意**: `specs/features/feat-universal-skill-engine/` 是已弃用的 spec，本次适配**不需要**修改规格工件。

## 当前状态

### 已支持
- **Lash**: 完整支持 OpenCode 作为 Worker 平台
  - `src/lash/platform-launcher.ts` 实现了 spawn/resume/heartbeat
  - 测试覆盖完整（`tests/platform-launcher.test.ts`）

### 实验性支持
- **NoPilot 框架**: `platform-registry.ts` 中 OpenCode 状态为 `experimental`
  - `skillsDir` 指向不存在的 `~/.opencode/skills/`
  - `nopilot init` 不会为 OpenCode 安装技能

## 技术发现

### OpenCode 技能加载机制

通过 `opencode debug skill` 确认：
- OpenCode 从 `~/.agents/skills/` 加载技能（与 Codex 共享）
- 同时也从 `~/.claude/skills/` 加载技能
- **不需要**单独的 `~/.opencode/skills/` 目录

### OpenCode SKILL.md 元数据要求

根据 OpenCode 官方 skills 文档补充确认：
- 目录型 skill 的 `SKILL.md` 必须以 YAML frontmatter 开头
- frontmatter 至少包含 `name` 和 `description`
- 该要求是 OpenCode 发现 skill 的元数据约束，不改变 `~/.agents/skills/` 作为兼容加载路径的结论

### 技能模板占位符

技能文件使用的占位符：
- `<%=VERSION%>` — 所有技能文件
- `<%=CRITIC_PATH%>` — critic/spec/review-runner 等
- `<%=SUPERVISOR_PATH%>` — spec/review-runner 等

## 设计方案

### 1. 修改 `platform-registry.ts`

```typescript
{
  name: 'opencode',
  status: 'active',  // experimental → active
  skillsDir: `${home}/.agents/skills/`,  // 与 Codex 共享
  legacyDir: null,
  placeholderMap: {
    CRITIC_PATH: `${home}/.agents/skills/critic/SKILL.md`,
    SUPERVISOR_PATH: `${home}/.agents/skills/supervisor/SKILL.md`,
  },
}
```

### 2. 修改 `skill-installer.ts`

添加去重逻辑，避免 Codex 和 OpenCode 重复安装到同一目录：

**返回语义定义**：
- `installAllPlatforms()` 仍然为每个 `active` 平台返回一条 `InstallResult`
- 对于跳过的平台（目标目录已被同一批次中的前一个平台安装）：
  - `success: true`
  - `filesWritten: 0`
  - `errors: []`
  - 不新增字段，通过 `filesWritten === 0 && success === true` 隐式表示跳过

```typescript
export function installAllPlatforms(
  sourceDir: string,
  force: boolean,
  platforms?: PlatformAdapter[],
): InstallResult[] {
  const activePlatforms = platforms ?? getActivePlatforms();
  const results: InstallResult[] = [];
  const installedDirs = new Set<string>(); // 去重跟踪

  for (const platform of activePlatforms) {
    const result: InstallResult = {
      platform: platform.name,
      success: true,
      filesWritten: 0,
      errors: [],
    };

    // 如果目标目录已安装，标记为跳过
    if (installedDirs.has(platform.skillsDir)) {
      results.push(result); // success=true, filesWritten=0
      continue;
    }
    
    try {
      const skills = scanSourceSkills(sourceDir);
      // ... 安装逻辑
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

### 3. 修改 `nopilot-cli.ts`

更新 `init` 命令的输出逻辑，正确处理跳过的平台：

```typescript
// 当前逻辑（src/nopilot-cli.ts:108-115）
for (const result of results) {
  if (result.success) {
    console.log(`Installed ${result.filesWritten} skill file(s) for ${result.platform}`);
  } else {
    console.error(`Failed to install skills for ${result.platform}: ${result.errors.join(', ')}`);
  }
}

// 更新后：区分"安装成功"和"跳过"
for (const result of results) {
  if (!result.success) {
    console.error(`Failed to install skills for ${result.platform}: ${result.errors.join(', ')}`);
  } else if (result.filesWritten === 0) {
    // 跳过的平台
    const skippedPlatform = getPlatform(result.platform);
    const sharedWith = activePlatforms.find(
      p => p.name !== result.platform && p.skillsDir === skippedPlatform?.skillsDir
    );
    console.log(`Skipped ${result.platform} (shares skill directory with ${sharedWith?.name})`);
  } else {
    console.log(`Installed ${result.filesWritten} skill file(s) for ${result.platform}`);
  }
}
```

### 4. 测试更新

#### `src/skill-engine/__tests__/platform-registry.test.ts`

- **TEST-011** (原测试编号): 更新预期，`getActivePlatforms()` 返回 3 个平台
- **新增 TEST-015**: 验证 `getPlatform('opencode')` 的完整配置
  ```typescript
  it('TEST-015: getPlatform opencode returns correct config', () => {
    const platform = getPlatform('opencode');
    expect(platform).toBeDefined();
    expect(platform?.name).toBe('opencode');
    expect(platform?.status).toBe('active');
    expect(platform?.skillsDir).toBe(`${home}/.agents/skills/`);
    expect(platform?.placeholderMap).toEqual({
      CRITIC_PATH: `${home}/.agents/skills/critic/SKILL.md`,
      SUPERVISOR_PATH: `${home}/.agents/skills/supervisor/SKILL.md`,
    });
  });
  ```

#### `src/skill-engine/__tests__/skill-installer.test.ts`

- **新增 TEST-020**: 验证共享目录去重
  ```typescript
  it('TEST-020: skips installation for platforms sharing skillsDir', () => {
    const platforms = [
      { name: 'codex', status: 'active', skillsDir: '/tmp/skills', legacyDir: null, placeholderMap: {} },
      { name: 'opencode', status: 'active', skillsDir: '/tmp/skills', legacyDir: null, placeholderMap: {} },
    ];
    const results = installAllPlatforms('/tmp/commands', false, platforms);
    
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[0].filesWritten).toBeGreaterThan(0);
    expect(results[1].success).toBe(true);
    expect(results[1].filesWritten).toBe(0); // 跳过
  });
  ```

#### `tests/nopilot-cli.test.ts`

- **更新测试 "installs skills to Claude and Codex global skill directories"**
  - 重命名为 "installs skills to Claude, Codex, and OpenCode (shared)"
  - 验证 OpenCode 的技能目录存在（与 Codex 共享）
  
- **新增测试**: 验证 `nopilot paths` 输出包含 opencode

## 完整影响范围

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| **源代码** | | |
| `src/skill-engine/platform-registry.ts` | 配置修改 | opencode 状态和路径 |
| `src/skill-engine/skill-installer.ts` | 逻辑修改 | 添加去重逻辑 |
| `src/nopilot-cli.ts` | 输出修改 | 正确处理跳过平台的输出 |
| **测试** | | |
| `src/skill-engine/__tests__/platform-registry.test.ts` | 测试更新 | TEST-011, 新增 TEST-015 |
| `src/skill-engine/__tests__/skill-installer.test.ts` | 测试新增 | TEST-020 |
| `tests/nopilot-cli.test.ts` | 测试更新 | 更新 init 测试，新增 paths 测试 |

## 验证步骤

1. **单元测试**: `pnpm test src/skill-engine/__tests__/platform-registry.test.ts`
2. **集成测试**: `pnpm test tests/nopilot-cli.test.ts`
3. **全量测试**: `pnpm test` 确保所有测试通过
4. **手动验证**:
   - 运行 `nopilot init` 验证技能安装输出
   - 验证 `~/.agents/skills/` 中包含 NoPilot 技能
   - 运行 `nopilot paths` 验证输出包含 opencode

**注意**: 当前 `nopilot init` 注入的指引（`src/nopilot-cli.ts:44-47`）只写了 Claude 和 Codex 的触发方式，没有 OpenCode。因此"在 OpenCode 中运行 `/discover`"不是当前可执行的验证步骤。如需支持，需要额外修改 `LASH_DIRECTIVE` 常量。

## 风险

- **测试覆盖**: 需要确保去重逻辑和 CLI 输出有充分测试
- **向后兼容**: OpenCode 和 Codex 共享目录是预期行为，不会导致冲突

## 后续工作

- 考虑在 `nopilot init` 输出中明确说明 OpenCode 复用 Codex 的技能目录
- 文档更新：README.md 中说明 OpenCode 支持情况
- 可选：更新 `LASH_DIRECTIVE` 添加 OpenCode 触发方式（`/prompts:discover` 或类似）
- 清理：删除已弃用的 `specs/features/feat-universal-skill-engine/` 目录
