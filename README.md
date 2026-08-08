# JP Tecno Template Registry

Catálogo público e versionado dos templates consumidos pelo `@jptecno/cli`.

## Estado da migração

A branch `development` carrega a preparação do contrato `schemaVersion: 2`. Esta preparação **não ativa** o contrato para consumidores: o endpoint atual da CLI continua sendo o `registry.json` v1 servido pelo GitHub Raw da branch `main`.

A integração ao workflow permanece uma ativação separada e pendente. Não há nesta etapa publicação em GitHub Pages, deploy de assinaturas, ativação de endpoint oficial da CLI, URL ou qualquer validação de rede. A migração para consumidores somente poderá ser coordenada após C01 e R07–R09 e C02; até então, `main` não pode ser promovida com base nesta preparação.

## Catálogo v2 em desenvolvimento

O arquivo [`registry.json`](./registry.json) na branch de desenvolvimento usa o contrato v2:

```json
{
  "schemaVersion": 2,
  "revision": 2,
  "publishedAt": "2026-08-08T13:32:04Z",
  "templates": [
    {
      "id": "api-nodejs-typescript",
      "name": "API Node.js + TypeScript",
      "description": "Fastify, PostgreSQL, Kysely, Vitest e Biome.",
      "repository": "jptecno/template-api-nodejs-typescript",
      "versions": [
        {
          "version": "v0.1.0",
          "ref": "v0.1.0",
          "commit": "40feae0d0ecd789b5fd3b7b8bc1ba09b6a33a340",
          "status": "deprecated",
          "statusReason": "Substituída pela v0.2.0, que atualiza a toolchain e incorpora endurecimentos de segurança."
        },
        {
          "version": "v0.2.0",
          "ref": "v0.2.0",
          "commit": "d437e631948a6e0c51cf544ddcb0943cb92aa389",
          "status": "active"
        }
      ]
    }
  ]
}
```

### Semântica dos campos

| Campo           | Semântica                                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion` | Versão do contrato do catálogo; esta preparação usa `2`.                                                                           |
| `revision`      | Revisão monotônica do documento v2. Uma correção publicada deve avançar a revisão, sem reutilizar uma revisão já publicada.        |
| `publishedAt`   | Instante RFC3339 em UTC que identifica quando aquela revisão foi publicada.                                                        |
| `id`            | Identificador estável em kebab-case, usado por `jp init --template`.                                                               |
| `repository`    | Repositório do template, restrito à organização `jptecno`.                                                                         |
| `version`       | Versão visível ao desenvolvedor, em tag SemVer estrita com prefixo `v`.                                                            |
| `ref`           | A mesma tag SemVer de `version`; branches não são aceitas.                                                                         |
| `commit`        | SHA Git de 40 caracteres minúsculos esperado para a versão. A validação local somente valida o formato e não consulta Git ou rede. |
| `status`        | Estado da versão: exatamente uma versão por template deve ser `active`; `deprecated` e `revoked` exigem `statusReason`.            |
| `statusReason`  | Justificativa não vazia para versão `deprecated` ou `revoked`. Não é permitida para `active`.                                      |
| `replacement`   | `id` de outro template existente que substitui uma versão; não pode apontar para o próprio template.                               |

O validador local também rejeita propriedades desconhecidas, IDs e versões duplicados, versões/ref divergentes e datas UTC semanticamente inválidas. Ele não executa conteúdo de templates, não resolve tags, não consulta DNS, Git ou APIs externas e não produz ou verifica assinaturas.

## Validar localmente

```sh
npm ci --ignore-scripts
npm run check
```

O comando de entrada é `node scripts/validate-registry.mjs`; ele valida o `registry.json` v2 localmente.

## Publicar um template após a ativação coordenada

1. Garanta que o template passa em sua validação local e CI.
2. Publique uma tag SemVer, por exemplo `v1.0.0`, e registre o SHA do commit correspondente.
3. Atualize a versão no catálogo, seu estado e a próxima `revision`.
4. Execute `npm run check`.
5. Abra um pull request para `development`.

A publicação/ativação para consumidores e a promoção para `main` permanecem bloqueadas até a conclusão coordenada de C01, R07, R08, R09 e C02.

## Schema

O schema canônico está em [`schemas/template-registry-v2.schema.json`](./schemas/template-registry-v2.schema.json). Esse arquivo v2 está congelado pela política do repositório, inclusive para alterações de formatação; uma mudança incompatível exige outro arquivo com versão distinta. Propriedades que exigem relações entre registros são validadas no código semântico.

## Proteção das branches

As branches `main` e `development` possuem rulesets ativos no GitHub. Cada uma exige pull request com uma aprovação e resolução de todas as conversas antes do merge. Os rulesets também bloqueiam exclusão da branch e force push. Não há checks obrigatórios configurados neste momento.
