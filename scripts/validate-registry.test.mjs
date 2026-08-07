import assert from "node:assert/strict";
import test from "node:test";

import { validateRegistry } from "./validate-registry.mjs";

const validTemplate = {
  id: "api-nodejs-typescript",
  name: "API Node.js + TypeScript",
  description: "Fastify, PostgreSQL, Kysely e Biome.",
  repository: "jptecno/template-api-nodejs-typescript",
  version: "v0.1.0",
  ref: "v0.1.0",
};

function registryWith(template = validTemplate) {
  return { schemaVersion: 1, templates: [template] };
}

test("aceita um registry válido", () => {
  assert.equal(validateRegistry(registryWith()), 1);
});

test("rejeita arrays no lugar de objetos", () => {
  assert.throws(
    () => validateRegistry([]),
    /deve ser um objeto com schemaVersion 1/,
  );
  assert.throws(
    () => validateRegistry(registryWith([])),
    /deve ser um objeto, não um array/,
  );
});

test("rejeita IDs que não estão em kebab-case", () => {
  assert.throws(
    () =>
      validateRegistry(registryWith({ ...validTemplate, id: "Api_Template" })),
    /deve usar kebab-case/,
  );
});

test("rejeita IDs duplicados", () => {
  assert.throws(
    () =>
      validateRegistry({
        schemaVersion: 1,
        templates: [validTemplate, { ...validTemplate, name: "Outra API" }],
      }),
    /identificadores.*duplicados/,
  );
});

test("rejeita campos ausentes, vazios ou não string", () => {
  for (const [field, value] of [
    ["name", undefined],
    ["description", ""],
    ["repository", 42],
  ]) {
    const template = { ...validTemplate };

    if (value === undefined) {
      delete template[field];
    } else {
      template[field] = value;
    }

    assert.throws(
      () => validateRegistry(registryWith(template)),
      new RegExp(`campo inválido: ${field}`),
    );
  }
});

test("rejeita repository fora do formato organização/repositório", () => {
  assert.throws(
    () =>
      validateRegistry(
        registryWith({ ...validTemplate, repository: "github.com/org/repo" }),
      ),
    /formato inválido.*organização\/repositório/,
  );
});

test("rejeita SemVer não estrito, branch e version diferente de ref", () => {
  for (const ref of [
    "1.0.0",
    "v01.0.0",
    "v1.0",
    "main",
    "v1.0.0+build+extra",
  ]) {
    assert.throws(
      () =>
        validateRegistry(registryWith({ ...validTemplate, version: ref, ref })),
      /tag SemVer estrita e imutável/,
    );
  }

  assert.throws(
    () =>
      validateRegistry(registryWith({ ...validTemplate, version: "v0.1.1" })),
    /tag SemVer estrita e imutável/,
  );
});

test("rejeita registry sem templates", () => {
  assert.throws(
    () => validateRegistry({ schemaVersion: 1, templates: [] }),
    /ao menos um template/,
  );
});
