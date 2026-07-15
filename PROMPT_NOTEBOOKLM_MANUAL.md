# Prompt para gerar o manual do sistema no NotebookLM

Copie todo o texto abaixo e cole no chat do NotebookLM depois de adicionar como fontes os arquivos do projeto, capturas de tela e demais documentos do sistema.

---

Atue como redator técnico especializado em manuais de sistemas de gestão e ponto de venda. Com base exclusivamente nas fontes deste notebook, crie um manual de instruções completo, claro e prático para o sistema ACS usado pelo Café Guajará.

Não invente telas, botões, permissões, comportamentos ou procedimentos. Quando uma informação não estiver comprovada pelas fontes, marque-a como “Informação a confirmar” em vez de presumir. Use os nomes dos menus, campos e botões exatamente como aparecem no sistema.

## Público do manual

O manual deve atender três perfis:

1. Atendente: utiliza principalmente o PDV, abre e fecha o próprio caixa, registra vendas e pode solicitar suporte.
2. Gerência: acompanha a operação, administra caixa, estoque, equipe, fluxo financeiro e relatórios.
3. Superadmin: possui os acessos da Gerência e também administra unidades, manutenção, suporte e recursos exclusivos da rede.

Explique claramente quais funções estão disponíveis para cada perfil. Nunca oriente um atendente a acessar uma função gerencial.

## Escopo do manual

Este manual deve tratar somente do Café Guajará. Ignore recursos, telas ou instruções exclusivas de outras empresas ou versões do sistema. O Café Guajará utiliza um PDV compacto: não possui banner superior nem Ranking de metas no PDV; apresenta somente o indicador “Total de vendas” e mantém as funções operacionais de produtos, venda atual, retirada, fechamento e vendas do turno.

## Estrutura obrigatória

Crie o manual em português do Brasil com esta estrutura:

1. Capa
   - Título: “Manual de Utilização do Sistema ACS”
   - Subtítulo: “Café Guajará”
   - Campo para versão do manual e data de atualização.

2. Sumário numerado.

3. Apresentação do sistema
   - Objetivo do sistema.
   - Visão geral dos módulos.
   - Diferença entre os perfis Atendente, Gerência e Superadmin.

4. Primeiro acesso e login
   - Login do Atendente pelo nome e senha operacional.
   - Login da Gerência e do Superadmin conforme mostrado nas fontes.
   - Como sair do sistema.
   - Mensagens comuns de acesso bloqueado, usuário inativo ou senha inválida.
   - Não publique nem sugira senhas reais.

5. PDV / Caixa — guia do Atendente
   - Selecionar o nome e informar a senha.
   - Informar o fundo inicial e abrir o caixa.
   - Retomar um caixa já aberto.
   - Localizar e selecionar produtos.
   - Adicionar itens e ajustar quantidade, valor ou peso quando aplicável.
   - Escolher a forma de pagamento.
   - Registrar valor recebido e conferir o troco em vendas em dinheiro.
   - Finalizar a venda.
   - Consultar as vendas do turno.
   - Fazer retirada/sangria, informando valor e motivo.
   - Conferir o resumo e fechar o caixa.
   - Exportar o fechamento em PDF quando disponível.
   - Explicar a visualização compacta usada pelo Café Guajará.

6. Dashboard / Hub de operação — Gerência
   - Indicadores apresentados.
   - Ações rápidas.
   - Consulta e administração dos caixas do dia.
   - Ações que exigem confirmação por senha da Gerência.

7. Fluxo de Caixa
   - Seleção de data ou período.
   - Consulta de entradas, vendas, gastos e saídas.
   - Registro e edição de saídas.
   - Despesas fixas.
   - Filtros, pesquisa e consolidação dos valores.

8. Estoque
   - Cadastrar produto.
   - Informar categoria, unidade de venda, custos, preço final e quantidade.
   - Produtos vendidos por unidade e por quilograma.
   - Adicionar imagem e dados de nota fiscal quando disponíveis.
   - Editar, ativar, inativar ou excluir produtos conforme permitido.
   - Alertas de estoque baixo e cuidados para não causar divergências.

9. Atendentes e usuários
   - Cadastrar e editar atendente.
   - Definir função, senha operacional, avatar/foto e meta de vendas.
   - Diferença entre senha operacional e credenciais de acesso ao painel.
   - Ativar, inativar e excluir usuários.
   - Restrições para criação ou alteração de Superadmin.

10. Relatórios
    - Selecionar período.
    - Interpretar vendas, caixas, entradas, saídas e resumo mensal.
    - Abrir o extrato de um caixa.
    - Cancelar item com motivo e senha da Gerência, quando permitido.
    - Exportações disponíveis.

11. Unidades e visão da rede — Superadmin
    - Cadastrar e editar unidades.
    - Selecionar unidade ativa.
    - Alterar disponibilidade/manutenção e mensagem aos usuários.
    - Simular acesso somente para leitura.
    - Comparar unidades e interpretar o ranking da rede.

12. Suporte
    - Como o usuário abre uma conversa e envia uma solicitação.
    - Como o Superadmin consulta, responde e conclui conversas.
    - Boas práticas para descrever o problema.

13. Modo de manutenção
    - O que acontece com o PDV e com as telas gerenciais.
    - Como o Superadmin libera o acesso, conforme comprovado pelas fontes.

14. Boas práticas operacionais
    - Cada atendente deve utilizar o próprio usuário.
    - Conferir produto, quantidade, peso, valor e pagamento antes de concluir.
    - Registrar toda retirada com motivo correto.
    - Não compartilhar senhas.
    - Fechar e conferir o caixa ao terminar o turno.
    - Não excluir ou cancelar registros sem autorização.

15. Solução de problemas
    Crie uma tabela com as colunas “Situação”, “Possível causa” e “Como resolver”. Inclua somente situações sustentadas pelas fontes, como senha inválida, usuário sem senha cadastrada, usuário inativo, caixa já aberto, estoque insuficiente, permissão negada, sistema em manutenção e falha ao carregar dados.

16. Perguntas frequentes.

17. Glossário
    - PDV, fundo de caixa, sangria/retirada, caixa aberto, fechamento, ticket médio, estoque, fluxo de caixa, perfil e unidade.

## Padrão de escrita

- Use linguagem simples, direta e acolhedora.
- Escreva instruções em passos numerados, começando cada passo com um verbo de ação.
- Use frases curtas e evite termos técnicos desnecessários.
- Antes de cada procedimento, informe “Quem pode fazer”.
- Depois de cada procedimento crítico, adicione uma seção curta chamada “Atenção”.
- Indique pontos adequados para imagens com: `[INSERIR CAPTURA DE TELA: descrição exata da tela]`.
- Para cada imagem sugerida, informe o que deve ser destacado com seta ou contorno.
- Use tabelas apenas para permissões e solução de problemas.
- Não exponha configurações internas, chaves, identificadores técnicos, código-fonte ou dados pessoais.

## Entregáveis

Produza, nesta ordem:

1. O manual completo e pronto para revisão.
2. Uma tabela resumida de permissões por perfil e módulo do Café Guajará.
3. Uma lista numerada de todas as capturas de tela que precisam ser produzidas.
4. Um guia rápido de uma página para o Atendente.
5. Um checklist diário de abertura, operação e fechamento do caixa.
6. Uma lista final de informações que precisam ser confirmadas por um responsável pelo sistema.

Antes de finalizar, revise o material e confirme que:

- nenhum recurso foi inventado;
- todo o conteúdo se refere somente ao Café Guajará;
- o login do Atendente está descrito como nome e senha operacional;
- o PDV foi descrito na forma compacta usada pelo Café Guajará;
- as permissões de Gerência e Superadmin não foram atribuídas ao Atendente;
- todos os procedimentos críticos possuem aviso de atenção.

---

## Fontes recomendadas para adicionar ao NotebookLM

Para obter um resultado mais preciso, adicione ao notebook:

- capturas de tela de cada menu nos três perfis;
- capturas das telas do Café Guajará em computador, tablet e celular;
- uma demonstração completa de abertura, venda, retirada e fechamento do caixa;
- regras internas da empresa sobre cancelamentos, retiradas e conferência;
- nomes e contatos oficiais para suporte;
- este arquivo como fonte complementar.
