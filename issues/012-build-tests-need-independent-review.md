# 012 - build 阶段生成的测试应由独立 agent review

## 来源

`.claude/commands/build.md` Step 2 — Generate tests.json（第32-51行）

## 问题描述

当前 build agent 生成 tests.json 后，review 机制存在两个问题：

1. **review 是可选的** — 取决于 `workflow.json` 的 `test_review_checkpoint` 配置，默认可能跳过
2. **即使开启 review，也是直接交给人类** — 人类审阅整个 tests.json 负担极重，且缺乏专业的测试质量评估

按照 006 的"生成与评审分离"原则，测试是 build agent 生成的，不应该由自己评估质量，也不应该把未经专业审查的内容直接甩给人类。

## 期望行为

tests.json 生成后，必须由独立 agent 进行测试质量 review，检查项包括：

- **覆盖率真实性** — requirements_covered 是否真的被测试覆盖，还是只是标记了 ref 但测试实际没有验证到
- **边界条件充分性** — 是否只写了 happy path，遗漏了 boundary/error 场景
- **测试可执行性** — 测试的 input/expected_output 是否合理、可执行
- **需求映射准确性** — ears_ref 和 requirement_refs 是否正确对应
- **property test 质量** — 不变量测试是否真的能捕获违反不变量的情况

review 通过后，人类只需看 review 摘要，而非整个 tests.json。

## 关联

- 006（生成与评审分离 + 迭代验证循环）的具体应用场景
