import assert from "node:assert/strict";
import test from "node:test";

import {
  parseCliArguments,
  runRegistryIntegrationPullRequest,
} from "../scripts/run-registry-integration-pr.mjs";

const target = {
  id: "api-nodejs-typescript",
  repository: "jptecno/template-api-nodejs-typescript",
  ref: "v0.2.0",
  commit: "d437e631948a6e0c51cf544ddcb0943cb92aa389",
};

function registry(active = target) {
  return {
    schemaVersion: 2,
    revision: 1,
    publishedAt: "2026-08-08T01:33:30Z",
    templates: [
      {
        id: active.id,
        name: "API Node.js + TypeScript",
        description: "Fastify, PostgreSQL, Kysely, Vitest e Biome.",
        repository: active.repository,
        versions: [
          {
            version: active.ref,
            ref: active.ref,
            commit: active.commit,
            status: "active",
          },
        ],
      },
    ],
  };
}

test("wrapper encerra no-op antes de construir engine ou executar operações externas", async () => {
  let engineCreated = false;
  const reports = [];
  const result = await runRegistryIntegrationPullRequest(
    { baseRegistryPath: "base", candidateRegistryPath: "candidate" },
    {
      readRegistry: async () => registry(),
      createEngine: async () => {
        engineCreated = true;
      },
      report: (message) => reports.push(message),
    },
  );

  assert.equal(result.noOp, true);
  assert.equal(engineCreated, false);
  assert.match(reports[0], /Nenhum alvo de integração ativo foi alterado/);
});

test("wrapper constrói engine confiável e executa alvos alterados sequencialmente", async () => {
  const events = [];
  const secondTarget = {
    id: "another-template",
    repository: "jptecno/another-template",
    ref: "v1.0.0",
    commit: "a437e631948a6e0c51cf544ddcb0943cb92aa389",
  };
  const candidate = registry({ ...target, commit: secondTarget.commit });
  candidate.templates.push({
    id: secondTarget.id,
    name: "Outro",
    description: "Outro template.",
    repository: secondTarget.repository,
    versions: [
      {
        version: secondTarget.ref,
        ref: secondTarget.ref,
        commit: target.commit,
        status: "active",
      },
    ],
  });

  await runRegistryIntegrationPullRequest(
    { baseRegistryPath: "base", candidateRegistryPath: "candidate" },
    {
      readRegistry: async (path) => (path === "base" ? registry() : candidate),
      createEngine: async (value) => {
        events.push(`construct:${value.id}`);
        return async (engineTarget) => events.push(`run:${engineTarget.id}`);
      },
      report: () => {},
    },
  );

  assert.deepEqual(events, [
    "construct:another-template",
    "run:another-template",
    "construct:api-nodejs-typescript",
    "run:api-nodejs-typescript",
  ]);
});

test("wrapper rejeita candidato inválido antes de construir engine", async () => {
  let engineCreated = false;
  const invalid = registry();
  invalid.templates[0].repository = "attacker/template";

  await assert.rejects(
    () =>
      runRegistryIntegrationPullRequest(
        { baseRegistryPath: "base", candidateRegistryPath: "candidate" },
        {
          readRegistry: async (path) =>
            path === "base" ? registry() : invalid,
          createEngine: async () => {
            engineCreated = true;
          },
          report: () => {},
        },
      ),
    /registry v2 não atende ao schema/,
  );
  assert.equal(engineCreated, false);
});

test("wrapper aceita somente os dois argumentos explícitos", () => {
  assert.deepEqual(
    parseCliArguments([
      "--base-registry",
      "base",
      "--candidate-registry",
      "candidate",
    ]),
    { baseRegistryPath: "base", candidateRegistryPath: "candidate" },
  );
  for (const args of [
    [],
    ["--base-registry", "base"],
    ["--other", "base", "--candidate-registry", "candidate"],
    ["--base-registry", "base", "--candidate-registry", "candidate", "extra"],
  ]) {
    assert.throws(() => parseCliArguments(args));
  }
});
