import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function validateRegistry(registry) {
  if (
    !isRecord(registry) ||
    registry.schemaVersion !== 1 ||
    !Array.isArray(registry.templates) ||
    registry.templates.length === 0
  ) {
    throw new Error(
      "registry.json deve conter schemaVersion 1 e ao menos um template",
    );
  }

  const ids = new Set();

  for (const template of registry.templates) {
    validateTemplate(template);

    if (ids.has(template.id)) {
      throw new Error(`Template possui id duplicado: ${template.id}`);
    }

    ids.add(template.id);
  }
}

function validateTemplate(template) {
  if (!isRecord(template)) {
    throw new Error("Cada template deve ser um objeto");
  }

  for (const field of [
    "id",
    "name",
    "description",
    "repository",
    "version",
    "ref",
  ]) {
    if (typeof template[field] !== "string" || template[field].trim() === "") {
      throw new Error(`Template possui campo inválido: ${field}`);
    }
  }

  if (!/^[\w.-]+\/[\w.-]+$/.test(template.repository)) {
    throw new Error(
      `Template possui repository inválido: ${template.repository}`,
    );
  }

  if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(template.ref)) {
    throw new Error(
      `Template deve referenciar uma tag SemVer imutável: ${template.ref}`,
    );
  }

  if (template.version !== template.ref) {
    throw new Error(
      `Template deve usar a mesma versão em version e ref: ${template.id}`,
    );
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null;
}

async function main() {
  const content = await readFile(
    new URL("../registry.json", import.meta.url),
    "utf8",
  );
  const registry = JSON.parse(content);

  validateRegistry(registry);
  console.log(`Registry válido: ${registry.templates.length} template(s)`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
