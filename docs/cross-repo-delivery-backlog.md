# Backlog de entrega cross-repo

Este documento coordena entregas que atravessam `template-api-nodejs-typescript`, `template-registry` e `cli`.

Ele não substitui os backlogs técnicos de cada repositório. Cada item daqui deve apontar para tarefas, PRs e critérios de aceite locais antes de iniciar implementação.

## Regras de coordenação

1. O template é publicado por tag SemVer imutável a partir de `main`.
2. O registry referencia a tag e o SHA40 descascado, com uma única versão `active` por template.
3. O CLI só muda para o endpoint oficial Pages depois de validar assinatura, registry v2, anti-rollback e o fluxo completo de materialização.
4. Nenhum consumidor aceita fallback unsigned para o endpoint Raw legado.
5. Correções de catálogo, publicação e integridade usam roll-forward: a `revision` nunca diminui e tags não são movidas.
6. Cada mudança segue `development` primeiro; promoções e sincronizações de `main` de volta para `development` permanecem obrigatórias.

## Estado atual

| Componente | Estado confirmado | Evidência |
| --- | --- | --- |
| Template Node.js + TypeScript | `v0.3.2` publicada e ativa no catálogo | Tag `v0.3.2`, commit `e5ae4c81f2e95fd57e195bd96d4ac0558ee3eb37` |
| Registry v2 | Publicado, `revision: 3`, template `v0.3.2` ativa | `https://jptecno.github.io/template-registry/registry.json` |
| Assinatura | Ed25519 detached publicada e verificada | `registry.json.sig`, `keyId: registry-2026-08` |
| GitHub Pages | Publicação por workflow concluída | `Publish signed registry` run `31270315561` |
| CLI | Toolchain Node e componentes v2 existem em `development`, mas o fluxo real ainda consome registry v1 Raw sem assinatura | `cli` PRs #50–#54 |

## Entregas prioritárias

### P0 — Consumidor autenticado do registry no CLI

**Dono:** `cli`  
**Dependências satisfeitas:** Pages, envelope Ed25519, `keyId` `registry-2026-08` e chave pública oficial.

| ID | Entrega | Critério de saída |
| --- | --- | --- |
| C02.1 | Keyring público e transporte autenticado | Baixa bytes do registry e `.sig`, verifica Ed25519 antes de decodificar ou parsear e falha fechado para envelope/chave/assinatura inválidos. |
| C02.2 | Registry v2 no fluxo real | Valida schema, semântica, `revision`, owners oficiais, versões/status e seleciona `active` sem reutilizar o parser v1. |
| C02.3 | Download fixado por commit | Materializa archive pelo SHA40 autenticado, nunca pela tag. |
| C02.4 | Cache verificado e anti-rollback | Cacheia somente dados verificados; usa TTL de sete dias, consentimento stale e rejeita `revision` menor. |
| C02.5 | Smoke de ativação | CLI candidato valida Pages, seleciona `api-nodejs-typescript@v0.3.2` e materializa o commit declarado. |
| C02.6 | Corte oficial | Troca a URL padrão para Pages e remove o caminho Raw/v1 sem fallback unsigned. |

**Gate cross-repo:** assinatura válida contra o keyring distribuído, registry v2 válido, `revision: 3` aceita, template materializado pelo commit `e5ae4c81f2e95fd57e195bd96d4ac0558ee3eb37` e `npm pack --dry-run` aprovado.

### P1 — Integridade e operação contínua do registry

**Dono:** `template-registry`  
**Dependências:** publicação Pages ativa; C02.1 disponível para homologação do consumidor.

| ID | Entrega | Critério de saída |
| --- | --- | --- |
| R09.1 | Preflight remoto de publicação | Antes de assinar, verifica registry remoto, assinatura e progressão de `revision`. |
| R09.2 | Republicação idempotente | `workflow_dispatch` republica apenas bytes idênticos de uma revisão autorizada; não reserializa o catálogo. |
| R09.3 | Monitor de integridade remoto | Workflow manual/agendado compara Pages com `main`, valida assinatura/schema/semântica e confirma tag → commit das versões ativas. |
| R09.4 | Runbook atualizado | README e operação distinguem Pages publicado de endpoint do CLI ativado. |

**Gate cross-repo:** exercício documentado de republicação idempotente e roll-forward corretivo sem redução de `revision`.

### P2 — Automação de release template → registry

**Donos:** `template-api-nodejs-typescript` e `template-registry`  
**Dependências:** fluxo C02 homologado e GitHub App com permissões mínimas.

| ID | Entrega | Critério de saída |
| --- | --- | --- |
| T12.1 | Release automatizada do template | Release cria tag imutável e valida o commit/tag final. |
| T12.2 | PR idempotente no registry | GitHub App cria ou atualiza uma única PR em `development` com versão, SHA, status, `revision` e `publishedAt`. |
| T12.3 | Homologação automatizada | A PR do registry executa o gate isolado contra a tag nova antes de merge. |

**Gate cross-repo:** uma release de teste percorre template → PR no registry → Pages → CLI homologado sem edição manual do catálogo.

### P3 — Hardening do template gerado e do producer

**Dono:** `template-api-nodejs-typescript`  
**Dependências:** nenhuma para iniciar; não bloqueia C02.

- separar producer e projeto gerado;
- gerar projeto determinístico e testar vazamento de harness;
- adicionar skills e hooks contextuais por contexto;
- separar CI `structural` e `integration`;
- fixar imagem Docker por digest, smoke de usuário não-root e `/health`;
- adicionar Trivy e SBOM CycloneDX;
- configurar Release Please e integração de release.

## Manutenção independente

- PRs Dependabot do registry são avaliadas separadamente e não devem ser misturadas às entregas P0–P3.
- O upgrade de `actions/deploy-pages` deve ser priorizado porque a versão atual emite aviso de runtime Node 20, mas exige revisão de harness e a label `harness-change-approved`.
- Rulesets e environments precisam de revisão administrativa periódica: aprovação, conversas resolvidas, branch permitida, autoaprovação e bypass.

## Fora deste ciclo

Estes itens permanecem nos backlogs locais até terem caso de uso e decisão próprios:

- `archiveSha256` para bytes do archive;
- novos ecosystems além de Node;
- Sigstore ou log de transparência;
- keyring dinâmico;
- registry local público;
- paralelização de steps;
- geração de templates a partir de base compartilhada;
- logging estruturado, CORS, rate limiting e `trustProxy` no template.
