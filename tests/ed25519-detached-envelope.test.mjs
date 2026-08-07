import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  createSignatureEnvelope,
  verifySignatureEnvelope,
} from "../scripts/ed25519-detached-envelope.mjs";

const payload = Buffer.from(
  '{"template":"api-nodejs-typescript","version":"v1.0.0"}\n',
);

const maintainerA = testKeyPair();
const maintainerB = testKeyPair();

function testKeyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  return {
    privateKey: privateKey.export({ format: "pem", type: "pkcs8" }),
    publicKey: publicKey.export({ format: "pem", type: "spki" }),
  };
}

function signedEnvelope() {
  const envelope = createSignatureEnvelope(
    payload,
    "maintainer-a",
    maintainerA.privateKey,
  );

  return createSignatureEnvelope(
    payload,
    "maintainer-b",
    maintainerB.privateKey,
    envelope,
  );
}

function trustedPublicKeys() {
  return new Map([
    ["maintainer-a", maintainerA.publicKey],
    ["maintainer-b", maintainerB.publicKey],
  ]);
}

test("verifica envelope detached com múltiplas assinaturas Ed25519", async () => {
  assert.equal(
    verifySignatureEnvelope(payload, signedEnvelope(), trustedPublicKeys()),
    2,
  );
});

test("rejeita quando os bytes do payload foram alterados", async () => {
  const tamperedPayload = Buffer.from(payload);
  tamperedPayload[0] ^= 1;
  const envelope = signedEnvelope();
  const trustedKeys = trustedPublicKeys();

  assert.throws(
    () => verifySignatureEnvelope(tamperedPayload, envelope, trustedKeys),
    /bytes do payload não correspondem/,
  );
});

test("rejeita chave de assinatura fora da trust store", async () => {
  const envelope = signedEnvelope();
  const trustedKeys = new Map([["maintainer-b", maintainerB.publicKey]]);

  assert.throws(
    () => verifySignatureEnvelope(payload, envelope, trustedKeys),
    /chave de assinatura não é confiável: maintainer-a/,
  );
});

test("rejeita chaves que não usam Ed25519", () => {
  const { privateKey: rsaPrivateKey, publicKey: rsaPublicKey } =
    generateKeyPairSync("rsa", { modulusLength: 2048 });

  assert.throws(
    () => createSignatureEnvelope(payload, "maintainer-c", rsaPrivateKey),
    /chave privada deve usar o algoritmo Ed25519/,
  );
  assert.throws(
    () =>
      verifySignatureEnvelope(
        payload,
        signedEnvelope(),
        new Map([["maintainer-a", rsaPublicKey]]),
      ),
    /chave pública deve usar o algoritmo Ed25519/,
  );
});

test("rejeita keyId duplicado no envelope", () => {
  const envelope = signedEnvelope();
  const duplicateKeyEnvelope = {
    ...envelope,
    signatures: [...envelope.signatures, { ...envelope.signatures[0] }],
  };

  const trustedKeys = trustedPublicKeys();

  assert.throws(
    () => verifySignatureEnvelope(payload, duplicateKeyEnvelope, trustedKeys),
    /chaves de assinatura duplicadas: maintainer-a/,
  );
});
