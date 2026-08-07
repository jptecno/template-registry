import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { verifySignatureEnvelope } from "./ed25519-detached-envelope.mjs";

export async function verifyEnvelopeCommand(argumentsList) {
  const options = parseArguments(argumentsList);
  const payloadPath = requiredOption(options, "payload");
  const envelopePath = requiredOption(options, "envelope");
  const publicKeyOptions = options.get("public-key") ?? [];

  if (publicKeyOptions.length === 0) {
    throw new Error("Informe ao menos uma opção --public-key key-id=caminho");
  }

  const [payload, envelope, trustedPublicKeys] = await Promise.all([
    readFile(payloadPath),
    readJson(envelopePath),
    readTrustedPublicKeys(publicKeyOptions),
  ]);

  return verifySignatureEnvelope(payload, envelope, trustedPublicKeys);
}

function parseArguments(argumentsList) {
  const options = new Map();

  for (let index = 0; index < argumentsList.length; index += 2) {
    const option = argumentsList[index];
    const value = argumentsList[index + 1];

    if (!option?.startsWith("--") || value === undefined) {
      throw new Error("Uso: opções devem ser informadas como --nome valor");
    }

    const name = option.slice(2);
    if (name !== "payload" && name !== "envelope" && name !== "public-key") {
      throw new Error(`Opção inválida: ${option}`);
    }

    const values = options.get(name) ?? [];
    if (name !== "public-key" && values.length > 0) {
      throw new Error(`Opção repetida: ${option}`);
    }

    values.push(value);
    options.set(name, values);
  }

  return options;
}

function requiredOption(options, name) {
  const value = options.get(name)?.[0];
  if (value === undefined || value === "") {
    throw new Error(`A opção --${name} é obrigatória`);
  }

  return value;
}

async function readTrustedPublicKeys(publicKeyOptions) {
  const entries = await Promise.all(
    publicKeyOptions.map(async (option) => {
      const separator = option.indexOf("=");
      if (separator < 1 || separator === option.length - 1) {
        throw new Error(
          "A opção --public-key deve usar o formato key-id=caminho",
        );
      }

      return [
        option.slice(0, separator),
        await readFile(option.slice(separator + 1)),
      ];
    }),
  );
  const trustedPublicKeys = new Map();

  for (const [keyId, publicKey] of entries) {
    if (trustedPublicKeys.has(keyId)) {
      throw new Error(`Chave pública confiável repetida: ${keyId}`);
    }

    trustedPublicKeys.set(keyId, publicKey);
  }

  return trustedPublicKeys;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const signatures = await verifyEnvelopeCommand(process.argv.slice(2));
    console.log(`Envelope válido: ${signatures} assinatura(s)`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
