import { readFile } from 'node:fs/promises';

const content = await readFile(new URL('../registry.json', import.meta.url), 'utf8');
let registry;

try {
  registry = JSON.parse(content);
} catch {
  throw new Error('registry.json deve conter JSON válido');
}

if (!isRecord(registry) || registry.schemaVersion !== 1 || !Array.isArray(registry.templates) || registry.templates.length === 0) {
  throw new Error('registry.json deve conter schemaVersion igual a 1 e pelo menos um template');
}

const ids = new Set();

for (const [index, template] of registry.templates.entries()) {
  validateTemplate(template, index);

  if (ids.has(template.id)) {
    throw new Error(`O id do template deve ser único: ${template.id}`);
  }

  ids.add(template.id);
}

console.log(`Registry válido: ${registry.templates.length} template(s)`);

function validateTemplate(template, index) {
  if (!isRecord(template)) {
    throw new Error(`O template na posição ${index} deve ser um objeto`);
  }

  for (const field of ['id', 'name', 'description', 'repository', 'version', 'ref']) {
    if (typeof template[field] !== 'string' || template[field].trim() === '') {
      throw new Error(`O template na posição ${index} possui campo inválido: ${field}`);
    }
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(template.id)) {
    throw new Error(`O id do template deve usar kebab-case: ${template.id}`);
  }

  if (!/^[\w.-]+\/[\w.-]+$/.test(template.repository)) {
    throw new Error(`O template possui repository inválido: ${template.repository}`);
  }

  if (!isStrictSemVer(template.ref)) {
    throw new Error(`O ref do template deve ser uma versão SemVer estrita com prefixo v: ${template.ref}`);
  }

  if (template.version !== template.ref) {
    throw new Error(`O template deve usar o mesmo valor em version e ref: ${template.id}`);
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStrictSemVer(value) {
  return /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value);
}
