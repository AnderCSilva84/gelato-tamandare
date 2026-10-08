# Backups e homologação — 08/10/2026

## Proteção real constatada

Projeto: `gelato-cb6fd`. O banco `(default)` em `southamerica-east1` já tinha PITR habilitado e um agendamento diário com retenção de 31 dias, criado em 20/05/2026. Portanto, a observação anterior de ausência de configuração de backup deve ser substituída por esta verificação direta. Essas proteções não foram criadas nesta etapa.

Backup utilizado: `projects/gelato-cb6fd/locations/southamerica-east1/backups/f5807120-0e23-40e8-b95d-33420d0a79a6`, de 08/10/2026 às 06:07:07 UTC (03:07:07 em Fortaleza), com expiração em 08/11/2026. Estado de origem: READY.

O bucket de arquivos `gelato-cb6fd.firebasestorage.app` já tinha soft delete de sete dias. Isso permite recuperar exclusões dentro da janela, mas não equivale a uma cópia independente dos arquivos. Uma cópia independente dos objetos ativos foi criada e verificada nesta etapa, conforme a seção abaixo. [Documentação do soft delete](https://cloud.google.com/storage/docs/soft-delete).

Foi criado `gs://gelato-cb6fd-resgate` em `SOUTHAMERICA-EAST1`, com acesso público bloqueado, IAM uniforme e soft delete de sete dias. Após autorização explícita do usuário para hashes e parâmetros de senha nesse destino, o backup real de Auth foi gravado e verificado. Não há agendamento de Auth implantado.

## Ensaio de restauração

Foi concluída com sucesso uma restauração do backup real para o banco novo `gelato-homolog-20261008` (operação SUCCESSFUL, progresso 100%). Foram conferidas contagens de 11 coleções: 16.036 vendas, 81 produtos, 361 caixas e 3 lojas, entre outras. O relatório está em `restauracao-cloud-2026-10-08.json`. As contagens demonstram presença dos dados restaurados, não uma auditoria contábil ou comparação completa com a origem. A operação está registrada abaixo:

`projects/gelato-cb6fd/databases/gelato-homolog-20261008/operations/UUDjTt8_2pxCRDJ0uOsOQRAqMXRzYWUtYWNpcmVtYWh0dW9zEiIKECga`

O aplicativo continua apontando para o banco original. O destino fica no mesmo projeto e compartilha o serviço Firebase Auth e as permissões administrativas do projeto. Não executar migração de credenciais nesse projeto como se fosse homologação independente. O banco restaurado tem cobrança própria; definir sua permanência após a validação.

Backups de Firestore incluem dados e índices, mas não as regras de segurança nem as políticas TTL. Um novo ID de banco começa com acesso de clientes negado por padrão; antes de conectar uma aplicação, conferir as regras e o IAM do destino. [Documentação de backups e restauração](https://cloud.google.com/firestore/docs/backups).

O ensaio local exportou Firestore, Auth e Storage, encerrou os emuladores e importou a cópia em uma nova execução. Foram conferidos login com senha, claims, estoque, pagamentos, timestamp, subcoleção e identidade SHA-256 do PDF. Dados exclusivamente fictícios. Esse resultado não prova a recuperação das contas reais de produção. [Exportação e importação dos emuladores](https://firebase.google.com/docs/emulator-suite/install_and_configure).

## Procedimentos reproduzíveis

`npm run test:backup` testa o exportador de Auth com respostas fictícias e executa o ciclo de exportação/importação dos três emuladores. O workflow de validação inclui esse comando. Os artefatos fictícios ficam em `artifacts/`, ignorado pelo Git. A execução remota do workflow ainda depende do envio das alterações ao repositório.

`scripts/restaurar-backup.ps1` exige projeto, backup READY do banco principal e destino novo `gelato-homolog-AAAAMMDD`. Sem `-Apply`, apenas apresenta o plano. Recusa produção como destino e banco já existente.

Após a conclusão da operação, executar:

```powershell
node scripts/verificar-restauracao-cloud.mjs --project gelato-cb6fd --database gelato-homolog-20261008 --output docs/restauracao-cloud-2026-10-08.json
```

Esse verificador só aceita banco de homologação, exige restauração concluída e consulta contagens de coleções sem exportar conteúdo de documentos. Não altera os dados.

## Backup de autenticação executado e verificado

Em 08/10/2026 às 14:05:40 UTC (11:05:40 em Fortaleza), foi gerado o objeto `gs://gelato-cb6fd-resgate/auth/2026-10-08T14-05-40-969Z.json`, contendo 17 contas, todas com senha, e os parâmetros de hash. Tamanho: 10.724 bytes. A leitura autenticada da geração gravada confirmou tamanho e SHA-256 iguais ao conteúdo enviado. Leitura anônima foi negada com HTTP 401. Evidência sem credenciais: `backup-auth-2026-10-08.json`.

O conteúdo sensível foi processado somente em memória e no objeto privado; o relatório local contém apenas estatísticas, checksum e identificação do objeto. Esta verificação demonstra integridade da gravação, mas ainda não comprova importação e login das contas reais em outro projeto.

`functions/backup-auth.js` pagina as contas e preserva os parâmetros de hash necessários à restauração. Recusa a cópia se faltar hash de um usuário com senha ou a configuração de hash. O teste com dados fictícios confere paginação e rejeição de exportação incompleta.

`scripts/backup-auth-cloud.mjs` aceita somente o bucket `<projeto>-resgate`, verifica bloqueio de acesso público e IAM uniforme, usa token em memória e envia um objeto com nome único, sem sobrescrita. Seu relatório contém somente quantidade, tamanho e checksum. Nenhum hash ou chave deve entrar no Git ou em logs. [Parâmetros de exportação/importação de Auth](https://firebase.google.com/docs/cli/auth).

A revisão automática inicialmente rejeitou o envio porque a autorização geral para backups não especificava hashes e parâmetros de senha nesse destino. O usuário posteriormente autorizou explicitamente esse envio e a execução foi permitida. A API exigiu o cabeçalho `x-goog-user-project`, adicionado ao exportador; a tentativa anterior falhou antes de gravar o backup. Ainda faltam validar a recuperação real de Auth em projeto independente, estabelecer retenção e automatizar a rotina.

## Próximas condições para liberar a migração

- Restauração real e contagens conferidas; utilizar o relatório para acompanhar os próximos ensaios.
- Backup real de Auth gravado e verificado; ensaiar sua importação em projeto independente, incluindo login e claims.
- Cópia independente dos arquivos ativos criada, com manifesto/checksums e leitura independente conferida. Atualizar a cópia antes da migração e repetir o ensaio para notas fiscais reais quando existirem.
- Preparar projeto Firebase de homologação separado, sem credenciais ou serviços de produção; aplicar regras, índices e backend ali.
- Validar vendas, cancelamentos, estoque, caixa, permissões e recuperação de falhas no ambiente separado; validar impressão no equipamento físico.
- Antes da migração, congelar operações financeiras, produzir cópias atualizadas, conferir relatórios e definir procedimento de retorno. Não houve migração, publicação de backend ou troca de aplicação nesta etapa.

## Trabalhos seguros durante o expediente

Em 08/10/2026 às 14:13:05 UTC (11:13:05 em Fortaleza), o inventário do Storage continha um objeto ativo de 4.970 bytes e nenhuma nota fiscal no prefixo `notas_fiscais/`. A cópia foi gravada em `gs://gelato-cb6fd-resgate/storage/2026-10-08T14-13-05-622Z/`, com manifesto privado. Evidência sem nomes pessoais: `backup-storage-2026-10-08.json`.

O procedimento não escreve na origem. Cada cópia fixa a geração do arquivo de origem e exige destino inexistente. Remove metadados personalizados e contextos, incluindo tokens de download Firebase, e usa nomes opacos no destino. Confere tamanho, CRC32C e SHA-256 e testa a rejeição de leitura anônima. O manifesto privado preserva o nome original, a geração e os checksums para futura recuperação. Só grava manifesto de conclusão quando todos os arquivos passaram. Se uma execução falhar, podem restar cópias parciais no destino; não considerá-las um backup completo sem manifesto válido. [Referência oficial da cópia por rewrite](https://cloud.google.com/storage/docs/json_api/v1/objects/rewrite).

A segunda verificação leu o manifesto e recuperou o conteúdo exclusivamente do bucket de backup, sem depender da existência do arquivo original. Checksum do manifesto, tamanho e SHA-256 do arquivo foram conferidos. Evidência: `recuperacao-storage-2026-10-08.json`. Isso valida recuperação dos bytes em memória, sem recolocar arquivo em produção ou alterar suas referências. Não havia nota fiscal real para esse ensaio; o teste automatizado usa PDF fictício.

O inventário não é um snapshot atômico sincronizado ao Firestore. Novos anexos após o inventário não entram nessa execução; mudança/exclusão de uma geração durante a cópia interrompe a validação caso ela deixe de estar disponível. Durante o expediente, essa rotina pode ser usada como proteção adicional. Antes da migração, repetir o backup após fechar as operações para alinhar dados e arquivos.

Comandos reproduzíveis:

```powershell
# Planejar: somente inventario e consulta da politica do bucket
node scripts/backup-storage-cloud.mjs --project gelato-cb6fd

# Copiar e conferir: escreve exclusivamente no bucket privado de resgate
node scripts/backup-storage-cloud.mjs --project gelato-cb6fd --apply --output docs/backup-storage-2026-10-08.json

# Recuperar e conferir os bytes: le somente o bucket de backup
node scripts/verificar-backup-storage.mjs --project gelato-cb6fd --report docs/backup-storage-2026-10-08.json --output docs/recuperacao-storage-2026-10-08.json
```

Os limites de 5.000 objetos e 1 GiB por execução exigem planejamento caso o volume cresça. Os relatórios locais não contêm arquivos, nomes originais ou credenciais. O manifesto contendo nomes originais fica somente no bucket privado. Não foi configurada exclusão automática nem rotina agendada; definir retenção e monitoramento antes de automatizar.

Os testes de `scripts/test-backup-storage.mjs`, incluídos em `npm run test:backup`, conferem paginação, plano sem escrita, múltiplas etapas de cópia, geração fixa, remoção de metadados, recuperação sem acesso à origem e rejeição de checksum divergente, origem ausente ou destino público. O comando completo `npm run test:backup` passou novamente, incluindo reinício e importação dos emuladores; lint e sintaxe dos novos scripts também passaram.

O comando `npm run test:seguranca` foi executado novamente durante o expediente exclusivamente nos emuladores e terminou com código 0, incluindo regras, permissões, migração fictícia, vendas atômicas/idempotentes, disputa de estoque, sangria concorrente, estorno único e fechamento autoritativo. Nenhum usuário real, regra de produção, caixa ou venda foi alterado por esses testes.

Podem continuar durante o expediente: backups de leitura/cópia, verificações de integridade, testes locais, preparação de builds e documentação. Permanecem para depois do fechamento e homologação: migração de credenciais, alteração de regras/backend/cliente em produção e qualquer restauração que substitua dados operacionais.
