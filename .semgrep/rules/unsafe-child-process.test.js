import { exec, execFile, execSync, spawn } from 'node:child_process';

const userCommand = process.argv[2];

// ruleid: unsafe-child-process-exec
exec(userCommand);

// ruleid: unsafe-child-process-exec
execSync(`npm ${userCommand}`);

// ok: unsafe-child-process-exec
exec('node scripts/validate-registry.mjs');

// ok: unsafe-child-process-exec
execFile('node', ['scripts/validate-registry.mjs']);

// ok: unsafe-child-process-exec
spawn('node', ['scripts/validate-registry.mjs'], { shell: false });
