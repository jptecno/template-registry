# JP Tecno Template Registry

Catálogo público e versionado dos templates consumidos pelo `@jptecno/cli`.

## Catálogo

O arquivo [`registry.json`](./registry.json) é servido pelo GitHub Raw e contém os templates disponíveis. Cada entrada deve apontar para uma tag [SemVer 2.0.0](https://semver.org/lang/pt-BR/) com o prefixo `v`.

```json
{
  "schemaVersion": 1,
  "templates": [
    {
      "id": "api-nodejs-typescript",
      "name": "API Node.js + TypeScript",
      "description": "Fastify, PostgreSQL, Kysely, Vitest e Biome.",
      "repository": "jptecno/template-api-nodejs-typescript",
      "version": "v0.1.0",
      "ref": "v0.1.0"
    }
  ]
}
```

## Publicar um template

1. Garanta que o template passa em sua validação local e CI.
2. Publique uma tag SemVer, por exemplo `v1.0.0`.
3. Adicione ou atualize a entrada em `registry.json`, apontando `version` e `ref` para a tag.
4. Abra um pull request com a alteração do catálogo.

O `id` deve ser único e usar kebab-case, como `api-nodejs-typescript`. `version` e `ref` devem ser idênticos e seguir SemVer estrito com prefixo `v`, incluindo versões de pré-lançamento e metadados de build válidos, quando necessários.

Não use branches como `main` ou `develop` em `ref`. Tags são referências mutáveis no Git e esta validação não fornece imutabilidade criptográfica. Enquanto a migração para o contrato com commit e hash não estiver concluída, mantenha as tags protegidas no repositório do template e não as mova após a publicação.

## Schema

| Campo | Descrição |
| --- | --- |
| `schemaVersion` | Versão do contrato do catálogo. |
| `id` | Identificador estável, usado por `jp init --template`. |
| `name` | Nome apresentado no seletor interativo. |
| `description` | Descrição curta apresentada no seletor. |
| `repository` | Repositório GitHub no formato `organização/repositório`. |
| `version` | Versão visível para o desenvolvedor. |
| `ref` | Tag SemVer que o CLI resolve para baixar o template. |

## Evolução do contrato

O contrato futuro com `commit` e `archiveSha256` está especificado em [`docs/future-registry-contract.md`](./docs/future-registry-contract.md). Esses campos ainda não são obrigatórios nem são interpretados pelo validador atual.
