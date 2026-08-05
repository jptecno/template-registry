# JP Tecno Template Registry

Catálogo público e versionado dos templates consumidos pelo `@jptecno/cli`.

## Catálogo

O arquivo [`registry.json`](./registry.json) é servido pelo GitHub Raw e contém os templates disponíveis. Cada entrada deve ter uma referência Git imutável, normalmente uma tag SemVer.

```json
{
  "schemaVersion": 1,
  "templates": [
    {
      "id": "api-nodejs-typescript",
      "repository": "jptecno/template-api-nodejs-typescript",
      "version": "v0.1.0",
      "ref": "v0.1.0"
    }
  ]
}
```

## Publicar um template

1. Garanta que o template passa em sua validação local e CI.
2. Publique uma tag imutável, por exemplo `v1.0.0`.
3. Adicione ou atualize a entrada em `registry.json`, apontando `version` e `ref` para a tag.
4. Abra um pull request com a alteração do catálogo.

Não use branches como `main` ou `develop` em `ref`: projetos novos devem ser reproduzíveis e sempre partir da mesma revisão.

## Schema

| Campo | Descrição |
| --- | --- |
| `schemaVersion` | Versão do contrato do catálogo. |
| `id` | Identificador estável, usado por `jp init --template`. |
| `name` | Nome apresentado no seletor interativo. |
| `description` | Descrição curta apresentada no seletor. |
| `repository` | Repositório GitHub no formato `organização/repositório`. |
| `version` | Versão visível para o desenvolvedor. |
| `ref` | Tag Git imutável baixada pelo CLI. |
