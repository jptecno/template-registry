import { execFile as execFileCallback } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import Ajv from "ajv";
import manifestSchema from "../schemas/template-manifest-v1.schema.json" with {
  type: "json",
};
import { validateRegistryV2 } from "./validate-registry.mjs";

const execFile = promisify(execFileCallback);
const SHA40 = /^[a-f0-9]{40}$/;
const REPOSITORY = /^jptecno\/[A-Za-z0-9_.-]+$/;
const REF = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const validateManifestSchema = new Ajv({
  allErrors: true,
  strict: true,
}).compile(manifestSchema);

export function selectIntegrationTargets(baseRegistry, candidateRegistry) {
  validateRegistryV2(baseRegistry);
  validateRegistryV2(candidateRegistry);

  const baseActiveVersions = new Map(
    baseRegistry.templates.map((template) => [
      template.id,
      activeTarget(template),
    ]),
  );
  const targets = candidateRegistry.templates
    .map(activeTarget)
    .filter(
      (target) => !sameIdentity(target, baseActiveVersions.get(target.id)),
    )
    .sort((left, right) => left.id.localeCompare(right.id));

  return targets.length === 0
    ? {
        targets,
        noOp: true,
        message: "Nenhum alvo de integração ativo foi alterado",
      }
    : { targets, noOp: false };
}

function activeTarget(template) {
  const version = template.versions.find(({ status }) => status === "active");

  return {
    id: template.id,
    repository: template.repository,
    ref: version.ref,
    commit: version.commit,
  };
}

function sameIdentity(left, right) {
  return (
    right !== undefined &&
    left.id === right.id &&
    left.repository === right.repository &&
    left.ref === right.ref &&
    left.commit === right.commit
  );
}

export function createGitTagResolver({ runner = runGit } = {}) {
  return async function resolveGitTag(target) {
    assertValidatedTarget(target);
    const url = `https://github.com/${target.repository}.git`;
    const args = [
      "ls-remote",
      "--tags",
      url,
      `refs/tags/${target.ref}`,
      `refs/tags/${target.ref}^{}`,
    ];
    const { stdout } = await runner("git", args);
    const { direct, peeled } = parseTagOutput(stdout, target.ref);
    const resolvedCommit = peeled ?? direct;

    if (resolvedCommit !== target.commit) {
      throw new Error(
        `A tag ${target.ref} de ${target.repository} resolve para ${resolvedCommit}, mas o registry declara ${target.commit}`,
      );
    }

    return {
      ...target,
      tagType: peeled === undefined ? "lightweight" : "annotated",
      resolvedCommit,
    };
  };
}

async function runGit(command, args) {
  return execFile(command, args, {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "" },
    timeout: PROCESS_TIMEOUT_MS,
    maxBuffer: PROCESS_MAX_OUTPUT_BYTES,
  });
}

function assertValidatedTarget(target) {
  if (
    target === null ||
    typeof target !== "object" ||
    !REPOSITORY.test(target.repository) ||
    !REF.test(target.ref) ||
    !SHA40.test(target.commit)
  ) {
    throw new Error(
      "O alvo de integração deve ter sido validado pelo registry v2",
    );
  }
}

export function parseTagOutput(output, ref) {
  if (typeof output !== "string") {
    throw new Error("A saída de git ls-remote deve ser texto");
  }

  const directReference = `refs/tags/${ref}`;
  const peeledReference = `${directReference}^{}`;
  const direct = [];
  const peeled = [];

  for (const line of output.split("\n").filter(Boolean)) {
    const match =
      /^(?<sha>[a-f0-9]{40})\t(?<reference>refs\/tags\/[^\t]+)$/.exec(line);

    if (match === null) {
      throw new Error("A saída de git ls-remote contém uma linha inválida");
    }

    if (match.groups.reference === directReference) {
      direct.push(match.groups.sha);
    } else if (match.groups.reference === peeledReference) {
      peeled.push(match.groups.sha);
    } else {
      throw new Error("A saída de git ls-remote contém uma ref inesperada");
    }
  }

  if (direct.length !== 1) {
    throw new Error("A tag deve possuir exatamente uma referência direta");
  }

  if (peeled.length > 1) {
    throw new Error("A tag anotada possui mais de uma referência descascada");
  }

  return { direct: direct[0], peeled: peeled[0] };
}

export async function validateTrustedManifest({ templateDirectory, target }) {
  assertValidatedTarget(target);
  const manifestPath = await assertContainedRegularFile(
    templateDirectory,
    "template.json",
  );
  const source = await readFile(manifestPath, "utf8");
  let manifest;

  try {
    manifest = JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`template.json não contém JSON válido: ${message}`);
  }

  if (!validateManifestSchema(manifest)) {
    const errors = validateManifestSchema.errors
      .map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("; ");
    throw new Error(`template.json não atende ao schema canônico: ${errors}`);
  }

  if (manifest.id !== target.id || manifest.repository !== target.repository) {
    throw new Error(
      "template.json deve corresponder ao id e repository do alvo",
    );
  }

  const variableNames = new Set();
  for (const variable of manifest.variables) {
    if (variableNames.has(variable.name)) {
      throw new Error(
        `template.json possui variável duplicada: ${variable.name}`,
      );
    }
    variableNames.add(variable.name);
  }

  for (const include of manifest.render.include) {
    await assertContainedRegularFile(templateDirectory, include);
  }

  return manifest;
}

export async function assertContainedRegularFile(root, include) {
  if (
    typeof include !== "string" ||
    include.length === 0 ||
    isAbsolute(include)
  ) {
    throw new Error("O caminho de render deve ser relativo e não vazio");
  }

  const rootPath = resolve(root);
  const candidatePath = resolve(rootPath, include);
  const candidateRelative = relative(rootPath, candidatePath);
  if (
    candidateRelative === "" ||
    candidateRelative === ".." ||
    candidateRelative.startsWith(`..${sep}`) ||
    isAbsolute(candidateRelative)
  ) {
    throw new Error("O caminho de render deve permanecer dentro do template");
  }

  await assertDirectoryWithoutSymlinks(rootPath, candidateRelative);
  const details = await lstat(candidatePath);
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error("O caminho de render deve referenciar um arquivo regular");
  }

  return candidatePath;
}

async function assertDirectoryWithoutSymlinks(rootPath, candidateRelative) {
  const rootDetails = await lstat(rootPath);
  if (!rootDetails.isDirectory() || rootDetails.isSymbolicLink()) {
    throw new Error("O diretório do template deve ser um diretório regular");
  }

  const components = candidateRelative.split(sep);
  let current = rootPath;
  for (const component of components.slice(0, -1)) {
    current = resolve(current, component);
    const details = await lstat(current);
    if (!details.isDirectory() || details.isSymbolicLink()) {
      throw new Error(
        "O caminho de render não pode atravessar links simbólicos",
      );
    }
  }
}

const HARNESS_PROFILE = Object.freeze({
  id: "api-nodejs-typescript",
  projectName: "registry-harness-api",
  description: "API criada pelo registry integration harness",
  docker: Object.freeze({
    image: "registry-harness-api",
    container: "registry-harness-api-smoke",
    hostPort: "39000",
    containerPort: "3000",
    healthPath: "/health",
  }),
});
const PROCESS_TIMEOUT_MS = 120_000;
const PROCESS_MAX_OUTPUT_BYTES = 64 * 1024;
const TOKEN = /{{([A-Za-z][A-Za-z0-9_]*)}}/g;

export function createRegistryIntegrationEngine({
  resolveTag = createGitTagResolver(),
  checkout,
  processRunner = createProcessRunner(),
  docker,
  http,
  validateManifest = validateTrustedManifest,
  copyTemplate = copyTemplateTree,
  renderProfile = renderTrustedProfile,
  createWorkspace = () => mkdtemp(join(tmpdir(), "registry-integration-")),
  removeWorkspace = (directory) =>
    rm(directory, { recursive: true, force: true }),
} = {}) {
  if (typeof checkout !== "function") {
    throw new Error("O engine exige um checkout confiável");
  }

  return async function runIntegration(target) {
    assertValidatedTarget(target);
    let checkedOut;
    let workspace;
    let dockerStarted = false;

    try {
      const resolved = await runPhase(target, "resolução da tag", () =>
        resolveTag(target),
      );
      checkedOut = await runPhase(target, "checkout", () =>
        checkout({ repository: resolved.repository, commit: resolved.commit }),
      );
      const templateDirectory = checkedOut.templateDirectory ?? checkedOut;
      const manifest = await runPhase(target, "preflight do manifesto", () =>
        validateManifest({ templateDirectory, target: resolved }),
      );
      await runPhase(target, "profile confiável", () =>
        assertTrustedProfile(resolved, manifest),
      );
      workspace = await runPhase(target, "materialização", createWorkspace);
      await runPhase(target, "cópia segura", () =>
        copyTemplate(templateDirectory, workspace),
      );
      await runPhase(target, "renderização", () =>
        renderProfile(workspace, manifest),
      );
      await runPhase(target, "npm ci", () =>
        processRunner(fixedProcess("npm", ["ci"], workspace)),
      );
      await runPhase(target, "npm run check", () =>
        processRunner(fixedProcess("npm", ["run", "check"], workspace)),
      );

      if (docker !== undefined) {
        dockerStarted = true;
        await runPhase(target, "Docker build", () =>
          docker.run({
            args: ["build", "--tag", HARNESS_PROFILE.docker.image, "."],
            cwd: workspace,
            timeoutMs: PROCESS_TIMEOUT_MS,
            maxOutputBytes: PROCESS_MAX_OUTPUT_BYTES,
          }),
        );
        await runPhase(target, "Docker run", () =>
          docker.run({
            args: [
              "run",
              "--detach",
              "--rm",
              "--name",
              HARNESS_PROFILE.docker.container,
              "--publish",
              `127.0.0.1:${HARNESS_PROFILE.docker.hostPort}:${HARNESS_PROFILE.docker.containerPort}`,
              "--cap-drop",
              "ALL",
              "--security-opt",
              "no-new-privileges",
              HARNESS_PROFILE.docker.image,
            ],
            cwd: workspace,
            timeoutMs: PROCESS_TIMEOUT_MS,
            maxOutputBytes: PROCESS_MAX_OUTPUT_BYTES,
          }),
        );
        await runPhase(target, "smoke HTTP", async () => {
          const response = await http.get({
            url: `http://127.0.0.1:${HARNESS_PROFILE.docker.hostPort}${HARNESS_PROFILE.docker.healthPath}`,
            timeoutMs: PROCESS_TIMEOUT_MS,
            maxOutputBytes: PROCESS_MAX_OUTPUT_BYTES,
          });
          if (
            response.status !== 200 ||
            JSON.stringify(response.body) !== JSON.stringify({ status: "ok" })
          ) {
            throw new Error("Resposta de health inválida");
          }
        });
      }
    } finally {
      if (dockerStarted) {
        await cleanupQuietly(() =>
          docker.cleanup({
            container: HARNESS_PROFILE.docker.container,
            image: HARNESS_PROFILE.docker.image,
          }),
        );
      }
      if (workspace !== undefined) {
        await cleanupQuietly(() => removeWorkspace(workspace));
      }
      if (checkedOut?.cleanup !== undefined) {
        await cleanupQuietly(() => checkedOut.cleanup());
      }
    }
  };
}

function fixedProcess(command, args, cwd) {
  return {
    command,
    args,
    cwd,
    env: { PATH: process.env.PATH ?? "" },
    timeoutMs: PROCESS_TIMEOUT_MS,
    maxOutputBytes: PROCESS_MAX_OUTPUT_BYTES,
  };
}

async function runPhase(target, phase, operation) {
  try {
    return await operation();
  } catch {
    throw new Error(
      `Falha na integração de ${target.id} ref ${target.ref} commit ${target.commit} durante ${phase}`,
    );
  }
}

async function cleanupQuietly(cleanup) {
  try {
    await cleanup();
  } catch {
    // A falha principal já é sanitizada; cleanup não pode expor dados externos.
  }
}

export function createProcessRunner({ runner = runProcess } = {}) {
  return (options) => runner(options.command, options.args, options);
}

export function createDockerAdapter({ runner = runProcess } = {}) {
  return {
    async run({ args, cwd, timeoutMs, maxOutputBytes }) {
      assertTrustedDockerArgs(args);
      return runner("docker", args, {
        cwd,
        env: { PATH: process.env.PATH ?? "" },
        timeoutMs,
        maxOutputBytes,
      });
    },
    async cleanup({ container, image }) {
      if (
        container !== HARNESS_PROFILE.docker.container ||
        image !== HARNESS_PROFILE.docker.image
      ) {
        throw new Error("A limpeza Docker exige recursos do profile confiável");
      }
      await cleanupQuietly(() =>
        runner("docker", ["rm", "--force", "--volumes", container], {
          env: { PATH: process.env.PATH ?? "" },
          timeoutMs: PROCESS_TIMEOUT_MS,
          maxOutputBytes: PROCESS_MAX_OUTPUT_BYTES,
        }),
      );
      await cleanupQuietly(() =>
        runner("docker", ["image", "rm", "--force", image], {
          env: { PATH: process.env.PATH ?? "" },
          timeoutMs: PROCESS_TIMEOUT_MS,
          maxOutputBytes: PROCESS_MAX_OUTPUT_BYTES,
        }),
      );
    },
  };
}

function assertTrustedDockerArgs(args) {
  const build = ["build", "--tag", HARNESS_PROFILE.docker.image, "."];
  const run = [
    "run",
    "--detach",
    "--rm",
    "--name",
    HARNESS_PROFILE.docker.container,
    "--publish",
    `127.0.0.1:${HARNESS_PROFILE.docker.hostPort}:${HARNESS_PROFILE.docker.containerPort}`,
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges",
    HARNESS_PROFILE.docker.image,
  ];
  if (
    !Array.isArray(args) ||
    ![build, run].some(
      (expected) =>
        args.length === expected.length &&
        args.every((value, index) => value === expected[index]),
    )
  ) {
    throw new Error("A execução Docker deve usar argumentos internos fixos");
  }
}

export function createLoopbackHttpClient({ fetchImpl = fetch } = {}) {
  return {
    async get({ url, timeoutMs, maxOutputBytes }) {
      const requestUrl = new URL(url);
      if (
        requestUrl.protocol !== "http:" ||
        requestUrl.hostname !== "127.0.0.1" ||
        requestUrl.pathname !== HARNESS_PROFILE.docker.healthPath
      ) {
        throw new Error(
          "O smoke HTTP deve usar apenas o health loopback confiável",
        );
      }
      const response = await fetchImpl(requestUrl, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await readBoundedJson(response, maxOutputBytes);
      return { status: response.status, body };
    },
  };
}

async function readBoundedJson(response, maxOutputBytes) {
  if (response.body === null)
    throw new Error("A resposta HTTP não possui corpo");
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxOutputBytes) {
        await reader.cancel();
        throw new Error("A resposta HTTP excede o limite de saída");
      }
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
  } catch {
    throw new Error("A resposta HTTP do smoke é inválida");
  }
}

async function runProcess(
  command,
  args,
  { cwd, env, timeoutMs, maxOutputBytes },
) {
  return execFile(command, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: maxOutputBytes,
  });
}

export function createGitCheckout({ directory, runner = runGitCheckout } = {}) {
  if (typeof directory !== "string" || directory.length === 0) {
    throw new Error("O checkout confiável exige um diretório de destino");
  }

  return async function checkout({ repository, commit }) {
    if (!REPOSITORY.test(repository) || !SHA40.test(commit)) {
      throw new Error("O checkout exige repository e commit validados");
    }
    const url = `https://github.com/${repository}.git`;
    const environment = {
      PATH: process.env.PATH ?? "",
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "Never",
    };
    await runner(
      "git",
      [
        "-c",
        "credential.helper=",
        "-c",
        "submodule.recurse=false",
        "clone",
        "--no-checkout",
        "--no-recurse-submodules",
        url,
        directory,
      ],
      checkoutOptions(environment),
    );
    await runner(
      "git",
      [
        "-C",
        directory,
        "-c",
        "credential.helper=",
        "-c",
        "submodule.recurse=false",
        "checkout",
        "--detach",
        commit,
      ],
      checkoutOptions(environment),
    );
    const { stdout } = await runner(
      "git",
      ["-C", directory, "rev-parse", "--verify", "HEAD"],
      checkoutOptions(environment),
    );
    if (stdout.trim() !== commit) {
      throw new Error("O checkout não corresponde ao SHA solicitado");
    }
    return {
      templateDirectory: directory,
      cleanup: () => rm(directory, { recursive: true, force: true }),
    };
  };
}

function checkoutOptions(env) {
  return {
    env,
    encoding: "utf8",
    timeout: PROCESS_TIMEOUT_MS,
    maxBuffer: PROCESS_MAX_OUTPUT_BYTES,
  };
}

async function runGitCheckout(command, args, options) {
  return execFile(command, args, options);
}

export async function copyTemplateTree(source, destination) {
  await assertRegularDirectory(source, "A origem do template");
  await mkdir(destination, { recursive: true });
  await assertRegularDirectory(destination, "O destino do template");
  await copyTree(source, destination, destination);
}

async function copyTree(source, destination, destinationRoot) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const sourcePath = join(source, entry.name);
    const destinationPath = assertContainedOutput(
      destinationRoot,
      join(destination, entry.name),
    );
    const details = await lstat(sourcePath);
    if (details.isSymbolicLink()) {
      throw new Error("A árvore do template não pode conter links simbólicos");
    }
    if (details.isDirectory()) {
      await mkdir(destinationPath);
      await copyTree(sourcePath, destinationPath, destinationRoot);
    } else if (details.isFile()) {
      await copyFile(sourcePath, destinationPath);
    } else {
      throw new Error("A árvore do template contém uma entrada não suportada");
    }
  }
}

function assertContainedOutput(root, candidate) {
  const rootPath = resolve(root);
  const candidatePath = resolve(candidate);
  const candidateRelative = relative(rootPath, candidatePath);
  if (
    candidateRelative === "" ||
    candidateRelative === ".." ||
    candidateRelative.startsWith(`..${sep}`) ||
    isAbsolute(candidateRelative)
  ) {
    throw new Error("A saída da materialização deve permanecer contida");
  }
  return candidatePath;
}

async function assertRegularDirectory(directory, label) {
  const details = await lstat(directory);
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error(`${label} deve ser um diretório regular`);
  }
}

export async function renderTrustedProfile(directory, manifest) {
  assertTrustedProfile({ id: manifest.id }, manifest);
  const values = {
    projectName: HARNESS_PROFILE.projectName,
    description: HARNESS_PROFILE.description,
  };
  await renderPackageJson(join(directory, "package.json"), values);
  await renderPackageLock(join(directory, "package-lock.json"), values);
  await renderTextFile(join(directory, ".env.example"), values);
  await renderTextFile(join(directory, "README.md"), values);
}

function assertTrustedProfile(target, manifest) {
  if (target.id !== HARNESS_PROFILE.id || manifest.id !== HARNESS_PROFILE.id) {
    throw new Error("Não existe profile confiável para este template");
  }
  for (const variable of manifest.variables) {
    if (
      variable.required &&
      variable.name !== "projectName" &&
      variable.name !== "description"
    ) {
      throw new Error(
        "O profile não suporta uma variável obrigatória do manifesto",
      );
    }
  }
}

async function renderPackageJson(path, values) {
  const document = await readJson(path);
  document.name = renderExactKnownToken(document.name, values);
  document.description = renderExactKnownToken(document.description, values);
  assertNoTokens(document);
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`);
}

async function renderPackageLock(path, values) {
  const document = await readJson(path);
  document.name = renderExactKnownToken(document.name, values);
  if (document.packages?.[""] !== undefined) {
    document.packages[""].name = renderExactKnownToken(
      document.packages[""].name,
      values,
    );
  }
  assertNoTokens(document);
  await writeFile(path, `${JSON.stringify(document, null, 2)}\n`);
}

async function renderTextFile(path, values) {
  const contents = await readFile(path, "utf8");
  await writeFile(path, renderTokens(contents, values));
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error("O arquivo JSON do profile confiável é inválido");
  }
}

function renderExactKnownToken(value, values) {
  if (typeof value !== "string")
    throw new Error("Campo JSON do profile é inválido");
  return renderTokens(value, values);
}

function renderTokens(value, values) {
  TOKEN.lastIndex = 0;
  return value.replace(TOKEN, (_match, name) => {
    if (!(name in values))
      throw new Error("O profile encontrou token não suportado");
    return values[name];
  });
}

function assertNoTokens(value) {
  if (typeof value === "string") {
    TOKEN.lastIndex = 0;
    if (TOKEN.test(value))
      throw new Error("O profile deixou token sem resolução");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertNoTokens);
  } else if (value !== null && typeof value === "object") {
    Object.values(value).forEach(assertNoTokens);
  }
}
