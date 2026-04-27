# Workspace Structure Snapshot
_Last updated: 2026-04-27_

```
/home/nishan/myworkspace/
├── claude/                          ← Claude CLI config (gitignored via .claude/)
├── dockerspace/                     ← Workspace-level Docker orchestration
│   ├── Dockerfile
│   ├── check_and_install_docker.sh
│   ├── dev_container.sh
│   ├── docker_backup.sh
│   ├── docker_clean.sh
│   ├── docker_dashboard.sh
│   ├── functions.sh
│   ├── os_explore.sh
│   ├── project.conf                 ← PROJECT_NAME=mypostgresql_db (active workspace project)
│   │                                  ⚠️ DIRTY: comment separator has stray "r" char (minor typo)
│   ├── restart_the_world.sh
│   ├── start_docker_ui.sh
│   ├── start_project_container.sh
│   ├── start_system_docker.sh
│   ├── stop_docker_ui.sh
│   ├── stop_project_container.sh
│   ├── stop_system_docker.sh
│   ├── stop_the_world.sh
│   ├── troubleshoot.sh
│   └── workspace.conf               ← IMAGE_VERSION=1.4, BASE_IMAGE=postgres:16, PKG_MANAGER=apt
├── mountspace/                      ← Local files, never committed
├── projectspace/                    ← All active projects (gitignored)
│   ├── ai-agents/
│   │   └── claude-agent/
│   │       ├── dockerspace/
│   │       │   ├── container_scripts/
│   │       │   │   └── check_env.sh
│   │       │   ├── host_scripts/
│   │       │   │   ├── build.sh
│   │       │   │   ├── health.sh
│   │       │   │   ├── login_docker.sh
│   │       │   │   ├── start.sh
│   │       │   │   └── stop.sh
│   │       │   ├── Dockerfile
│   │       │   └── docker-compose.yml  ← uses ums-network, connects to ums-app + mypostgresql_db-container
│   │       ├── host/
│   │       │   ├── build.sh          ⚠️ ANOMALY: scripts also in host/ (outside dockerspace/host_scripts/)
│   │       │   ├── health.sh
│   │       │   ├── start.sh
│   │       │   └── stop.sh
│   │       ├── sql/
│   │       │   ├── init_agent_schema.sql
│   │       │   └── init_db.sh
│   │       ├── agent.conf              ← GITIGNORED (real secrets)
│   │       ├── agent.conf.example
│   │       ├── agent.py
│   │       ├── db.py
│   │       ├── requirements.txt
│   │       └── tools.py
│   ├── myapigw/
│   │   └── README.md                  ← stub only, not yet developed ⚠️ no dockerspace/
│   ├── mypostgresql_db/
│   │   ├── dockerspace/
│   │   │   ├── container_scripts/
│   │   │   │   └── db_ui.sh
│   │   │   ├── host_scripts/
│   │   │   │   ├── loginto_docker.sh
│   │   │   │   ├── run_in_host.sh
│   │   │   │   ├── start.sh
│   │   │   │   └── stop.sh
│   │   │   ├── Dockerfile             ← ARG BASE_IMAGE=postgres:16
│   │   │   └── project.conf           ← CONTAINER_NAME=mypostgresql_db-container, PORT=8085:8085
│   │   ├── umsdb/
│   │   │   ├── init/
│   │   │   │   ├── 01_create_user.sql
│   │   │   │   ├── 02_create_database.sql
│   │   │   │   ├── 03_create_tables.sql
│   │   │   │   └── 04_seed_data.sql
│   │   │   └── scripts/
│   │   │       ├── connect.sh
│   │   │       ├── reset_db.sh
│   │   │       └── startdb.sh
│   │   └── readme.md
│   ├── mywrites/
│   │   ├── amazon/                    ← quantum_machine_is_here paper (LaTeX + Python)
│   │   │   ├── images/                ← cover_page_v1.jpg/pdf/svg
│   │   │   ├── output/                ← compiled PDF + latex build artifacts
│   │   │   ├── export_docx.py
│   │   │   ├── install_latex.md
│   │   │   ├── prompt_instructions.md
│   │   │   ├── quantum_machine_is_here.properties
│   │   │   ├── quantum_machine_is_here.py
│   │   │   └── quantum_machine_is_here.tex
│   │   └── springer/                  ← empty folder (placeholder)
│   ├── pc-maker/
│   │   ├── home/user/                 ← empty (user home dotfiles placeholder)
│   │   ├── ossetup/debian2debian/
│   │   │   ├── utility/               ← install scripts: chrome, docker, git, ssh, vim, vscode, etc.
│   │   │   ├── boot_usbdrive.sh
│   │   │   ├── check_usbdrive.sh
│   │   │   ├── format_usbdrive.sh
│   │   │   ├── linux-lite-7.8-64bit.iso  ⚠️ BINARY ISO in git-tracked-area
│   │   │   ├── os_lookup.sh
│   │   │   └── safely_remove_usbdrive.sh
│   │   ├── pchealth/
│   │   │   ├── disk_health.sh
│   │   │   └── system_info.sh
│   │   └── README.md
│   ├── ums/
│   │   ├── dockerspace/
│   │   │   ├── container_scripts/
│   │   │   │   ├── health.sh
│   │   │   │   ├── start.sh
│   │   │   │   └── stop.sh
│   │   │   ├── host_scripts/
│   │   │   │   ├── Dockerfile         ← Multi-stage: maven:3.9-temurin-21-alpine → eclipse-temurin:21-jre-alpine
│   │   │   │   ├── Makefile
│   │   │   │   ├── docker-compose.yml ← container_name=ums-app, port=8080, ums-network, env_file=../../.env
│   │   │   │   ├── health_from_host.sh
│   │   │   │   ├── login_docker.sh
│   │   │   │   ├── restart_docker.sh
│   │   │   │   ├── start_docker.sh
│   │   │   │   └── stop_docker.sh
│   │   │   └── prometheus.yml
│   │   ├── k8s/
│   │   ├── src/
│   │   │   ├── main/
│   │   │   └── test/
│   │   ├── README.md
│   │   ├── mvnw
│   │   └── pom.xml
│   └── mywritings.zip                 ⚠️ ANOMALY: binary zip in projectspace root
├── workspace-agent/                   ← Workspace Management Agent (this agent)
│   ├── memory/
│   │   ├── change_log.md
│   │   ├── concerns.md
│   │   ├── gitignore_content.md
│   │   ├── meta.json
│   │   ├── projects.md
│   │   ├── proposed_gitignore.md
│   │   ├── sessions.md
│   │   └── workspace_structure.md
│   ├── agent.conf
│   ├── agent.conf.example
│   ├── agent.py
│   ├── build.sh
│   ├── health.sh
│   ├── prompt.md
│   ├── requirements.txt
│   ├── start.sh
│   ├── stop.sh
│   └── tools.py
├── README.md
├── context.md                         ⚠️ STALE: references AlmaLinux9/dnf/IMAGE_VERSION=1.3 — actual is postgres:16/apt/1.4
├── copy_host2mount.sh
└── myworkspace_struct.sh
```

## Notes
- Shared Docker network: `ums-network` (external, must be pre-created)
- Portainer: http://localhost:9000
- workspace-agent/ is untracked (gitignored)
- .claude/ untracked (gitignored)
- .vscode/settings.json: DIRTY — added latex-workshop.latex.outDir setting (uncommitted)
- dockerspace/project.conf: DIRTY — stray "r" character in comment separator line (uncommitted)
