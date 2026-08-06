# Contrato futuro: commit e archiveSha256

Este documento define a evolução planejada de cada item em `registry.json`. Ele é uma especificação para a futura migração coordenada com o `@jptecno/cli`; não altera o schema atual nem torna campos novos obrigatórios.

## Objetivo

Hoje, `ref` aponta para uma tag SemVer. Uma tag Git pode ser movida, portanto ela não é uma prova criptográfica do conteúdo baixado. O contrato futuro associa a versão a:

- `commit`: a revisão Git exata resolvida pela tag;
- `archiveSha256`: o hash SHA-256 do archive de template que o CLI baixa e extrai.

O CLI poderá verificar tanto a revisão esperada quanto a integridade dos bytes do archive antes de usar o template.

## Formato planejado

Após a migração, uma entrada poderá conter os campos adicionais abaixo:

```json
{
  "id": "api-nodejs-typescript",
  "name": "API Node.js + TypeScript",
  "description": "Fastify, PostgreSQL, Kysely, Vitest e Biome.",
  "repository": "jptecno/template-api-nodejs-typescript",
  "version": "v1.2.3",
  "ref": "v1.2.3",
  "commit": "0123456789abcdef0123456789abcdef01234567",
  "archiveSha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
}
```

Os valores de hash acima são somente exemplos de formato e não identificam um template real.

| Campo | Formato planejado | Semântica |
| --- | --- | --- |
| `commit` | 40 caracteres hexadecimais minúsculos | SHA-1 do commit Git ao qual `ref` deve resolver. |
| `archiveSha256` | 64 caracteres hexadecimais minúsculos | SHA-256 dos bytes exatos do archive baixado pelo CLI. |

## Regras da futura validação

Quando a CLI e o registry adotarem a próxima versão do contrato, o validador deverá exigir, para cada template:

1. `commit` e `archiveSha256` presentes e com os formatos definidos acima;
2. `ref` ainda igual a `version` e em SemVer estrito com prefixo `v`;
3. que a tag `ref` resolva para `commit`, durante a publicação ou em uma verificação que tenha acesso ao repositório remoto;
4. que o archive obtido pelo mesmo endpoint e parâmetros usados pela CLI produza `archiveSha256`.

A validação local atual não consulta a rede e, por isso, não verifica a resolução da tag nem o conteúdo do archive.

## Responsabilidades da futura CLI

Na migração, a CLI deve baixar o archive definido pelo contrato, calcular SHA-256 sobre os bytes recebidos e interromper a criação do projeto se o resultado for diferente de `archiveSha256`. Quando a fonte permitir consultar a revisão resolvida, a CLI também deve confirmar que ela é igual a `commit`.

A fonte do archive, o método de obtenção e a normalização dos bytes devem ser definidos uma única vez na implementação da CLI. Alterar endpoint, formato de archive ou parâmetros pode alterar o hash e exige a republicação do valor correspondente no registry.

## Estratégia de migração

1. Manter os campos opcionais enquanto versões compatíveis da CLI ainda consomem o contrato atual.
2. Publicar versões de templates com `commit` e `archiveSha256` calculados pela fonte de archive adotada.
3. Lançar a CLI capaz de aceitar ambos os formatos, preferindo a verificação quando os dois campos estiverem presentes.
4. Somente após encerrar o suporte ao formato atual, elevar a versão do schema e tornar os campos obrigatórios no validador e na CLI.

Até essa mudança, `commit` e `archiveSha256` não devem ser adicionados como requisitos de `schemaVersion: 1`.
