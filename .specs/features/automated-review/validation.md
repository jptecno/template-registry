# Validação independente final — revisão automatizada do registry

**Data**: 2026-08-06
**Spec**: `.specs/features/automated-review/spec.md`
**Diff range**: `origin/development..HEAD`
**HEAD**: `3ea5fc0` — `test(danger): comprova bloqueio e aviso do adaptador`
**Verifier**: independente (autor ≠ verificador)
**Veredito**: ✅ PASS

## Escopo e commits

T1–T5 estão concluídas. A branch está 6 commits à frente de `origin/development`; os commits são atômicos por etapa e usam Conventional Commits. Antes deste relatório, a implementação estava limpa e somente o `validation.md` anterior já aparecia modificado. Após a sobrescrita solicitada, somente este relatório deve permanecer modificado.

## Requisitos e evidências

| Requisito | Evidência independente                                                                                                                                                             | Resultado |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| AR-01     | `scripts/validate-registry.mjs` rejeita IDs duplicados; os testes afirmam catálogo válido e erro de duplicidade.                                                                   | ✅ PASS   |
| AR-02     | O validador verifica repo, tag, archive, `template.json` raiz e ID sem instalar/buildar/executar template; testes cobrem sucesso e cinco falhas; execução real validou 1 template. | ✅ PASS   |
| AR-03     | Regras Semgrep cobrem workflows e scripts perigosos; 3/3 fixtures; workflow publica SARIF via reviewdog quando seguro e reaplica o status bloqueante.                              | ✅ PASS   |
| AR-04     | Testes de políticas cobrem failures/warnings; `dangerfile.mjs` delega a `reportFindings`; `tests/report-findings.test.mjs:7-31` afirma `fail`, `warn` e chamadas negativas.        | ✅ PASS   |
| AR-05     | PR-Agent limita paths, ignora drafts/forks, não faz checkout, desliga telemetria e usa `continue-on-error`; instruções proíbem execução de código.                                 | ✅ PASS   |

**Spec-anchored check**: 5/5 requisitos atendidos, sem gap de precisão bloqueante.

## Gates reexecutados

- Testes Node: ✅ 17/17, 0 skipped.
- `node scripts/validate-registry.mjs`: ✅ `Registry válido: 1 template(s)`.
- `node scripts/validate-remote-templates.mjs`: ✅ `Templates remotos válidos: 1`.
- `SEMGREP_SEND_METRICS=off uvx --from semgrep==1.172.0 semgrep --test ...`: ✅ 3/3.
- Scan Semgrep local: ✅ 0 findings.
- `actionlint@v1.7.7`: ✅ sem diagnósticos.
- `git diff --check origin/development..HEAD`: ✅.

## Validação remota mínima

- O catálogo exige `owner/repo`, tag SemVer e igualdade `version/ref` antes da consulta remota.
- Para cada entrada, são feitas somente consultas de repo, ref de tag, endpoint do archive e `template.json` raw.
- Bodies de repo/tag/archive são cancelados; apenas o manifesto JSON é parseado.
- Não há checkout, extração, instalação, build ou execução de templates.
- A execução externa real, sem secret, confirmou 1 template acessível e consistente.

## Sensor de discriminação

Executado em `/tmp/zed-final-verifier-registry`, sem mutar o worktree real.

| Mutação                                                                                     | Teste                            | Resultado                                                               |
| ------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------- |
| `scripts/danger/report-findings.mjs`: `reporters.fail(message)` → `reporters.warn(message)` | `tests/report-findings.test.mjs` | ✅ KILLED: exit 1; 1/2 testes falhou porque `fail` não recebeu chamada. |

**Sensor**: 1/1 killed — ✅ PASS.

## Segurança operacional

- Semgrep/reviewdog preserva o bloqueio após a publicação e omite reviewdog em forks.
- Forks não executam Danger/PR-Agent nem recebem secrets.
- Danger diferencia failures e warnings com prova discriminante no adaptador.
- PR-Agent é advisory, restrito por paths e a PR interno não draft, sem checkout nem execução de código.

## Limitações não bloqueantes

- PR-Agent e Danger não foram executados contra um PR real: exigem contexto/API do GitHub e, para PR-Agent, `OPENAI_KEY`. A configuração e o comportamento de adaptação foram verificados estaticamente e por testes locais.
- O primeiro PR que introduz `pr-policy.yml` faz checkout da base, que ainda não contém o Dangerfile novo; é uma limitação de bootstrap, não dos PRs após o merge.
- O workflow Danger do registry baixa `danger@13.0.10` em runtime via npm; a versão é fixa, mas a disponibilidade do registry npm continua sendo dependência operacional.

## Resumo

**Overall**: ✅ Ready

IDs únicos, validação remota mínima, Semgrep/reviewdog bloqueante, Danger fail/warn, segurança de forks e PR-Agent advisory estão comprovados. O mutante `fail→warn` anteriormente sobrevivente agora é morto pelo teste do adaptador.
