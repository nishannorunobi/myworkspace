# Change Log
_Tracks notable workspace changes with dates_

---

## 2026-04-27 — Session 2 (re-scan)
- **Re-scan performed** — confirmed workspace structure matches Session 1 memory
- **New findings vs Session 1:**
  - `claude-agent/host/` folder discovered: contains build.sh, health.sh, start.sh, stop.sh — duplicate of dockerspace/host_scripts/ (→ C-010)
  - `pc-maker/ossetup/debian2debian/linux-lite-7.8-64bit.iso` — binary ISO confirmed in place (→ C-011)
  - `pc-maker/ossetup/debian2debian/utility/` — 9 utility install scripts confirmed
  - `mywrites/springer/` — empty folder (placeholder only)
  - `.vscode/settings.json` dirty: added `latex-workshop.latex.outDir: "%DIR%/output"` — LaTeX workshop output dir config
  - `dockerspace/project.conf` dirty: stray `r` character in comment separator (cosmetic typo)
- **No new commits** since last session (latest: 4ab2149 on 2026-04-25)
- **Concerns C-001 through C-009** remain open (none resolved)

---

## 2026-04-27 — Session 1 (initial scan)
- **Initial workspace-agent memory population** — First full scan performed. All memory files created from scratch.
- workspace-agent added to workspace (untracked, gitignored)

---

## 2026-04-25 (commit 4ab2149)
- `dockerspace/functions.sh` — modified (9 lines, reduced complexity)
- `dockerspace/project.conf` — modified (PROJECT_NAME likely updated)
- `dockerspace/start_project_container.sh` — minor addition
- `dockerspace/workspace.conf` — modified (6 lines changed)

## 2026-04-24 (commit 8ce21c7)
- `context.md` — updated (33 lines, reformatted/expanded)
- `dockerspace/dev_container.sh` — 9 lines removed
- `dockerspace/functions.sh` — minor update
- `dockerspace/prod_container.sh` — **DELETED** (39 lines removed)
- `dockerspace/project.conf` — updated
- `dockerspace/start_docker_ui.sh` — updated
- `dockerspace/test_container.sh` — **DELETED** (39 lines removed)
- `dockerspace/workspace.conf` — 3 lines removed
- **Note:** prod_container.sh and test_container.sh removed — intentional simplification

## 2026-04-24 (commit 3348f6e)
- `context.md` — large addition (113 lines added)
- `dockerspace/check_and_install_docker.sh` — new file (54 lines)
- `dockerspace/check_hostdocker.sh` — **DELETED** (123 lines) → replaced by check_and_install_docker.sh
- `dockerspace/start_docker_ui.sh` — updated
- `dockerspace/start_project_container.sh` — 2 lines removed

## 2026-04-24 (commit fd4ecb4)
- `dockerspace/os_explore.sh` — 3 lines added
- `dockerspace/restart_the_world.sh` — 8 lines added (new script)
- `dockerspace/start_system_docker.sh` — 6 lines modified
- `dockerspace/stop_system_docker.sh` — 10 lines modified
- `dockerspace/stop_the_world.sh` — 8 lines added (new script)

## 2026-04-24 (commit c4d463d)
- `dockerspace/start.sh` → renamed to `start_project_container.sh`
- `dockerspace/stop.sh` → renamed to `stop_project_container.sh`
- `dockerspace/start_system_docker.sh` — new (11 lines)
- `dockerspace/stop_system_docker.sh` — new (20 lines)
- `dockerspace/docker_backup.sh`, `troubleshoot.sh`, `workspace.conf` — minor updates

## 2026-04-24 (commit 2790245)
- `dockerspace/start_docker_ui.sh` — new (31 lines, Portainer startup)
- `dockerspace/stop_docker_ui.sh` — new (6 lines)
- Multiple config/script updates

## 2026-04-24 (commit 52ad5c0) ⚠️ LARGE CHANGE (11 files)
- `claude/CLAUDE.md` — **DELETED** (157 lines)
- `claude/claude.conf` — **DELETED** (14 lines)
- `claude/claude_cli.sh` — **DELETED** (129 lines)
- `claude/package-lock.json` — **DELETED**
- `claude/package.json` — **DELETED**
- `claude/start_claude.sh` — **DELETED**
- `claude/stop_claude.sh` — **DELETED**
- `dockerspace/workspace.conf` — major update (+31/-2 lines)
- **Note:** Entire claude/ dir content removed from git — moved to gitignored .claude/

## 2026-04-22 (commit b3c5605) ⚠️ LARGE CHANGE (18 files)
- Major structural setup commit: added copy scripts, docker_clean.sh, claude_cli.sh, project.conf, workspace.conf restructure

---

## Structural Pattern
- Workspace has been heavily refactored between 2026-04-22 and 2026-04-25
- Trend: consolidation (removing prod/test container scripts), renaming for clarity, separating system-level from project-level docker management
- OS switched from AlmaLinux 9 to postgres:16 (Debian-based) at some point — context.md still not updated to reflect this
