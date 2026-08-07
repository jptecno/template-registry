import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import Ajv from "ajv";
import manifestSchema from "../schemas/template-manifest-v1.schema.json" with {
  type: "json",
};

const validateManifest = new Ajv({ allErrors: true, strict: true }).compile(
  manifestSchema,
);

async function fixture(name) {
  return JSON.parse(
    await readFile(
      new URL(`./fixtures/manifest-v1/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
}

test("aceita manifesto v1 estruturalmente válido", async () => {
  assert.equal(validateManifest(await fixture("valid")), true);
});

test("rejeita path inseguro e propriedades extras no manifesto", async () => {
  assert.equal(validateManifest(await fixture("unsafe-path")), false);

  const extraProperty = await fixture("valid");
  extraProperty.toolchain.steps.test.postCreate = true;
  assert.equal(validateManifest(extraProperty), false);

  const missingRequired = await fixture("valid");
  delete missingRequired.toolchain.steps.test.dependsOn;
  assert.equal(validateManifest(missingRequired), false);

  const invalidEcosystem = await fixture("valid");
  invalidEcosystem.toolchain.ecosystem = "java";
  assert.equal(validateManifest(invalidEcosystem), false);
});

test("aceita etapas nomeadas e rejeita o formato anterior", async () => {
  const manifest = await fixture("valid");
  manifest.toolchain.steps.install = {
    command: "npm",
    args: ["ci"],
    dependsOn: [],
    recommended: true,
  };
  manifest.toolchain.steps.test.dependsOn = ["install"];
  assert.equal(validateManifest(manifest), true);

  const arraySteps = await fixture("valid");
  arraySteps.toolchain.steps = [arraySteps.toolchain.steps.test];
  assert.equal(validateManifest(arraySteps), false);

  const emptySteps = await fixture("valid");
  emptySteps.toolchain.steps = {};
  assert.equal(validateManifest(emptySteps), false);
});

test("rejeita propriedades e dependências fora do contrato da etapa", async () => {
  const unsupportedStep = await fixture("valid");
  unsupportedStep.toolchain.steps.deploy = {
    command: "npm",
    args: ["run", "deploy"],
    dependsOn: [],
    recommended: false,
  };
  assert.equal(validateManifest(unsupportedStep), false);

  const legacyId = await fixture("valid");
  legacyId.toolchain.steps.test.id = "test";
  assert.equal(validateManifest(legacyId), false);

  const legacyType = await fixture("valid");
  legacyType.toolchain.steps.test.type = "test";
  assert.equal(validateManifest(legacyType), false);

  const invalidDependency = await fixture("valid");
  invalidDependency.toolchain.steps.test.dependsOn = ["deploy"];
  assert.equal(validateManifest(invalidDependency), false);
});
