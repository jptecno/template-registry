import { readFile } from "node:fs/promises";

import Ajv from "ajv";
import registryV2Schema from "../schemas/template-registry-v2.schema.json" with {
  type: "json",
};

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

const ajv = new Ajv({ allErrors: true, strict: true });
const validateRegistryV2Schema = ajv.compile(registryV2Schema);

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

export function validateRegistryV2(registry) {
  validateWithSchema(validateRegistryV2Schema, registry, "registry v2");
  validateRegistryV2Semantics(registry);

  return registry.templates.length;
}

export function validateRegistryV2Semantics(registry) {
  const templateIds = new Set();

  for (const template of registry.templates) {
    if (templateIds.has(template.id)) {
      throw new Error(
        `O catálogo possui identificadores de template duplicados: ${template.id}`,
      );
    }

    templateIds.add(template.id);
  }

  for (const template of registry.templates) {
    const versions = new Set();
    let activeVersions = 0;

    for (const version of template.versions) {
      if (versions.has(version.version)) {
        throw new Error(
          `O template possui versões duplicadas: ${template.id}@${version.version}`,
        );
      }

      versions.add(version.version);

      if (version.version !== version.ref) {
        throw new Error(
          `A versão e a ref devem ser idênticas: ${template.id}@${version.version}`,
        );
      }

      if (version.status === "active") {
        activeVersions += 1;
      }

      if (version.replacement !== undefined) {
        if (version.replacement === template.id) {
          throw new Error(
            `O replacement não pode referenciar o próprio template: ${template.id}`,
          );
        }

        if (!templateIds.has(version.replacement)) {
          throw new Error(
            `O replacement deve referenciar um template existente: ${version.replacement}`,
          );
        }
      }
    }

    if (activeVersions !== 1) {
      throw new Error(
        `O template deve possuir exatamente uma versão active: ${template.id}`,
      );
    }
  }
}

export function validateWithSchema(validate, document, label = "documento") {
  if (!validate(document)) {
    const errors = ajv.errorsText(validate.errors, { separator: "; " });
    throw new Error(`${label} não atende ao schema: ${errors}`);
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
