import { spawn } from "node:child_process";

export const skill = {
  id: "git",
  name: "Git",
  description: "Git repository operations - status, commit, branch, diff, log, and more.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["status", "log", "diff", "branch", "branch_create", "branch_delete", "checkout", "commit", "add", "push", "pull", "fetch", "merge", "stash", "stash_pop", "reset", "revert", "remote", "init", "clone"],
        description: "Git action to perform"
      },
      path: {
        type: "string",
        description: "Repository path (default: current directory)"
      },
      message: {
        type: "string",
        description: "Commit message (for commit)"
      },
      branch: {
        type: "string",
        description: "Branch name (for branch operations, checkout)"
      },
      files: {
        type: "array",
        description: "Files to add/commit",
        items: { type: "string" }
      },
      remote: {
        type: "string",
        description: "Remote name or URL"
      },
      ref: {
        type: "string",
        description: "Git reference (commit hash, branch, tag)"
      },
      count: {
        type: "number",
        description: "Number of commits for log (default: 20)"
      }
    },
    required: ["action"],
    additionalProperties: false
  },
  async run({ input }) {
    const action = input?.action;
    const cwd = input?.path || process.cwd();

    const execGit = (args, timeoutMs = 30000) => {
      return new Promise((resolve) => {
        let stdout = "";
        let stderr = "";
        
        const child = spawn("git", args, {
          cwd,
          env: process.env,
          windowsHide: true
        });

        const timeoutId = setTimeout(() => {
          child.kill("SIGTERM");
          resolve({ exitCode: -1, stdout, stderr, timedOut: true });
        }, timeoutMs);
        
        child.stdout?.on("data", (data) => { stdout += data.toString(); });
        child.stderr?.on("data", (data) => { stderr += data.toString(); });
        
        child.on("close", (code) => {
          clearTimeout(timeoutId);
          resolve({ exitCode: code, stdout, stderr });
        });
        
        child.on("error", (err) => {
          clearTimeout(timeoutId);
          resolve({ exitCode: -1, stdout, stderr, error: err.message });
        });
      });
    };

    switch (action) {
      case "status": {
        const result = await execGit(["status", "--porcelain=v1", "--branch"]);
        const lines = result.stdout.trim().split("\n").filter(Boolean);
        const branchMatch = lines[0]?.match(/^## (.+?)(?:\.\.\.(.+))?$/);
        const changes = lines.slice(1).map(line => ({
          status: line.slice(0, 2).trim(),
          file: line.slice(3)
        }));
        
        return {
          ok: result.exitCode === 0,
          action,
          branch: branchMatch?.[1] || "unknown",
          tracking: branchMatch?.[2] || null,
          changes,
          changeCount: changes.length
        };
      }

      case "log": {
        const count = input?.count || 20;
        const result = await execGit([
          "log", `-${count}`, "--pretty=format:%H|%h|%an|%ae|%s|%ci",
          "--no-merges"
        ]);
        
        if (result.exitCode !== 0) {
          return { ok: false, action, error: result.stderr };
        }
        
        const commits = result.stdout.trim().split("\n").filter(Boolean).map(line => {
          const [hash, shortHash, author, email, subject, date] = line.split("|");
          return { hash, shortHash, author, email, subject, date };
        });
        
        return { ok: true, action, commits };
      }

      case "diff": {
        const args = ["diff"];
        if (input?.ref) args.push(input.ref);
        if (input?.files?.length) args.push("--", ...input.files);
        
        const result = await execGit(args, 60000);
        return {
          ok: result.exitCode === 0,
          action,
          diff: result.stdout.slice(0, 50000)
        };
      }

      case "branch": {
        const result = await execGit(["branch", "-a", "-v"]);
        if (result.exitCode !== 0) {
          return { ok: false, action, error: result.stderr };
        }
        
        const branches = result.stdout.trim().split("\n").map(line => {
          const current = line.startsWith("*");
          const match = line.match(/^([* ])(.+?)\s+([a-f0-9]+)\s+(.*)$/);
          return match ? {
            current,
            name: match[2].trim(),
            commit: match[3],
            message: match[4]
          } : { name: line.trim(), current };
        });
        
        return { ok: true, action, branches };
      }

      case "branch_create": {
        const branch = input?.branch;
        if (!branch) throw new Error("branch is required");
        
        const result = await execGit(["checkout", "-b", branch]);
        return {
          ok: result.exitCode === 0,
          action,
          branch,
          message: result.exitCode === 0 ? `Branch ${branch} created` : result.stderr
        };
      }

      case "branch_delete": {
        const branch = input?.branch;
        if (!branch) throw new Error("branch is required");
        
        const result = await execGit(["branch", "-D", branch]);
        return {
          ok: result.exitCode === 0,
          action,
          branch,
          message: result.exitCode === 0 ? `Branch ${branch} deleted` : result.stderr
        };
      }

      case "checkout": {
        const branch = input?.branch || input?.ref;
        if (!branch) throw new Error("branch or ref is required");
        
        const result = await execGit(["checkout", branch]);
        return {
          ok: result.exitCode === 0,
          action,
          branch,
          message: result.exitCode === 0 ? `Switched to ${branch}` : result.stderr
        };
      }

      case "add": {
        const files = input?.files || ["."];
        const result = await execGit(["add", ...files]);
        return {
          ok: result.exitCode === 0,
          action,
          files,
          message: result.exitCode === 0 ? "Files staged" : result.stderr
        };
      }

      case "commit": {
        const message = input?.message;
        if (!message) throw new Error("message is required for commit");
        
        const result = await execGit(["commit", "-m", message]);
        return {
          ok: result.exitCode === 0,
          action,
          message: result.exitCode === 0 ? "Committed" : result.stderr,
          output: result.stdout
        };
      }

      case "push": {
        const args = ["push"];
        if (input?.remote) args.push(input.remote);
        if (input?.branch) args.push(input.branch);
        
        const result = await execGit(args, 60000);
        return {
          ok: result.exitCode === 0,
          action,
          message: result.exitCode === 0 ? "Pushed" : result.stderr,
          output: result.stdout.slice(0, 2000)
        };
      }

      case "pull": {
        const args = ["pull"];
        if (input?.remote) args.push(input.remote);
        if (input?.branch) args.push(input.branch);
        
        const result = await execGit(args, 60000);
        return {
          ok: result.exitCode === 0,
          action,
          message: result.exitCode === 0 ? "Pulled" : result.stderr,
          output: result.stdout.slice(0, 2000)
        };
      }

      case "fetch": {
        const args = ["fetch"];
        if (input?.remote) args.push(input.remote);
        
        const result = await execGit(args, 60000);
        return {
          ok: result.exitCode === 0,
          action,
          message: result.exitCode === 0 ? "Fetched" : result.stderr
        };
      }

      case "merge": {
        const branch = input?.branch;
        if (!branch) throw new Error("branch is required for merge");
        
        const result = await execGit(["merge", branch], 60000);
        return {
          ok: result.exitCode === 0,
          action,
          branch,
          message: result.exitCode === 0 ? `Merged ${branch}` : result.stderr,
          output: result.stdout.slice(0, 2000)
        };
      }

      case "stash": {
        const result = await execGit(["stash", "push", "-m", input?.message || "stash"]);
        return {
          ok: result.exitCode === 0,
          action,
          message: result.exitCode === 0 ? "Stashed" : result.stderr
        };
      }

      case "stash_pop": {
        const result = await execGit(["stash", "pop"]);
        return {
          ok: result.exitCode === 0,
          action,
          message: result.exitCode === 0 ? "Stash applied" : result.stderr
        };
      }

      case "reset": {
        const args = ["reset"];
        if (input?.ref) {
          args.push("--hard", input.ref);
        } else {
          args.push("--soft");
        }
        
        const result = await execGit(args);
        return {
          ok: result.exitCode === 0,
          action,
          message: result.exitCode === 0 ? "Reset" : result.stderr
        };
      }

      case "revert": {
        const ref = input?.ref;
        if (!ref) throw new Error("ref is required for revert");
        
        const result = await execGit(["revert", "--no-commit", ref]);
        return {
          ok: result.exitCode === 0,
          action,
          ref,
          message: result.exitCode === 0 ? `Reverted ${ref}` : result.stderr
        };
      }

      case "remote": {
        const result = await execGit(["remote", "-v"]);
        if (result.exitCode !== 0) {
          return { ok: false, action, error: result.stderr };
        }
        
        const remotes = {};
        for (const line of result.stdout.trim().split("\n")) {
          const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/);
          if (match) {
            const [, name, url, type] = match;
            if (!remotes[name]) remotes[name] = {};
            remotes[name][type] = url;
          }
        }
        
        return { ok: true, action, remotes };
      }

      case "init": {
        const result = await execGit(["init"]);
        return {
          ok: result.exitCode === 0,
          action,
          path: cwd,
          message: result.exitCode === 0 ? "Repository initialized" : result.stderr
        };
      }

      case "clone": {
        const remote = input?.remote;
        if (!remote) throw new Error("remote URL is required for clone");
        
        const args = ["clone", remote];
        if (input?.path) args.push(input.path);
        
        const result = await execGit(args, 120000);
        return {
          ok: result.exitCode === 0,
          action,
          remote,
          message: result.exitCode === 0 ? "Cloned" : result.stderr,
          output: result.stdout.slice(0, 2000)
        };
      }

      default:
        throw new Error(`Unsupported action: ${action}`);
    }
  }
};
