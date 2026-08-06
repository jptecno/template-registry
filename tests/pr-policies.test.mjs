import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  analyzeRegistryPatch,
  evaluatePullRequest,
} from '../scripts/danger/pr-policies.mjs';

const completeBody = `## Resumo

Atualiza o catálogo.

## Contexto da alteração do registry

Compatibilidade mantida e origem do template conferida.

## Homologação, release e produção

- Ambiente de homologação e resultado: validado em development
- Impacto de produção: novos projetos usam a versão indicada
- Plano de rollback: reverter o merge
`;

function facts(overrides = {}) {
  return {
    title: 'ci(review): adiciona políticas de pull request',
    body: completeBody,
    baseBranch: 'development',
    headBranch: 'chore/automated-review',
    files: ['registry.json'],
    additions: 10,
    deletions: 2,
    registryChanges: {
      repositoryChanged: false,
      schemaChanged: false,
      versionDowngraded: false,
    },
    ...overrides,
  };
}

describe('evaluatePullRequest', () => {
  it('aceita uma pull request que atende às políticas', () => {
    assert.deepEqual(evaluatePullRequest(facts()), {
      failures: [],
      warnings: [],
    });
  });

  it('reprova título não convencional e descrição vazia', () => {
    const result = evaluatePullRequest(
      facts({ title: 'Atualiza registry.', body: '## Resumo\n\n<!-- preencher -->' }),
    );

    assert.deepEqual(result.failures, [
      'Use um título no formato Conventional Commits.',
      'Preencha a seção Resumo com uma descrição objetiva.',
      'Descreva compatibilidade e supply chain em Contexto da alteração do registry.',
    ]);
  });

  it('reprova PR para main que não vem de development', () => {
    assert.ok(
      evaluatePullRequest(
        facts({ baseBranch: 'main', headBranch: 'fix/urgente' }),
      ).failures.includes(
        'Pull requests para main devem ter origem em development.',
      ),
    );
  });

  it('reprova promoção sem homologação, impacto e rollback', () => {
    const result = evaluatePullRequest(
      facts({
        baseBranch: 'main',
        headBranch: 'development',
        body: '## Resumo\n\nPromove versão.\n\n## Homologação, release e produção',
        files: [],
      }),
    );

    assert.deepEqual(result.failures, [
      'Preencha o campo de promoção: Ambiente de homologação e resultado.',
      'Preencha o campo de promoção: Impacto de produção.',
      'Preencha o campo de promoção: Plano de rollback.',
    ]);
  });

  it('reprova artefatos e registry sem contexto', () => {
    const result = evaluatePullRequest(
      facts({ files: ['registry.json', 'dist/result.json'], body: '## Resumo\n\nMudança.' }),
    );

    assert.deepEqual(result.failures, [
      'Não versione artefatos gerados: dist/result.json.',
      'Descreva compatibilidade e supply chain em Contexto da alteração do registry.',
    ]);
  });

  it('mantém downgrade, troca de repositório e schema como warnings', () => {
    const result = evaluatePullRequest(
      facts({
        registryChanges: {
          repositoryChanged: true,
          schemaChanged: true,
          versionDowngraded: true,
        },
      }),
    );

    assert.deepEqual(result, {
      failures: [],
      warnings: [
        'Possível downgrade de versão no registry; confirme a intenção.',
        'Repositório do template alterado; confirme origem e confiança.',
        'Schema do registry alterado; confirme compatibilidade com a CLI.',
      ],
    });
  });
});

describe('analyzeRegistryPatch', () => {
  it('extrai as três heurísticas do patch sem torná-las gates', () => {
    const patch = `-  "schemaVersion": 1,
+  "schemaVersion": 2,
-      "repository": "jptecno/original",
+      "repository": "jptecno/novo",
-      "version": "v2.0.0",
+      "version": "v1.9.0"`;

    assert.deepEqual(analyzeRegistryPatch(patch), {
      repositoryChanged: true,
      schemaChanged: true,
      versionDowngraded: true,
    });
  });
});
