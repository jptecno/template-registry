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
  copyTemplateTree,
  createDockerAdapter,
  createGitCheckout,
  createGitTagResolver,
  createLoopbackHttpClient,
  createRegistryIntegrationEngine,
  renderTrustedProfile,
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

test("checkout usa limites, desabilita prompts e confirma HEAD destacado no SHA", async () => {
  const calls = [];
  const checkout = createGitCheckout({
    directory: "checkout",
    runner: async (command, args, options) => {
      calls.push({ command, args, options });
      return { stdout: args.includes("rev-parse") ? `${target.commit}\n` : "" };
    },
  });

  await checkout({ repository: target.repository, commit: target.commit });

  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0].args.slice(4, 7), [
    "clone",
    "--no-checkout",
    "--no-recurse-submodules",
  ]);
  assert.deepEqual(calls[2].args, [
    "-C",
    "checkout",
    "rev-parse",
    "--verify",
    "HEAD",
  ]);
  for (const call of calls) {
    assert.equal(call.options.timeout, 120000);
    assert.equal(call.options.maxBuffer, 65536);
    assert.equal(call.options.env.GIT_TERMINAL_PROMPT, "0");
    assert.equal(call.options.env.GCM_INTERACTIVE, "Never");
  }
});

test("checkout falha quando HEAD não é o SHA solicitado", async () => {
  const checkout = createGitCheckout({
    directory: "checkout",
    runner: async (_command, args) => ({
      stdout: args.includes("rev-parse")
        ? "a437e631948a6e0c51cf544ddcb0943cb92aa389\n"
        : "",
    }),
  });

  await assert.rejects(
    () => checkout({ repository: target.repository, commit: target.commit }),
    /não corresponde ao SHA solicitado/,
  );
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

async function withProfileTree(run) {
  const directory = await mkdtemp(
    join(tmpdir(), "registry-integration-profile-"),
  );
  const manifest = JSON.parse(
    await readFile(
      new URL("./fixtures/manifest-v1/valid.json", import.meta.url),
    ),
  );
  manifest.variables.push({
    name: "description",
    prompt: "Descrição",
    required: false,
  });
  manifest.render.include = ["package.json", "package-lock.json", "README.md"];
  await Promise.all([
    writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: "{{projectName}}",
        description: "{{description}}",
      }),
    ),
    writeFile(
      join(directory, "package-lock.json"),
      JSON.stringify({
        name: "{{projectName}}",
        packages: { "": { name: "{{projectName}}" } },
      }),
    ),
    writeFile(
      join(directory, "README.md"),
      "# {{projectName}}\n\n{{description}}\n",
    ),
    writeFile(join(directory, "template.json"), JSON.stringify(manifest)),
  ]);
  try {
    return await run({ directory, manifest });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function createFakeEngine({ events, ...overrides } = {}) {
  return createRegistryIntegrationEngine({
    resolveTag: async (value) => {
      events.push("resolve");
      return value;
    },
    checkout: async (value) => {
      events.push(
        `checkout:${Object.keys(value).sort().join(",")}:${value.commit}`,
      );
      return {
        templateDirectory: "source",
        cleanup: async () => events.push("checkout-cleanup"),
      };
    },
    validateManifest: async () => {
      events.push("preflight");
      return {
        id: target.id,
        variables: [{ name: "projectName", required: true }],
      };
    },
    createWorkspace: async () => {
      events.push("workspace");
      return "output";
    },
    copyTemplate: async () => events.push("copy"),
    renderProfile: async () => events.push("render"),
    processRunner: async ({
      command,
      args,
      env,
      timeoutMs,
      maxOutputBytes,
    }) => {
      events.push(`${command} ${args.join(" ")}`);
      assert.equal(env.REGISTRY_SECRET_SENTINEL, undefined);
      assert.equal(timeoutMs, 120000);
      assert.equal(maxOutputBytes, 65536);
    },
    removeWorkspace: async () => events.push("workspace-cleanup"),
    ...overrides,
  });
}

test("orquestra tag, checkout por commit, preflight, cópia, render e comandos fixos em ordem", async () => {
  const events = [];
  const engine = createFakeEngine({ events });

  await engine(target);

  assert.deepEqual(events, [
    "resolve",
    `checkout:commit,repository:${target.commit}`,
    "preflight",
    "workspace",
    "copy",
    "render",
    "npm ci",
    "npm run check",
    "workspace-cleanup",
    "checkout-cleanup",
  ]);
});

test("não faz checkout quando a resolução anotada diverge", async () => {
  const events = [];
  const engine = createFakeEngine({
    events,
    resolveTag: async () => {
      events.push("resolve");
      throw new Error("tag divergente");
    },
  });

  await assert.rejects(() => engine(target), /resolução da tag/);
  assert.deepEqual(events, ["resolve"]);
});

test("interrompe após npm ci falhar e não encaminha sentinel secreto", async () => {
  const previous = process.env.REGISTRY_SECRET_SENTINEL;
  process.env.REGISTRY_SECRET_SENTINEL = "não-vaze";
  const events = [];
  const engine = createFakeEngine({
    events,
    processRunner: async ({ args, env }) => {
      events.push(`npm ${args.join(" ")}`);
      assert.equal(env.REGISTRY_SECRET_SENTINEL, undefined);
      if (args[0] === "ci") throw new Error("stderr secreto");
    },
  });

  try {
    await assert.rejects(() => engine(target), /npm ci/);
  } finally {
    if (previous === undefined) delete process.env.REGISTRY_SECRET_SENTINEL;
    else process.env.REGISTRY_SECRET_SENTINEL = previous;
  }
  assert.deepEqual(events, [
    "resolve",
    `checkout:commit,repository:${target.commit}`,
    "preflight",
    "workspace",
    "copy",
    "render",
    "npm ci",
    "workspace-cleanup",
    "checkout-cleanup",
  ]);
});

test("copia a árvore inteira, ignora .git e rejeita symlink fora de render.include", async () => {
  await withProfileTree(async ({ directory, manifest }) => {
    manifest.render.include = ["package.json"];
    await writeFile(join(directory, "template.json"), JSON.stringify(manifest));
    await mkdir(join(directory, ".git"));
    await writeFile(join(directory, ".git", "config"), "ignored");
    await symlink(
      join(directory, "README.md"),
      join(directory, "unexpected-link"),
    );
    const output = await mkdtemp(join(tmpdir(), "registry-integration-copy-"));
    try {
      await assert.rejects(
        () => copyTemplateTree(directory, output),
        /links simbólicos/,
      );
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });
});

test("renderiza JSON estruturado e README exclusivamente com o profile confiável", async () => {
  await withProfileTree(async ({ directory, manifest }) => {
    await renderTrustedProfile(directory, manifest);
    assert.deepEqual(
      JSON.parse(await readFile(join(directory, "package.json"), "utf8")),
      {
        name: "registry-harness-api",
        description: "API criada pelo registry integration harness",
      },
    );
    assert.equal(
      JSON.parse(await readFile(join(directory, "package-lock.json"), "utf8"))
        .packages[""].name,
      "registry-harness-api",
    );
    assert.equal(
      await readFile(join(directory, "README.md"), "utf8"),
      "# registry-harness-api\n\nAPI criada pelo registry integration harness\n",
    );
  });
});

test("falha fechada para token desconhecido e variável obrigatória não suportada", async () => {
  await withProfileTree(async ({ directory, manifest }) => {
    await writeFile(join(directory, "README.md"), "{{unknown}}\n");
    await assert.rejects(
      () => renderTrustedProfile(directory, manifest),
      /token não suportado/,
    );

    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({
        name: "{{projectName}}",
        description: "{{description}}",
        scripts: { check: "echo {{projectName}}" },
      }),
    );
    await writeFile(join(directory, "README.md"), "# {{projectName}}\n");
    await assert.rejects(
      () => renderTrustedProfile(directory, manifest),
      /token sem resolução/,
    );

    manifest.variables.push({
      name: "region",
      prompt: "Região",
      required: true,
    });
    await assert.rejects(
      () => renderTrustedProfile(directory, manifest),
      /variável obrigatória/,
    );
  });
});

test("adaptadores Docker e HTTP mantêm os limites e recusam destinos não confiáveis", async () => {
  const calls = [];
  const docker = createDockerAdapter({
    runner: async (command, args, options) =>
      calls.push({ command, args, options }),
  });
  await docker.run({
    args: ["build", "--tag", "registry-harness-api", "."],
    cwd: "workspace",
    timeoutMs: 120000,
    maxOutputBytes: 65536,
  });
  await docker.cleanup({
    container: "registry-harness-api-smoke",
    image: "registry-harness-api",
  });
  assert.deepEqual(
    calls.map(({ command, args }) => [command, args[0]]),
    [
      ["docker", "build"],
      ["docker", "rm"],
      ["docker", "image"],
    ],
  );
  assert.equal(calls[0].options.timeoutMs, 120000);
  assert.equal(calls[0].options.maxOutputBytes, 65536);
  await assert.rejects(
    () =>
      docker.run({
        args: ["run", "--privileged", "registry-harness-api"],
        cwd: "workspace",
        timeoutMs: 120000,
        maxOutputBytes: 65536,
      }),
    /argumentos internos fixos/,
  );

  const http = createLoopbackHttpClient();
  await assert.rejects(
    () =>
      http.get({
        url: "http://example.test/health",
        timeoutMs: 120000,
        maxOutputBytes: 65536,
      }),
    /loopback confiável/,
  );
});

test("falha do adaptador Docker ainda tenta remover container e imagem", async () => {
  const calls = [];
  const docker = createDockerAdapter({
    runner: async (_command, args) => {
      calls.push(args[0]);
      if (args[0] === "build") throw new Error("falha interna");
    },
  });
  const engine = createFakeEngine({
    events: [],
    docker,
    http: { get: async () => ({ status: 200, body: { status: "ok" } }) },
  });

  await assert.rejects(() => engine(target), /Docker build/);
  assert.deepEqual(calls, ["build", "rm", "image"]);
});

test("Docker é opcional e, quando habilitado, faz smoke e cleanup", async () => {
  const noDockerEvents = [];
  await createFakeEngine({ events: noDockerEvents })(target);
  assert.equal(
    noDockerEvents.some((event) => event.startsWith("docker")),
    false,
  );

  const events = [];
  const docker = {
    run: async ({ args }) => events.push(`docker ${args[0]}`),
    cleanup: async ({ container, image }) =>
      events.push(`cleanup:${container}:${image}`),
  };
  const engine = createFakeEngine({
    events,
    docker,
    http: {
      get: async ({ url }) => {
        events.push(`http:${url}`);
        return { status: 200, body: { status: "ok" } };
      },
    },
  });

  await engine(target);
  assert.deepEqual(events.slice(-6), [
    "docker build",
    "docker run",
    "http:http://127.0.0.1:39000/health",
    "cleanup:registry-harness-api-smoke:registry-harness-api",
    "workspace-cleanup",
    "checkout-cleanup",
  ]);
});

test("falha Docker ainda limpa container, workspace e checkout", async () => {
  const events = [];
  const engine = createFakeEngine({
    events,
    docker: {
      run: async () => {
        events.push("docker build");
        throw new Error("stderr secreto");
      },
      cleanup: async () => events.push("docker-cleanup"),
    },
    http: { get: async () => ({ status: 200, body: { status: "ok" } }) },
  });

  await assert.rejects(() => engine(target), /Docker build/);
  assert.deepEqual(events.slice(-3), [
    "docker-cleanup",
    "workspace-cleanup",
    "checkout-cleanup",
  ]);
});
