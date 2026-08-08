import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateRegistryPullRequest } from "../scripts/validate-registry-pr.mjs";

const registrySchemaPath = new URL(
  "../schemas/template-registry-v2.schema.json",
  import.meta.url,
);

async function validRegistry() {
  return {
    schemaVersion: 2,
    revision: 1,
    publishedAt: "2026-08-08T01:33:30Z",
    templates: [
      {
        id: "api-nodejs-typescript",
        name: "API Node.js + TypeScript",
        description: "Fastify, PostgreSQL, Kysely, Vitest e Biome.",
        repository: "jptecno/template-api-nodejs-typescript",
        versions: [
          {
            version: "v0.1.0",
            ref: "v0.1.0",
            commit: "40feae0d0ecd789b5fd3b7b8bc1ba09b6a33a340",
            status: "active",
          },
        ],
      },
    ],
  };
}

async function withDocuments(options, run) {
  const base = options.base ?? (await validRegistry());
  const candidate = options.candidate ?? (await validRegistry());
  const { candidateSchema } = options;
  const directory = await mkdtemp(join(tmpdir(), "validate-registry-pr-"));
  const baseRegistryPath = join(directory, "base-registry.json");
  const candidateRegistryPath = join(directory, "candidate-registry.json");
  const baseSchemaPath = join(directory, "base-schema.json");
  const candidateSchemaPath = join(directory, "candidate-schema.json");
  const schema = await readFile(registrySchemaPath);

  await Promise.all([
    writeFile(baseRegistryPath, JSON.stringify(base)),
    writeFile(candidateRegistryPath, JSON.stringify(candidate)),
    writeFile(baseSchemaPath, schema),
    writeFile(candidateSchemaPath, candidateSchema ?? schema),
  ]);

  try {
    return await run({
      baseRegistryPath,
      candidateRegistryPath,
      baseSchemaPath,
      candidateSchemaPath,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function progressedCandidate(base) {
  return {
    ...structuredClone(base),
    revision: base.revision + 1,
    publishedAt: "2026-08-08T01:33:31Z",
  };
}

test("aceita progressão válida do registry", async () => {
  const base = await validRegistry();
  const result = await withDocuments(
    { base, candidate: progressedCandidate(base) },
    validateRegistryPullRequest,
  );

  assert.deepEqual(result, { registryChanged: true });
});

test("rejeita revisão igual, menor ou pulada quando o registry muda", async () => {
  const base = await validRegistry();
  base.revision = 3;

  for (const revision of [
    base.revision,
    base.revision - 1,
    base.revision + 2,
  ]) {
    await withDocuments(
      {
        base,
        candidate: {
          ...progressedCandidate(base),
          revision,
        },
      },
      async (paths) => {
        await assert.rejects(
          () => validateRegistryPullRequest(paths),
          /revisão do candidato deve ser exatamente a revisão da base mais um/,
        );
      },
    );
  }
});

test("rejeita publishedAt igual, anterior ou semanticamente inválido", async () => {
  const base = await validRegistry();

  for (const publishedAt of [
    base.publishedAt,
    "2026-08-08T01:33:29Z",
    "2026-02-30T01:33:30Z",
  ]) {
    await withDocuments(
      {
        base,
        candidate: {
          ...progressedCandidate(base),
          publishedAt,
        },
      },
      async (paths) => {
        await assert.rejects(
          () => validateRegistryPullRequest(paths),
          /publishedAt do candidato deve ser distinto e posterior|registry candidate é inválido/,
        );
      },
    );
  }
});

test("rejeita candidato inválido conforme schema e semântica confiáveis", async () => {
  const base = await validRegistry();
  const candidate = progressedCandidate(base);
  candidate.templates[0].versions[0].ref = "v1.0.1";

  await withDocuments({ base, candidate }, async (paths) => {
    await assert.rejects(
      () => validateRegistryPullRequest(paths),
      /registry candidate é inválido: A versão e a ref devem ser idênticas/,
    );
  });
});

test("rejeita schema candidato alterado por whitespace ou ausente", async () => {
  const base = await validRegistry();
  const candidate = progressedCandidate(base);
  const schema = await readFile(registrySchemaPath, "utf8");

  await withDocuments(
    { base, candidate, candidateSchema: `${schema}\n` },
    async (paths) => {
      await assert.rejects(
        () => validateRegistryPullRequest(paths),
        /byte a byte idêntico/,
      );
    },
  );

  await withDocuments({ base, candidate }, async (paths) => {
    paths.candidateSchemaPath = join(tmpdir(), "schema-inexistente.json");
    await assert.rejects(() => validateRegistryPullRequest(paths), /ENOENT/);
  });
});

test("aceita registry inalterado sem exigir nova revisão ou publishedAt", async () => {
  const base = await validRegistry();
  const result = await withDocuments(
    { base, candidate: base },
    validateRegistryPullRequest,
  );

  assert.deepEqual(result, { registryChanged: false });
});
