# Revisar segurança do registry

**Gatilho:** alteração em registry, schema, manifesto, paths de renderização, validação, assinatura, scripts ou workflow.

1. Trate JSON e metadados de template como entrada não confiável.
2. Confirme `additionalProperties: false`, validação na borda e regras semânticas necessárias.
3. Confirme que paths relativos não permitem traversal e que dados do registry não viram comandos de shell.
4. Confirme que não há secrets, logs sensíveis ou execução de template no gate estrutural.

**Evidências:** trechos revisados, testes executados e riscos residuais.

**Interrompa:** diante de secret, execução arbitrária, path traversal, schema com campos inesperados, tag não imutável ou acesso de publicação fora do fluxo aprovado.
