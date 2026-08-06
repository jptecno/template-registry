import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { validateRemoteTemplates } from '../scripts/validate-remote-templates.mjs';

const template = {
  id: 'api-nodejs-typescript',
  repository: 'jptecno/template-api-nodejs-typescript',
  ref: 'v0.1.0',
};
const registry = { templates: [template] };

function response({ ok = true, json = { id: template.id } } = {}) {
  return {
    ok,
    body: { cancel: async () => {} },
    json: async () => json,
  };
}

function requestWithFailure(fragment) {
  return async (url) => response({ ok: !url.includes(fragment) });
}

describe('validateRemoteTemplates', () => {
  it('aceita repo, tag, archive e manifesto raiz acessíveis com ID correspondente', async () => {
    const urls = [];
    const request = async (url) => {
      urls.push(url);
      return response();
    };

    await validateRemoteTemplates(registry, request);

    assert.deepEqual(urls, [
      'https://api.github.com/repos/jptecno/template-api-nodejs-typescript',
      'https://api.github.com/repos/jptecno/template-api-nodejs-typescript/git/ref/tags/v0.1.0',
      'https://codeload.github.com/jptecno/template-api-nodejs-typescript/tar.gz/v0.1.0',
      'https://raw.githubusercontent.com/jptecno/template-api-nodejs-typescript/v0.1.0/template.json',
    ]);
  });

  it('rejeita repositório inacessível', async () => {
    await assert.rejects(
      validateRemoteTemplates(registry, requestWithFailure('/repos/')),
      new Error(
        'Repositório inacessível: jptecno/template-api-nodejs-typescript',
      ),
    );
  });

  it('rejeita tag inacessível', async () => {
    await assert.rejects(
      validateRemoteTemplates(registry, requestWithFailure('/git/ref/tags/')),
      new Error(
        'Tag inacessível: jptecno/template-api-nodejs-typescript@v0.1.0',
      ),
    );
  });

  it('rejeita archive inacessível', async () => {
    await assert.rejects(
      validateRemoteTemplates(registry, requestWithFailure('/tar.gz/')),
      new Error(
        'Archive inacessível: jptecno/template-api-nodejs-typescript@v0.1.0',
      ),
    );
  });

  it('rejeita ausência de template.json na raiz', async () => {
    await assert.rejects(
      validateRemoteTemplates(registry, requestWithFailure('/template.json')),
      new Error(
        'template.json ausente na raiz: jptecno/template-api-nodejs-typescript@v0.1.0',
      ),
    );
  });

  it('rejeita ID do manifesto diferente do registry', async () => {
    const request = async (url) =>
      response({ json: { id: url.includes('template.json') ? 'outro' : template.id } });

    await assert.rejects(
      validateRemoteTemplates(registry, request),
      new Error(
        'ID do template.json não corresponde ao registry: api-nodejs-typescript',
      ),
    );
  });
});
