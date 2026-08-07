# Regras do Template Registry

## Contrato e arquitetura

O registry é dado público não confiável para consumidores. `registry.json` permanece no contrato v1 até uma migração coordenada; o contrato alvo é o schema versionado em `schemas/`. Schemas publicados são imutáveis: não os reescreva, não crie alias `latest` e introduza uma nova versão para mudanças incompatíveis.

Valide estrutura com Ajv e regras semânticas no código. O registry oficial aceita somente repositórios `jptecno/*`, tags SemVer imutáveis e, no v2, histórico com uma única versão `active`. Não execute conteúdo de templates no validador estrutural.

## Desenvolvimento e segurança

Use Node.js 24 e ESM. Não versione nem registre secrets. Trate JSON externo como não confiável, rejeite propriedades desconhecidas e não use dados do registry para formar comandos de shell. Mudanças em `registry.json`, `schemas/`, scripts de validação/publicação, hooks ou workflows exigem revisão explícita de segurança.

Execute `npm run check` antes de enviar alterações. O fluxo é branch curta → PR para `development` → homologação → PR de `development` para `main`. Não faça push direto nas branches permanentes.

## Fases futuras

Danger, Semgrep e workflows adicionais de proteção do harness serão implementados em fase posterior; não são gates deste worktree.
