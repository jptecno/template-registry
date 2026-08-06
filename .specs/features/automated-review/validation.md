# Revisão automatizada do registry — validação

**Data**: 2026-08-06
**Spec**: `.specs/features/automated-review/spec.md`
**Diff verificado**: `dc977b0..de62377`
**Verificador**: revisão fresh-eyes local, sem subagente por restrição explícita

## Resultado por requisito

| Requisito                 | Resultado | Evidência                                                                                                                                                                                                                 |
| ------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AR-01 — IDs únicos        | ✅        | `tests/validate-registry.test.mjs:31` — `assert.throws(...)` exige o erro exato de ID duplicado.                                                                                                                          |
| AR-02 — validação remota  | ✅        | `tests/validate-remote-templates.test.mjs:33` valida as quatro URLs; `:44`, `:53`, `:62`, `:71` exigem erros de repo/tag/archive/manifesto; `:83` exige erro para ID divergente. A execução real validou a entrada atual. |
| AR-03 — Semgrep/reviewdog | ✅        | `.semgrep/rules/dangerous-workflow.test.yaml:3` e `:11` cobrem evento/Action; `.semgrep/rules/unsafe-child-process.test.js:5` cobre comando dinâmico. `semgrep --test`: 3/3; scan real: zero findings.                    |
| AR-04 — Danger            | ✅        | `tests/pr-policies.test.mjs:43`, `:56`, `:63`, `:82`, `:94`, `:111` e `:131` verificam resultados exatos para políticas e warnings.                                                                                       |
| AR-05 — PR-Agent          | ✅        | `.github/workflows/ai-review.yml:6` limita paths, `:20` ignora drafts/forks, `:26` mantém advisory e não há checkout/run; `.pr_agent.toml:13` limita foco e proíbe execução; telemetria desligada em `ai-review.yml:31`.  |

## Gates

- `node --test tests/*.test.mjs`: **15 passaram, 0 falharam, 0 ignorados**.
- `node scripts/validate-registry.mjs`: **1 template válido**.
- `node scripts/validate-remote-templates.mjs`: **1 template remoto válido**.
- `semgrep --test .semgrep/rules`: **3/3 regras testadas**.
- Semgrep em `.github/workflows` e `scripts`: **0 findings bloqueantes**.
- `actionlint` 1.7.7 em todos os workflows: **0 diagnósticos**.
- TOML do PR-Agent, sintaxe Node e `git diff --check`: **válidos**.

## Sensor de discriminação

| Mutação em cópia descartável              | Resultado                                       |
| ----------------------------------------- | ----------------------------------------------- |
| Remove rejeição de ID duplicado           | ✅ Morta pelo teste de duplicidade.             |
| Inverte comparação do ID remoto           | ✅ Morta pelos testes de sucesso e divergência. |
| Inverte regra de origem de PR para `main` | ✅ Morta pelos testes de origem e promoção.     |

**Resultado**: 3/3 mutações mortas.

## Qualidade e limitações

- Mudanças restritas ao registry, scripts e automações solicitadas; sem pacote/schema compartilhado, matriz da CLI ou execução de templates.
- Actions fixadas por SHA; sem `pull_request_target`; workflows têm permissões mínimas, timeout e concurrency.
- A validação remota depende da disponibilidade e dos limites da API pública do GitHub; `GITHUB_TOKEN` reduz risco de rate limit na CI.
- PR-Agent depende do secret `OPENAI_KEY`, é advisory e não roda em forks/drafts.
- Danger é obtido do npm em versão exata durante o job; não há lockfile porque o repositório não é um pacote Node.

## Veredito

**PASS** — 5/5 requisitos cobertos, sem lacunas de precisão e com gates/sensor aprovados.
