import { readFile } from "node:fs/promises";

import { validateRegistryV2 } from "./validate-registry.mjs";

const DEFAULT_PATHS = {
  baseRegistryPath: "registry.json",
  candidateRegistryPath: "registry.json",
  baseSchemaPath: "schemas/template-registry-v2.schema.json",
  candidateSchemaPath: "schemas/template-registry-v2.schema.json",
};

export async function validateRegistryPullRequest(paths) {
  const {
    baseRegistryPath,
    candidateRegistryPath,
    baseSchemaPath,
    candidateSchemaPath,
  } = { ...DEFAULT_PATHS, ...paths };

  const [
    baseRegistrySource,
    candidateRegistrySource,
    baseSchemaSource,
    candidateSchemaSource,
  ] = await Promise.all([
    readFile(baseRegistryPath, "utf8"),
    readFile(candidateRegistryPath, "utf8"),
    readFile(baseSchemaPath),
    readFile(candidateSchemaPath),
  ]);

  assertEqualSchemaBytes(baseSchemaSource, candidateSchemaSource);

  const baseRegistry = parseRegistry(baseRegistrySource, "base");
  const candidateRegistry = parseRegistry(candidateRegistrySource, "candidate");

  validateDocument(baseRegistry, "base");
  validateDocument(candidateRegistry, "candidate");

  const registryChanged = baseRegistrySource !== candidateRegistrySource;

  if (registryChanged) {
    validateProgression(baseRegistry, candidateRegistry);
  }

  return { registryChanged };
}

function assertEqualSchemaBytes(baseSchema, candidateSchema) {
  if (!baseSchema.equals(candidateSchema)) {
    throw new Error(
      "O schema template-registry-v2.schema.json do candidato deve ser byte a byte idêntico ao da base",
    );
  }
}

function parseRegistry(source, label) {
  try {
    return JSON.parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`O registry ${label} não contém JSON válido: ${message}`);
  }
}

function validateDocument(registry, label) {
  try {
    validateRegistryV2(registry);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`O registry ${label} é inválido: ${message}`);
  }
}

function validateProgression(base, candidate) {
  if (candidate.revision !== base.revision + 1) {
    throw new Error(
      `A revisão do candidato deve ser exatamente a revisão da base mais um: esperado ${base.revision + 1}, recebido ${candidate.revision}`,
    );
  }

  const basePublishedAt = Date.parse(base.publishedAt);
  const candidatePublishedAt = Date.parse(candidate.publishedAt);

  if (
    candidate.publishedAt === base.publishedAt ||
    candidatePublishedAt <= basePublishedAt
  ) {
    throw new Error(
      "publishedAt do candidato deve ser distinto e posterior ao publishedAt da base",
    );
  }
}

function parseCliArguments(argv) {
  const paths = {};

  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];

    if (value === undefined) {
      throw new Error(`A opção ${option} exige um caminho`);
    }

    switch (option) {
      case "--base-registry":
        paths.baseRegistryPath = value;
        break;
      case "--candidate-registry":
        paths.candidateRegistryPath = value;
        break;
      case "--base-schema":
        paths.baseSchemaPath = value;
        break;
      case "--candidate-schema":
        paths.candidateSchemaPath = value;
        break;
      default:
        throw new Error(`Opção desconhecida: ${option}`);
    }
  }

  return paths;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = await validateRegistryPullRequest(
      parseCliArguments(process.argv.slice(2)),
    );
    console.log(
      result.registryChanged
        ? "Gate estrutural do registry aprovado: alteração com progressão válida"
        : "Gate estrutural do registry aprovado: registry inalterado",
    );
  } catch (error) {
    console.error(
      `Gate estrutural do registry reprovado: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
