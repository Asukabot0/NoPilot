# Standard Content Pack — Long-term Vision Update (2026-05-20)

> 这是一份**仅供编辑 agent 使用的标准内容包**，目的是确保 README / ROADMAP / CLAUDE 等多份文档在描述长期愿景时使用一致的术语和措辞。所有 agent 必须从本文件取词，不要自行改写核心定位句。
>
> 本文件不是面向终端用户的文档，编辑完成后可保留为决策档案。

---

## 0. 术语表（所有文档统一用词）

| 中文 | English | 含义 |
|---|---|---|
| 长期愿景 / 终局愿景 | Long-term Vision / North Star | 3-5 年方向，无交付承诺 |
| AI 交付治理 | AI Delivery Governance | NoPilot 对 AI 生成代码进入生产前的治理定位 |
| 不做清单 | Non-Goals | 明确不替代/不承担的范围 |
| 自治分级 | Risk-tier Autonomy Level | L1/L2/L3，与 L0-L3 异常分级正交 |
| 异常分级 | Exception Tier | 现有 L0/L1/L2/L3，处理失败时的路由 |
| 演化路径 | Evolution Path | 个人 → 团队 → 企业三阶段 |
| 防重构准备 | Refactor-proofing | 4 件早期投资，降低未来重构成本 |
| 重构拐点 | Architectural Inflection Point | 必然发生的核心架构调整时机 |

---

## 1. 长期愿景陈述（README "What It Is" 后的 Vision 段）

### English (for README.md)

```markdown
## Long-term Vision

NoPilot's North Star is an **enterprise-grade AI delivery governance platform** — a control layer
that lets organizations adopt AI coding agents (Claude Code, Codex, Cursor, Copilot, OpenCode, …)
without losing auditability, contract integrity, or release safety.

We get there in three stages, each building on the previous:

1. **Personal layer (current — V1.x):** Single-developer Greenfield workflow framework.
   Spec-as-contract, generation-review separation, multi-agent orchestration via Lash.
2. **Team layer (V2 → V3):** Shared specs and decision ledger, PR / issue / CI-failure entry points,
   web dashboard for traceability, multi-model verification, MCP enforcement.
3. **Enterprise layer (V4 → North Star):** SSO/RBAC, audit logs, private deployment,
   compliance reports, AI Delivery Governance — risk-tiered release contracts that integrate with
   (never replace) the team's existing CI/CD, feature flags, APM, and incident management tools.

The framing is consistent across all three stages: **NoPilot governs the AI-generated change;
existing infrastructure executes it.**
```

### 中文 (for docs/zh-CN/README.md)

```markdown
## 长期愿景

NoPilot 的终局愿景是**企业级 AI 交付治理平台** —— 一个让组织在采用 Claude Code、Codex、Cursor、
Copilot、OpenCode 等 AI 编码代理时，仍能保持可审计、契约可信、发布安全的控制层。

通往这个终局的路径分三个阶段，每一阶段建立在前一阶段之上：

1. **个人层（当前 — V1.x）：** 单人 Greenfield 项目工作流框架。规格即契约，生成-评审分离，
   通过 Lash 实现多代理编排。
2. **团队层（V2 → V3）：** 共享规格与决策账本、PR / Issue / CI 失败入口、可视化 Web Dashboard、
   多模型校验、MCP 强制约束。
3. **企业层（V4 → North Star）：** SSO/RBAC、审计日志、私有部署、合规报告、AI 交付治理 ——
   基于风险分级的发布契约，与团队既有 CI/CD、Feature Flag、APM、Incident Management 工具
   **协同而非替代**。

三个阶段的核心立场始终一致：**NoPilot 治理 AI 生成的变更，既有基础设施执行变更**。
```

---

## 2. Non-Goals 章节（README "Why This Approach" 后）

### English

```markdown
## Non-Goals

To keep NoPilot focused, we explicitly **do not** plan to:

- **Replace CI/CD pipelines.** Jenkins, GitHub Actions, ArgoCD, Spinnaker remain the executors.
  NoPilot produces release contracts they consume.
- **Replace feature flag platforms.** LaunchDarkly, Unleash, Statsig keep their role.
  NoPilot recommends flag configuration based on spec risk tier.
- **Replace APM / observability tools.** Sentry, Datadog, New Relic continue to monitor production.
  NoPilot consumes their signals as post-deploy verification evidence.
- **Replace incident management.** PagerDuty, Opsgenie keep handling on-call.
  NoPilot supplies change provenance and rollback recommendations when an incident is linked back.
- **Write to production databases or invoke paid third-party APIs without human approval.**
- **Promise L5 fully-autonomous delivery.** Risk-tier L3 (security, payments, permissions,
  data migration, compliance) always requires human approval, by design.
```

### 中文

```markdown
## 不做清单（Non-Goals）

为了保持 NoPilot 的定位清晰，我们明确**不会**做以下事情：

- **不替代 CI/CD 流水线。** Jenkins、GitHub Actions、ArgoCD、Spinnaker 继续担任执行者，
  NoPilot 产出可被它们消费的发布契约。
- **不替代 Feature Flag 平台。** LaunchDarkly、Unleash、Statsig 保留各自角色，
  NoPilot 基于规格风险等级**建议**flag 配置。
- **不替代 APM / 可观测平台。** Sentry、Datadog、New Relic 继续监控生产，
  NoPilot 把它们的信号回流为部署后验证证据。
- **不替代事件管理。** PagerDuty、Opsgenie 继续处理 on-call，
  NoPilot 提供变更溯源与回滚建议。
- **不在没有人类批准的情况下写入生产数据库或调用付费第三方 API。**
- **不承诺 L5 级完全自治交付。** 风险分级 L3（安全、支付、权限、数据迁移、合规）
  在设计上**永远**需要人类批准。
```

---

## 3. Risk-tier 自治分级（README + ROADMAP 都引用）

### 统一定义（中英共用语义）

| Tier | Scope | Autonomy | Approval |
|---|---|---|---|
| **L1** | Docs, configs, internal tools, low-risk UI tweaks | Auto-PR + auto-merge to non-prod | None required (audited) |
| **L2** | Standard business features | Auto-PR + auto-verification | Human approval before prod |
| **L3** | Security, auth/permissions, payments, data migration, compliance | NoPilot only produces evidence + rollback plan | Human approval **always required** |

### 与现有 L0-L3 异常分级的关系

> **正交，不冲突。** Exception tier 描述"失败如何处理"，Risk tier 描述"任务可以被多自治地执行"。
> 一个 L1 风险任务遇到 L3 异常仍要 escalate；一个 L3 风险任务即使全程没有 L0-L3 异常也仍需人工批准。

### 中文表达（直接复制到 docs/zh-CN）

```markdown
### 风险分级（Risk-tier）

| 等级 | 适用范围 | 自治程度 | 审批要求 |
|---|---|---|---|
| **L1** | 文档、配置、内部工具、低风险 UI 调整 | 自动 PR + 自动合并到非生产环境 | 无需人工审批（仍记录审计） |
| **L2** | 普通业务功能 | 自动 PR + 自动验收 | 进入生产前需要人工批准 |
| **L3** | 安全、权限、支付、数据迁移、合规 | NoPilot 只产出证据链与回滚预案 | **永远需要人工批准** |

> **与 L0-L3 异常分级正交。** 异常分级描述"失败如何处理"，风险分级描述"任务可以被多自治地执行"。
> 二者并存，互不替代。
```

---

## 4. North Star / Delivery Governance 章节（ROADMAP V4 之后）

### English (for ROADMAP.md)

```markdown
---

## North Star — Long-term Vision (Non-committed, Directional)

> The sections below describe **direction**, not deliverables. Items here have no version
> assignment and no timeline commitment. They exist to anchor product positioning and to
> filter design partners. Concrete delivery items that emerge from this vision will be
> promoted into a numbered version (V5+) when ready.

### Team Layer

- Shared spec / decisions ledger across team members
- PR / issue / CI-failure entry points (in addition to `/discover`)
- Web dashboard: traceability graph, pipeline status, decision timeline
- Multi-model verification (Critic and Supervisor on independent models)
- MCP-enforced constraints in Lash worker boundaries

### Enterprise Layer

- SSO / RBAC / audit log / private deployment
- Compliance reporting (SOC2-friendly evidence trails)
- Multi-tenant artifact store
- Private model routing and data-residency controls

### AI Delivery Governance Layer

NoPilot's most distinct long-term position. **All four points below are governance, not execution.**

- **Risk-tiered release contracts.** Every AI-generated change is annotated with risk tier,
  rollback plan, canary strategy, and observability whitelist — consumed by the team's existing
  CD system.
- **Feature-flag advisory.** Integrate with LaunchDarkly / Unleash / Statsig to recommend
  flag configuration based on spec risk tier. The flag platform remains authoritative.
- **Evidence-driven post-deploy validation.** Production signals from Sentry / Datadog / New Relic
  flow back into the evidence graph as post-hoc acceptance for the originating change.
- **Rollback recommendation, human-approved execution.** When an incident is linked back to a
  NoPilot-produced change, NoPilot surfaces the change provenance and a rollback proposal.
  The actual rollback is executed by the CD system after human approval.

### Non-Goals (restated)

NoPilot will **not** replace CI/CD, feature-flag platforms, APM, or incident-management tools.
NoPilot will **not** auto-execute production-impacting changes without explicit human approval
above risk tier L1.
```

### 中文（直接复制到 docs/zh-CN/ROADMAP.md）

```markdown
---

## North Star — 长期愿景（无时间承诺，方向性）

> 下面的内容描述**方向**，不是可交付项。这里没有版本号、没有时间承诺。
> 存在的意义是锚定产品定位、筛选合适的早期客户。从这个愿景里成熟的具体交付，
> 会在条件具备时晋升为带版本号的路线图（V5+）。

### 团队层

- 团队成员共享规格与决策账本
- PR / Issue / CI 失败入口（在 `/discover` 之外）
- Web Dashboard：可追溯性图、流水线状态、决策时间线
- 多模型校验（Critic 与 Supervisor 跑在不同模型上）
- Lash worker 边界由 MCP 强制执行

### 企业层

- SSO / RBAC / 审计日志 / 私有部署
- 合规报告（SOC2 友好的证据链）
- 多租户 artifact 存储
- 私有模型路由与数据驻留控制

### AI 交付治理层

NoPilot 长期最独特的定位。**下面四条都是治理，不是执行。**

- **风险分级发布契约。** 每一次 AI 生成的变更都标注风险等级、回滚预案、灰度策略、
  可观测指标白名单 —— 由团队既有 CD 系统消费执行。
- **Feature Flag 顾问。** 与 LaunchDarkly / Unleash / Statsig 协同，根据规格风险等级
  **建议** flag 配置。flag 平台保留最终权威。
- **证据驱动的部署后验证。** Sentry / Datadog / New Relic 的生产信号回流到 evidence graph，
  作为对应变更的事后验收。
- **回滚建议，人工批准执行。** 当事件被回溯到某次 NoPilot 产出的变更时，
  NoPilot 提供变更溯源与回滚预案。**回滚动作由 CD 系统在人工批准后执行。**

### 不做清单（重申）

NoPilot **不会**替代 CI/CD、Feature Flag 平台、APM、事件管理工具。
NoPilot **不会**在 L1 风险等级以上自动执行影响生产的变更，必须有人类批准。
```

---

## 5. 架构重构拐点（ROADMAP 版本间过渡说明）

### 加在 ROADMAP V2 末尾、V3 开头之间

#### English

```markdown
---

### Architectural Inflection Point — V2 → V3

NoPilot's first major architectural shift happens between V2 and V3:
**prompt-driven workflow → runtime-driven orchestration.**

Today the workflow lives primarily in `commands/*.md`, with `workflow.json` as a declarative
schema interpreted by an LLM reading skill files. Enterprise needs (audit, replayability,
deterministic state transitions, mid-run interruption/recovery) require promoting the workflow
to an executable orchestrator. Skills will become prompt templates invoked **by** the runtime
rather than the runtime itself.

Estimated impact: ~30-40% of core code (commands/, workflow runtime, Lash dispatch, artifact I/O).
Mitigated by the V1.5 refactor-proofing items below.
```

#### 中文

```markdown
---

### 架构重构拐点 —— V2 → V3

NoPilot 的第一次核心架构调整发生在 V2 与 V3 之间：
**prompt-driven 工作流 → runtime-driven 编排。**

当前工作流主要存在于 `commands/*.md` 中，`workflow.json` 是声明式 schema，由 LLM 阅读 skill
文件来推进流程。企业级需求（审计、可重放、确定性状态转移、运行中可中断/可恢复）要求把工作流
升级为可执行的 orchestrator。skills 会退化为被 runtime **调用**的 prompt 模板，而不再是 runtime 本身。

影响范围估算：核心代码约 30-40%（commands/、workflow runtime、Lash 调度、artifact I/O）。
通过下面 V1.5 的"防重构准备"投资来降低这次重构的成本。
```

### 加在 ROADMAP V3 末尾、V4 开头之间

#### English

```markdown
---

### Architectural Inflection Point — V3 → V4

The second major shift: **local CLI → team backend service.**

V1.x ~ V3 keeps all artifacts in the user's local `specs/` folder; CLI runs on the developer's
machine. Team-layer features (shared specs, PR webhooks, web dashboard, multi-user concurrent
spec edits, audit logs) require centralized storage and server-side coordination.

Scope: add a backend service tier. **Core algorithms (Critic / Supervisor / Lash dispatch /
failure classifier) are not rewritten** — only their I/O and state-store boundaries.
```

#### 中文

```markdown
---

### 架构重构拐点 —— V3 → V4

第二次核心架构调整：**本地 CLI → 团队后端服务。**

V1.x ~ V3 把所有 artifact 存在用户本地 `specs/` 文件夹中，CLI 跑在开发者的机器上。
团队层功能（共享规格、PR webhook、Web Dashboard、多人并发改 spec、审计日志）
要求中心化存储与服务端协调。

范围：增加一层后端服务。**核心算法（Critic / Supervisor / Lash 调度 / 失败分类）不重写**，
只调整它们的 I/O 与状态存储边界。
```

---

## 6. 防重构准备（V1.5 新增章节）

### 加在 ROADMAP V1.5 现有内容末尾

#### English

```markdown
### Refactor-Proofing (Tech Debt Investment)

Four small investments now make the V2→V3 and V3→V4 inflection points 30-50% cheaper.
These are tracked separately from feature work.

- [ ] **Unify artifact I/O behind an `ArtifactStore` interface.** Today `fs.writeFileSync` is
  scattered across many call sites. Wrap it in a `LocalFsStore` implementing a small interface;
  future `RemoteStore` (V4) can drop in without rewriting call sites.
- [ ] **Add an `execution_model_version` field to `workflow.json`.** Today nothing distinguishes
  prompt-driven from runtime-driven semantics. Adding the field now lets the V3 runtime detect
  and migrate older workflow definitions safely.
- [ ] **Schema versioning + migration scaffolding.** Add a `schema_version` field to all artifact
  types; ship an empty `migrations/` directory with a stub runner. Future schema changes will not
  break existing projects.
- [ ] **Concentrate CLI side-effects in `lash` subcommands, not in skill markdown.** Today some
  side-effects (file writes, state mutations) are described in markdown and executed by the LLM.
  Migrate them into atomic `lash` subcommands. This also eliminates the documentation/CLI
  consistency risk demonstrated by the historical `lash state read` issue.
```

#### 中文

```markdown
### 防重构准备（技术债投资）

四件现在做的小投资，能让 V2→V3 和 V3→V4 两次重构拐点的成本降低 30-50%。
独立于功能工作单独跟踪。

- [ ] **把 artifact I/O 统一到 `ArtifactStore` 接口背后。** 当前 `fs.writeFileSync` 散落在
  很多调用点。用一个 `LocalFsStore` 实现一个小接口包起来；未来的 `RemoteStore`（V4）
  可以无侵入替换，不需要改调用点。
- [ ] **给 `workflow.json` 加 `execution_model_version` 字段。** 当前没有任何字段能区分
  prompt-driven 与 runtime-driven 语义。现在加字段，未来 V3 runtime 能识别并安全迁移
  旧版工作流定义。
- [ ] **Schema 版本化 + migration 脚手架。** 给所有 artifact 类型加 `schema_version` 字段；
  附带一个空的 `migrations/` 目录与 stub runner。未来 schema 变更不会破坏现有项目。
- [ ] **把 CLI 副作用集中到 `lash` 子命令里，而不是散在 skill markdown。** 当前部分副作用
  （写文件、改状态）是写在 markdown 里由 LLM 执行。把它们迁移到原子 `lash` 子命令中。
  这也顺带消除了 `lash state read` 这类历史文档/CLI 不一致风险。
```

---

## 7. 必要的修补项（不属于愿景，纯粹是过时内容）

下面这些是 audit 中发现的具体过时点，编辑 agent 顺手修掉即可：

| 文件 | 行号 | 当前内容 | 改成 |
|---|---|---|---|
| `docs/zh-CN/USER_GUIDE.md` | L119 附近 | "npm package 0.0.6" | "npm package 0.0.7" |
| `docs/tracking/progress.md` | 头部 | "V1.1 (Schema 4.0) — Delivered" | "V1.2 (Schema 4.0) — Delivered" |
| `commands/lash-build.md` | L70, L96, L112 | `lash state read` | `cat specs/build-state.json`（或等价 `jq` 读法）。同时在 V1.5 防重构准备的第 4 项里登记"补 `lash state read` 子命令"作为后续动作。 |

---

## 8. 编辑准则（agent 必读）

1. **不要改写本内容包里的核心定位句**。可以拆分段落、调整顺序，但句子主语和主谓宾必须保留。
2. **保持中英文对齐**。如果在英文文档里加了一段，中文文档对应位置必须有等价段。
3. **保留 NoPilot 当前阶段的 Greenfield/Personal 定位**——它没有过时，只是"当前阶段"，
   长期愿景与之不矛盾。删除任何"Greenfield"字样会破坏当前用户对工具范围的认知。
4. **新增章节标题层级**遵循各文件原有层级习惯（README 用 `##`，ROADMAP V 块用 `##`，
   过渡说明用 `###`）。
5. **不要新建多余的中间文件**。编辑直接落到 README/ROADMAP/CLAUDE 等现有文件。

---

**Authoring note:** 本内容包基于 2026-05-19/05-20 主人与 Claude 关于 NoPilot 长期愿景、
企业推广路径、架构重构拐点的对话整理。是设计决策的快照，不是实现计划。
