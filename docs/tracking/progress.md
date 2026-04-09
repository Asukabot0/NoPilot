# NoPilot Progress Tracking

## Progress Snapshot: 2026-04-03 21:00
- 触发方式: /progress 手动调用（首次）
- 代码统计: 11 个 .py 文件, 2909 行 Python 代码, 0 个测试（NoPilot 本体无测试套件）
- Prompt 文件: 10 个 command .md (2567 行) + 7 个 lash prompt .md (401 行)
- Schema 文件: 14 个 JSON Schema 文件
- 当前版本: V1.1 (Schema 4.0) — Delivered
- Lash 状态: Python helper layer 完成 (8 个核心模块), V1.0 release blockers 已修复
- Issues: 13 个 open issues (2 个 P0, 6 个 P1, 3 个 P2), 全部 open 状态
- 近期工作: schema 版本号 3.0→4.0 升级, Lash 集成, .gitattributes 配置

## Progress Snapshot: 2026-04-04 01:00
- 触发方式: /progress 手动调用
- 代码统计: 13 个 .ts 文件, 3835 行 TypeScript, 202 个测试 (11 个测试文件)
- Prompt 文件: 13 个 command .md (commands/ 目录)
- Schema 文件: 14 个 JSON Schema 文件
- 当前版本: V1.2 (Schema 4.0) — Delivered
- 自上次快照以来的变更:
  - Lash 从 Python (~2921 行) 重写为 TypeScript (3835 行)，合并进 NoPilot
  - 新增 npm package 结构: package.json, tsconfig.json, vitest.config.ts, pnpm-lock.yaml
  - 双 CLI: `nopilot` (init/validate/preview/version) + `lash` (15 subcommands)
  - 所有 prompt 文件迁移到 commands/ 目录，路径引用更新
  - install.sh 删除，被 `nopilot init` 取代
  - 10 个 code review 问题全部修复 (shell injection, pipe deadlock, path mismatch 等)
  - PR #22 已合并到 main
- Issues: 旧 issues #001-#013 全部关闭, GitHub issues #17 和 #21 open
- 基线对比: 上次快照 2026-04-03 21:00 | 语言从 Python 切换到 TypeScript, 测试从 0 增加到 202

## Progress Snapshot: 2026-04-04 20:50
- 触发方式: /progress 手动调用
- 代码统计: 35 个 .ts 文件 (src: 22, tests: 13), 12133 行 TypeScript, 482 个测试 (22 test files, all passing)
- 当前版本: V1.2 (Schema 4.0) — Delivered
- 当前分支: feat/issue-26-spec-resolver (+809 行, -97 行 vs main)
- 自上次快照以来的变更:
  - ui-taste 模块实现: design provider orchestration, preview engine, iteration engine, stitch-based UI generation
  - UI Taste Exploration 集成到 discover flow (#34)
  - spec-resolver 支持 split format (#26) — PR #36 已合并到 dev
  - GitHub Actions CI 添加 (build + test)
  - 安全修复: ui-taste 模块 HIGH/MEDIUM issues (#32)
  - 基础设施: IPv4 替代 localhost, 移除 Node 18 CI 支持
  - specHash 确定性排序修复
  - OMC-style distribution 重构
  - v0.0.1 release 准备
- Issues: 9 个 open (之前 2 个), 新增 #23/#24/#29/#30/#31/#33/#35/#37
- 基线对比: 上次快照 2026-04-04 01:00 | .ts 文件 13→35, 行数 3835→12133, 测试 202→482

## Progress Snapshot: 2026-04-05 14:00
- 触发方式: brownfield discover + spec 完成后自动更新
- 代码统计: 48 个 .ts 文件, 16367 行 TypeScript, 482 个测试 (无新代码, 本次为设计阶段)
- 当前版本: V0.0.2 Released (main)
- 当前分支: fix/issue-24-domain-skill-confirm
- 本次工作: Brownfield Support feature 设计 (discover + spec 阶段完成)
  - **Discover 阶段**:
    - 识别 10 大痛点 (discover 太重、设计哲学不应重生成、必须读现有代码等)
    - 竞品调研: Cursor/Windsurf/Copilot/Devin/Factory/Augment 的 brownfield 方案
    - 方向选择: Hybrid (意图持久化 + 结构按需扫描), 意图捕获作为实验性功能
    - 核心创新: 多层级项目画像 (L0 基础设施、L1 架构、L2 决策/实验性、L3 状态)
    - 设计哲学: 一条流程条件分支、流程产出即记忆来源、意图与结构分离、为拆除而设计、上下文不能以偏概全
    - 15 个 REQ, 5 个 INV, 3 个核心场景
    - Critic: 3 个 block 已修复 (阈值具体化 + updated_at 字段)
    - Supervisor: aligned, 无漂移
  - **Spec 阶段**:
    - 8 个模块: 5 个 TypeScript 新组件 (profile-storage, writer, scanner, mode-detector, conflict-detector) + 3 个命令修改 (discover/spec/build feature mode)
    - 新增文件: src/profile/ (5 个 .ts), schemas/profile-l{0-3}.schema.json (4 个)
    - 3 个 auto_decisions (Ajv 验证、TS 工具函数模式、.nopilot/config.json)
    - Critic: ACCEPT, 52/52 AC 覆盖 (修复 REQ-015 过期响应缺口后)
    - Supervisor: aligned, drift score 8/100
  - 产出位置: specs/features/feat-brownfield-support/ (discover/ + spec/ + reviews)
- 下一步: /build 执行, 或先 review spec 产出
- Issues: 8 个 open
- 基线对比: 上次快照 2026-04-04 20:50 | 无代码变更, 新增 brownfield feature 设计制品

## Progress Snapshot: 2026-04-09 19:55
- 触发方式: 排查并修复 issue #78 及同类 split artifact 入口缺口
- 代码统计: 本次修改 `lash` resolver、CLI、profile writer 与相关测试，补充 split artifact 回归覆盖
- 当前版本: V0.0.6 缺陷修复中
- 本次工作:
  - 将 `src/lash/spec-resolver.ts` 的 artifact 入口判定统一为“语义入口”而非“物理文件/目录类型”，显式传入 `spec/index.json`、`discover/index.json` 时会归一化到 split artifact 根目录再加载
  - 新增 `resolveTests()`，使 `lash package --tests` 支持 `tests.json`、`tests/` 与 `tests/index.json` 三种入口
  - 新增 `resolveBuildReport()`，并让 `src/profile/writer.ts` 复用 `resolveDiscover()` / `resolveSpec()` / `resolveBuildReport()`，补齐 profile writer 对 split discover/spec/build artifact 的支持
  - 补充回归测试: `tests/spec-resolver.test.ts`、`tests/plan-generator.test.ts`、`tests/cli.test.ts`、`src/profile/__tests__/writer.test.ts`
  - 同步更新 `docs/zh-CN/USER_GUIDE.md` 中 `lash package` 参数说明，明确 artifact 入口路径支持单文件、目录和显式 `index.json`
- 当前问题:
  - `profile writer` 之前一直按单文件入口读取 stage artifact，这次已补齐 split discover/spec/build 支持，但其他非 Lash 路径若未来新增 artifact loader，仍需优先复用统一 resolver，避免再次出现入口语义分叉
- 值得深入研究的问题:
  - 是否将 `decisions.json`、未来的 `tests_review` / `build_review` 等 artifact 也统一纳入一层通用 resolver API，进一步消除不同子系统各自读取 JSON 的重复实现

## Progress Snapshot: 2026-04-09 21:05
- 触发方式: 子 agent 复审后修补 split child payload 静默降级缺陷
- 代码统计: 本次修改 `spec-resolver` 与回归测试，新增 malformed split child 负向覆盖
- 当前版本: V0.0.6 缺陷修复中
- 本次工作:
  - 将 `resolveTests()` / `resolveBuildReport()` 对 split child payload 的数组字段读取从“非数组则吞掉”改为“明确抛出 `INVALID_CHILD_PAYLOAD`”
  - 新增 `tests/spec-resolver.test.ts` 负向用例，覆盖 split tests child 与 split build child 字段类型错误场景
  - 收紧错误语义，避免上游生成畸形 split child 文件时出现 silent data loss
- 当前问题:
  - discover split child 仍然采用 `Object.assign` 合并，若未来要对 `requirements` / `core_scenarios` 做更强结构校验，还需单独补 schema 级验证
- 值得深入研究的问题:
  - 是否在 resolver 层统一接入 schema 校验，而不仅是路径解析与基础结构拼装

## Progress Snapshot: 2026-04-09 21:35
- 触发方式: 最后一轮 merge blocker 修补
- 代码统计: 本次继续修改 `spec-resolver` 与回归测试，补齐 split index `modules` 字段强校验
- 当前版本: V0.0.6 缺陷修复中
- 本次工作:
  - 将 split `tests/build` 的 `index.json` 中 `modules` 读取从默认空数组改为强校验，缺失或包含非法项时明确抛出 `INVALID_INDEX_PAYLOAD`
  - 新增 `tests/spec-resolver.test.ts` 负向用例，覆盖 split tests/build index 缺失 `modules` 与 `modules` 含非法项两类场景
  - 消除 split index 元数据错误时的静默空聚合风险
- 当前问题:
  - `resolveDiscover()` 仍未对 split child 内容做 schema 级结构校验，只保证文件存在且 JSON 可解析
- 值得深入研究的问题:
  - 是否应在 resolver 层统一接入 artifact schema 校验，以便将 discover/spec/tests/build 的结构错误统一前置到加载阶段

## Progress Snapshot: 2026-04-10 00:35
- 触发方式: 修复 issue #64 的 plan-generator ownership fallback 缺口
- 代码统计: 本次修改 `src/lash/plan-generator.ts`、`tests/plan-generator.test.ts`、`tests/worktree-manager.test.ts` 与 `docs/zh-CN/USER_GUIDE.md`
- 当前版本: V0.0.6 缺陷修复中
- 当前分支: `fix/issue-64-plan-generator-batches`
- 本次工作:
  - 将 `plan-generator` 在缺失 `owned_files` 时的行为改为在 plan 生成阶段直接抛错（fail-closed），列出所有缺失 `owned_files` 的模块 ID
  - 新增 `tests/plan-generator.test.ts` 回归覆盖，确认缺失 ownership 不再伪造 wildcard ownership，也不会把同目录 sibling 模块被动串行化
  - 新增 `tests/worktree-manager.test.ts` 回归覆盖，明确 `checkUnexpectedFiles` 仍按显式文件路径做 merge 前边界检查，`src/**` 这类字符串不会被当成授权模式
  - 同步更新 `docs/zh-CN/USER_GUIDE.md`，补充缺失 `owned_files` 的 fail-closed 语义与边界检查说明
- 当前问题:
  - 现有 schema 仍只把 `owned_files` 视为可选字段，没有进一步约束“缺失 ownership 是否应阻断构建”；当前修复仅保证语义一致，不额外引入新的 hard fail
- 值得深入研究的问题:
  - 是否应在后续版本把 `owned_files` 提升为更强合同（例如 spec 阶段必填，或在 `lash plan` 中将缺失 ownership 升级为显式错误），从源头消除 ownership 不完整问题

## Progress Snapshot: 2026-04-10 14:45
- 触发方式: 修复 discover review gate 相关 issue #69 / #70 / #48 / #58
- 代码统计: 本次未改运行时代码，收紧 `discover` prompt 合同并补充结构测试
- 当前版本: V0.0.6 缺陷修复中
- 当前分支: `fix/issue-48-58-69-70-discover-review`
- 本次工作:
  - 将 `commands/discover/SKILL.md` 明确改为：Layer 3 与 artifact 写入后不得视为 discover 完成，下一步必须进入 Critic + Supervisor review gate
  - 将 `commands/discover/critic-supervisor.md` 明确改为：禁止主代理内联 Critic/Supervisor、禁止手工写 `passed/aligned` 通过、Critic 自修复后必须由 fresh Critic 复检
  - 将 `commands/discover/artifact-writer.md` 去掉提前提示 `Run /spec to continue.` 的放行文案，改为仅回传写入确认并等待 review gate 完成
  - 在 `src/skill-engine/__tests__/skill-structure.test.ts` 增加回归断言，锁定上述 discover review 合同
  - 根据独立复核继续收紧边界：`artifact-writer` 不再宣称写入 `discover_review.json`，且 `critic-supervisor` 明确“用户手工处理发现的问题后也必须先拿到 fresh Critic pass，才能进入 Supervisor”
- 下一步计划:
  - 重新运行 `skill-structure` 定向测试与类型检查，确认 Oracle 指出的剩余两处合同缺口已被锁定
  - 若重新验证通过，再复核全量测试 / build 结果与变更概况
- 当前问题:
  - `README_AGENT.md` 与部分旧说明仍保留 lite/spec 的 same-session Critic 叙述；本次 issue 目标集中在 discover，后续是否统一口径仍需单独决策
- 值得深入研究的问题:
  - 是否应把“主流程不得手工写 passed/aligned、必须等待独立 review artifact”沉淀成跨 discover/spec/build 的统一结构测试模板
  - 是否需要在 `workflow.json` 或 schema 层新增更显式的 review-gate 完成信号，减少 prompt 文本与 artifact 状态机之间的歧义

## Progress Snapshot: 2026-04-10 18:45
- 触发方式: 根据 PR #80 review 与 Oracle 复核继续修补 merge blocker
- 代码统计: 本次继续修改 prompt contract 与结构测试，未触碰 TypeScript 运行时代码
- 当前版本: V0.0.6 缺陷修复中
- 当前分支: `fix/issue-48-58-69-70-discover-review`
- 本次工作:
  - 在 `commands/spec/SKILL.md` 增加 discover review 硬门禁：`/spec` 现在必须读取同一 artifact root 下的 `discover_review.json`，并校验四个 Critic pass 字段与 `global_coherence_check.intent_alignment == "aligned"`
  - 将 `commands/discover/SKILL.md`、`commands/discover/critic-supervisor.md`、`commands/critic/discover.md` 的 discover review 输入/输出路径统一为 greenfield 与 feature 共用“current artifact root”模型
  - 将 `commands/spec/schema.md`、`commands/spec/review-runner.md`、`commands/spec/decisions.md`、`commands/critic/spec.md` 改为沿用当前 artifact root，避免 feature discover 驱动下仍回写全局 `specs/`
  - 在 `src/skill-engine/__tests__/skill-structure.test.ts` 补充 `/spec` gate、feature-aware review path、spec artifact root 一致性的结构回归断言
- 下一步计划:
  - 先运行 `skill-structure` 定向测试，确认新增合同断言全部落地
  - 若定向测试通过，再运行 `pnpm test`、`pnpm lint`、`pnpm build`，最后交给子代理做代码审查
- 当前问题:
  - LSP 本地缺少 `typescript-language-server`，无法用 LSP 直接做 TypeScript 诊断，只能依赖测试与构建验证
- 值得深入研究的问题:
  - 是否应在 `workflow.json` 与用户文档中把 `/spec` 的输入依赖显式提升为“discover artifact + discover review artifact”
  - 是否应为 discover/spec review artifact 增加 root/hash 绑定，防止人工修改 discover 后继续复用陈旧 review

## Progress Snapshot: 2026-04-10 19:20
- 触发方式: 为 ULTRAWORK 完成性验收补充可审计证据
- 代码统计: 本次未改业务合同，仅补充验证与 review 证据记录
- 当前版本: V0.0.6 缺陷修复中
- 当前分支: `fix/issue-48-58-69-70-discover-review`
- 本次工作:
  - 再次执行并通过定向结构测试：`pnpm test src/skill-engine/__tests__/skill-structure.test.ts`
  - 在当前 worktree 再次执行并通过全量验证：`pnpm test`、`pnpm lint`、`pnpm build`
  - 清理本地产生的 `.benchmark/` 未跟踪测试产物，确认工作树恢复干净状态
  - 追加子代理终审证据：快速子代理复核认为 PR #80 当前阻塞已关闭、范围内无新 blocker，且 GitHub 状态为 `mergeStateStatus: CLEAN`
  - 记录 Oracle 终审的关键结论：代码修补方向正确，先前未通过完成性验收的原因是“审计证据不足”，而非“仍有代码阻塞”
- 当前问题:
  - GitHub 侧仍显示 `gh pr checks 80` 为 `no checks reported`；本轮验收依赖本地完整验证日志与子代理/Oracle 复核证据，而非远端 CI 记录
- 值得深入研究的问题:
  - 是否需要把 review 子代理与本地验证结果自动沉淀为仓库内标准化验收记录，避免后续 ULTRAWORK/Oracle 验收时再次因“证据不集中”被卡住
