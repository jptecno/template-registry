## Resumo

<!-- Explique objetivamente a alteração e o comportamento alterado. -->

## Contrato, risco e segurança

- [ ] Avaliei compatibilidade do registry/CLI/template, quando aplicável.
- [ ] Não introduzi secrets nem execução de conteúdo de template no gate estrutural.
- [ ] Alterações em registry, schemas, assinatura, paths de harness ou workflows receberam revisão de segurança.

## Validação

- [ ] `npm ci`
- [ ] `npm run check`
- [ ] `git diff --check`

## Publicação e rollback

- Publicação ou migração necessária:
- Impacto de produção:
- Plano de rollback (roll-forward com nova revisão, se aplicável):
