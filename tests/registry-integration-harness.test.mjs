import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createGitTagResolver,
  selectIntegrationTargets,
  validateTrustedManifest,
} from "../scripts/registry-integration-harness.mjs";

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

function tagOutput({ direct = target.commit, peeled } = {}) {
  const output = `${direct}\trefs/tags/${target.ref}\n`;
  return peeled === undefined
    ? output
    : `${output}${peeled}\trefs/tags/${target.ref}^{}\n`;
}

async function withManifest(mutator, run) {
  const directory = await mkdtemp(
    join(tmpdir(), "registry-integration-harness-"),
  );
  const manifest = JSON.parse(
    await readFile(
      new URL("./fixtures/manifest-v1/valid.json", import.meta.url),
    ),
  );
  manifest.render.include = ["src/index.ts", "package.json"];
  await mkdir(join(directory, "src"));
  await Promise.all([
    writeFile(join(directory, "src", "index.ts"), "export {};\n"),
    writeFile(join(directory, "package.json"), "{}\n"),
  ]);
  await mutator({ directory, manifest });
  await writeFile(join(directory, "template.json"), JSON.stringify(manifest));

  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("seleciona somente identidades ativas novas ou alteradas e ordena os alvos", () => {
  const base = registry();
  const candidate = registry({
    ...target,
    commit: "a437e631948a6e0c51cf544ddcb0943cb92aa389",
  });
  candidate.templates.push({
    id: "another-template",
    name: "Outro",
    description: "Outro template.",
    repository: "jptecno/another-template",
    versions: [
      {
        version: "v1.0.0",
        ref: "v1.0.0",
        commit: "b437e631948a6e0c51cf544ddcb0943cb92aa389",
        status: "active",
      },
    ],
  });

  assert.deepEqual(selectIntegrationTargets(base, candidate), {
    targets: [
      {
        id: "another-template",
        repository: "jptecno/another-template",
        ref: "v1.0.0",
        commit: "b437e631948a6e0c51cf544ddcb0943cb92aa389",
      },
      { ...target, commit: "a437e631948a6e0c51cf544ddcb0943cb92aa389" },
    ],
    noOp: false,
  });
});

test("retorna no-op claro e rejeita candidato fora do validador v2", () => {
  assert.deepEqual(selectIntegrationTargets(registry(), registry()), {
    targets: [],
    noOp: true,
    message: "Nenhum alvo de integração ativo foi alterado",
  });

  const invalid = registry();
  invalid.templates[0].repository = "other/template";
  assert.throws(
    () => selectIntegrationTargets(registry(), invalid),
    /registry v2 não atende ao schema/,
  );
});

test("resolve tag leve com argumentos fixos e sem shell", async () => {
  const calls = [];
  const resolver = createGitTagResolver({
    runner: async (command, args) => {
      calls.push({ command, args });
      return { stdout: tagOutput() };
    },
  });

  assert.deepEqual(await resolver(target), {
    ...target,
    tagType: "lightweight",
    resolvedCommit: target.commit,
  });
  assert.deepEqual(calls, [
    {
      command: "git",
      args: [
        "ls-remote",
        "--tags",
        "https://github.com/jptecno/template-api-nodejs-typescript.git",
        "refs/tags/v0.2.0",
        "refs/tags/v0.2.0^{}",
      ],
    },
  ]);
});

test("resolve tag anotada pelo SHA descascado", async () => {
  const resolver = createGitTagResolver({
    runner: async () => ({
      stdout: tagOutput({
        direct: "c437e631948a6e0c51cf544ddcb0943cb92aa389",
        peeled: target.commit,
      }),
    }),
  });

  const result = await resolver(target);
  assert.equal(result.tagType, "annotated");
  assert.equal(result.resolvedCommit, target.commit);
});

test("rejeita saídas de tag ausentes, malformadas, duplicadas ou divergentes", async () => {
  const outputs = [
    "",
    `D437e631948a6e0c51cf544ddcb0943cb92aa389\trefs/tags/${target.ref}\n`,
    `${tagOutput()}${target.commit}\trefs/tags/${target.ref}\n`,
    `${tagOutput({ peeled: target.commit })}${target.commit}\trefs/tags/${target.ref}^{}\n`,
    tagOutput({ direct: "a437e631948a6e0c51cf544ddcb0943cb92aa389" }),
  ];

  for (const stdout of outputs) {
    const resolver = createGitTagResolver({ runner: async () => ({ stdout }) });
    await assert.rejects(() => resolver(target));
  }
});

test("rejeita alvo não validado antes de chamar git", async () => {
  let called = false;
  const resolver = createGitTagResolver({
    runner: async () => {
      called = true;
      return { stdout: tagOutput() };
    },
  });

  await assert.rejects(
    () => resolver({ ...target, repository: "attacker/template" }),
    /deve ter sido validado pelo registry v2/,
  );
  assert.equal(called, false);
});

test("aceita manifesto regular correspondente ao alvo", async () => {
  await withManifest(
    async () => {},
    async (directory) => {
      const manifest = await validateTrustedManifest({
        templateDirectory: directory,
        target,
      });
      assert.equal(manifest.id, target.id);
      assert.equal(manifest.render.include[0], "src/index.ts");
    },
  );
});

test("rejeita manifesto inválido, symlink, identidade divergente e variáveis duplicadas", async () => {
  await withManifest(
    async ({ manifest }) => {
      delete manifest.name;
    },
    async (directory) => {
      await assert.rejects(
        () => validateTrustedManifest({ templateDirectory: directory, target }),
        /schema canônico/,
      );
    },
  );

  await withManifest(
    async ({ manifest }) => {
      manifest.variables.push({ ...manifest.variables[0] });
    },
    async (directory) => {
      await assert.rejects(
        () => validateTrustedManifest({ templateDirectory: directory, target }),
        /variável duplicada/,
      );
    },
  );

  await withManifest(
    async ({ manifest }) => {
      manifest.repository = "jptecno/other-template";
    },
    async (directory) => {
      await assert.rejects(
        () => validateTrustedManifest({ templateDirectory: directory, target }),
        /id e repository/,
      );
    },
  );

  await withManifest(
    async () => {},
    async (directory) => {
      await rm(join(directory, "template.json"), { force: true });
      await symlink(
        join(directory, "package.json"),
        join(directory, "template.json"),
      );
      await assert.rejects(
        () => validateTrustedManifest({ templateDirectory: directory, target }),
        /arquivo regular/,
      );
    },
  );
});

test("rejeita render fora do template, arquivos não regulares e diretórios symlink", async () => {
  await withManifest(
    async ({ manifest }) => {
      manifest.render.include = ["../outside"];
    },
    async (directory) => {
      await assert.rejects(
        () => validateTrustedManifest({ templateDirectory: directory, target }),
        /schema canônico/,
      );
    },
  );

  await withManifest(
    async ({ manifest }) => {
      manifest.render.include = ["src"];
    },
    async (directory) => {
      await assert.rejects(
        () => validateTrustedManifest({ templateDirectory: directory, target }),
        /arquivo regular/,
      );
    },
  );

  await withManifest(
    async ({ directory, manifest }) => {
      await rm(join(directory, "src"), { recursive: true });
      await symlink(tmpdir(), join(directory, "src"));
      manifest.render.include = ["src/package.json"];
    },
    async (directory) => {
      await assert.rejects(
        () => validateTrustedManifest({ templateDirectory: directory, target }),
        /links simbólicos/,
      );
    },
  );
});
