# Ativação do PWA — 08/10/2026

## Autorização e janela

O responsável confirmou que todas as lojas estavam sem atendimento, que o login Adm funcionava na homologação e que o acesso leticia@icoaraci continuava em uso. Autorizou expressamente o backup completo do Firestore, incluindo dados pessoais, históricos financeiros e senhas legadas, para o bucket privado gelato-cb6fd-resgate.

## Proteção e migração concluídas

- Backup completo: `gs://gelato-cb6fd-resgate/firestore/preproducao-20261008`; exportação bem-sucedida, 18.027 documentos, 12.166.964 bytes.
- Backups de Auth e Storage atualizados e verificados antes da migração.
- Zero caixas abertos antes e depois da migração.
- Dez cadastros migrados, sem pendências; removidas as senhas legadas em texto do cadastro de atendentes.
- Todos os 17 usuários do Auth preservados, com as mesmas senhas e estados de ativação.
- Os dois perfis existentes de Letícia mantêm seu vínculo original com o cadastro de atendente de Sabor & Açaí. Nenhuma conta duplicada foi excluída ou teve senha alterada.
- Master permanece com perfil gerência e escopo Gelato/Sabor & Açaí. Não recebeu acesso ao Café Guajará ou às configurações globais reservadas a superadmin.
- Atualizados 292 resumos diários e 292 rankings; o processo não altera os registros originais de vendas, despesas ou caixas.
- Compilações dos dois PWAs e lint aprovados; teste do resolvedor de login aprovado com `node --experimental-vm-modules scripts/test-login-atendente.mjs`.

## Publicação

Concluída em 08/10/2026 às 22:13, horário de Fortaleza (09/10/2026 às 01:13 UTC). Operações financeiras liberadas após confirmar a função ativa, os 11 índices prontos e a publicação dos dois sites.

- Backend `operacaoGelato`: Node.js 22, região southamerica-east1, zero instâncias mínimas e limite de dez instâncias.
- Regras de Firestore e Storage publicadas com sucesso. Integração Storage-Firestore configurada para o agente do próprio projeto.
- A criação e a exclusão pública de contas estão desabilitadas; os logins existentes e o provisionamento pelo backend permanecem disponíveis.
- Limpeza das imagens antigas de compilação configurada para um dia. A primeira publicação do backend retornou código 1 somente por ausência dessa política: a função já estava ativa. A configuração posterior da política terminou com sucesso.
- Gelato/Sabor: deploy `6ac83ee7321c0426f1ce58f2`.
- Café Guajará: deploy `6ac83ef31b69b058b6159a38`.
- HTML e JavaScript principal publicados conferidos por SHA-256 contra os arquivos locais. Manifestos disponíveis, com tema do Café Guajará preservado.
- Chamada anônima ao backend rejeitada com HTTP 401; nenhuma venda ou movimentação financeira de teste criada em produção.
- Sessão existente de Adm carregou os dois sites. Conferidos visualmente o tema e dashboard do Café Guajará e o seletor exclusivo de Gelato/Sabor & Açaí.

Sites separados: Gelato/Sabor & Açaí em `gelatotht.netlify.app`; Café Guajará em `cafe-guajara.netlify.app`, preservando sua identidade visual.

## Verificação operacional após publicação

No retorno ao atendimento, entrar novamente com Master, validar um acesso de atendente de cada loja e confirmar o acesso usado por Letícia. Fechar e reabrir os PWAs nos dispositivos para carregar a versão atual, conferir abertura de caixa, registrar uma venda real durante o atendimento e conferir estoque e pagamentos. Testar anexo de nota no PWA com um documento real e a impressão no equipamento utilizado pela loja.

Essas verificações operacionais não são substituídas pelos testes automatizados da homologação. O aplicativo Android permanece para uma etapa posterior.
