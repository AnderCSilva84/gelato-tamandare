# Preparação da ativação — 08/10/2026

## Atualização após fechamento informado pelo usuário

O usuário confirmou expressamente que Wesley usará a conta Master. O plano privado passou a `autorizacaoIdentidadeConfirmada: true`. A simulação foi repetida com resultado: 10 cadastros migráveis, zero pendências técnicas e zero vínculos aguardando confirmação. Perfil permanece `gerencia`, limitado a Gelato e Sabor & Açaí; nenhuma promoção a superadmin, troca de senha ou associação em produção foi aplicada nessa etapa. Os parágrafos abaixo registram as verificações anteriores à confirmação.

O usuário definiu Wesley como gerente de Gelato e Sabor & Açaí, com administração operacional e sem configurações do sistema. O acesso Auth encontrado já possui `role: gerencia` e somente essas duas lojas. Foi preparado um plano privado para vincular o cadastro pendente à conta existente, e a simulação técnica desse plano resultou em 10 migráveis e zero pendências técnicas. Entretanto, a resposta definiu o perfil, sem confirmar expressamente se Wesley deve usar a conta Master ou ter login próprio. Essa informação foi solicitada e o plano foi marcado `autorizacaoIdentidadeConfirmada: false`; `--apply` com esse plano é recusado antes de qualquer alteração. Não houve associação real de contas.

Os testes nos emuladores confirmaram: gerência recebe HTTP 403 para alteração de configuração do sistema e do bloqueio financeiro global; superadmin recebe HTTP 200 para configuração. A suíte direcionada de regras e operações/migração fictícia passou. As regras de produção ainda dependem da ativação coordenada; o resultado dos testes não implica publicação dessas restrições.

Após o usuário concluir `gcloud auth application-default login`, a credencial ADC funcionou. A simulação completa de credenciais encontrou 10 cadastros, 9 migráveis e 1 pendência de email ocupado por conta já vinculada a outro cadastro. Conferência somente de leitura confirmou que as funções e escopos de loja são compatíveis, mas o identificador do cadastro é diferente: não há prova suficiente para associar automaticamente. Foi solicitada ao usuário a confirmação de identidade ou a definição de acesso separado. Nenhuma migração real foi aplicada.

Em 08/10/2026 às 19:41 (Fortaleza), nova consulta confirmou zero caixas abertos e zero caixas legados abertos. O bloqueio por caixas foi resolvido pelo fechamento realizado pelo usuário. Permanecem a configuração de credencial administrativa, confirmação do destino de publicação, simulação completa de credenciais e homologação independente. O relatório agregado foi atualizado; nenhuma migração foi aplicada nesta conferência.

A consulta de infraestrutura também confirmou que a API `cloudfunctions.googleapis.com` está desabilitada (HTTP 403, motivo SERVICE_DISABLED). O site padrão `gelato-cb6fd.web.app` existe, mas a consulta encontrou zero releases no Firebase Hosting, portanto sua existência não confirma hospedagem do sistema atual. Nenhuma API foi habilitada nem recurso publicado nessa verificação. Usuário orientado a autenticar ADC localmente e informar a plataforma/endereço real de publicação.

Nova consulta somente de leitura em 08/10/2026 às 19:10 (Fortaleza) confirmou redução de 10 para 5 caixas legados abertos: dois de 16/08, um de 24/09, um de 29/09 e um de 08/10. O relatório `preflight-producao-2026-10-08.json` foi atualizado. Ainda há bloqueio por caixas legados; nenhuma migração foi aplicada. Os registros abaixo descrevem a conferência inicial, anterior a esse fechamento parcial.

O usuário informou encerramento do atendimento e autorizou continuar as correções. A conferência somente de leitura encontrou 10 caixas legados com `status: aberto`: um de hoje e nove anteriores (junho a setembro). Encerramento físico do atendimento não altera esses registros. Nenhum caixa foi fechado pelo agente; é necessário conferir os valores e conciliar pela versão atual. Não modificar `versaoFinanceira` manualmente para contornar esse requisito.

Foram encontrados 10 atendentes com senha legada, um sem `authUid`. Todos têm função reconhecida pelo migrador. Isso não confirma propriedade de email, validade de senha ou total conciliação; a simulação completa permanece necessária depois de resolver os caixas. Evidência agregada, sem nomes ou senhas: `preflight-producao-2026-10-08.json`.

## Correções locais

- Removida a dependência `gelato-tamandare: file:..` do backend, pois não era utilizada. O backend passa a instalar somente suas dependências declaradas, sem incluir o aplicativo como pacote local. Lockfile atualizado e instalação limpa realizada.
- Adicionado `--dry-run` explícito aos comandos de migração de credenciais e reconstrução de agregados. A combinação com `--apply` é recusada. Todas as gravações continuam condicionadas a `--apply`.
- Criado `scripts/preflight-producao.mjs`, que somente lê pré-requisitos, registra contagens e datas e não aceita `--apply`. Usa credencial gcloud em memória, sem imprimir tokens ou dados pessoais.

## Bloqueios reais

A revisão automática rejeitou a tentativa inicial de simulação por não existir sinalizador explícito no comando. Após revisar os ramos de escrita e acrescentar `--dry-run`, a nova execução foi permitida, mas falhou por ausência de Application Default Credentials (ADC). Nenhuma conta foi criada ou alterada. A autenticação gcloud disponível permite o preflight REST, mas os scripts Admin/Firestore ainda precisam de ADC ou uma conta de serviço autorizada. Não copiar tokens para arquivos nem pedir envio de chaves pelo chat. A autenticação administrativa deve ser estabelecida localmente por quem tem acesso ao projeto.

O Firebase local não configura hosting e o README ainda é o modelo genérico de Vite; não há neste roteiro confirmação de onde publicar o cliente web. Publicar regras antes de disponibilizar o cliente compatível interromperia gravações do aplicativo antigo. Backend, regras e cliente precisam de uma ativação coordenada.

Ainda há oito alertas moderados na cadeia de dependências do backend. Remover a dependência local indevida não corrige esses alertas; não foi aplicado `audit fix --force`.

## Ordem após conciliação

1. Repetir o preflight e confirmar zero caixas legados abertos.
2. Estabelecer ADC/conta de serviço administrativa, confirmar destino de publicação do cliente e executar a simulação completa de credenciais.
3. Concluir o ensaio de recuperação de Auth em ambiente independente e resolver todas as pendências cadastrais.
4. Atualizar backups de Firestore, Auth e Storage dentro da janela sem atendimento.
5. Seguir o roteiro coordenado de backend/índices, bloqueio financeiro, migração e reconstrução, regras e cliente descrito em `SEGURANCA_E_FINANCEIRO_2026-10-08.md`.
6. Validar login de operador e gestor, venda, estorno, sangria, fechamento e impressão antes de liberar atendimento.

Lint e builds Gelato/Café passaram. A suíte de segurança e operações passou nos emuladores, incluindo migração fictícia e reconstrução de agregados, e passou novamente após a instalação limpa final do backend. A instalação do backend e do workflow passa a executar `npm ci` diretamente no diretório `functions`. Os testes locais usaram Node 20; o runtime de publicação e o CI estão configurados para Node 22, e a execução remota do CI ainda não foi realizada.

Nenhuma regra, backend ou aplicação foi publicada nesta preparação. Nenhuma senha, venda, estoque ou caixa real foi alterado.
