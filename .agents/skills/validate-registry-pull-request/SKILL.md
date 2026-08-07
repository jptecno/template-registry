# Validar pull request do registry

**Gatilho:** antes de abrir ou atualizar PR que altere catálogo, schemas, validação, toolchain ou hooks.

1. Inspecione o diff e confirme a versão de contrato afetada.
2. Execute `npm ci`, `npm run check` e `git diff --check`.
3. Verifique que fixtures cobrem o comportamento novo e que `registry.json` não foi migrado sem coordenação.
4. Preencha o template de PR com impacto, segurança e rollback.

**Evidências:** comandos e resultados, arquivos afetados e compatibilidade declarada.

**Interrompa:** se faltar lockfile, algum gate falhar, houver schema mutável/`latest`, ou a alteração precisar de publicação coordenada ainda não aprovada.
