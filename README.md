# betterpowershell

MCP server that runs PowerShell and WSL commands with structured stdout/stderr/exit code output for OpenCode.

## Tools

- `powershell_run` — run a PowerShell command
- `powershell_script` — run a `.ps1` script file
- `powershell_batch` — run multiple PowerShell commands sequentially
- `powershell_which` — check if a command/executable is available in PowerShell
- `wsl_run` — run a Bash command in the default WSL distro
- `wsl_script` — run a `.sh` script file in WSL
- `wsl_batch` — run multiple Bash commands sequentially in WSL
- `wsl_which` — check if a command is available in WSL

## Setup

Add to your OpenCode config (`~/.opencode/opencode.json`):

```json
"mcpServers": {
  "betterpowershell": {
    "command": "node",
    "args": ["<absolute-path-to>/betterpowershell/dist/index.js"]
  }
}
```

Build:

```bash
npm install
npm run build   # tsc
```

Requires Node >= 18. PowerShell tools use `pwsh` and fall back to Windows PowerShell 5.1. WSL tools require `wsl --install`.
