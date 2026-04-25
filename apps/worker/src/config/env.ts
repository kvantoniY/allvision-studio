import fs from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';

function findEnvFile(startDir: string) {
  let current = startDir;

  while (true) {
    const candidate = path.join(current, '.env');
    if (fs.existsSync(candidate)) return candidate;

    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

const envPath = findEnvFile(process.cwd()) ?? findEnvFile(__dirname);

config(envPath ? { path: envPath } : undefined);
