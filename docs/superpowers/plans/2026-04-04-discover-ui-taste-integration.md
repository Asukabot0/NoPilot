# Discover UI Taste Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire UI taste exploration into the `/discover` prompt so frontend products automatically go through visual design selection between Design Philosophy Extraction and Layer 3.

**Architecture:** Prompt-level integration only. Modify the discover command prompt to instruct Claude to detect frontend products, generate UI variants via Stitch MCP (with 3-tier degradation), serve interactive preview, and save results. Update User Guide with Stitch setup and usage docs.

**Tech Stack:** Markdown prompts, Stitch MCP tools, existing ui-taste TypeScript module (reference only, not modified)

---

### Task 1: Add UI Taste Exploration step to discover.md

**Files:**
- Modify: `commands/discover.md:234-237` (between Design Philosophy Extraction and Layer 3)

- [ ] **Step 1: Add the UI Taste Exploration section**

Insert a new section between "Design Philosophy Extraction" (ends at line ~235) and "Layer 3 — Requirement Lock" (starts at line ~238). The new section:

```markdown
## UI Taste Exploration (conditional, between Design Philosophy and Layer 3)

After Design Philosophy is confirmed, determine whether the product has a user-facing interface.

### Trigger Check

Evaluate from Layer 2's `tech_direction`, `mvp_features`, and `constraints.platform`:

**Trigger:** The product includes user-visible UI (web app, mobile app, desktop app, dashboard, admin panel, etc.).

**Skip:** CLI tools, pure REST APIs, data pipelines, backend microservices, SDKs, libraries. When skipping, record `"ui_taste": null` in the discover artifact and proceed directly to Layer 3.

When triggered but Stitch MCP is not configured, display this setup hint:

> "This product has a frontend. For the best UI exploration experience, configure Google Stitch MCP:
> 1. Visit stitch.withgoogle.com to get an API key
> 2. Add `@_davideast/stitch-mcp proxy` to your MCP servers with `STITCH_API_KEY`
>
> You can skip this — the system will fall back to AI-generated HTML mockups (Tier 2) or text-based questions (Tier 3)."

Proceed regardless of whether user configures Stitch.

### Phase 1 — Page Identification

From Layer 2's MVP features + core scenarios, derive the key pages/screens the product needs:
- Page name
- One-line description
- Target platform (`ios` / `android` / `web` / `desktop`)
- Device type (`MOBILE` / `TABLET` / `DESKTOP`)

Present the page list to the user for confirmation. In lite mode, keep only the single most important page.

### Phase 2 — Existing Style Detection (existing projects only)

If the user is adding features to an existing frontend project:
1. Check the project for CSS/SCSS files, Tailwind config, `design-tokens.json`, theme files, Storybook config
2. Extract a style profile: color palette, typography, spacing scale, border radius, shadows
3. Use this profile as a `designConstraint` for variant generation (`creativeRange: REFINE`)

For greenfield projects, skip this phase and use `creativeRange: REIMAGINE`.

### Phase 3 — Variant Generation (3-tier degradation)

| Tier | Condition | Action |
|------|-----------|--------|
| **1** (best) | Stitch MCP configured | Call `generate_screen_from_text` for base screen, then `generate_variants` with `variantCount: 5`. Use `GEMINI_3_1_PRO` model. |
| **2** (fallback) | No Stitch, has browser | Generate 5 distinct HTML mockups directly. Each variant uses a different color scheme and layout style. Include responsive CSS, animations, and proper typography hierarchy. |
| **3** (minimal) | CLI only / no browser | Ask text-based style preference questions: preferred color tone (warm/cool/neutral), information density (spacious/compact), animation level (none/subtle/expressive), visual style (minimal/rich). Record answers as design constraints. |

For Tier 1 and 2:
- Display generation progress to the user: "Generating variant 3/5..."
- Post-process all generated HTML: patch fonts to user-specified font stack, inline external assets as base64, verify responsive CSS (inject if missing)

### Phase 4 — Interactive Preview (Tier 1/2 only)

Serve the generated variants via a local HTTP server:
- **Tab bar** to switch between 5 variants
- **Device preview buttons**: iPhone SE / iPhone 16 Pro / iPhone 16 Pro Max / iPad mini / iPad Pro 11" / iPad Pro 13" / iPad Split View / Slide Over / Desktop / Full Screen
- **Side-by-side comparison** mode
- **Dark/Light mode** toggle for the preview page itself
- **"Select This Design" button** → POST to `/api/select`, CLI receives the selection automatically

Server behavior:
- Auto-detect available port (start from 8900)
- SSH environment → display URL instead of opening browser
- Auto-close after 30 minutes of inactivity

### Phase 5 — User Feedback & Iteration

Three feedback modes:

1. **Direct select:** User is satisfied → proceed to Phase 6
2. **Text micro-feedback:** User types adjustments ("cards rounder", "less saturated", "larger headings") → append as prompt constraints, regenerate variants with updated constraints, display new round in preview
3. **Hybrid DNA selection:** User picks dimensions from different variants ("colors from variant A, layout from variant B, animation from variant C") → synthesize a composite design constraint, generate 5 new variants

Preserve iteration history. User can say "go back to round 1" to revisit earlier variants.

### Phase 6 — Save & Cleanup

After user selects their preferred design:

1. **Dark/light pairing:** Detect if the selected variant is light or dark themed. Generate the counterpart mode. Let user confirm or adjust.
2. **Cross-page consistency:** After first page selection, extract Design DNA. Apply as constraint to all subsequent pages so styles are consistent.
3. **Save mockups:**
   - Selected HTML → `specs/mockups/{page-name}.html`
   - Dark variant (if applicable) → `specs/mockups/{page-name}-dark.html`
   - Generate `specs/mockups/index.html` linking all saved pages
4. **Export design tokens:** Write `specs/mockups/tokens.json` (W3C DTCG format for Tier 1/3) or `specs/mockups/tokens.css` (CSS custom properties for Tier 2)
5. **Update discover artifact:** Write `ui_taste` field to the discover artifact (`specs/discover.json` or `specs/discover/index.json`):
   ```json
   {
     "ui_taste": {
       "designDNA": { ... },
       "tokensPath": "specs/mockups/tokens.json",
       "mockupsDir": "specs/mockups/",
       "stitchProjectId": "<project-id or null>",
       "tier": 1,
       "selectedPages": [
         { "name": "home", "mockupFile": "home.html", "darkMockupFile": "home-dark.html" }
       ]
     }
   }
   ```
6. **Cleanup:** Kill HTTP server, delete temp files under `/tmp/nopilot-preview-*`

After completing UI Taste Exploration, proceed to Layer 3 (Requirement Lock). The selected mockups and design tokens are available for reference during requirement definition.

### Downstream Usage

- **Layer 3:** When defining UI-related requirements, reference the selected mockups for specific elements
- **`/spec` phase:** Reads `specs/mockups/` + `tokens.json` for component-level design
- **`/build` phase (Lash):** Workers read `specs/mockups/tokens.json` for style consistency. Can reference Stitch project ID for additional screens.
```

- [ ] **Step 2: Update the state machine in discover.md**

The discover prompt does not have a visual state machine diagram, but the flow transitions need to be clear. The new section is placed between the two existing sections, so no transition changes are needed in the prompt itself. Verify that the section ordering is:

1. Design Philosophy Extraction
2. UI Taste Exploration (new)
3. Layer 3 — Requirement Lock

- [ ] **Step 3: Add `ui_taste` field to the discover.json schema in discover.md**

In the `specs/discover.json` schema block (around line 336), add `ui_taste` as an optional top-level field after `context_dependencies`:

```json
  "context_dependencies": [],
  "ui_taste": null
```

- [ ] **Step 4: Verify the prompt reads correctly end-to-end**

Read the full `commands/discover.md` file after edits to verify:
- The new section is between Design Philosophy Extraction and Layer 3
- No duplicate headings
- The schema includes `ui_taste`
- The flow is coherent

- [ ] **Step 5: Commit**

```bash
git add commands/discover.md
git commit -m "feat: add UI Taste Exploration step to discover prompt

Triggered after Design Philosophy for frontend products.
3-tier Stitch MCP degradation. Saves to specs/mockups/ and discover.json."
```

---

### Task 2: Update User Guide — prerequisites and Stitch setup

**Files:**
- Modify: `docs/zh-CN/USER_GUIDE.md:135-139` (section 2.1)

- [ ] **Step 1: Add Stitch MCP as optional prerequisite**

After the existing prerequisites (Claude Code, Node.js >= 20), add:

```markdown
- (可选) [Google Stitch MCP](https://stitch.withgoogle.com) — 用于 Discover 阶段的高保真 UI mockup 生成。未配置时系统自动降级到 AI 生成的 HTML 或文字问答模式。
```

- [ ] **Step 2: Add Stitch MCP configuration section to section 6**

After section 6.1 (系统定位), add a new subsection `6.1.1 Stitch MCP 配置` with setup instructions:

```markdown
#### Stitch MCP 配置（可选，推荐）

UI Taste 系统使用 Google Stitch MCP 生成高保真设计变体。未配置时自动降级到 Tier 2（AI 生成 HTML）或 Tier 3（文字问答）。

**配置步骤：**

1. 访问 [stitch.withgoogle.com](https://stitch.withgoogle.com) 获取 API Key
2. 在 Claude Code 的 MCP 配置中添加 Stitch 服务器：

\`\`\`json
{
  "mcpServers": {
    "stitch": {
      "command": "npx",
      "args": ["@_davideast/stitch-mcp", "proxy"],
      "env": {
        "STITCH_API_KEY": "your-api-key-here"
      }
    }
  }
}
\`\`\`

3. 重启 Claude Code，验证 Stitch MCP 工具可用（如 `generate_screen_from_text`）

**三级降级策略：**

| Tier | 条件 | 体验 |
|------|------|------|
| 1 (最佳) | Stitch MCP 已配置 | Gemini 3.1 Pro 生成高保真 HTML，5 款变体 |
| 2 (回退) | 无 Stitch，有浏览器 | Claude 直接生成 5 款 HTML mockup |
| 3 (最小) | CLI / 无浏览器 | 文字问答收集风格偏好 |
```

- [ ] **Step 3: Commit**

```bash
git add docs/zh-CN/USER_GUIDE.md
git commit -m "docs(zh-CN): add Stitch MCP setup and optional prerequisite"
```

---

### Task 3: Update User Guide — Discover section and UI Taste positioning

**Files:**
- Modify: `docs/zh-CN/USER_GUIDE.md:419-533` (section 4.1 Discover)
- Modify: `docs/zh-CN/USER_GUIDE.md:1063-1070` (section 6.1)

- [ ] **Step 1: Update the state machine diagram in section 4.1**

In section 4.1's state machine (lines 427-449), add the `ui_taste` state between `design_philosophy` and `lock`:

```
idea_collection
  │ IDEA_CAPTURED
  ▼
idea_structuring
  │ IDEA_CONFIRMED
  ▼
constraint_collection
  │ MODE_SELECTED
  ▼
direction ◄───────── REJECT_ALL (重新生成方向)
  │ SELECT / MERGE
  ▼
mvp ◄──────────────── BACKTRACK (回到方向选择)
  │ APPROVE
  ▼
design_philosophy
  │ PHILOSOPHY_CONFIRMED
  ▼
ui_taste (条件触发) ── SKIP (非前端项目，直接进入 lock)
  │ TASTE_SELECTED
  ▼
lock ◄──────────────── REVISE (修改需求)
  │ APPROVE            BACKTRACK_MVP (回到 MVP)
  ▼                    BACKTRACK_DIR (回到方向选择)
$complete              FORCE_OVERRIDE (强制通过)
```

- [ ] **Step 2: Add Step 3.5 (UI Taste) to detailed steps in section 4.1**

After "Step 3: 设计哲学提取" (line ~490) and before "Step 4: 需求锁定" (line ~492), insert:

```markdown
**Step 3.5: UI Taste 探索 (ui_taste)** *(条件触发)*

仅当产品包含用户界面时触发（web/mobile/desktop app），CLI 工具和纯 API 项目跳过。

流程：
1. 从 MVP 功能列表推导关键页面
2. 检测已有前端风格（如有）
3. 生成 5 个设计变体（Stitch MCP → AI HTML → 文字问答，三级降级）
4. 启动本地预览服务器，支持设备模拟和并排对比
5. 用户选择或迭代反馈
6. 导出 Design Token 和 mockup 到 `specs/mockups/`
7. 将 `UITasteConstraint` 写入 discover.json 的 `ui_taste` 字段

详细技术文档见 [6. UI Taste 系统](#6-ui-taste-系统)。
```

- [ ] **Step 3: Fix section 6.1 positioning description**

Section 6.1 (line 1067) currently says:

> "UI Taste 系统在 `/discover` 阶段的 Step 0c 激活"

Change to:

> "UI Taste 系统在 `/discover` 阶段的 Design Philosophy 确认之后、Layer 3 需求锁定之前激活（条件触发：仅当产品包含用户界面时）"

- [ ] **Step 4: Update discover output list in section 4.1**

In the "产出" subsection (line ~528), add:

```markdown
- `specs/mockups/` -- UI mockup HTML 文件和 Design Token（仅前端项目）
```

- [ ] **Step 5: Commit**

```bash
git add docs/zh-CN/USER_GUIDE.md
git commit -m "docs(zh-CN): update Discover flow with UI Taste step and fix positioning"
```

---

### Task 4: Update Table of Contents and verify

**Files:**
- Modify: `docs/zh-CN/USER_GUIDE.md:7-77` (目录)

- [ ] **Step 1: Add new TOC entries**

Under section 6, add a sub-entry for Stitch MCP configuration. Under section 4.1, no TOC change needed (Step 3.5 is inline, not a separate heading).

Add under `- [6.1 系统定位]`:
```markdown
  - [6.1.1 Stitch MCP 配置](#stitch-mcp-配置可选推荐)
```

- [ ] **Step 2: Verify document consistency**

Read the updated file to verify:
- TOC links match actual headings
- State machine includes `ui_taste`
- Section 6.1 positioning matches the actual flow
- No broken references

- [ ] **Step 3: Commit**

```bash
git add docs/zh-CN/USER_GUIDE.md
git commit -m "docs(zh-CN): update TOC for UI Taste subsections"
```
