import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { execFileSync } from "child_process";

const POWERSHELL = process.env.PWSH_PATH || "pwsh";
const PS_FALLBACK = "powershell";
const WSL = "wsl";
const SHELL = pickShell();

function pickShell(): string {
  try {
    execFileSync(POWERSHELL, ["-NoProfile", "-Command", "exit 0"], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return POWERSHELL;
  } catch {
    return PS_FALLBACK;
  }
}

function runCmd(shell: string, args: string[]): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  try {
    const stdout = execFileSync(shell, args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "",
      exitCode: err.status ?? 1,
    };
  }
}

function runShell(command: string) {
  return runCmd(pickShell(), ["-NoProfile", "-Command", command]);
}

function runScript(scriptPath: string) {
  return runCmd(pickShell(), ["-NoProfile", "-File", scriptPath]);
}

function runWsl(command: string) {
  return runCmd(WSL, ["bash", "-c", command]);
}

function runWslScript(scriptPath: string) {
  return runCmd(WSL, ["bash", scriptPath]);
}

const TOOLS: Tool[] = [
  {
    name: "powershell_run",
    description: "Run a PowerShell command and return structured stdout/stderr/exit code.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "PowerShell command to run" },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
  {
    name: "powershell_script",
    description: "Run a PowerShell .ps1 script file and return structured output.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the .ps1 script" },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "powershell_batch",
    description: "Run multiple PowerShell commands sequentially, returning each result.",
    inputSchema: {
      type: "object",
      properties: {
        commands: {
          type: "array",
          items: { type: "string" },
          description: "PowerShell commands to run in order",
        },
      },
      required: ["commands"],
      additionalProperties: false,
    },
  },
  {
    name: "powershell_which",
    description: "Check whether a PowerShell command/executable is available.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Command name to check" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "wsl_run",
    description: "Run a command in the default WSL distro and return structured output.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Bash command to run in WSL" },
      },
      required: ["command"],
      additionalProperties: false,
    },
  },
  {
    name: "wsl_script",
    description: "Run a Bash .sh script file in WSL and return structured output.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path to the .sh script (WSL path)" },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    name: "wsl_batch",
    description: "Run multiple Bash commands sequentially in WSL, returning each result.",
    inputSchema: {
      type: "object",
      properties: {
        commands: {
          type: "array",
          items: { type: "string" },
          description: "Bash commands to run in order in WSL",
        },
      },
      required: ["commands"],
      additionalProperties: false,
    },
  },
  {
    name: "wsl_which",
    description: "Check whether a command is available in the default WSL distro.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Command name to check" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
];

const server = new Server(
  {
    name: "betterpowershell",
    version: "0.1.0",
  },
  {
    capabilities: { tools: {} },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "powershell_run") {
    const result = runShell(String(args?.command));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              command: args?.command,
              shell: SHELL,
              ...result,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === "powershell_script") {
    const result = runScript(String(args?.path));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              path: args?.path,
              shell: SHELL,
              ...result,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === "powershell_batch") {
    const results = (args?.commands as string[]).map((cmd) => ({
      command: cmd,
      ...runShell(cmd),
    }));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ shell: SHELL, results }, null, 2),
        },
      ],
    };
  }

  if (name === "powershell_which") {
    const result = runShell(
      `$c = Get-Command ${String(args?.name)} -ErrorAction SilentlyContinue; if ($c -ne $null) { "AVAILABLE"; if ($c.Path) { $c.Path } } else { "NOTFOUND" }`
    );
    const lines = result.stdout.trim().split(/\r?\n/).filter(Boolean);
    const available = lines.includes("AVAILABLE");
    const source = available && lines.length > 1 ? lines[1] : null;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { name: args?.name, available, source },
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === "wsl_run") {
    const result = runWsl(String(args?.command));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              command: args?.command,
              shell: WSL,
              ...result,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === "wsl_script") {
    const result = runWslScript(String(args?.path));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              path: args?.path,
              shell: WSL,
              ...result,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === "wsl_batch") {
    const results = (args?.commands as string[]).map((cmd) => ({
      command: cmd,
      ...runWsl(cmd),
    }));
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ shell: WSL, results }, null, 2),
        },
      ],
    };
  }

  if (name === "wsl_which") {
    const result = runWsl(`command -v ${String(args?.name)} 2>/dev/null || true`);
    const available = result.exitCode === 0 && result.stdout.trim().length > 0;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { name: args?.name, available, source: available ? result.stdout.trim() : null },
            null,
            2
          ),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("betterpowershell MCP server running on stdio");
}

main().catch((err) => {
  console.error("betterpowershell fatal:", err);
  process.exit(1);
});
