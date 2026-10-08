# Segurança, vendas, estoque e caixa — 08/10/2026

## Implementado

- Backend Firebase callable `operacaoGelato`, na região `southamerica-east1`, com validação de autenticação, sessão revogada, conta ativa, função e unidades autorizadas. A aplicação web e o Android usam o mesmo backend.
- Cadastro de atendentes cria/vincula a conta Auth no servidor. A senha é enviada para o Auth e não é gravada no Firestore. Mudança de senha exige confirmação da conta do gestor; edição deixa a senha vazia e opcional. Cópia de atendente concede somente destinos explicitamente autorizados. Abrir uma tela ou cadastrar uma loja não distribui privilégios automaticamente.
- Confirmações para caixa e cancelamento usam Firebase Auth, sem comparar senhas extraídas de documentos. Desativação é feita junto com o acesso do painel. Exclusão de atendente desativa o cadastro para preservar referências históricas.
- Login por nome usa aliases contendo somente endereços sintéticos `@acs.local`; renomear ou copiar atendente mantém a conta. Aliases não expõem senha nem email pessoal. Contas legadas com email pessoal continuam podendo entrar pelo email.
- Carrinho completo é registrado em uma transação: itens, estoque, movimentações, totais do caixa, resumo, ranking e comprovante. Preço e estoque são conferidos no servidor; preço diferenciado fica restrito à gerência. Venda por KG respeita o valor informado e a quantidade calculada pelo preço cadastrado.
- Identificador persistido antes do envio impede duplicação após resposta incerta. A tela permite verificar a venda pendente mesmo depois de recarregar. Erro de impressão acontece após confirmar a venda e não a devolve ao carrinho.
- Pagamentos e troco são calculados em centavos. Troco não pode exceder o dinheiro recebido. Rateio fecha o valor de cada item e o total de cada meio de pagamento.
- Abertura de caixa usa uma referência ativa por atendente/unidade. Sangria consulta o saldo físico atualizado na transação. Fechamento usa totais do servidor e calcula a diferença com o valor contado.
- Estorno conserva a venda original como cancelada, registra autor/motivo e repõe o estoque uma única vez, junto dos ajustes financeiros. Caixa com movimentação não pode ser apagado: caixas vazios e fechados podem ser arquivados. Mudança de data de caixa com movimentação é bloqueada.
- Despesas e entradas consolidadas usam o backend. Despesas ajustam o resumo na mesma transação, sem zerar vendas anteriores. Registros cancelados ficam preservados e não entram nos totais exibidos.
- Relatório separa dinheiro dos caixas, saldo do período e resultado. Sangria é transferência, não despesa do resultado. Novas vendas guardam custo histórico. Despesas avulsas não vinculadas ao caixa não são presumidas como saída física de uma gaveta.
- Leituras de vendas, despesas, entradas, caixas e retiradas filtram período/caixa no Firestore. Histórico de estoque carrega os últimos 30 movimentos no servidor. Índices correspondentes foram acrescentados.
- Regras negam gravações diretas em acessos, atendentes, vendas, despesas, entradas, caixas, sangrias e agregados. Operador não altera estoque diretamente. Estornos não podem ser apagados ou imitados pelo cliente.
- Logs estruturados no backend registram operação, UID e código de resultado sem registrar payload ou senha. Há recuperação de erro de renderização e workflow de CI para lint, emuladores, comprovantes, anexos e builds.

## Evidências de homologação local

`npm run test:seguranca` usa somente o projeto `demo-gelato-audit`, Firestore em 8188, Storage em 9299, Auth em 9101 e Functions em 5002. Os testes incluem regras, endpoint HTTP callable com token do Auth Emulator, acesso anônimo/inativo/de outra loja, abertura concorrente, repetição do mesmo pedido, concorrência pelo último item, pagamentos mistos, agregados, sangria concorrente, estorno repetido e fechamento autoritativo.

As migrações também são exercitadas em dados fictícios: simulação sem escrita, retirada da senha, criação Auth e reconstrução separada por loja. Lint, builds Gelato/Café, testes de nota fiscal/comprovante e geração Android fazem parte das verificações desta etapa. O CI foi criado; sua execução remota depende de enviar as alterações ao repositório.

## Ativação em produção

Estas mudanças estão locais. Não publicar apenas as regras: o cliente antigo deixará de gravar e o cliente novo precisa da função publicada. Não executar migração real antes de backup e conciliação dos caixas antigos.

1. Conferir projeto Firebase, permissões e plano necessários para Cloud Functions. Usar Node 22 no ambiente de publicação e instalar `npm ci` e `npm ci --prefix functions`.
2. Conciliar e fechar os caixas antigos usando a versão atualmente publicada. Novas operações não aceitam caixa legado sem `versaoFinanceira: 2`. Não inventar totais ou mudar essa versão manualmente.
3. Fazer exportação de Firestore e backup do Auth/Storage conforme política da empresa, com acesso restrito. O backup anterior à migração pode conter as senhas legadas; não o colocar no repositório nem em bucket público. Testar a restauração em projeto de homologação separado.
4. Publicar o backend e os índices usando projeto explicitamente selecionado. Criar `configuracoes/operacoes_financeiras` com `bloqueadas: true` durante a janela de migração. O backend rejeita gravações enquanto esse bloqueio estiver ativo. Pausar também os clientes antigos durante a janela, pois eles ainda usam as regras anteriores.
5. Simular a migração com `node scripts/migrar-credenciais.mjs --project PROJETO`. O script usa credencial administrativa local/ADC, nunca as chaves web. Resolver todas as pendências: contas sem vínculo, email já ocupado ou cadastro inconsistente. Não assumir que um email já existente pertence ao cadastro.
6. Aplicar com o mesmo comando acrescentando `--apply`. O script não exibe senhas e recusa a execução se houver caixa legado aberto. Revisar os escopos dos gestores existentes: a migração preserva os escopos existentes e não decide quais concessões antigas devem ser revogadas. Trocar senhas que já foram armazenadas em texto puro.
7. Simular e aplicar `node scripts/backfill-agregados.mjs --project PROJETO` e depois `--apply`, ainda sem gravações concorrentes. O backfill usa chaves `loja__data`, exclui cancelamentos e grava lotes de até 400 documentos. Não misturar sua execução com vendas ativas.
8. Publicar regras e aplicativo compatível, validar um operador e um gestor, conferir login, produto, venda, estorno, sangria, fechamento e impressão. Desbloquear `operacoes_financeiras` somente após concluir a migração. Acompanhar os logs e conciliar os totais no primeiro turno.

Para desenvolver com dados isolados, iniciar os emuladores usando `firebase.audit.json` e executar o Vite com `VITE_USE_FIREBASE_EMULATORS=true`. Essa opção somente funciona em modo de desenvolvimento e troca a configuração para o projeto demo.

## Pontos ainda abertos

- Publicação e aplicação das migrações em dados reais não foram feitas. Contas legadas ainda têm sua situação original até a migração ser aplicada.
- Backups diários do Firestore e PITR já existentes foram confirmados, e uma restauração real foi concluída em banco separado. Backups manuais de Auth e Storage foram gravados e conferidos. Ver `BACKUPS_E_HOMOLOGACAO_2026-10-08.md`. Ainda faltam automatização de Auth/Storage, alertas e ensaio de importação de Auth em projeto independente.
- Retenção dos anexos vinculados e acesso por URL com token ainda precisam ser reforçados; as regras atuais continuam permitindo ao gestor apagar uma nota fiscal da própria loja.
- Restam alertas de dependências registrados pela auditoria, incluindo dependências do Admin SDK/backend. Não foi usado `audit fix --force` para introduzir incompatibilidades sem homologação.
- O bundle de PDF mantém aviso de tamanho acima de 500 KB. Carregamento é separado, mas ainda pode ser otimizado.
- APK de debug serve para homologação. Assinatura de release, impressão física, papel ausente, desconexão, retomada de rede e atualização na maquineta precisam de validação no equipamento. Não há declaração de aprovação integral para produção.

Referências de implementação: [Firebase callable](https://firebase.google.com/docs/functions/callable), [transações Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions), [exportação e importação Firestore](https://firebase.google.com/docs/firestore/manage-data/export-import).
