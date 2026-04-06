# NoPilot OpenCode 适配设计方案

**日期**: 2026-04-07
**状态**: 待审批

## 背景

NoPilot 框架的 Lash 已完整支持 OpenCode 作为 Worker 平台，但 NoPilot 框架本身（discover/spec/build 等命令）对 OpenCode 的支持仍处于实验性状态。

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

```typescript
// 在 installAllPlatforms 中
const installedDirs = new Set<string>();

for (const platform of activePlatforms) {
  // 如果目标目录已安装，跳过
  if (installedDirs.has(platform.skillsDir)) {
    // 记录跳过信息
    continue;
  }
  
  // ... 安装逻辑
  
  installedDirs.add(platform.skillsDir);
}
```

### 3. 测试更新

- `src/skill-engine/__tests__/platform-registry.test.ts`
  - 更新 TEST-002: 预期 `getActivePlatforms()` 返回 3 个平台（claude, codex, opencode）
  
- `src/skill-engine/__tests__/skill-installer.test.ts`
  - 添加测试：验证 Codex 和 OpenCode 共享目录时只安装一次

## 影响范围

| 文件 | 修改类型 |
|------|---------|
| `src/skill-engine/platform-registry.ts` | 配置修改 |
| `src/skill-engine/skill-installer.ts` | 逻辑修改（去重） |
| `src/skill-engine/__tests__/platform-registry.test.ts` | 测试更新 |
| `src/skill-engine/__tests__/skill-installer.test.ts` | 测试新增 |

## 验证步骤

1. 运行 `pnpm test` 确保所有测试通过
2. 运行 `nopilot init` 验证技能安装
3. 在 OpenCode 中运行 `/discover` 验证技能可用

## 风险

- **低风险**: OpenCode 和 Codex 共享技能目录是预期行为，不会导致冲突
- **测试覆盖**: 需要确保去重逻辑有充分测试

## 后续工作

- 考虑在 `nopilot init` 输出中明确说明 OpenCode 复用 Codex 的技能目录
- 文档更新：README.md 中说明 OpenCode 支持情况
