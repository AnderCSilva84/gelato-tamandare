# Homologação PDV ACS — resultado de 08/10/2026

Prévias corrigidas, mantendo proprietários e identidades visuais separados:

- Gelato / Sabor & Açaí: https://6ac836a75525baedd91897b2--gelatotht.netlify.app/
- Café Guajará sozinho: https://6ac836b5d7bd0df207fd7268--cafe-guajara.netlify.app/

A prévia antiga `6ac827ef36cbba6ed52f8c59` usava filtro de rede vazio e omitira logos/capas da cópia de teste. Foi substituída por estas duas referências para homologação; seu endereço antigo é uma versão histórica e não deve ser usado nos testes atuais. A produção não foi alterada. Os builds agora usam `gelato`/`redeId: gelato` e `cafe-guajara`/`redeId: emporio`, respectivamente. O modo Café preserva seu tema, layout compacto e manifesto próprio. Logos e capas foram copiadas como imagens incorporadas e conferidas por igualdade com a origem; nenhuma URL de Storage de produção foi introduzida nas prévias. A seleção no navegador mostrou Café sozinho e somente Gelato / Sabor & Açaí na outra prévia; a troca para Sabor & Açaí foi conferida. Evidências: `homolog-branding-2026-10-08.json` e `deploy-homolog-redes-2026-10-08.json`.

Firebase separado: `pdv-acs-homolog-20261008`, vinculado à mesma conta de faturamento da produção mediante autorização expressa. Banco e Storage em `southamerica-east1`. Foram preparadas três lojas, dez cadastros e produtos fictícios; não foram copiados vendas, estoque histórico ou caixas reais.

O deploy principal Netlify permaneceu `6a87926e8605cb4c6d1aa951`, em `pdvacs.acstech.dev.br`. Nenhuma senha, venda, estoque, caixa ou regra de produção foi alterada.

## Recuperação e acessos

O backup privado foi conferido por geração, tamanho e SHA-256. As 17 contas foram restauradas preservando identificadores, e-mails, situação de bloqueio, hashes, salts e atributos personalizados, sem sobrescrita. Oito logins usando a senha legada disponível foram confirmados. Uma senha legada retornou `INVALID_LOGIN_CREDENTIALS`; nenhuma senha foi redefinida. Isso não confirma login de todas as 17 contas.

Existe um grupo de três contas ativas com o mesmo e-mail, correspondente a duas duplicidades adicionais. Todas foram preservadas sem fusão. A opção de e-mails duplicados está desabilitada em ambos os projetos. É necessário revisar esse histórico antes de excluir ou associar identidades.

O vínculo confirmado de Wesley à conta Master foi reproduzido como `gerencia`, somente nas duas lojas autorizadas, e conferido contra o plano privado. Não houve promoção a superadmin.

## Testes aprovados

- Login e backend autenticados; chamadas anônimas, operações em outra loja e escrita financeira direta bloqueadas.
- Gerência impedida de alterar configuração do sistema; superadmin autorizado.
- Venda e repetição do mesmo pedido sem duplicar baixa de estoque; sangria, estorno repetido, devolução de estoque e fechamento conferidos; venda em caixa fechado bloqueada.
- Nota PDF fictícia enviada pela gerência e lida pelo atendente autorizado; acesso anônimo, envio sem permissão, envio para outra loja e HTML bloqueados.
- Contas temporárias e dados criados pelo teste removidos. Lint aprovado. Tela de acesso, logo e identificação de testes conferidas no Chrome.

O teste de anexo encontrou uma permissão ausente: a CLI Firebase pula a concessão de integração entre serviços no modo não interativo. Foi concedido `roles/firebaserules.firestoreServiceAgent` somente ao agente de Storage da homologação. Após propagação, os testes passaram. O script de preparação agora configura essa integração. [Documentação oficial](https://firebase.google.com/docs/rules/manage-deploy).

## Consumo e separação

Backend Node.js 22 com máximo de uma instância, mínimo zero e concorrência dez. Imagens de deploy têm limpeza após um dia. Esses limites reduzem consumo, mas não são teto monetário de cobrança.

Build exclusivo em `dist/homolog`, faixa de homologação, manifesto ACS Teste e bloqueio de indexação. Verificação automática não encontrou referência ao projeto de produção nos arquivos JavaScript. Configuração privada e logs ficam em diretórios ignorados; `.netlify/` também foi ignorado. O lint exclui cópias geradas em `artifacts/`, mantendo a verificação do código fonte.

Scripts: `restore-auth-homolog.mjs`, `prepare-homolog.mjs`, `build-homolog.mjs` e `test-homolog-cloud.mjs`. Evidências agregadas, sem credenciais: `restore-auth-homolog-2026-10-08.json`, `prepare-homolog-2026-10-08.json`, `build-homolog-2026-10-08.json`, `deploy-homolog-2026-10-08.json` e `test-homolog-cloud-2026-10-08.json`.

## Antes da ativação real

1. Conferir o login atual da conta cuja senha legada falhou e revisar as contas com e-mail repetido.
2. Homologar o uso na prévia, incluindo Master nas duas lojas, anexo de estoque no PWA e impressão. A impressora interna ainda exige teste físico na maquineta.
3. Na janela sem atendimento, repetir preflight, atualizar backups e executar a ativação coordenada de backend, migração, agregados, regras e cliente.
4. Validar as operações em produção antes de liberar atendimento.

A homologação publicada não encerra todas as pendências da auditoria. Foram utilizados os procedimentos das skills Netlify deploy e computer-use.
