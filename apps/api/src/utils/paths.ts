import fs from 'node:fs';
import path from 'node:path';

let workspaceRoot: string | undefined;

function findWorkspaceRoot(startDir: string): string {
  let current = path.resolve(startDir);

  while (true) {
    const packageJson = path.join(current, 'package.json');
    if (fs.existsSync(packageJson)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(packageJson, 'utf8')) as { workspaces?: unknown };
        if (parsed.workspaces) return current;
      } catch {
        // Keep walking up.
      }
    }

    const parent = path.dirname(current);
    if (parent === current) return path.resolve(process.cwd());
    current = parent;
  }
}

export function getWorkspaceRoot(): string {
  if (!workspaceRoot) {
    workspaceRoot = findWorkspaceRoot(process.cwd());
  }
  return workspaceRoot;
}

export function resolveWorkspacePath(value: string): string {
  if (path.isAbsolute(value)) return path.resolve(value);
  return path.resolve(getWorkspaceRoot(), value);
}
