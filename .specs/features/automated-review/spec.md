# Revisão automatizada do registry

## Objetivo

Proteger alterações do catálogo com validações pequenas, bloqueantes quando objetivas e consultivas quando heurísticas.

## Requisitos

- **AR-01**: o validador local rejeita dois templates com o mesmo `id`.
- **AR-02**: a CI confirma que cada repositório e tag existem, o archive responde, `template.json` existe na raiz da tag e seu `id` corresponde ao catálogo; não baixa dependências nem executa/builda templates.
- **AR-03**: Semgrep CE bloqueia `pull_request_target`, Actions sem SHA e execução perigosa em scripts; regras possuem fixtures e findings são publicados pelo reviewdog quando seguro.
- **AR-04**: Danger aplica políticas objetivas para título, descrição, promoção `development` → `main`, campos de promoção, artefatos e contexto de mudanças do registry; downgrade, troca de repositório e schema são apenas warnings.
- **AR-05**: PR-Agent é consultivo, limitado a `registry.json`, scripts, workflows e README, ignora drafts/forks, não executa código do PR e mantém métricas desligadas.

## Restrições

Sem `pull_request_target`, permissões mínimas, Actions fixadas por SHA, timeout e concurrency. Sem matriz da CLI, schema/pacote compartilhado ou execução/build dos templates.
