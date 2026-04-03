# Lash Batch Execution Phase

You are executing a parallel batch of modules in a Lash build. Each module follows the same spawn → test → classify → critic → merge cycle.

You receive: batch module list with platform assignments, completed module list, project root.

## Execution

For each module in this batch, follow the EXACT same process as described in `commands/lash-tracer.md` steps 1-9:

1. Create worktree
2. Generate task package (include completed modules for interface references)
3. Spawn Worker on assigned platform
4. Wait for completion
5. Run external tests
6. Handle failures (L0/L1/L2/L3 classification + feedback loop)
7. Module Critic review
8. Merge to main
9. Update build state

## Parallel Spawning

You MAY spawn multiple Workers simultaneously (all modules in this batch have no mutual dependencies). However:

- **Merge must be sequential**: after all Workers complete and pass Critic, merge one at a time to avoid git conflicts.
- **If merge conflict occurs**: spawn a conflict-resolution Worker in a new worktree (use `commands/lash-conflict-resolver.md` as instruction) to resolve, then re-test and re-merge.

## Dependency Context

When generating task packages, pass `--completed <list>` with ALL modules that have been merged before this batch (tracer modules + any previous batch modules). This ensures Workers get the correct interface references.

## Output

Report back to the calling agent: batch result (success/partial/failure), modules completed, modules failed, any L2/L3 escalations.
