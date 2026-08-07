# Publicar entrada do registry

**Gatilho:** inclusão ou atualização de entrada após o contrato v2 ser adotado.

1. Confirme repositório `jptecno/*`, tag SemVer imutável, SHA de commit resolvido e histórico de versões.
2. Atualize `revision` por roll-forward e defina `publishedAt` no PR; não reescreva o catálogo durante publicação.
3. Execute os gates locais e abra PR para `development`.
4. Após homologação, promova `development` para `main` e use o processo de assinatura aprovado.

**Evidências:** tag, SHA, revisão, validação e plano de rollback.

**Interrompa:** se houver necessidade de chave privada, secret, push direto, tag móvel, regressão de revisão ou ausência de aprovação. Nunca acesse, solicite ou exponha chave privada.
