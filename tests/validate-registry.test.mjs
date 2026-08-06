import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateRegistry } from '../scripts/validate-registry.mjs';

const template = {
  id: 'api-nodejs-typescript',
  name: 'API Node.js + TypeScript',
  description: 'Template de API.',
  repository: 'jptecno/template-api-nodejs-typescript',
  version: 'v0.1.0',
  ref: 'v0.1.0',
};

describe('validateRegistry', () => {
  it('aceita templates com identificadores diferentes', () => {
    const registry = {
      schemaVersion: 1,
      templates: [template, { ...template, id: 'outro-template' }],
    };

    assert.doesNotThrow(() => validateRegistry(registry));
  });

  it('rejeita templates com identificadores duplicados', () => {
    const registry = {
      schemaVersion: 1,
      templates: [template, { ...template }],
    };

    assert.throws(
      () => validateRegistry(registry),
      new Error('Template possui id duplicado: api-nodejs-typescript'),
    );
  });
});
