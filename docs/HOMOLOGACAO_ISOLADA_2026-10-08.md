# Homologacao isolada — 08/10/2026

## Concluido

- Projeto Cloud separado `pdv-acs-homolog-20261008` criado e associado ao Firebase.
- APIs Firebase Management e Identity Toolkit habilitadas.
- Backup privado de Auth conferido por tamanho, SHA-256 e geracao fixa: 17 contas, integridade confirmada.
- Script `scripts/restore-auth-homolog.mjs` preparado: destino restrito a homologacao, modo de simulacao padrao, importacao apenas com `--apply`, recusa destino com contas existentes, sem sobrescrita e sem imprimir credenciais.
- Site Netlify de destino identificado: `gelatotht`, ID `62238a5b-3689-4415-a5bd-2e570aa7213e`, dominio principal `pdvacs.acstech.dev.br`.

## Pendente

A API `identityPlatform:initializeAuth` retornou `BILLING_NOT_ENABLED`. Nao foi vinculado faturamento ao novo projeto. Essa API inicializa Identity Platform; isso nao significa que todo uso de Firebase Authentication exige plano pago. O backend Cloud Functions tambem deve ter seus requisitos de faturamento avaliados antes da homologacao completa.

Nenhuma conta foi importada. Nao existe ainda comprovacao de login com senha restaurada, Firestore de homologacao preparado, backend publicado ou previa Netlify publicada. Nao publicar uma previa conectada ao projeto de producao para contornar essa pendencia.

## Continuacao

1. Definir faturamento do ambiente separado e limites operacionais para os testes.
2. Inicializar Auth e importar o backup, verificar contas e realizar teste de login sem expor senhas.
3. Preparar Firestore com dados de teste, regras, indices e backend separado.
4. Gerar build com configuracao exclusiva de homologacao, conferir ausencia de conexoes com producao e publicar um deploy de previa.
5. Homologar venda, estoque, caixa, permissoes de Master/gerencia e impressao antes da ativacao real.

O ambiente de producao e suas contas nao foram alterados nesta etapa.
