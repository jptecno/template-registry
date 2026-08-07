import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateRegistryV2 } from "../scripts/validate-registry.mjs";

async function fixture(name) {
  return JSON.parse(
    await readFile(
      new URL(`./fixtures/registry-v2/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
}

test("aceita fixture estrutural e semanticamente válida do registry v2", async () => {
  assert.equal(validateRegistryV2(await fixture("valid")), 1);
});

test("rejeita campos extras, SemVer inválido e SHA fora do formato", async () => {
  const extraProperty = await fixture("extra-property");
  assert.throws(
    () => validateRegistryV2(extraProperty),
    /não atende ao schema/,
  );

  const missingRequired = await fixture("valid");
  delete missingRequired.publishedAt;
  assert.throws(
    () => validateRegistryV2(missingRequired),
    /não atende ao schema/,
  );

  const invalidStatus = await fixture("valid");
  invalidStatus.templates[0].versions[0].status = "archived";
  assert.throws(
    () => validateRegistryV2(invalidStatus),
    /não atende ao schema/,
  );

  const invalidVersion = await fixture("valid");
  invalidVersion.templates[0].versions[0].version = "1.0.0";
  assert.throws(
    () => validateRegistryV2(invalidVersion),
    /não atende ao schema/,
  );

  const invalidSha = await fixture("valid");
  invalidSha.templates[0].versions[0].commit = "abc";
  assert.throws(() => validateRegistryV2(invalidSha), /não atende ao schema/);
});

test("rejeita regras semânticas do registry v2", async () => {
  const duplicatedVersion = await fixture("valid");
  duplicatedVersion.templates[0].versions.push({
    ...duplicatedVersion.templates[0].versions[0],
    status: "deprecated",
    statusReason: "Substituída",
  });
  assert.throws(
    () => validateRegistryV2(duplicatedVersion),
    /versões duplicadas/,
  );

  const missingActive = await fixture("valid");
  missingActive.templates[0].versions[0] = {
    ...missingActive.templates[0].versions[0],
    status: "deprecated",
    statusReason: "Substituída",
  };
  assert.throws(
    () => validateRegistryV2(missingActive),
    /exatamente uma versão active/,
  );

  const selfReplacement = await fixture("valid");
  selfReplacement.templates[0].versions[0].replacement =
    "api-nodejs-typescript";
  assert.throws(
    () => validateRegistryV2(selfReplacement),
    /não pode referenciar o próprio template/,
  );
});
