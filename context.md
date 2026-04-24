# Workspace Context

## Project: myworkspace
A Dockerized workspace that acts as a container dashboard to manage all project containers, Claude CLI, and other tools.

---

## Architecture

### Workspace Role
- `myworkspace` is the **dashboard/orchestrator** — manages all project containers, Claude, Docker UI
- Each project (API-Gateway, ums) runs in its **own independent container**
- Docker UI (Portainer) manages all containers from the browser

### Directory Structure
```
myworkspace/
  dockerspace/          ← all workspace-level docker scripts
  projectspace/         ← cloned project repos (gitignored)
    API-Gateway/
      dockerspace/      ← independent container scripts for APISIX project
    ums/
      dockerspace/      ← independent container scripts for UMS project
  mountspace/           ← local files, never committed (gitignored)
  claude/               ← Claude CLI (gitignored)
  context.md            ← this file
```

---

## Configuration Files

### workspace.conf (OS/infrastructure level)
- `PROJECT_NAME` → drives `IMAGE_NAME` and `CONTAINER_NAME`
- `BASE_IMAGE` → current: `almalinux:9`
- `PKG_MANAGER` → current: `dnf`
- `IMAGE_VERSION` → current: `1.3`
- Package names and versions (configurable per distro)

### project.conf (project-specific)
- `PROJECT_NAME` → sourced FIRST so workspace.conf can reference it
- `GIT_USER_NAME`, `GIT_USER_EMAIL`
- `GIT_CLONE_URL` → currently pointing to ums repo
- Source order: `project.conf` → `workspace.conf` (project.conf must come first)

---

## Scripts — Workspace Level (dockerspace/)

| Script | Purpose |
|---|---|
| `start_project_container.sh` | Build image + start workspace container |
| `stop_project_container.sh` | Stop workspace container |
| `start_system_docker.sh` | Start Docker daemon + socket |
| `stop_system_docker.sh` | Stop all containers + Docker daemon + socket |
| `stop_the_world.sh` | stop_system_docker → shutdown PC |
| `restart_the_world.sh` | stop_system_docker → reboot PC |
| `start_docker_ui.sh` | Start Portainer CE on port 9000 |
| `stop_docker_ui.sh` | Stop Portainer |
| `check_and_install_docker.sh` | Check/install Docker, report status (manual use) |
| `os_explore.sh` | Open OS filesystem in VSCode as root |
| `docker_backup.sh` | Snapshot container state to versioned image |
| `docker_clean.sh` | Clean unused Docker resources |
| `docker_dashboard.sh` | Dashboard overview |
| `functions.sh` | Shared library (install_packages, setup_user, etc.) |
| `dev_container.sh` | Setup script run inside workspace container |

## Scripts — Per-Project Level (project/dockerspace/)

Each project (API-Gateway, ums) has its own independent:
- `start.sh` / `stop.sh`
- `workspace.conf` (IMAGE_NAME, CONTAINER_NAME, BASE_IMAGE, PKG_MANAGER)
- `project.conf` (git identity, project tools)
- `Dockerfile`
- `functions.sh`
- `setup.sh` (runs inside container on first start)

---

## Projects

### API-Gateway (APISIX)
- Repo: `git@github.com:nishannorunobi/myapigw.git`
- OS: AlmaLinux 9
- Purpose: APISIX API gateway for Node.js backend service
- Container: `apigw-container`, Image: `apigw-image`

### UMS (User Management System)
- Repo: `git@github.com:nishannorunobi/ums.git`
- OS: AlmaLinux 9
- Container: `ums-container`, Image: `ums-image`

---

## Key Decisions & Rules

- **OS changes** → update `workspace.conf`: `BASE_IMAGE`, `PKG_MANAGER`, package names
- **Project name** → set in `project.conf`, drives image/container naming in `workspace.conf`
- **Source order** → always `project.conf` first, then `workspace.conf`
- **Docker auto-start disabled** → `sudo systemctl disable docker.service docker.socket`
- **check_and_install_docker.sh** is standalone — does NOT auto-start daemon
- **start_project_container.sh** does NOT auto-start Docker — fails naturally if daemon is down
- **Claude permissions** → configured in `~/.claude/settings.json` (outside workspace, user-controlled)
- **claude/** directory is gitignored and excluded from version control
- **Portainer** runs on `http://localhost:9000`

---

## OS & Environment
- OS: Linux (Ubuntu/XFCE desktop)
- Docker base image: AlmaLinux 9
- Package manager inside containers: dnf
- Guake terminal set to autostart via `~/.config/autostart/guake.desktop`
