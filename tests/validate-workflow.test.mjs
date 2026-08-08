import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("workflow ativa gate de integração de PR pelo wrapper confiável da base", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/validate.yml", import.meta.url),
    "utf8",
  );

  assert.match(workflow, /validate-template-integration:/);
  assert.match(workflow, /timeout-minutes: 25/);
  assert.match(
    workflow,
    /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/,
  );
  assert.match(workflow, /path: base/);
  assert.match(workflow, /scripts\/run-registry-integration-pr\.mjs/);
  assert.match(workflow, /npm ci --ignore-scripts/);
  assert.match(workflow, /path: candidate-data/);
  assert.match(
    workflow,
    /--candidate-registry \.\.\/candidate-data\/registry\.json/,
  );
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.doesNotMatch(workflow, /secrets\./);
  assert.doesNotMatch(workflow, /actions\/cache/);
  assert.doesNotMatch(workflow, /upload-artifact/);
});
