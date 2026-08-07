# Backlog futuro do Template Registry

Este backlog contém somente evoluções futuras, fora do hardening aprovado e descrito em [`docs/hardening-plan.md`](docs/hardening-plan.md). Nenhum item abaixo deve ser incluído incidentalmente nos PRs do plano atual; cada um exige especificação, análise de segurança e decisão própria.

## 1. Repositório central de harness

**Objetivo futuro:** extrair regras, skills, workflows e verificadores reutilizáveis para um repositório central, com mecanismo explícito de versionamento e atualização nos repositórios consumidores.

**Condições para avaliar:**

- o harness local já deve estar estável e ter uso comprovado em mais de um repositório;
- atualizações devem ser fixadas por versão ou SHA, sem execução implícita de conteúdo remoto mutável;
- divergências locais justificadas precisam continuar possíveis e auditáveis.

## 2. Múltiplas versões ativas e `defaultVersion`

**Objetivo futuro:** permitir mais de uma versão `active` por template e introduzir `defaultVersion` para seleção determinística pelo CLI.

**Questões a especificar:**

- compatibilidade com CLIs antigos;
- regras para canais estável, pré-release e manutenção;
- unicidade e validade de `defaultVersion`;
- interação com versões `deprecated` e `revoked`.

## 3. Transparency log

**Objetivo futuro:** manter um log append-only verificável de todas as revisões e assinaturas publicadas.

**Questões a especificar:**

- formato e prova de inclusão;
- operador e disponibilidade do log;
- checkpoint confiável no CLI;
- recuperação diante de split view ou perda do serviço.

## 4. Sigstore

**Objetivo futuro:** avaliar assinatura keyless e transparência via Sigstore como complemento ou sucessor controlado do modelo Ed25519.

**Questões a especificar:**

- identidade OIDC autorizada;
- dependência de Fulcio/Rekor e comportamento offline;
- política de verificação no CLI;
- migração e coexistência com clientes que confiam no keyring Ed25519.

## 5. Arquivo separado de revogações

**Objetivo futuro:** publicar revogações em artefato independente do catálogo principal, com atualização e consumo próprios.

**Questões a especificar:**

- assinatura e anti-rollback independentes;
- precedência entre registry e arquivo de revogações;
- disponibilidade em falhas parciais;
- latência máxima para o CLI aplicar uma revogação.

## 6. Aliases de schemas

**Objetivo futuro:** avaliar aliases convenientes para versões de schema depois que houver necessidade operacional comprovada.

**Questões a especificar:**

- aliases imutáveis versus móveis;
- proteção contra mudança silenciosa de contrato;
- cache e pinning por consumidores;
- relação com os nomes canônicos versionados.

## 7. Registries federados

**Objetivo futuro:** permitir descoberta e composição de múltiplos registries administrados por entidades distintas.

**Questões a especificar:**

- raiz de confiança por registry;
- colisão de IDs e namespaces;
- ordenação, prioridade e disponibilidade;
- anti-rollback independente;
- limites de rede e prevenção de SSRF no CLI.

## 8. Políticas avançadas para owners externos

**Objetivo futuro:** admitir templates oficiais ou parceiros fora de `jptecno/*` mediante política explícita.

**Questões a especificar:**

- onboarding, prova de controle e revisão do owner;
- allowlist, níveis de confiança e expiração;
- resposta a transferência ou comprometimento de repositório;
- isolamento adicional na integração;
- responsabilidades de suporte, segurança e revogação.
