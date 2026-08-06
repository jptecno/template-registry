import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function validateRemoteTemplates(registry, request = fetch) {
  for (const template of registry.templates) {
    await validateTemplate(template, request);
  }
}

async function validateTemplate(template, request) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'jptecno-template-registry-validator',
  };
  const token = process.env.GITHUB_TOKEN;

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  await requireAccessible(
    request(`https://api.github.com/repos/${template.repository}`, { headers }),
    `Repositório inacessível: ${template.repository}`,
  );
  await requireAccessible(
    request(
      `https://api.github.com/repos/${template.repository}/git/ref/tags/${encodeURIComponent(template.ref)}`,
      { headers },
    ),
    `Tag inacessível: ${template.repository}@${template.ref}`,
  );
  await requireAccessible(
    request(
      `https://codeload.github.com/${template.repository}/tar.gz/${encodeURIComponent(template.ref)}`,
      { headers },
    ),
    `Archive inacessível: ${template.repository}@${template.ref}`,
  );

  const manifestResponse = await request(
    `https://raw.githubusercontent.com/${template.repository}/${encodeURIComponent(template.ref)}/template.json`,
    { headers },
  );

  if (!manifestResponse.ok) {
    throw new Error(
      `template.json ausente na raiz: ${template.repository}@${template.ref}`,
    );
  }

  let manifest;

  try {
    manifest = await manifestResponse.json();
  } catch {
    throw new Error(
      `template.json inválido: ${template.repository}@${template.ref}`,
    );
  }

  if (manifest?.id !== template.id) {
    throw new Error(
      `ID do template.json não corresponde ao registry: ${template.id}`,
    );
  }
}

async function requireAccessible(responsePromise, message) {
  const response = await responsePromise;

  if (!response.ok) {
    throw new Error(message);
  }

  await response.body?.cancel();
}

async function main() {
  const content = await readFile(
    new URL('../registry.json', import.meta.url),
    'utf8',
  );
  const registry = JSON.parse(content);

  await validateRemoteTemplates(registry);
  console.log(`Templates remotos válidos: ${registry.templates.length}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
