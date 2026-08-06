# Tarefas

- [x] **T1 — IDs únicos**: validar duplicidade e cobrir catálogo válido/duplicado. Gate: `node --test tests/validate-registry.test.mjs && node scripts/validate-registry.mjs`.
- [x] **T2 — Entradas remotas**: validar repo/tag/archive/manifesto/ID sem executar template. Gate: `node --test tests/*.test.mjs && node scripts/validate-registry.mjs`.
- [x] **T3 — Semgrep**: regras locais testadas e workflow bloqueante com reviewdog. Gate: testes Semgrep e validação de workflows disponível.
- [x] **T4 — Danger**: funções puras e testes das políticas solicitadas. Gate: `node --test tests/*.test.mjs` e validação de workflows.
- [ ] **T5 — PR-Agent**: revisão advisory restrita e segura. Gate: todos os testes, validadores, Semgrep e validação de workflows.

## Rastreabilidade

| Requisito | Tarefa |
| --------- | ------ |
| AR-01     | T1     |
| AR-02     | T2     |
| AR-03     | T3     |
| AR-04     | T4     |
| AR-05     | T5     |
