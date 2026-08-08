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

test("rejeita campos extras, revisão inválida, IDs, proprietário, SemVer e SHA fora do formato", async () => {
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

  const invalidRevision = await fixture("valid");
  invalidRevision.revision = 0;
  assert.throws(
    () => validateRegistryV2(invalidRevision),
    /não atende ao schema/,
  );

  const invalidId = await fixture("valid");
  invalidId.templates[0].id = "Api_Template";
  assert.throws(() => validateRegistryV2(invalidId), /não atende ao schema/);

  const invalidOwner = await fixture("valid");
  invalidOwner.templates[0].repository = "other/template-api";
  assert.throws(() => validateRegistryV2(invalidOwner), /não atende ao schema/);

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

  const divergentRef = await fixture("valid");
  divergentRef.templates[0].versions[0].ref = "v1.0.1";
  assert.throws(
    () => validateRegistryV2(divergentRef),
    /versão e a ref devem ser idênticas/,
  );
});

test("rejeita status e statusReason incompatíveis", async () => {
  const missingReason = await fixture("valid");
  missingReason.templates[0].versions[0].status = "deprecated";
  assert.throws(
    () => validateRegistryV2(missingReason),
    /não atende ao schema/,
  );

  const activeWithReason = await fixture("valid");
  activeWithReason.templates[0].versions[0].statusReason = "Não se aplica";
  assert.throws(
    () => validateRegistryV2(activeWithReason),
    /não atende ao schema/,
  );
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

  const multipleActive = await fixture("valid");
  multipleActive.templates[0].versions.push({
    ...multipleActive.templates[0].versions[0],
    version: "v1.0.1",
    ref: "v1.0.1",
  });
  assert.throws(
    () => validateRegistryV2(multipleActive),
    /exatamente uma versão active/,
  );

  const duplicatedTemplate = await fixture("valid");
  duplicatedTemplate.templates.push({
    ...duplicatedTemplate.templates[0],
    name: "Outra API",
  });
  assert.throws(
    () => validateRegistryV2(duplicatedTemplate),
    /identificadores de template duplicados/,
  );

  const selfReplacement = await fixture("valid");
  selfReplacement.templates[0].versions[0].replacement =
    "api-nodejs-typescript";
  assert.throws(
    () => validateRegistryV2(selfReplacement),
    /não pode referenciar o próprio template/,
  );

  const missingReplacement = await fixture("valid");
  missingReplacement.templates[0].versions[0].replacement = "other-template";
  assert.throws(
    () => validateRegistryV2(missingReplacement),
    /deve referenciar um template existente/,
  );
});

test("aceita replacement para outro template existente", async () => {
  const registry = await fixture("valid");
  registry.templates[0].versions.push({
    version: "v0.9.0",
    ref: "v0.9.0",
    commit: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
    status: "deprecated",
    statusReason: "Substituída pelo template successor-api.",
    replacement: "successor-api",
  });
  registry.templates.push({
    ...registry.templates[0],
    id: "successor-api",
    name: "API sucessora",
    versions: [
      {
        version: "v1.0.0",
        ref: "v1.0.0",
        commit: "0123456789abcdef0123456789abcdef01234567",
        status: "active",
      },
    ],
  });

  assert.equal(validateRegistryV2(registry), 2);
});

test("rejeita publishedAt que atende ao padrão, mas não representa UTC RFC3339 válida", async () => {
  const impossibleDate = await fixture("valid");
  impossibleDate.publishedAt = "2026-02-30T01:33:30Z";
  assert.throws(
    () => validateRegistryV2(impossibleDate),
    /semanticamente válida/,
  );

  const invalidHour = await fixture("valid");
  invalidHour.publishedAt = "2026-08-08T25:33:30Z";
  assert.throws(() => validateRegistryV2(invalidHour), /semanticamente válida/);
});
