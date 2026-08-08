import {
  createHash,
  createPrivateKey,
  createPublicKey,
  KeyObject,
  sign,
  verify,
} from "node:crypto";

import Ajv from "ajv";
import envelopeSchema from "../schemas/ed25519-detached-envelope-v1.schema.json" with {
  type: "json",
};

const keyIdPattern = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const ajv = new Ajv({ allErrors: true, strict: true });
const validateSchema = ajv.compile(envelopeSchema);

export function createSignatureEnvelope(payload, keyId, privateKey, envelope) {
  assertPayload(payload);
  assertKeyId(keyId);

  const signingKey = ed25519PrivateKey(privateKey);
  const payloadSha256 = hashPayload(payload);
  const signatures =
    envelope === undefined
      ? []
      : signaturesFromEnvelope(envelope, payloadSha256);

  if (signatures.some((signature) => signature.keyId === keyId)) {
    throw new Error(
      `O envelope já contém uma assinatura para a chave: ${keyId}`,
    );
  }

  return {
    schemaVersion: 1,
    algorithm: "Ed25519",
    payloadSha256,
    signatures: [
      ...signatures,
      { keyId, signature: sign(null, payload, signingKey).toString("base64") },
    ],
  };
}

export function verifySignatureEnvelope(payload, envelope, trustedPublicKeys) {
  assertPayload(payload);
  validateEnvelope(envelope);

  const payloadSha256 = hashPayload(payload);
  if (envelope.payloadSha256 !== payloadSha256) {
    throw new Error("Os bytes do payload não correspondem ao hash do envelope");
  }

  if (!(trustedPublicKeys instanceof Map)) {
    throw new TypeError(
      "As chaves públicas confiáveis devem ser fornecidas em um Map",
    );
  }

  for (const signature of envelope.signatures) {
    const publicKey = trustedPublicKeys.get(signature.keyId);

    if (publicKey === undefined) {
      throw new Error(
        `A chave de assinatura não é confiável: ${signature.keyId}`,
      );
    }

    if (
      !verify(
        null,
        payload,
        ed25519PublicKey(publicKey),
        Buffer.from(signature.signature, "base64"),
      )
    ) {
      throw new Error(
        `A assinatura é inválida para a chave: ${signature.keyId}`,
      );
    }
  }

  return envelope.signatures.length;
}

export function validateEnvelope(envelope) {
  if (!validateSchema(envelope)) {
    const errors = ajv.errorsText(validateSchema.errors, { separator: "; " });
    throw new Error(`Envelope de assinatura inválido: ${errors}`);
  }

  const keyIds = new Set();
  for (const signature of envelope.signatures) {
    if (keyIds.has(signature.keyId)) {
      throw new Error(
        `O envelope possui chaves de assinatura duplicadas: ${signature.keyId}`,
      );
    }

    keyIds.add(signature.keyId);
  }
}

function signaturesFromEnvelope(envelope, payloadSha256) {
  validateEnvelope(envelope);

  if (envelope.payloadSha256 !== payloadSha256) {
    throw new Error(
      "O envelope existente foi criado para bytes de payload diferentes",
    );
  }

  return envelope.signatures;
}

function ed25519PrivateKey(privateKey) {
  const key =
    privateKey instanceof KeyObject ? privateKey : createPrivateKey(privateKey);

  if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") {
    throw new TypeError("A chave privada deve usar o algoritmo Ed25519");
  }

  return key;
}

function ed25519PublicKey(publicKey) {
  const key =
    publicKey instanceof KeyObject ? publicKey : createPublicKey(publicKey);

  if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") {
    throw new TypeError("A chave pública deve usar o algoritmo Ed25519");
  }

  return key;
}

function hashPayload(payload) {
  return createHash("sha256").update(payload).digest("hex");
}

function assertPayload(payload) {
  if (!Buffer.isBuffer(payload) && !(payload instanceof Uint8Array)) {
    throw new TypeError("O payload deve ser um Buffer ou Uint8Array");
  }
}

function assertKeyId(keyId) {
  if (typeof keyId !== "string" || !keyIdPattern.test(keyId)) {
    throw new Error("O identificador da chave de assinatura é inválido");
  }
}
