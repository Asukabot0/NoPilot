<!-- nopilot-managed v<%=VERSION%> -->

# supervisor/scoring — Drift Score + Confidence + Action Matrix

For each of the three core dimensions, produce a quantitative score rather than a binary label.

## Drift Score (0-100)

- **0-10:** Fully aligned. No detectable drift.
- **11-30:** Minor drift. Isolated deviations that do not affect the overall direction. Proceed with note.
- **31-60:** Moderate drift. Multiple signals detected or a single high-severity pattern. Review recommended.
- **61-100:** Severe drift. The output has meaningfully diverged from the user's intent. Halt and present findings.

## Confidence Level

Rate your own assessment confidence:
- **high:** The signals are clear and unambiguous. The anchor provides sufficient context to judge.
- **medium:** Some signals are present but interpretation requires assumptions. Findings should be reviewed by the user.
- **low:** The anchor is vague or the output is complex enough that drift assessment is uncertain. Recommend user review regardless of score.

## Recommended Action Matrix

Based on drift score and confidence:

| Drift Score | Confidence | Action |
|-------------|-----------|--------|
| 0-10 | any | `proceed` |
| 11-30 | high | `proceed` |
| 11-30 | medium/low | `review` |
| 31-60 | any | `review` |
| 61-100 | any | `halt` |
