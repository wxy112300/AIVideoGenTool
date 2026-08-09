# Repository Instructions

## Version Management

The application follows semantic versioning while it remains in the `0.x` development phase. The current milestone is `0.2.0`, the first stable workstation milestone.

Before completing any code change, classify its release impact:

- **Patch**: bug fixes, documentation-only changes, tests, internal refactors, or small non-breaking UX corrections. Increment `0.2.x`.
- **Minor**: a new user-facing feature, workflow capability, model integration, substantial UI area, or other compatible cross-module improvement. Increment the middle number, for example `0.3.0`.
- **Major/release**: a breaking persisted-state, IPC, workflow, or public contract change requires an explicit migration plan. Use `1.0.0` only when the core application contract is stable and ready for formal release.

Any substantial or milestone-level change must increase the version in the same change. Do not merge a significant feature bundle while leaving the previous version number unchanged.

### Required Version Updates

When the version changes:

1. Update `version` in the root `package.json`.
2. Keep the root `package-lock.json` version and `packages[""].version` identical to `package.json`.
3. Keep the README current-version section and milestone description accurate.
4. Do not hardcode a second application version in renderer or Electron code. Electron reads `app.getVersion()`, and the renderer receives the same value through preload IPC.
5. Verify with `npm.cmd pkg get version` and `npm.cmd run typecheck`. Run the focused or full test suite when the change affects behavior.

For routine bumps, prefer npm's version command so both package manifests stay synchronized, for example:

```powershell
npm.cmd version patch --no-git-tag-version
npm.cmd version minor --no-git-tag-version
```

Review the resulting diff before committing. A version bump belongs in the same commit as the feature or fix it describes.

## Repository Conventions

- Preserve existing user changes and unrelated worktree changes.
- Use the existing TypeScript, Electron, Vite, and Vitest patterns.
- Keep public IPC contracts and persisted state migrations backward compatible unless the version change includes an explicit migration plan.
- Use `apply_patch` for edits to existing files and keep changes focused.
