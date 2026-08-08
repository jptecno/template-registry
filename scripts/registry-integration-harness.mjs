import { execFile as execFileCallback } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
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
  return execFile(command, args, { encoding: "utf8" });
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
