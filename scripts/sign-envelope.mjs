import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { createSignatureEnvelope } from "./ed25519-detached-envelope.mjs";

export async function signEnvelopeCommand(argumentsList) {
  const options = parseArguments(argumentsList, [
    "key-id",
    "private-key",
    "payload",
    "output",
    "envelope",
  ]);
  const keyId = requiredOption(options, "key-id");
  const privateKeyPath = requiredOption(options, "private-key");
  const payloadPath = requiredOption(options, "payload");
  const outputPath = requiredOption(options, "output");
  const envelopePath = options.get("envelope");

  const [payload, privateKey, existingEnvelope] = await Promise.all([
    readFile(payloadPath),
    readFile(privateKeyPath),
    envelopePath === undefined ? undefined : readJson(envelopePath),
  ]);
  const envelope = createSignatureEnvelope(
    payload,
    keyId,
    privateKey,
    existingEnvelope,
  );

  await writeFile(outputPath, `${JSON.stringify(envelope, null, 2)}\n`);
  return envelope.signatures.length;
}

function parseArguments(argumentsList, allowedOptions) {
  const options = new Map();

  for (let index = 0; index < argumentsList.length; index += 2) {
    const option = argumentsList[index];
    const value = argumentsList[index + 1];

    if (!option?.startsWith("--") || value === undefined) {
      throw new Error("Uso: opções devem ser informadas como --nome valor");
    }

    const name = option.slice(2);
    if (!allowedOptions.includes(name) || options.has(name)) {
      throw new Error(`Opção inválida ou repetida: ${option}`);
    }

    options.set(name, value);
  }

  return options;
}

function requiredOption(options, name) {
  const value = options.get(name);
  if (value === undefined || value === "") {
    throw new Error(`A opção --${name} é obrigatória`);
  }

  return value;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const signatures = await signEnvelopeCommand(process.argv.slice(2));
    console.log(`Envelope assinado: ${signatures} assinatura(s)`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
