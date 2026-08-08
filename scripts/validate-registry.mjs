import { readFile } from "node:fs/promises";

import Ajv from "ajv";
import registryV2Schema from "../schemas/template-registry-v2.schema.json" with {
  type: "json",
};

const ajv = new Ajv({ allErrors: true, strict: true });
const validateRegistryV2Schema = ajv.compile(registryV2Schema);

export function validateRegistryV2(registry) {
  validateWithSchema(validateRegistryV2Schema, registry, "registry v2");
  validateRegistryV2Semantics(registry);

  return registry.templates.length;
}

export function validateRegistryV2Semantics(registry) {
  if (!isValidRfc3339Utc(registry.publishedAt)) {
    throw new Error(
      "publishedAt deve ser uma data e hora RFC3339 UTC semanticamente válida",
    );
  }

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

function isValidRfc3339Utc(value) {
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/.exec(value);

  if (parts === null) {
    return false;
  }

  const date = new Date(value);

  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(parts[1]) &&
    date.getUTCMonth() + 1 === Number(parts[2]) &&
    date.getUTCDate() === Number(parts[3]) &&
    date.getUTCHours() === Number(parts[4]) &&
    date.getUTCMinutes() === Number(parts[5]) &&
    date.getUTCSeconds() === Number(parts[6])
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const content = await readFile(
      new URL("../registry.json", import.meta.url),
      "utf8",
    );
    const count = validateRegistryV2(JSON.parse(content));
    console.log(`Registry válido: ${count} template(s)`);
  } catch (error) {
    console.error(
      `Registry inválido: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
