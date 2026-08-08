import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

test("o entrypoint valida o registry.json canônico v2", async () => {
  const { stdout } = await execFile(
    process.execPath,
    ["scripts/validate-registry.mjs"],
    {
      cwd: new URL("../", import.meta.url),
    },
  );

  assert.match(stdout, /Registry válido: 1 template\(s\)/);
});
