# Plano de hardening do Template Registry

## 1. Objetivo e estado das decisões

Este documento transforma as decisões já aprovadas em uma sequência executável de pull requests pequenos, revisáveis e ordenados. Ele cobre o repositório `jptecno/template-registry` e explicita as dependências necessárias em `jptecno/cli` e `jptecno/template-api-nodejs-typescript`.

As decisões descritas aqui são requisitos, não propostas. Mudanças de contrato devem ser registradas em uma decisão nova antes da implementação.

### Resultado esperado

Ao final do plano:

- `registry.json` usa o contrato canônico `schemaVersion: 2`;
- o manifesto de template usa o contrato canônico redefinido `schemaVersion: 1`;
- schemas canônicos são publicados pelo GitHub Pages e cópias vendorizadas no CLI e no template são verificadas byte a byte;
- o catálogo publicado é assinado com Ed25519 sobre os bytes exatos de `registry.json`;
- o CLI aceita o registry oficial somente quando houver ao menos uma assinatura válida de uma chave confiável e impede downgrade de `revision`;
- validação estrutural e integração de template são gates separados;
- publicação e deploy são jobs separados, com permissões mínimas e aprovação manual do environment `registry-signing`;
- alterações normais entram por `development`, são homologadas e depois promovidas para `main`;
- releases do template abrem PR normal no registry por uma GitHub App dedicada, sem permissão de merge ou administração;
- o repositório possui harness local determinístico, regras de contribuição e revisão de segurança.

## 2. Escopo e restrições

### Dentro do escopo

- preservação e transporte do diff local já existente;
- governança do repositório e fluxo `development` → `main`;
- toolchain Node.js 24, Ajv, Biome e Lefthook;
- contratos JSON Schema canônicos;
- migração do catálogo para v2;
- validação local, estrutural, semântica e de integração;
- assinatura, publicação no GitHub Pages, verificação remota e rollback seguro;
- automação cross-repo para releases do template;
- documentação do contrato oficial consumido pelo CLI.

### Fora do escopo

- implementar política de registries customizados neste repositório;
- aceitar owners externos no registry oficial;
- qualquer item listado em [`BACKLOG.md`](../BACKLOG.md).

A política de registry customizado pertence ao CLI. Este repositório documentará somente o contrato e a política de confiança do registry oficial.

## 3. Princípios invariáveis

1. Nenhum código obtido de um template é executado no job estrutural.
2. O job que executa conteúdo de template não recebe secrets, não possui permissão de escrita e faz checkout pelo SHA de commit declarado.
3. A chave privada de assinatura nunca é versionada, incluída em artifact, cache, log ou disponibilizada a workflows de pull request.
4. Os bytes de `registry.json` assinados são exatamente os bytes publicados.
5. `revision` nunca diminui e uma atualização normal deve incrementá-lo em exatamente `1`.
6. `publishedAt` é alterado no próprio PR; a publicação não reescreve o JSON.
7. Um rollback de conteúdo é um novo PR de roll-forward, com nova `revision`; uma republicação operacional reutiliza bytes idênticos.
8. Tags e schemas publicados são imutáveis.
9. Todas as GitHub Actions usam commit SHA completo, nunca tag flutuante.
10. Somente repositórios `jptecno/*` podem ser declarados no registry oficial.

## 4. Contratos-alvo

### 4.1 Registry v2

O schema canônico será `schemas/template-registry-v2.schema.json`. Não haverá alias `latest`.

O documento raiz terá, sem propriedades extras:

- `schemaVersion`: inteiro constante `2`;
- `revision`: inteiro positivo e monotônico;
- `publishedAt`: timestamp UTC em RFC 3339, versionado no JSON;
- `templates`: array não vazio de templates.

Cada template terá, sem propriedades extras:

- `id`: identificador único em `kebab-case`;
- `name`: nome não vazio;
- `description`: descrição não vazia;
- `repository`: repositório oficial no formato `jptecno/<repo>`;
- `versions`: histórico não vazio de versões.

Cada item de `versions` terá, sem propriedades extras:

- `version`: tag SemVer estrita com prefixo `v`;
- `ref`: igual a `version`;
- `commit`: SHA Git completo de 40 caracteres hexadecimais;
- `status`: `active`, `deprecated` ou `revoked`;
- `statusReason`: obrigatório e não vazio para `deprecated` e `revoked`; proibido para `active`;
- `replacement`: opcional, contendo o `id` de outro template existente no mesmo documento.

Regras semânticas adicionais, verificadas além do JSON Schema:

- `id` é único em todo o registry;
- o par lógico de versão é único: não pode haver `version` duplicada no mesmo template;
- `version === ref`;
- existe exatamente uma versão `active` por template;
- versões anteriores permanecem no histórico como `deprecated` ou `revoked`;
- todo `replacement`, quando presente, referencia um `id` existente e não o próprio template;
- toda tag `ref` resolve exatamente para o `commit` declarado, considerando a resolução final de tags anotadas;
- o owner extraído de `repository` é exatamente `jptecno`.

Exemplo ilustrativo do formato-alvo:

```json
{
  "schemaVersion": 2,
  "revision": 1,
  "publishedAt": "2026-08-07T12:00:00Z",
  "templates": [
    {
      "id": "api-nodejs-typescript",
      "name": "API Node.js + TypeScript",
      "description": "Fastify, PostgreSQL, Kysely, Vitest e Biome.",
      "repository": "jptecno/template-api-nodejs-typescript",
      "versions": [
        {
          "version": "v0.1.0",
          "ref": "v0.1.0",
          "commit": "0123456789abcdef0123456789abcdef01234567",
          "status": "active"
        }
      ]
    }
  ]
}
```

O SHA do exemplo é apenas ilustrativo e não pode ser copiado para o catálogo real.

### 4.2 Manifesto de template v1

O schema canônico redefinido será `schemas/template-manifest-v1.schema.json`. Não haverá alias `latest` nem compatibilidade com o `postCreate` experimental anterior.

Ele formaliza:

- `schemaVersion: 1`;
- `id`, `name`, `description` e `repository` válidos;
- `variables` com nomes únicos, `prompt`, `required`, `pattern` válido quando informado e `default` string quando informado;
- `render.include` como lista não duplicada de caminhos relativos seguros;
- `toolchain.ecosystem` em `node`, `go`, `flutter`, `rust`, `ruby` ou `python`;
- `toolchain.requirements` não vazio, com ferramentas permitidas pelo ecossistema e somente `minimumVersion`;
- `toolchain.steps` como objeto não vazio, com as propriedades opcionais e fixas `install`, `formatCheck`, `lint`, `typecheck`, `test` e `build`;
- cada etapa contém exatamente `command`, `args`, `dependsOn` e `recommended`, todos obrigatórios; não há campos `id` nem `type`;
- `dependsOn` é uma lista sem duplicatas que referencia apenas os nomes fixos de etapa;
- comandos e argumentos estruturados e literais, sem placeholders ou string de shell;
- executáveis limitados por ecossistema; combinações de subcomandos e flags são verificadas semanticamente pelo CLI;
- ausência de propriedades extras em todos os níveis.

Validações semânticas complementares rejeitam ferramentas duplicadas, dependências ausentes/duplicadas, autorreferência, ciclos no DAG e combinações de comando fora da allowlist fechada.

A redefinição deve ser entregue de forma coordenada: schema canônico, parser do CLI, cópias vendorizadas e `template.json` devem concordar antes da primeira publicação estável do schema.

### 4.3 Envelope de assinatura detached v1

O arquivo publicado ao lado de `registry.json` será `registry.json.sig`, com JSON determinístico no formato:

```json
{
  "schemaVersion": 1,
  "signatures": [
    {
      "keyId": "<identificador-estável-da-chave-pública>",
      "algorithm": "Ed25519",
      "signature": "<assinatura-base64>"
    }
  ]
}
```

Regras:

- o envelope é detached: não contém nem reserializa o registry;
- `signatures` aceita múltiplas assinaturas para rotação de chaves;
- cada par `keyId` + `algorithm` é único;
- `algorithm` é exatamente `Ed25519`;
- `signature` usa Base64 canônico;
- o CLI exige ao menos uma assinatura criptograficamente válida cujo `keyId` exista em seu keyring público;
- assinaturas desconhecidas, duplicadas, malformadas ou inválidas não contam para o mínimo de confiança;
- a verificação usa `node:crypto` sobre o `Buffer` exato baixado para `registry.json`, antes do parse ou de qualquer normalização.

## 5. Fluxo de branches e preservação do diff local

Esta preparação é operacional e antecede os PRs. Ela não deve alterar nem descartar o checkout local atual.

1. Congelar o checkout atual: não formatar, não executar autofix e não trocar de branch sobre arquivos modificados.
2. Inventariar arquivos rastreados e não rastreados do diff local.
3. Gerar uma cópia de segurança fora do worktree de destino, incluindo patch binário e cópia explícita dos arquivos não rastreados.
4. Registrar hashes dos arquivos do diff para permitir comparação depois do transporte.
5. Criar `development` a partir do estado remoto aprovado de `main` e publicá-la antes de configurar proteções.
6. Criar uma branch curta a partir de `development` em worktree separado.
7. Aplicar o patch e copiar os arquivos não rastreados somente nesse worktree.
8. Comparar lista de arquivos, diff e hashes com o inventário original.
9. Manter o checkout original intacto até o merge do primeiro PR.

O diff já aprovado a preservar contém:

- validator melhorado;
- testes do validator;
- Actions fixadas por SHA;
- configuração do Dependabot;
- ajustes no README.

Esse conteúdo entra no PR R01 sem ser misturado à migração de schema, ao toolchain ou ao harness.

## 6. Sequência de implementação

### R01 — Preservar o hardening local existente

**Objetivo:** transportar o diff local para uma branch curta baseada em `development`, preservando seu conteúdo e histórico de revisão.

**Arquivos previstos:**

- `scripts/validate-registry.mjs`;
- `scripts/validate-registry.test.mjs`;
- `.github/workflows/validate.yml`;
- `.github/dependabot.yml`;
- `README.md`.

**Critérios de aceite:**

- [ ] O diff no novo worktree corresponde ao inventário do checkout original.
- [ ] Nenhum arquivo local foi perdido ou sobrescrito.
- [ ] O validator permanece determinístico e sem acesso à rede.
- [ ] Os testes cobrem entradas válidas e inválidas relevantes ao contrato vigente neste PR.
- [ ] Todas as Actions estão fixadas por SHA completo.
- [ ] Dependabot cobre `github-actions` com target `development`; o ecossistema npm será adicionado em R02, junto do primeiro `package.json` e lockfile.
- [ ] O README descreve fielmente o estado entregue por R01, sem antecipar como disponível o registry v2.

**Gate:** testes atuais do validator e workflow `validate` verdes.

**Dependências:** criação administrativa de `development` e do worktree; nenhuma dependência cross-repo.

---

### R02 — Adotar toolchain Node.js 24 e checks locais

**Objetivo:** tornar instalação, lint, validação e hooks reproduzíveis.

**Arquivos previstos:**

- `package.json`;
- `package-lock.json`;
- `biome.json`;
- `lefthook.yml`;
- scripts focados necessários aos hooks, em `scripts/`;
- ajustes mínimos em `.github/workflows/validate.yml` e `.github/dependabot.yml`.

**Conteúdo obrigatório:**

- Node.js 24 declarado em `engines` e usado na CI;
- Ajv como dependência de desenvolvimento;
- Biome e Lefthook como dependências de desenvolvimento;
- `prepare` instalando Lefthook automaticamente;
- scripts específicos para testes, validação do registry, lint/formatação e `check` agregado;
- pre-commit contextual, executando apenas verificações aplicáveis aos arquivos staged;
- pre-push executando o `check` completo.

**Critérios de aceite:**

- [ ] `npm ci` funciona em Node.js 24 usando somente o lockfile versionado.
- [ ] `npm run check` reúne, no mínimo, testes, validator, lint e verificação de formatação.
- [ ] `npm run prepare` instala os hooks sem passo manual adicional.
- [ ] O pre-commit não altera arquivos e não executa a suíte completa quando o contexto não exige.
- [ ] O pre-push falha quando qualquer etapa de `npm run check` falha.
- [ ] CI usa `npm ci`, não `npm install`.
- [ ] Dependabot npm reconhece o novo lockfile e tem target `development`.

**Gate:** `npm ci && npm run check` em Node.js 24.

**Dependências:** R01.

---

### R03 — Criar governança e instruções do repositório

**Objetivo:** criar a fonte canônica de regras e os artefatos de revisão humana.

**Arquivos previstos:**

- `AGENTS.md`;
- `CLAUDE.md`;
- `.github/copilot-instructions.md`;
- `.github/CODEOWNERS`;
- `.github/pull_request_template.md`;
- `.agents/skills/validate-registry-pull-request/SKILL.md`;
- `.agents/skills/review-registry-security/SKILL.md`;
- `.agents/skills/publish-registry-entry/SKILL.md`.

**Conteúdo obrigatório:**

- arquitetura e contrato do registry;
- fluxo obrigatório `development` → `main`;
- regras de schemas imutáveis e ausência de alias `latest`;
- política de owner oficial `jptecno/*`;
- revisão obrigatória para paths de harness, schemas, registry, assinatura e workflows;
- checklist do PR com mudança de comportamento, risco, segurança, validação, publicação e rollback;
- skills locais determinísticas, sem depender de instruções remotas mutáveis.

**Critérios de aceite:**

- [ ] `AGENTS.md` é a fonte canônica e os arquivos Claude/Copilot apontam para ele sem duplicar regras conflitantes.
- [ ] CODEOWNERS cobre `registry.json`, `schemas/`, `.github/`, `.agents/`, scripts de validação/publicação e arquivos de toolchain/hook.
- [ ] O template de PR exige evidências dos gates aplicáveis.
- [ ] As três skills têm gatilhos, passos, evidências e critérios de interrupção claros.
- [ ] A skill de publicação nunca instrui acesso direto ou exposição da chave privada.

**Gate:** `npm run check` e revisão de CODEOWNERS.

**Dependências:** R02.

---

### R04 — Completar o harness automatizado

**Objetivo:** adicionar análise estática, revisão automática de tamanho e proteção contra alterações silenciosas do próprio harness.

**Arquivos previstos:**

- configuração Semgrep;
- workflow Semgrep + reviewdog;
- configuração/script de Danger simplificado;
- workflow ou script do gate `harness-change-approved`;
- ajustes de `package.json`, `package-lock.json`, `lefthook.yml` e template de PR quando necessários.

**Regras do Danger:**

- PR com mais de 10 arquivos alterados **ou** mais de 300 linhas somadas exige, no corpo do PR:
  - motivo para o tamanho;
  - estratégia de revisão;
  - natureza da mudança;
- ausência de qualquer um desses campos falha o gate;
- o limite orienta decomposição, mas não bloqueia um PR inevitável quando a justificativa está completa.

**Proteção do harness:**

O gate `harness-change-approved` é obrigatório quando forem alterados `AGENTS.md`, instruções de agentes, `.agents/`, CODEOWNERS, template de PR, workflows, Semgrep, Danger, hooks, scripts de gate ou toolchain. A aprovação usa inicialmente a label manual `harness-change-approved`, aplicada conscientemente pelo mantenedor. CODEOWNERS documenta responsabilidade; revisão obrigatória por CODEOWNER distinto do autor será ativada somente quando houver um segundo mantenedor ou equipe.

**Critérios de aceite:**

- [ ] Semgrep analisa somente conteúdo do repositório e publica achados via reviewdog.
- [ ] Actions de Semgrep/reviewdog/Danger estão fixadas por SHA.
- [ ] Workflows de PR não recebem secrets e possuem permissões mínimas.
- [ ] Danger aplica exatamente os limites `> 10 arquivos` ou `> 300 linhas`.
- [ ] `harness-change-approved` é condicional: obrigatório para paths do harness e neutro nos demais PRs.
- [ ] Hooks locais e CI chamam scripts compartilhados sempre que isso evitar divergência de regra.

**Gate:** `npm run check`, Semgrep, Danger e `harness-change-approved` quando aplicável.

**Dependências:** R03.

---

### R05 — Definir os schemas canônicos antes da primeira publicação

**Objetivo:** consolidar os contratos finais enquanto ainda podem ser revisados.

**Arquivos previstos:**

- `schemas/template-registry-v2.schema.json`;
- `schemas/template-manifest-v1.schema.json`;
- fixtures e testes em `scripts/` ou diretório de testes adotado;
- `README.md` e documentação de contratos.

**Critérios de aceite:**

- [ ] Ambos os schemas usam JSON Schema em draft explicitamente declarado e suportado pelo Ajv adotado.
- [ ] `additionalProperties: false` é aplicado em todos os objetos do contrato.
- [ ] Fixtures positivas e negativas cobrem campos obrigatórios, enums, SemVer, SHA40, caminhos e propriedades extras.
- [ ] Regras que JSON Schema não expressa com clareza estão identificadas como validações semânticas.
- [ ] Não existe arquivo ou URL `latest`.
- [ ] Os bytes finais foram revisados em conjunto com responsáveis do CLI e do template.
- [ ] A documentação marca os schemas como mutáveis apenas até a primeira publicação no Pages.

**Gate:** validação Ajv de todas as fixtures, `npm run check` e aprovação dos CODEOWNERS dos três repositórios.

**Dependências:** R04.

**Dependências cross-repo liberadas:** C01 e T01 podem começar após o merge de R05, mas a primeira publicação aguarda sua conclusão.

---

### C01 — CLI: vendorizar schemas e consumir os contratos canônicos

**Repositório:** `jptecno/cli`.

**Objetivo:** preparar o consumidor antes do corte do registry oficial para v2.

**Mudanças esperadas:**

- cópias vendorizadas, com os mesmos nomes canônicos, dos schemas de registry v2 e manifesto v1;
- verificador determinístico que compara bytes ou SHA-256 das cópias com a origem canônica fixada;
- tipos/parsers do registry v2 e manifesto v1 alinhados aos schemas;
- seleção da única versão `active` por template;
- testes para status, histórico, `replacement`, propriedades extras e revisão inválida.

**Critérios de aceite:**

- [ ] A verificação falha diante de qualquer diferença nas cópias vendorizadas.
- [ ] O CLI rejeita registry v1 no endpoint oficial após o corte planejado, com erro acionável.
- [ ] O parser não ignora propriedades desconhecidas.
- [ ] O parser exige exatamente uma versão `active`.
- [ ] Testes não dependem do Pages ao vivo.

**Gate:** check completo do CLI.

**Dependências:** R05.

---

### T01 — Template: vendorizar e validar o manifesto v1

**Repositório:** `jptecno/template-api-nodejs-typescript`.

**Objetivo:** provar que `template.json` adere ao manifesto canônico antes da publicação.

**Mudanças esperadas:**

- cópia vendorizada de `schemas/template-manifest-v1.schema.json`;
- verificação determinística de identidade com o schema canônico;
- validação de `template.json` no `npm run check`;
- ajustes do manifesto estritamente necessários para aderir ao contrato redefinido.

**Critérios de aceite:**

- [ ] `template.json` valida sem coerção ou remoção automática de propriedades.
- [ ] Cópia vendorizada divergir do canônico falha o check.
- [ ] Caminhos de renderização são relativos, únicos e materializáveis.
- [ ] A seção `toolchain` contém apenas ecossistema, requisitos, steps, executáveis e argumentos permitidos; `postCreate` é rejeitado.

**Gate:** `npm run check` do template.

**Dependências:** R05.

---

### R06 — Migrar `registry.json` e o validator local para v2

**Objetivo:** adotar o novo formato e suas invariantes sem introduzir acesso à rede no validator local.

**Arquivos previstos:**

- `registry.json`;
- `scripts/validate-registry.mjs`;
- `scripts/validate-registry.test.mjs` e fixtures;
- `README.md`.

**Critérios de aceite:**

- [ ] O catálogo usa `schemaVersion: 2`, `revision` inicial aprovada e `publishedAt` versionado.
- [ ] A versão atual é preservada em `versions[]` com SHA real de 40 caracteres.
- [ ] O validator aplica o schema canônico com Ajv e todas as regras semânticas locais.
- [ ] Há exatamente uma versão `active` por template.
- [ ] IDs e versões são únicos; `version === ref`.
- [ ] `statusReason` e `replacement` obedecem às regras da seção 4.1.
- [ ] Somente `jptecno/*` é aceito.
- [ ] O validator local não consulta GitHub, DNS, Git ou qualquer serviço externo.
- [ ] Testes de regressão cobrem cada invariante.

**Gate:** `npm run check`.

**Dependências:** R05; C01 deve estar pronto para homologação antes do corte do endpoint oficial.

---

### R07 — Separar validação estrutural e integração isolada

**Objetivo:** estabelecer os dois gates obrigatórios para mudanças publicáveis.

**Arquivos previstos:**

- `.github/workflows/validate.yml`;
- scripts determinísticos de validação estrutural;
- scripts de resolução de tag/commit e integração;
- fixtures e documentação de troubleshooting.

#### Job 1: estrutural, bloqueante

- executa apenas tooling confiável do próprio registry;
- não faz checkout nem executa código dos templates;
- valida JSON Schema e regras semânticas;
- compara o PR com a base para exigir `revision = revisão anterior + 1` quando `registry.json` muda;
- exige mudança coerente de `publishedAt` quando houver nova revisão;
- detecta alteração indevida de schema publicado;
- não possui secrets e usa apenas `contents: read`.

#### R07b.1 — Fundação local do harness de integração

A fundação e o engine local confiável do harness estão implementados: selecionam deterministicamente apenas versões `active` cuja identidade lógica (`id`, `repository`, `ref`, `commit`) mudou em relação à base, validam a resolução de tag/commit por `git ls-remote` sem shell, fazem checkout exclusivamente pelo SHA declarado, preflight de `template.json`, cópia segura, renderização do profile fixo e os gates npm/Docker com seams injetáveis. O engine permanece local e não está ligado a workflow/CI.

A ativação em workflow/CI continua desabilitada e R07 permanece incompleto até que os dois jobs bloqueantes sejam ativados. O `registry.json` atual v0.1 continua legado e não pode ativar o fluxo de integração, assinatura ou Pages.

#### Job 2: integração isolada

Para cada versão `active` alterada:

1. resolve `refs/tags/<ref>` e confirma que a tag, inclusive anotada, termina no SHA40 declarado;
2. faz checkout do repositório público pelo `commit`, nunca pela tag ou branch;
3. desabilita persistência de credenciais e submódulos não autorizados;
4. valida `template.json` pelo schema canônico;
5. materializa e renderiza o template em diretório temporário;
6. executa `npm ci` e `npm run check` no projeto materializado;
7. executa build Docker e smoke test quando o template declarar/suportar esses gates;
8. destrói workspace, containers e dados temporários ao final.

**Isolamento obrigatório:**

- runner efêmero hospedado pelo GitHub;
- nenhum secret, token adicional, environment protegido, cache gravável compartilhado ou permissão de escrita;
- `GITHUB_TOKEN` com somente `contents: read`, se necessário;
- timeouts por etapa e no job;
- sem modo privilegiado, montagem do host ou reutilização de containers;
- logs sem conteúdo sensível e com origem/revisão/commit claramente identificados.

**Critérios de aceite:**

- [ ] Os checks aparecem como dois jobs distintos e bloqueantes.
- [ ] O estrutural não baixa nem executa template.
- [ ] O job de integração usa o SHA declarado em todas as etapas posteriores à resolução.
- [ ] Divergência entre tag e commit falha antes de executar conteúdo do template.
- [ ] Um teste prova que secrets não são encaminhados ao job de integração.
- [ ] Falhas de manifesto, materialização, renderização, npm, Docker ou smoke apontam o template e a versão.
- [ ] Todas as Actions usam SHA completo e permissões mínimas.

**Gate:** os dois jobs verdes.

**Dependências:** R06, C01 e T01.

---

### C02 — CLI: verificar assinatura, keyring oficial e anti-rollback

**Repositório:** `jptecno/cli`.

**Objetivo:** preparar a cadeia de confiança do consumidor antes da ativação do Pages assinado.

**Mudanças esperadas:**

- URL oficial apontando para GitHub Pages;
- download de `registry.json` e `registry.json.sig` como bytes;
- keyring público versionado com `keyId`, algoritmo e chave pública Ed25519;
- validação de pelo menos uma assinatura confiável;
- persistência segura da maior `revision` oficial já aceita e rejeição de downgrade;
- documentação separando a política estrita do endpoint oficial da política de registries customizados.

**Critérios de aceite:**

- [ ] A assinatura é validada antes de confiar no conteúdo parseado.
- [ ] Uma assinatura válida entre múltiplas assinaturas satisfaz o quorum atual de uma.
- [ ] Assinatura inválida, chave desconhecida, envelope malformado ou ausência do `.sig` falha fechado no registry oficial.
- [ ] Uma revisão oficial menor que a maior revisão aceita é rejeitada.
- [ ] Republicação de bytes idênticos com a mesma revisão é aceita como idempotente.
- [ ] O keyring contém apenas material público.
- [ ] Testes cobrem rotação com duas assinaturas e downgrade.

**Gate:** check completo e testes de integração do CLI com servidor local, sem depender do Pages ao vivo.

**Dependências:** R05 para contratos e criação controlada da chave pública descrita na seção 8. R09 não pode ativar o endpoint sem C02 homologado.

---

### T02 — Template: GitHub App para abrir PR de release no registry

**Repositório:** `jptecno/template-api-nodejs-typescript`.

**Objetivo:** após Release Please concluir uma release, abrir um PR normal contra `development` no registry.

**Mudanças esperadas:**

- workflow acionado somente após release/tag concluída pelo Release Please;
- autenticação por GitHub App dedicada;
- criação de branch efêmera no registry;
- atualização de `version`, `ref`, `commit`, statuses, `revision` e `publishedAt`;
- abertura de PR contra `development` usando o template obrigatório.

**Permissões da GitHub App:**

- acesso somente aos repositórios necessários;
- no registry: `Contents: read/write` e `Pull requests: read/write` estritamente para criar branch e PR;
- sem `Administration`, sem bypass, sem merge, sem alteração de rulesets e sem acesso a secrets de assinatura.

**Critérios de aceite:**

- [ ] O SHA vem da tag publicada e possui 40 caracteres.
- [ ] A versão anterior ativa é preservada e passa a `deprecated` com `statusReason`.
- [ ] A nova versão é a única `active`.
- [ ] `revision` incrementa exatamente `1` e `publishedAt` é definido no commit do PR.
- [ ] O PR aponta para `development`, executa todos os gates e não faz automerge.
- [ ] Reexecução não cria PRs duplicados para a mesma versão.
- [ ] A App não consegue fazer merge nem administrar o repositório.

**Gate:** testes do gerador de alteração, execução em dry-run e PR real de homologação.

**Dependências:** R06, R07 e instalação administrativa da GitHub App.

---

### R08 — Implementar assinatura Ed25519 em job dedicado

**Objetivo:** gerar `registry.json.sig` a partir dos bytes aprovados sem expor a chave ao deploy.

**Arquivos previstos:**

- script de assinatura e verificação local;
- testes do envelope detached;
- workflow de publicação com job `sign` separado;
- documentação operacional de rotação e incidente.

**Critérios de aceite:**

- [ ] O script usa `node:crypto` com Ed25519 e assina um `Buffer` lido diretamente de `registry.json`.
- [ ] Teste prova que mudar um byte invalida a assinatura.
- [ ] Teste prova suporte a múltiplas assinaturas e ao requisito de uma chave confiável válida.
- [ ] O job `sign` acessa a chave somente pelo environment `registry-signing`.
- [ ] Toda execução de assinatura exige aprovação manual do environment.
- [ ] O job não imprime chave, conteúdo PEM/DER, variáveis ou comandos com expansão do secret.
- [ ] O artifact de saída contém somente arquivos publicáveis: `registry.json`, `registry.json.sig` e os schemas canônicos.
- [ ] A chave privada não aparece em artifacts, caches ou outputs.
- [ ] Actions e permissões estão fixadas e minimizadas.

**Gate:** `npm run check`, testes criptográficos e aprovação de segurança/CODEOWNERS.

**Dependências:** R07 e provisionamento seguro da chave conforme seção 8.

---

### R09 — Publicar no GitHub Pages, garantir integridade e republicação idempotente

**Objetivo:** concluir a distribuição oficial assinada com anti-rollback.

**Arquivos previstos:**

- workflow Pages com jobs `sign` e `deploy` separados;
- workflow de integridade remota;
- configuração/documentação do Pages;
- README com URLs oficiais e procedimento de rollback.

**Comportamento de publicação:**

- somente commit aprovado em `main` pode publicar;
- mudanças publicáveis são exclusivamente `registry.json` e `schemas/template-registry-v2.schema.json` / `schemas/template-manifest-v1.schema.json`; o `.sig` é gerado no job de assinatura;
- antes de assinar, o workflow consulta o registry atualmente publicado e valida sua assinatura;
- publicação normal exige `candidate.revision = remote.revision + 1`;
- primeira publicação exige a revisão inicial aprovada;
- o job `deploy` baixa o artifact assinado e não recebe a chave privada;
- `deploy` possui somente `pages: write` e `id-token: write`, além das permissões de leitura estritamente necessárias;
- Pages publica `registry.json`, `registry.json.sig` e os dois schemas nos nomes canônicos, sem alias `latest`.

**`workflow_dispatch` de republicação:**

- não reconstrói nem reserializa `registry.json`;
- só republica quando os bytes candidatos são idênticos aos bytes da revisão solicitada em `main` e a revisão não é menor que a remota;
- gera novamente um envelope válido sobre os mesmos bytes ou reutiliza artifact retido e verificado;
- não altera `publishedAt`, `revision` ou schemas;
- continua exigindo aprovação manual do environment de assinatura.

**Workflow de integridade remota:**

- execução agendada e manual;
- baixa os três tipos de artefato do Pages;
- valida assinatura, schemas, semântica e revisão;
- compara seus bytes aos arquivos correspondentes do commit publicado em `main`;
- confirma novamente tag → commit para versões `active`;
- falha e alerta em divergência, sem corrigir ou publicar automaticamente.

**Critérios de aceite:**

- [ ] Assinatura e deploy aparecem como jobs separados.
- [ ] O job de deploy não consegue acessar o secret da chave.
- [ ] O Pages serve registry, assinatura e schemas com tipo de conteúdo utilizável e sem transformação de bytes.
- [ ] Tentativa de publicar revisão igual com bytes diferentes ou revisão menor falha.
- [ ] Republicação idempotente preserva exatamente os bytes do registry.
- [ ] O workflow de integridade detecta adulteração do registry, assinatura, schema e resolução de tag.
- [ ] Actions usam SHA completo e os jobs têm permissões mínimas.
- [ ] C02 está homologado antes da troca da URL oficial do CLI.

**Gate:** publicação de homologação, verificação independente dos bytes/assinatura e smoke test do CLI homologado.

**Dependências:** R08, C02, conclusão dos gates de R07 e configuração administrativa do Pages/environment.

---

### R10 — Ativar fluxo de proteção e encerrar migração

**Objetivo:** tornar os controles obrigatórios e remover caminhos temporários de migração.

**Operações administrativas:**

- proteger `development` e `main` contra push direto;
- exigir PR, revisão de CODEOWNER e conversa resolvida;
- exigir os checks aplicáveis: `check`, estrutural, integração, Semgrep, Danger e `harness-change-approved`;
- exigir promoção `development` → `main` após homologação;
- restringir publicação a `main`;
- configurar `registry-signing` com reviewers obrigatórios, impedir autoaprovação quando suportado e limitar a branch `main`;
- confirmar Dependabot npm/actions com target `development`;
- remover URL Raw do contrato oficial depois da janela de migração do CLI.

**Critérios de aceite:**

- [ ] Push direto e bypass não autorizado estão bloqueados nas duas branches permanentes.
- [ ] PR de release automatizado pela App não pode pular checks nem fazer merge.
- [ ] Uma alteração de registry percorreu `development`, homologação, `main`, aprovação de assinatura e Pages.
- [ ] O CLI consumiu a publicação assinada e registrou a revisão.
- [ ] Um exercício de republicação idempotente foi concluído.
- [ ] Um exercício de roll-forward corretivo foi documentado sem reduzir `revision`.
- [ ] README e runbook refletem somente o fluxo definitivo.

**Gate:** checklist de encerramento aprovado por CODEOWNERS do registry, CLI e template.

**Dependências:** R09 e T02.

## 7. Matriz de dependências cross-repo

| Entrega | Produz                                        | Consumida por                          | Bloqueia                                 |
| ------- | --------------------------------------------- | -------------------------------------- | ---------------------------------------- |
| R05     | Schemas canônicos revisados                   | CLI e template                         | C01, T01, definição final dos parsers    |
| C01     | CLI compatível com registry v2 e manifesto v1 | Registry                               | Corte do `registry.json` oficial para v2 |
| T01     | Manifesto e schema vendorizado validados      | Job de integração                      | R07                                      |
| R06     | Registry v2 e invariantes locais              | CLI, integração e automação de release | R07, T02                                 |
| R07     | Gates estrutural e isolado                    | Todos os PRs de catálogo               | R08 e publicação                         |
| C02     | Confiança por assinatura e anti-rollback      | Usuários do CLI                        | Ativação do endpoint Pages oficial       |
| T02     | PR automático pós-release                     | Registry `development`                 | Operação contínua após migração          |
| R09     | Endpoint Pages assinado                       | CLI                                    | Encerramento da migração                 |

Regra de coordenação: schemas só se tornam imutáveis após sua primeira publicação no Pages. Antes dessa publicação, qualquer ajuste exige atualizar R05, C01 e T01 na mesma janela de homologação. Depois dela, mudança incompatível exige novo nome/versionamento de schema; os arquivos v2/v1 publicados não podem ser alterados.

## 8. Segurança da chave de assinatura

### 8.1 Geração e armazenamento

- Gerar Ed25519 fora do repositório, em estação administrativa controlada ou serviço de chaves compatível com o workflow.
- Registrar quem gerou, data, finalidade, fingerprint e `keyId`; nunca registrar a chave privada.
- Armazenar a chave privada apenas como secret do environment protegido `registry-signing`.
- Armazenar a chave pública no keyring versionado do CLI; material público também pode ser usado pelos verificadores do registry.
- Manter backup privado cifrado somente se a política operacional exigir, com acesso separado e auditável.
- Nunca reutilizar a chave para commits, packages ou outras finalidades.

### 8.2 Acesso e aprovação

- Toda assinatura requer aprovação manual do environment.
- O aprovador deve revisar commit, diff publicável, revisão, `publishedAt`, resolução tag/commit e resultado dos gates.
- O autor do PR não deve aprovar sua própria publicação quando o provedor permitir essa restrição.
- O secret não é exposto a PRs, Dependabot, GitHub App do template, job de integração ou job de deploy.
- O job de assinatura possui `contents: read`; somente o job de deploy recebe `pages: write` e `id-token: write`.

### 8.3 Rotação

1. Gerar nova chave e novo `keyId`.
2. Adicionar a chave pública ao keyring do CLI e publicar uma versão do CLI que confie nas chaves antiga e nova.
3. Homologar adoção suficiente dessa versão.
4. Publicar envelopes com assinaturas das duas chaves durante a janela de transição.
5. Remover a chave antiga do secret de assinatura após a janela aprovada.
6. Remover confiança antiga do CLI somente em release posterior e com plano de compatibilidade.

### 8.4 Suspeita de comprometimento

1. Desabilitar imediatamente o secret/environment afetado e pausar publicação.
2. Preservar logs e artifacts para investigação, sem baixar ou redistribuir segredo.
3. Verificar Pages, histórico de Actions, revisões e assinaturas conhecidas.
4. Preparar chave nova e release do CLI com keyring corrigido.
5. Publicar correção somente com chave ainda confiável e não comprometida; se nenhuma existir, distribuir primeiro o novo keyring por release segura do CLI.
6. Corrigir o catálogo por nova `revision`, nunca apagando evidência nem reduzindo revisão.
7. Documentar incidente e rotação.

## 9. Gates por tipo de alteração

| Alteração                               | Gates mínimos                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Documentação comum                      | `check`, Danger; CODEOWNER quando aplicável                                                                                           |
| Harness, instruções, workflows ou hooks | `check`, Semgrep, Danger e `harness-change-approved`; CODEOWNER distinto torna-se obrigatório quando houver segundo mantenedor/equipe |
| Schema ainda não publicado              | `check`, fixtures Ajv, revisão cross-repo, CODEOWNERS                                                                                 |
| Schema já publicado                     | alteração proibida; deve ser criado novo schema versionado                                                                            |
| `registry.json`                         | estrutural, integração isolada, Semgrep, Danger, CODEOWNER, `revision + 1`                                                            |
| Assinatura/publicação                   | todos os gates do PR, merge em `main`, aprovação manual de `registry-signing`, anti-rollback remoto                                   |
| Release automatizada do template        | mesmos gates de um PR humano; sem automerge ou bypass                                                                                 |
| Promoção `development` → `main`         | CI completo, homologação documentada, aprovação e plano de rollback                                                                   |

## 10. Publicação e rollback

### 10.1 Publicação normal

1. Release Please publica a tag no template.
2. A GitHub App resolve o SHA e abre PR no registry contra `development`.
3. O PR preserva histórico, troca a versão ativa, incrementa `revision` em `1` e define `publishedAt`.
4. Jobs estrutural e integração isolada passam.
5. PR é revisado e mergeado em `development`.
6. CLI/template são homologados contra o conteúdo candidato.
7. PR de promoção `development` → `main` é aprovado.
8. Job de assinatura compara revisão remota, recebe aprovação manual e assina bytes exatos.
9. Job de deploy publica o artifact assinado no Pages.
10. Workflow de integridade e smoke do CLI confirmam a publicação.

### 10.2 Falha operacional sem erro de conteúdo

Exemplos: indisponibilidade do Pages, falha transitória de upload ou artifact não promovido.

- não editar `registry.json`;
- executar `workflow_dispatch` para a revisão desejada;
- provar identidade dos bytes com a versão em `main` e, quando disponível, com o remoto;
- assinar/publicar novamente sob aprovação manual;
- confirmar integridade remota.

### 10.3 Erro de conteúdo já publicado

Não republicar uma revisão anterior e não fazer force-push.

1. Pausar novas publicações.
2. Abrir PR corretivo contra `development`.
3. Restaurar semanticamente o conteúdo desejado, mantendo o histórico relevante.
4. Incrementar `revision` em exatamente `1` e definir novo `publishedAt`.
5. Executar todos os gates, homologar e promover para `main`.
6. Assinar e publicar a nova revisão.
7. Confirmar que o CLI aceita a revisão maior.

### 10.4 Tag ou versão comprometida

- marcar a versão afetada como `revoked` com `statusReason` explícito;
- promover uma versão segura como a única `active`;
- usar `replacement` quando houver outro template que seja a substituição adequada;
- incrementar `revision` e seguir publicação normal;
- nunca mover ou recriar a tag comprometida: publicar nova tag imutável.

## 11. Definição de pronto do programa

O hardening está concluído somente quando:

- [ ] R01–R10 foram entregues na ordem compatível com suas dependências.
- [ ] C01, C02, T01 e T02 foram homologados nos repositórios correspondentes.
- [ ] `AGENTS.md` e todo o harness local estão ativos.
- [ ] Branches permanentes e rulesets estão protegidos.
- [ ] Schemas canônicos estão publicados e suas cópias vendorizadas são idênticas.
- [ ] Registry v2 contém SHAs reais e histórico com uma única versão ativa.
- [ ] CLI valida assinatura e anti-rollback do endpoint oficial.
- [ ] Pages publica bytes assinados com jobs e permissões separados.
- [ ] Republicação idempotente e roll-forward corretivo foram exercitados.
- [ ] Nenhum secret foi disponibilizado à validação de PR ou ao conteúdo de template.
- [ ] README e runbooks descrevem o comportamento efetivamente implantado.
