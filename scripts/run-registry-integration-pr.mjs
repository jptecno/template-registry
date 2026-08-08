import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createDockerAdapter,
  createGitCheckout,
  createLoopbackHttpClient,
  createRegistryIntegrationEngine,
  selectIntegrationTargets,
} from "./registry-integration-harness.mjs";

export async function runRegistryIntegrationPullRequest(
  paths,
  {
    readRegistry = readRegistryFile,
    createEngine = createTrustedEngine,
    report = console.log,
  } = {},
) {
  const { baseRegistryPath, candidateRegistryPath } = paths;
  const [baseRegistry, candidateRegistry] = await Promise.all([
    readRegistry(baseRegistryPath, "base"),
    readRegistry(candidateRegistryPath, "candidate"),
  ]);
  const selection = selectIntegrationTargets(baseRegistry, candidateRegistry);

  if (selection.noOp) {
    report(`Gate de integração do registry aprovado: ${selection.message}`);
    return selection;
  }

  for (const target of selection.targets) {
    const engine = await createEngine(target);
    await engine(target);
  }
  report(
    `Gate de integração do registry aprovado: ${selection.targets.length} alvo(s) ativo(s) validado(s)`,
  );
  return selection;
}

async function readRegistryFile(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(`O registry ${label} não contém JSON válido`);
  }
}

async function createTrustedEngine() {
  const checkoutDirectory = await mkdtemp(
    join(tmpdir(), "registry-integration-checkout-"),
  );
  const engine = createRegistryIntegrationEngine({
    checkout: createGitCheckout({ directory: checkoutDirectory }),
    docker: createDockerAdapter(),
    http: createLoopbackHttpClient(),
  });

  return async (target) => {
    try {
      await engine(target);
    } finally {
      await rm(checkoutDirectory, { recursive: true, force: true });
    }
  };
}

export function parseCliArguments(argv) {
  if (argv.length !== 4) {
    throw new Error(
      "Uso: --base-registry <caminho> --candidate-registry <caminho>",
    );
  }

  const paths = {};
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`A opção ${option} exige um caminho`);
    }
    if (option === "--base-registry") paths.baseRegistryPath = value;
    else if (option === "--candidate-registry") {
      paths.candidateRegistryPath = value;
    } else {
      throw new Error(`Opção desconhecida: ${option}`);
    }
  }

  if (
    paths.baseRegistryPath === undefined ||
    paths.candidateRegistryPath === undefined
  ) {
    throw new Error(
      "Uso: --base-registry <caminho> --candidate-registry <caminho>",
    );
  }
  return paths;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await runRegistryIntegrationPullRequest(
      parseCliArguments(process.argv.slice(2)),
    );
  } catch {
    console.error("Gate de integração do registry reprovado");
    process.exitCode = 1;
  }
}
