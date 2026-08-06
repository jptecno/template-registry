const conventionalTitle =
  /^(build|chore|ci|docs|feat|fix|perf|refactor|revert|style|test)(\([a-z0-9-]+\))?!?: .+[^.]$/;
const artifactPath = /^(dist|coverage)(\/|$)/;

export function analyzeRegistryPatch(patch = '') {
  const removedVersion = valueFromPatch(patch, '-', 'version');
  const addedVersion = valueFromPatch(patch, '+', 'version');

  return {
    repositoryChanged:
      valueFromPatch(patch, '-', 'repository') !== undefined &&
      valueFromPatch(patch, '+', 'repository') !== undefined,
    schemaChanged:
      valueFromPatch(patch, '-', 'schemaVersion') !== undefined ||
      valueFromPatch(patch, '+', 'schemaVersion') !== undefined,
    versionDowngraded:
      removedVersion !== undefined &&
      addedVersion !== undefined &&
      compareVersions(addedVersion, removedVersion) < 0,
  };
}

export function evaluatePullRequest(facts) {
  const failures = [];
  const warnings = [];
  const body = facts.body ?? '';

  if (!conventionalTitle.test(facts.title.trim())) {
    failures.push('Use um título no formato Conventional Commits.');
  }

  if (meaningfulText(section(body, 'Resumo')).length === 0) {
    failures.push('Preencha a seção Resumo com uma descrição objetiva.');
  }

  if (facts.baseBranch === 'main' && facts.headBranch !== 'development') {
    failures.push('Pull requests para main devem ter origem em development.');
  }

  if (facts.baseBranch === 'main' && facts.headBranch === 'development') {
    for (const field of [
      'Ambiente de homologação e resultado',
      'Impacto de produção',
      'Plano de rollback',
    ]) {
      if (!hasPromotionField(body, field)) {
        failures.push(`Preencha o campo de promoção: ${field}.`);
      }
    }
  }

  const artifacts = facts.files.filter((file) => artifactPath.test(file));
  if (artifacts.length > 0) {
    failures.push(`Não versione artefatos gerados: ${artifacts.join(', ')}.`);
  }

  if (
    facts.files.includes('registry.json') &&
    meaningfulText(section(body, 'Contexto da alteração do registry')).length ===
      0
  ) {
    failures.push(
      'Descreva compatibilidade e supply chain em Contexto da alteração do registry.',
    );
  }

  if (facts.files.length > 20 || facts.additions + facts.deletions > 300) {
    warnings.push('PR grande: considere dividir a mudança para facilitar a revisão.');
  }

  if (facts.registryChanges.versionDowngraded) {
    warnings.push('Possível downgrade de versão no registry; confirme a intenção.');
  }
  if (facts.registryChanges.repositoryChanged) {
    warnings.push('Repositório do template alterado; confirme origem e confiança.');
  }
  if (facts.registryChanges.schemaChanged) {
    warnings.push('Schema do registry alterado; confirme compatibilidade com a CLI.');
  }

  return { failures, warnings };
}

function section(body, heading) {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    body.match(
      new RegExp(
        `^## ${escapedHeading}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`,
        'im',
      ),
    )?.[1] ?? ''
  );
}

function meaningfulText(value) {
  return value
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*[-*]\s*$/gm, '')
    .replace(/^\s*- \[[ x]\].*$/gim, '')
    .replace(/[#*_`>]/g, '')
    .trim();
}

function hasPromotionField(body, label) {
  const line = section(body, 'Homologação, release e produção')
    .split('\n')
    .find((candidate) => candidate.trim().startsWith(`- ${label}:`));
  return meaningfulText(line?.slice(line.indexOf(':') + 1) ?? '').length > 0;
}

function valueFromPatch(patch, prefix, field) {
  const expression = new RegExp(
    `^\\${prefix}\\s*"${field}"\\s*:\\s*(?:"([^"]+)"|(\\d+))`,
    'm',
  );
  const match = patch.match(expression);
  return match?.[1] ?? match?.[2];
}

function compareVersions(left, right) {
  const parse = (value) => value.replace(/^v/, '').split(/[.-]/).map(Number);
  const leftParts = parse(left);
  const rightParts = parse(right);

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }

  return 0;
}
