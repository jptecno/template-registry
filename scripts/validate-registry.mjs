import { readFile } from "node:fs/promises";

const requiredFields = [
  "id",
  "name",
  "description",
  "repository",
  "version",
  "ref",
];

const repositoryPattern = /^[\w.-]+\/[\w.-]+$/;
const immutableVersionPattern =
  /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function validateRegistry(registry) {
  if (
    !isRecord(registry) ||
    registry.schemaVersion !== 1 ||
    !Array.isArray(registry.templates)
  ) {
    throw new Error(
      "registry.json deve ser um objeto com schemaVersion 1 e templates como array",
    );
  }

  if (registry.templates.length === 0) {
    throw new Error("registry.json deve conter ao menos um template");
  }

  const ids = new Set();

  for (const template of registry.templates) {
    validateTemplate(template, ids);
  }

  return registry.templates.length;
}

function validateTemplate(template, ids) {
  if (!isRecord(template)) {
    throw new Error(
      "Cada template deve ser um objeto, não um array ou valor primitivo",
    );
  }

  const values = Object.create(null);

  for (const field of requiredFields) {
    const value = template[field];

    if (typeof value !== "string" || value.trim() === "") {
      throw new Error(
        `Template possui campo inválido: ${field} deve ser uma string não vazia`,
      );
    }

    values[field] = value;
  }

  if (!isKebabCase(values.id)) {
    throw new Error(
      `O identificador do template deve usar kebab-case: ${values.id}`,
    );
  }

  if (ids.has(values.id)) {
    throw new Error(
      `O catálogo possui identificadores de template duplicados: ${values.id}`,
    );
  }

  ids.add(values.id);

  if (!repositoryPattern.test(values.repository)) {
    throw new Error(
      `O repositório do template possui formato inválido (organização/repositório): ${values.repository}`,
    );
  }

  if (
    !immutableVersionPattern.test(values.ref) ||
    values.version !== values.ref
  ) {
    throw new Error(
      `O template deve usar a mesma tag SemVer estrita e imutável em version e ref: ${values.id}`,
    );
  }
}

function isKebabCase(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const content = await readFile(
      new URL("../registry.json", import.meta.url),
      "utf8",
    );
    const count = validateRegistry(JSON.parse(content));
    console.log(`Registry válido: ${count} template(s)`);
  } catch (error) {
    console.error(
      `Registry inválido: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
