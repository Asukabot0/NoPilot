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

## Progress Snapshot: 2026-04-08 21:10
- 触发方式: benchmark 设计讨论后手动更新
- 代码统计: 本次无源码变更，新增 benchmark 设计文档与计划文档
- 当前版本: V0.0.6 周期内设计补充
- 本次工作: NoPilot workflow benchmark 设计
  - 明确 benchmark 同时服务回归守卫、平台横评、模型横评
  - 确定三层结构: case layer / run layer / evaluation layer
  - 确定评分模型: process 50 / outcome 30 / efficiency 20
  - 确定首批 12 个 case，覆盖 discover/spec/build 的主要失效模式
  - 确定 run 产物结构、event-log 抽取和 oracle 判分流程
  - 新增设计文档: `docs/design/2026-04-08-nopilot-benchmark-design.md`
  - 新增计划文档: `docs/plans/2026-04-08-nopilot-benchmark-plan.md`
- 当前问题:
  - transcript 到 event-log 的抽取规则仍需进一步形式化
  - 多平台 transcript 差异较大，第一期需要限制输入格式范围
  - 部分高层流程语义难以完全自动判分
- 值得深入研究的问题:
  - 是否单独定义 trace schema 作为平台无关中间层
  - 是否为 benchmark 引入重复运行与稳定性统计
  - 是否对 case 难度进行显式校准，避免排行榜被简单 case 主导

## Progress Snapshot: 2026-04-08 22:25
- 触发方式: benchmark 设计评审后手动修补
- 代码统计: 本次无源码变更，修订 benchmark 设计与计划文档
- 当前版本: V0.0.6 周期内设计修补
- 本次工作:
  - 将 benchmark 事件定义从直接绑定 transcript 细节改为 `observation events -> semantic events` 两层 trace schema
  - 为 `oracle.json` 断言改用 semantic events，降低平台私有 transcript 差异对判分的影响
  - 补入评分封顶规则：核心流程违规限制 process 分上限，并阻断 efficiency 抬分
  - 补充 `F10/F11` 失败分类，覆盖 trace 不足不可判与 artifact 合同不匹配
  - 将 `Stage Heatmap` 收敛为 `discover/spec/build`，并单独提出 `Review Heatmap`
  - 在 MVP 路线中前置人工复核入口，避免高层语义误判后直接写死结论
  - 同步更新计划文档，加入 `trace-schema.json`、artifact format profile 和人工复核回写流程
- 当前问题:
  - semantic event 的判定依据仍需在 schema 层进一步形式化，否则实现时仍可能漂移
  - process fail run 的 efficiency 展示方式仍需在评分器中锁定，避免误导榜单解读
- 值得深入研究的问题:
  - contract case 与 prompt behavior case 是否需要分开维护与分开统计
  - trace extractor 是否应作为独立模块版本化发布，便于回归比较

## Progress Snapshot: 2026-04-08 21:45
- 触发方式: 手动配置 OpenCode 自定义 API 源
- 代码统计: 本次无仓库源码变更，修改用户级配置 `~/.config/opencode/opencode.jsonc`
- 当前版本: V0.0.6 使用环境补充
- 本次工作:
  - 在 OpenCode 全局配置中新增 `provider.openai`，指向主人提供的兼容接口地址
  - 保留现有 `vllm-local` provider 与默认模型配置，不改变当前默认模型选择
  - 计划: 先完成 provider 注册并验证配置可被 `opencode debug config` 正常解析
- 当前问题:
  - 新 provider 仅注册了连接信息，尚未声明模型清单；若后续要直接切换使用，还需要补 `provider.custom-openai.models` 或手动指定可用模型 ID
- 值得深入研究的问题:
  - OpenCode 对兼容 OpenAI 接口在未显式声明 `models` 时的模型发现与选择行为是否稳定一致

## Progress Snapshot: 2026-04-08 21:52
- 触发方式: 消除 OpenAI OAuth 与自定义 API 源歧义
- 代码统计: 本次无仓库源码变更，继续修改用户级配置 `~/.config/opencode/opencode.jsonc`
- 当前版本: V0.0.6 使用环境补充
- 本次工作:
  - 将自定义 provider 从 `openai` 改为独立命名 `custom-openai`
  - 为该 provider 显式补充 `name` 与 `npm: @ai-sdk/openai-compatible`，避免与内建 `openai` provider 混用
  - 保留现有默认模型不变，后续可按需显式使用 `custom-openai/<model-id>`
- 当前问题:
  - 自定义源最初未声明 `models` 列表，OpenCode 无法识别 `custom-openai/<model-id>`；需补显式模型映射
- 值得深入研究的问题:
  - OpenCode 对自定义 openai-compatible provider 的模型发现是否依赖服务端 `/models` 返回格式

## Progress Snapshot: 2026-04-08 21:58
- 触发方式: 修复自定义 provider 模型不可识别问题
- 代码统计: 本次无仓库源码变更，继续修改用户级配置 `~/.config/opencode/opencode.jsonc`
- 当前版本: V0.0.6 使用环境补充
- 本次工作:
  - 通过请求自定义接口 `/v1/models` 确认服务端实际暴露的模型 ID
  - 为 `custom-openai` 显式补充最小模型清单：`gpt-5.4`、`gpt-5.4-mini`、`gpt-5.3-codex`、`gpt-5-codex`
  - 计划: 用 `opencode run -m custom-openai/gpt-5.4-mini` 做一次端到端验证
- 当前问题:
  - 当前仅录入最小常用模型，若主人要用其他模型，还需要继续补充到配置
- 值得深入研究的问题:
  - 是否需要写一个小脚本根据 `/v1/models` 自动同步 OpenCode 配置中的模型清单

## Progress Snapshot: 2026-04-08 22:10
- 触发方式: 主人要求统一提高 OpenCode 全部已声明模型的推理强度
- 代码统计: 本次无仓库源码变更，继续修改用户级配置 `~/.config/opencode/opencode.jsonc`
- 当前版本: V0.0.6 使用环境补充
- 本次工作:
  - 查阅 OpenCode provider 文档与 AI SDK OpenAI-compatible 文档，确认聊天模型使用 `options.reasoningEffort`
  - 为当前配置中全部已声明模型统一设置 `options.reasoningEffort: "high"`
  - 覆盖范围: `vllm-local` 下 2 个 Qwen 模型，`custom-openai` 下 4 个 GPT/Codex 模型
  - 计划: 用 `opencode debug config` 复核配置已被正确解析
- 当前问题:
  - 该配置仅覆盖 `opencode.jsonc` 中已显式声明的模型；后续新增模型不会自动继承，仍需补同字段
  - 不同后端对 `reasoningEffort: "high"` 的实际支持程度可能不同，不支持的服务端可能忽略该字段
- 值得深入研究的问题:
  - 是否需要在 OpenCode 层增加统一的全局默认 providerOptions，避免逐模型重复配置
  - 是否需要为本地 vLLM 服务核实其对 `reasoningEffort` 的透传和生效行为

## Progress Snapshot: 2026-04-08 22:14
- 触发方式: 主人要求将全部已声明模型的推理强度进一步改为 `xhigh`
- 代码统计: 本次无仓库源码变更，继续修改用户级配置 `~/.config/opencode/opencode.jsonc`
- 当前版本: V0.0.6 使用环境补充
- 本次工作:
  - 将 `vllm-local` 与 `custom-openai` 下全部已声明模型的 `options.reasoningEffort` 从 `high` 改为 `xhigh`
  - 计划: 继续使用 `opencode debug config` 验证配置文件可正常解析
- 当前问题:
  - `xhigh` 不是前面查到的公开示例值；OpenCode 配置层会透传该字段，但具体后端是否识别需要以服务端实现为准
- 值得深入研究的问题:
  - 自定义兼容接口与 vLLM 后端各自接受的 `reasoningEffort` 枚举是否一致，是否需要按 provider 分别配置

## Progress Snapshot: 2026-04-08 22:16
- 触发方式: 主人要求进入 `/discover`，锁定 benchmark feature 的 MVP 与 requirement lock
- 代码统计: 本次无源码变更，新增 benchmark feature discover 制品
- 当前版本: V0.0.6 设计深化
- 当前分支: `discussion/nopilot-benchmark`
- 本次工作:
  - 按 `feature mode` 完成 NoPilot benchmark 的 discover 收敛，未额外生成设计哲学
  - 锁定第一期目标: 同时服务工作流回归守卫与平台/模型横评
  - 锁定第一期边界: 自动运行、适配器运行器、单一标准 run profile、合成 fixture 为主、仅本地平台 CLI、仅本地运行
  - 明确第一期非目标: 暂缓网页 Dashboard 与 case authoring UI
  - 新增 discover 制品: `specs/features/feat-nopilot-benchmark/discover/index.json`
  - 新增 discover 制品: `specs/features/feat-nopilot-benchmark/discover/requirements.json`
  - 新增 discover 制品: `specs/features/feat-nopilot-benchmark/discover/scenarios.json`
  - 新增 discover 制品: `specs/features/feat-nopilot-benchmark/discover/history.json`
- 当前问题:
  - 当前仓库没有现成 profile/discover 制品可供该 feature 继承，discover index 仅保留 `profile_ref: ".nopilot/profile/"` 与空 `design_philosophy` 数组，后续若仍缺 profile，`/spec` 将按绿地式无代码画像路径继续
  - phase 1 已锁单一 run profile，但标准字段与 adapter contract 仍需在 spec 阶段形式化
  - 平台准入已锁定为“只接完整 trace 平台”，但完整性的最低字段门槛仍需在 spec 阶段明确
  - 评分锁定规则已补到 discover requirement：`process_score < 25` 触发 `process_fail`，`F1-F4` 命中时 process 分封顶 `20/50`
  - failure taxonomy 的名称与 `needs_review/F10` 映射已补入 discover requirement，后续 spec 仍需把字段落到 scorer 与 verdict schema
- 值得深入研究的问题:
  - benchmark adapter contract 是否应单独版本化，避免 runner 与 scorer 演进不同步
  - phase 2 引入 CI 子集门禁时，如何在时长、稳定性与回归覆盖之间取得平衡
  - `trace_insufficient` 的最小触发条件是否需要按 semantic event 类型拆分，避免不同 case 共用过粗粒度规则

## Progress Snapshot: 2026-04-08 22:39
- 触发方式: 主人要求进入 `/spec`，对 benchmark feature 做模块级设计展开
- 代码统计: 本次无源码实现变更，新增 benchmark feature spec 制品
- 当前版本: V0.0.6 设计深化
- 当前分支: `discussion/nopilot-benchmark`
- 本次工作:
  - 基于 `feat-nopilot-benchmark` discover 制品完成 `/spec` 展开
  - 新增 `spec.json`，将 benchmark 拆成 8 个模块: CLI surface、contracts、suite catalog、runner、trace pipeline、evaluator、review store、reporting
  - 明确 benchmark 接入点在 `nopilot` CLI，而不是 `lash` CLI
  - 明确 phase-1 运行资产与运行时边界: 版本化 case 置于 `benchmark/`，本地 run 产物置于 `.nopilot/benchmark/runs/`
  - 明确 phase-1 只支持一个标准 run profile: `phase1-local-cli-v1`
  - 明确 adapter / trace / scorer / review 的模块边界，作为后续 `/build` 输入
  - 新增 spec 制品: `specs/features/feat-nopilot-benchmark/spec.json`
  - 新增 decisions 制品: `specs/features/feat-nopilot-benchmark/decisions.json`
  - 新增 spec review 制品: `specs/features/feat-nopilot-benchmark/spec_review.json`
- 当前问题:
  - spec 已锁 `benchmark/` 与 `.nopilot/benchmark/runs/` 两条路径，但是否需要额外 gitignore 规则仍要在实现时确认
  - 当前 spec 依赖本地平台 CLI 提供足够 transcript 记录；不同平台如何稳定映射到 `phase1-local-cli-v1` 仍是 build 阶段最高风险
  - discover 中已声明 `.nopilot/profile/`，但现有 profile 没有 benchmark 相关模块画像；后续如果希望 feature mode 强继承 benchmark 既有架构，还需要在 profile 体系里补位
  - 第一轮独立 spec 审阅指出的四个核心契约缺口已补齐：run metadata 必填字段、official suite 的 profile/平台准入、F1-F11 taxonomy 枚举化、needs_review 到 review-store 的显式衔接
- 值得深入研究的问题:
  - `phase1-local-cli-v1` 是否应单独做成公开 schema 版本线，便于历史 run 横向兼容与升级迁移
  - benchmark suite manifest 是否需要区分 contract cases 与 prompt-behavior cases，避免同榜混淆
  - adapter 记录的 transcript 粒度是否要统一到 message/tool/artifact 三种最小事件，还是允许更细粒度记录后再降采样

## Progress Snapshot: 2026-04-08 22:48
- 触发方式: 主人要求先用 `/build` Step 2 为 benchmark feature 生成 tests 制品，以满足 `lash-build` 前置条件
- 代码统计: 本次无源码实现变更，新增 benchmark feature tests 制品
- 当前版本: V0.0.6 设计深化
- 当前分支: `discussion/nopilot-benchmark`
- 本次工作:
  - 读取 `/build` 与 `test-gen` 合同，确认 feature mode 下 tests 应写到 `specs/features/feat-nopilot-benchmark/tests.json`
  - 基于 benchmark spec 生成单文件 `tests.json`，覆盖 10 个 example cases 与 5 个 property cases
  - 覆盖重点包括: CLI surface、run metadata、phase1-local-cli-v1、official suite >=10 case、F1-F11 taxonomy、process_fail、needs_review->review-store、JSON/Markdown 报告
  - 新增独立 tests review 制品: `specs/features/feat-nopilot-benchmark/tests_review.json`
- 当前问题:
  - 现有仓库在 single-file `tests.schema.json` 与 split `tests_index.schema.json` 的 `phase` 字段上存在不一致；本次为降低合同风险，先采用单文件 tests artifact
  - 当前 `tests_review.json` 是基于已锁定 spec 的人工生成审阅结果，尚未经过独立 tests Critic 子代理复核
  - `lash-build` 文档默认引用 greenfield 路径，后续正式进入编排时仍需显式使用 feature 路径，避免误读 `specs/` 根目录
- 值得深入研究的问题:
  - 是否需要在 phase 2 统一修复 single/split tests artifact 的 `phase` 字段合同不一致问题
  - benchmark tests 是否应再细分一组专门针对 adapter 认证失败与非 ranked platform 的 acceptance cases

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

## Progress Snapshot: 2026-04-09 20:40
- 触发方式: PR #79 审查后修复 split build artifact 入口契约偏差
- 代码统计: 本次修正 `profile writer` 的 build artifact 入口解析，并补齐 build resolver 回归测试
- 当前版本: V0.0.6 缺陷修复中
- 本次工作:
  - 将 `src/profile/writer.ts` 的 artifact 入口解析改为显式区分单文件名与 split 目录名，避免把 `build_report.json` 错当成 `build_report/` 目录合同
  - 将 split build profile 测试 fixture 从错误的 `build_report/index.json` 改为合同规定的 `build/index.json`
  - 在 `tests/spec-resolver.test.ts` 新增 `resolveBuildReport()` 的单文件、目录、显式 `index.json` 与缺子文件回归覆盖
  - 在 `src/profile/__tests__/writer.test.ts` 补充 `framework` 断言，确认 L3 测试覆盖率信息完整保留
- 当前问题:
  - `framework` 仍属于 build report 中的弱契约字段，extractor 会读取，但 schema 尚未将其声明为必需或可选属性
- 值得深入研究的问题:
  - 是否应让 profile writer 完全复用 `findArtifactPath()` 一类统一入口发现逻辑，进一步减少路径合同分叉风险

## Progress Snapshot: 2026-04-09 21:05
- 触发方式: 子 agent 复审后修补 split child payload 静默降级缺陷
- 代码统计: 本次修改 `spec-resolver` 与回归测试，新增 malformed split child 负向覆盖
- 当前版本: V0.0.6 缺陷修复中
- 本次工作:
  - 将 `resolveTests()` / `resolveBuildReport()` 对 split child payload 的数组字段读取从”非数组则吞掉”改为”明确抛出 `INVALID_CHILD_PAYLOAD`”
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


## Progress Snapshot: 2026-04-10 01:45
- 触发方式: 修复 GitHub issues #63 与 #67（`lash package`/`/lash-build` 前置条件与文档契约）
- 代码统计: 本次修改 `src/lash/cli.ts`、`src/lash/task-packager.ts` 与对应回归测试，并同步更新 `commands/`、schema 与中文用户指南
- 当前版本: V0.0.6 缺陷修复中
- 本次工作:
  - `lash package` 在缺失 `--tests` 时改为 fail-fast，直接返回带恢复指引的错误，而不再静默构造空 tests 载荷
  - `generatePackage()` 在模块缺失 `owned_files` 时明确抛出 `missing_owned_files`，避免生成空的 `.lash/owned_files.txt` 破坏 Worker 边界
  - `missing_tests` 报错补充恢复指引，明确 `--tests <path>`、`specs/tests.json` / `specs/tests/` / `specs/tests/index.json` 以及 `/build` Step 2 / `commands/build/test-gen.md` 的生成路径
  - 同步更新 `/lash-build` 前置条件、`spec` 模板、`spec.schema.json` 与 `docs/zh-CN/USER_GUIDE.md`，将 `owned_files` 与 tests artifact 都提升为显式上游契约
- 计划 / 下一步:
  - 运行受影响测试、TypeScript 诊断、全量测试与构建验证，确认无回归后拆分提交并创建 PR
- 当前问题:
  - `plan-generator` 仍对缺失 `owned_files` 保留兼容性推断；当前修复选择在 package/build 入口硬阻断，在计划层保持向后兼容，后续可再评估是否统一收紧
- 值得深入研究的问题:
  - 是否应把 spec artifact 的 schema 校验前移到 `/spec` 写出阶段或 resolver 层，从而在 `owned_files` 等关键字段缺失时更早阻断，而不是等到 `lash package` / `/lash-build` 才暴露问题

## Progress Snapshot: 2026-04-10 02:02
- 触发方式: Oracle 最终审查后的契约收口
- 本次工作:
  - 根据 Oracle 审查补充 `tests/spec-schema.test.ts`，锁定 `schemas/spec.schema.json` 对空 `owned_files` 的拒绝行为
  - 将 `schemas/spec.schema.json` 的 `owned_files` 约束从“字段存在”收紧为“字段存在且至少包含 1 个条目”
  - 同步更新 `commands/spec/schema.md` 与中文用户指南，将 `owned_files` 的口径统一为“缺失或为空都会阻断执行”
- 当前问题:
  - 无新的阻断性问题；等待重跑验证与最终 Oracle 放行

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
