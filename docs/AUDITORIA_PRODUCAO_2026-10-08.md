# Auditoria de produção — Gelato Tamandaré

Data: 08/10/2026, America/Fortaleza. Base: árvore local de trabalho, incluindo alterações ainda não commitadas. Auditoria do código, regras locais, dependências, builds e testes isolados. Não foram alterados dados, regras ou sites em produção.

## Parecer

**Não recomendo liberar esta versão para produção antes de corrigir os bloqueadores de segurança e integridade financeira.** Os builds passam, mas isso não garante segurança nem consistência do negócio. Não há base para declarar o sistema “100% pronto”.

As falhas de regras abaixo foram reproduzidas no emulador com as regras locais e dados fictícios. Isso confirma o comportamento dessas regras, mas não confirma que elas são as mesmas atualmente publicadas no Firebase. Não foi feita leitura do banco real nem teste de invasão contra o site publicado.

## Verificações executadas

| Verificação | Resultado | Limite |
|---|---|---|
| Build Gelato | Passou | Compilação, sem homologação operacional |
| Build Café Guajará | Passou | Mesmo limite |
| Build das telas Android | Passou | Não equivale a compilar/instalar novo APK nesta auditoria |
| ESLint de `src`, Vite e configuração ESLint | Passou | Sem validação de regra de negócio |
| `npm run lint` | Falhou: 1.316 erros, 1 aviso | Inclui arquivos gerados do Android; não são 1.316 defeitos independentes do produto |
| Teste do comprovante | Passou | Texto, largura, KG, acentos e pagamentos; sem papel físico |
| Teste do anexo de NF | Passou | Formatos, tamanho e persistência com mocks |
| Emulador Firestore | 2 bloqueios básicos corretos; 9 cenários inseguros reproduzidos | Regras locais, projeto `demo-gelato-audit` |
| Emulador Storage | Upload/leitura autorizados e 4 negativas passaram; acesso de inativo reproduzido | Não valida IAM/bucket real |
| Reprodução financeira em memória | 3 situações inconsistentes reproduzidas | Test double das chamadas Firebase, executando o serviço real |
| `npm audit` | 39 pacotes sinalizados: 4 críticos, 16 altos, 16 moderados, 3 baixos | Não significa 39 explorações comprovadas |
| `npm audit --omit=dev` | 26 pacotes sinalizados: 4 críticos, 7 altos, 14 moderados, 1 baixo | Inclui dependências de scripts Node, além do app |

Os scripts de reprodução são instrumentos de auditoria: algumas asserções confirmam que a vulnerabilidade existe. **Saída zero desses scripts não significa aprovação de segurança.** Após corrigir, converter os cenários para exigir rejeição e usá-los como testes de regressão.

## Bloqueadores de produção

### A01 — Crítico: suporte aberto sem autenticação

Evidência: `firestore.rules:233`, serviço `src/services/suporte.js`.

As conversas permitem leitura, criação e atualização com `if true`; mensagens permitem leitura e criação pública. O emulador permitiu ler e alterar uma conversa sem token, HTTP 200 (F01/F02). Há exposição de conteúdo, possibilidade de falsificação e consumo abusivo de armazenamento/leitura. Não foi consultado conteúdo real.

Correção: autenticação obrigatória, vínculo do usuário à conversa, acesso administrativo explicitamente autorizado, validação de remetente/tamanho e bloqueio de alterações em campos de identidade. Testar usuário comum, outra conta, outro estabelecimento, administrador e não autenticado.

### A02 — Crítico: senhas operacionais em texto acessível aos operadores

Evidência: `src/services/atendentes.js:53`, `firestore.rules:131`, `src/screens/Caixa.jsx:839`, `src/screens/Atendentes.jsx:95`.

O documento guarda `senha` em texto, e qualquer usuário com acesso à loja pode ler atendentes. O emulador confirmou que um operador lê o documento contendo senha de outro usuário (F04). O caixa compara senhas no navegador. Para atendentes, a senha operacional também é usada no provisionamento do Firebase Auth, ampliando o impacto.

Correção: retirar senhas dos documentos e das assinaturas de listas. Usar Firebase Auth para identidade e reautenticação; qualquer PIN adicional deve ser verificado em serviço confiável, com hash e limitação de tentativas. Migrar cadastros e trocar credenciais expostas. Apenas colocar hash no cliente não resolve autorização server-side.

### A03 — Crítico e condicionado ao cadastro: apropriação de superadmin legado

Evidência: `firestore.rules:72`, `firestore.rules:100`, `src/App.jsx:1134`.

Uma conta autenticada pode criar seu próprio `acessos_painel` como superadmin apontando para um atendente superadmin com `authUid` vazio. Não há comprovação de propriedade desse cadastro. Reprodução F09: usuário sem acesso reivindicou o cadastro fictício e recebeu HTTP 200. A condição necessária é existir um superadmin legado sem vínculo e conhecer seu ID; sua existência no banco real não foi verificada.

Correção: bootstrap fora do cliente, por procedimento administrativo confiável e de uso único. Remover a exceção depois da migração. Conferir todos os cadastros legados e vínculos antes da publicação.

### A04 — Alto: desativação não revoga acesso no servidor

Evidência: `firestore.rules:13`, `storage.rules:76`, `src/App.jsx:351`.

As regras verificam existência/perfil/loja, mas não exigem `ativo == true`. Um acesso fictício desativado continuou lendo produtos (F03) e notas fiscais (S07). A tela bloqueia alguns fluxos, mas não protege chamadas diretas; `accessUser` também pode derivar de atendente ativo independentemente do `ativo` de `panelAccess`.

Correção: exigir acesso ativo em todas as funções de autorização de Firestore/Storage. Desabilitar conta/revogar sessões quando apropriado e testar uma sessão já aberta após desativação.

### A05 — Alto: operadores podem apagar e forjar operações financeiras

Evidência: `firestore.rules:179`, `firestore.rules:203`, `firestore.rules:209`, `firestore.rules:215`.

O acesso à loja é suficiente para excluir vendas, caixas, retiradas e resumos em diversas coleções. Não há validação de valor positivo, vínculo entre caixa/atendente/produto, caixa aberto, soma dos pagamentos ou autoria. O emulador permitiu um operador excluir venda (F06) e criar venda de valor negativo sem caixa (F07). A senha de gerência na tela não impede chamadas diretas.

Correção: matriz de permissões aplicada no backend/regras; operações financeiras validadas em serviço confiável, com IDs idempotentes. Preferir estorno auditável à exclusão física. Separar leitura, lançamento, ajuste e cancelamento.

### A06 — Alto: estoque pode ser arbitrariamente alterado pelo operador

Evidência: `firestore.rules:160`, `src/screens/Caixa.jsx:1285`.

A exceção para atualização somente de `estoque` não restringe valor, transição ou vínculo com venda. F05 permitiu estoque -99 sem movimentação. O atendimento precisa baixar estoque, mas esse poder não deve permitir escolher qualquer saldo.

Correção: baixa vinculada à venda validada e transacional, ajuste com autorização/motivo e validação de saldo não negativo. Cobrir também estoque inicial, KG e valores não finitos no serviço e nas regras.

### A07 — Alto: perda de totais nos agregados diários

Evidência: `src/services/vendas.js:103`, `src/services/vendas.js:138`, `src/services/vendas.js:160`.

`ensureDailyDocs` chama `setDoc(..., { merge: true })` com zeros mesmo quando o documento já existe. Merge preserva campos omitidos, mas não os valores enviados. A reprodução F10 executou duas vendas de 10 e 20: o resumo terminou com 20, em vez de 30. Em seguida, despesa de 5 zerou as vendas e deixou resultado -5, em vez de 25. O mapa vazio do ranking também precisa ser tratado.

As telas examinadas em grande parte recalculam pelos documentos de vendas/despesas; não se deve concluir que todo relatório visível usa o agregado errado. Os agregados e qualquer consumidor deles estão comprometidos.

Correção: inicialização apenas quando inexistente e atualização atômica; reconciliar dados históricos por loja após corrigir. Não executar o backfill atual como solução, pois ele também tem problemas (A16).

### A08 — Alto: venda, baixa e resumo não formam uma operação atômica

Evidência: `src/screens/Caixa.jsx:1258`, `src/services/vendas.js:199`.

Cada item é gravado em sequência, seguido da baixa por saldo absoluto. `addVenda` grava o documento antes de atualizar os agregados. Reprodução F11: falha no agregado fez a função rejeitar, mas a venda permaneceu salva. A tela pode oferecer nova tentativa com o carrinho anterior. Um segundo item pode falhar depois do primeiro já gravado. Dois terminais que leem saldo 5 e vendem 1 podem gravar ambos saldo 4, em vez de 3.

Correção: transação da venda completa com estoque, vínculo do caixa e identificador de operação estável. Atualizar agregados na mesma transação ou por processamento idempotente confiável. Testar falha em cada etapa, retry, duplo clique, dois dispositivos e venda concorrente com fechamento. [Referência de atomicidade do Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions).

### A09 — Alto: permissões de lojas podem ser ampliadas pelo próprio gestor

Evidência: `firestore.rules:112`, `src/App.jsx:328`, `src/screens/Atendentes.jsx:90`.

As regras preservam `lojaId` no update, mas não restringem `lojaIds`. F08 confirmou gestor originalmente da loja A adicionando a loja B ao próprio acesso. O cliente também tenta liberar todas as lojas carregadas para a gerência. Se gerência global for a política desejada, torná-la explícita no servidor; se houver gerência por unidade/rede, isso permite ultrapassar o escopo autorizado.

Correção: gestão de concessões somente por autoridade superior; validar cada loja autorizada e preservar isolamento entre redes. Não confiar no filtro de rede do frontend.

### A10 — Crítico no APK: dependência Capacitor vulnerável

Evidência: lockfile e dependência `@capacitor/android` 7.6.8.

A versão usada na integração recente está na faixa vulnerável do aviso GHSA-rvm3-566m-v7fv. O fabricante informa que conteúdo remoto pode executar na origem do app e alcançar capacidades nativas após navegação por link malicioso. Atualizar a linha 7 para versão corrigida, no mínimo 7.6.9 para esse aviso, manter pacotes compatíveis e recompilar/redistribuir o APK. Não foi criada exploração contra o aplicativo. [Aviso oficial do Capacitor](https://github.com/ionic-team/capacitor/security/advisories/GHSA-rvm3-566m-v7fv).

## Outros problemas e melhorias

### A11 — Alto: falha de impressão no PWA pode induzir repetição da venda

Evidência: `src/screens/Caixa.jsx:1304`, `src/services/comprovanteTermico.js:36`.

No navegador, a venda já foi gravada quando a impressão tenta abrir um popup. Se bloqueado, a exceção chega ao catch de “não foi possível registrar”, sem limpar o carrinho. O tratamento seguro de impressão implementado no Android não é aplicado ao PWA, que foi preservado conforme solicitado. Correção: desacoplar registro e impressão também na web, com confirmação de venda salva e reimpressão por ID sem nova gravação.

### A12 — Alto: fechamento, sangria e abertura têm corrida entre dispositivos

Evidência: `src/services/caixas.js:45`, `src/services/caixas.js:60`, `src/services/caixas.js:209`, `src/screens/Caixa.jsx:902`.

Abertura usa IDs aleatórios sem exclusividade transacional. Fechamento aceita totais calculados pelo cliente, sem bloquear vendas/sangrias concorrentes. Sangria verifica saldo apenas na tela. Dois pedidos simultâneos podem superar disponibilidade; venda pode ocorrer depois do cálculo de fechamento. Correção: estado e totais validados em transação/backend, regras de transição e exclusividade conforme política operacional.

### A13 — Alto: cancelamentos e exclusão de caixa não são seguros para retry

Evidência: `src/screens/Relatorio.jsx:707`, `src/services/caixas.js:150`.

Cancelamento grava um lançamento e depois apaga venda em operações separadas; o fluxo examinado não repõe estoque. É necessário definir se o cancelamento significa devolução ou perda, registrando a movimentação correspondente. Exclusão de caixa repõe estoque antes de apagar vendas; uma falha parcial e nova tentativa podem repor novamente. Exclusão física ainda prejudica rastreabilidade. Correção: estorno idempotente com motivo, autor, referências e ajuste coerente dos totais/estoque.

### A14 — Alto para decisão gerencial: “em caixa” e “lucro” misturam conceitos

Evidência: `src/utils/financeiro.js:25`, `src/screens/Relatorio.jsx:261`.

O saldo inclui vendas PIX/cartão junto ao fundo, embora não sejam dinheiro físico. Reprodução F12: venda PIX 100 + fundo 10 resulta em `emCaixa = 110`. Isso pode ser um saldo financeiro do período, mas precisa ter nome e escopo claros; não é dinheiro na gaveta nem saldo bancário conciliado. O cálculo chamado lucro subtrai despesas e retiradas, sem custo histórico dos itens vendidos. Sangria pode ser transferência, não despesa.

Correção: distinguir dinheiro físico, recebíveis, receitas, despesas, transferências e margem. Gravar custo/preço histórico na venda e definir a política de entradas consolidadas para não contar receita duas vezes. Validar os conceitos com quem acompanha o financeiro. Este relatório não certifica cálculo contábil/fiscal.

### A15 — Alto: pagamentos mistos podem ficar diferentes do total

Evidência: `src/screens/Caixa.jsx:1226` e `src/screens/Caixa.jsx:1233`.

Se existir qualquer dinheiro, a validação de igualdade dos pagamentos é relaxada; o excesso é descontado somente do dinheiro. Exemplo por leitura do código: venda 100, PIX 150 e dinheiro 1 calcula troco 51, zera o dinheiro e ainda registra PIX 150. Falta impedir excesso não compensável pelo dinheiro. Há também rateio proporcional arredondado por item; o último recebe resíduo, e parcelas negativas são descartadas. Dinheiro usa ponto flutuante.

Correção: validação explícita de troco limitado ao dinheiro recebido, soma final em centavos, rateio que preserve os totais e testes de muitas parcelas/itens baratos. Para KG, separar precisão da quantidade e da moeda.

### A16 — Alto se executado: backfill mistura lojas e usa esquema antigo

Evidência: `scripts/backfill-agregados.mjs:52`.

O script lê todas as lojas, agrupa somente por data e grava documentos com ID de data, sem `uid`. O serviço atual usa `${uid}__${data}` e as regras dependem de `uid`. Além disso, usa um único batch sem segmentação para grande histórico. Não foi executado contra o banco real.

Correção: agrupar por loja/data, respeitar esquema atual, limitar batches, incluir dry-run, backup e relatório de reconciliação. Executar migração somente depois de corrigir a escrita dos agregados.

### A17 — Médio: consultas leem todo o histórico e filtros são locais

Evidência: `src/services/vendas.js:29`, `src/services/caixas.js:21`, `src/services/produtos.js:168`, `src/App.jsx:300`.

Consultas de período/caixa frequentemente filtram apenas por loja no servidor. A tela recebe o histórico inteiro e filtra data/caixa em JavaScript. Movimentações mostram 30, mas o listener busca tudo. Há múltiplos listeners do histórico. Correção: filtros de data/caixa/status no Firestore, índices correspondentes, paginação e listeners compartilhados. Medir custo/leitura e latência com volume realista.

### A18 — Médio: notas fiscais precisam de política de retenção e acesso

Evidência: `src/services/notasFiscais.js:16`, `storage.rules:91`, `src/screens/Estoque.jsx:213`.

Os testes do Storage confirmaram tipo/tamanho/permissão para uploads. Porém o acesso de inativo continua válido (A04), e um gestor pode excluir arquivo sem checagem de vínculo (S08). A URL de download tem token compartilhável; guardar somente a URL não oferece revogação granular por usuário. Substituir um anexo preserva o arquivo anterior, mas nem sempre há referência histórica quando a atualização não possui movimentação. Limpeza de upload interrompido depende de tentativa no cliente.

Correção: registro de anexos com vínculos/versionamento, retenção, política de descarte e limpeza de órfãos. Se confidencialidade exigir acesso por sessão, usar download autenticado em vez de link compartilhável. A restrição PWA/Android é de interface/distribuição, não uma fronteira de segurança provada pelo servidor.

### A19 — Médio: provisionamento e cadastro de usuários podem ficar parciais

Evidência: `src/screens/Atendentes.jsx:175`, `src/services/auth.js:22`.

Auth, atendente, acesso de painel e cópias entre lojas são atualizados em sequência. Falha pode deixar cadastro sem acesso, senha divergente ou foto removida apesar de documento parcialmente salvo. Cópias mantêm identidade global e podem divergir em status/permissão. Regras impedem update normal de superadmin existente, enquanto a interface oferece edição pelo superadmin; o bootstrap é exceção estreita.

Correção: provisionamento administrativo confiável com estados e recuperação, identidade única e vínculos por loja. Garantir limpeza de sessão secundária em `finally`. Testar edição/desativação de superadmin e propagação de alterações de acesso entre lojas.

### A20 — Médio: modo de screenshots permanece no build de produção

Evidência: `src/App.jsx:358`.

Query/hash pode liberar telas e perfil gerencial visualmente. As regras ainda protegem dados onde corretas: não é evidência isolada de acesso aos dados de todas as lojas. Mesmo assim, remove a proteção da interface e dificulta avaliar o fluxo real. Correção: permitir somente em desenvolvimento e com fixtures sem escrita real.

### A21 — Médio: PWA sem estratégia de atualização/offline

Evidência: `src/main.jsx`, `public/manifest.json`, ausência de registro de service worker nos arquivos examinados.

Há manifest e aparência standalone, mas não há estratégia explícita de cache, atualização ou venda offline. Não se deve prometer operação offline. Listeners frequentemente não mostram erros ou convertem falha em lista vazia, indistinguível de ausência de dados. Não há uso explícito de metadados de cache/pending writes no fluxo.

Correção: mostrar conexão, dados incompletos e resultado indeterminado; impedir duplicação após falha. Definir atualização de telas com sessão aberta e evitar cache de dados financeiros inadequado. Se offline for necessário, tratar como projeto próprio de sincronização/reconciliação.

### A22 — Médio: maquineta ainda requer homologação e endurecimento

Evidência: `src/services/impressoraNativa.js:18`, `NaviaPrinterPlugin.java:112`, manifesto Android.

Resultado enfileirado não comprova papel; callback tardio pode ser ignorado e a trava JS permanece se a chamada nativa nunca concluir. A classe captura `service`, mas usa o campo mutável `printer` em outras chamadas, vulnerável a desconexão durante o trabalho. Reimpressão mantém apenas o último comprovante em memória. `ultimoComprovante` não é limpo explicitamente nos caminhos de fechamento, podendo sobreviver à troca de caixa na mesma tela. O avanço usa o padrão anterior e precisa de teste físico. Não existe coordenação de fila entre APKs.

Correção: usar conexão consistente, recuperação/status claros, reimpressão por venda persistida e limpeza de sessão. Homologar sem papel, reconexão, aquecimento, concorrência de APKs e atualização. Distribuir release assinado, preservar chave, incrementar versão e revisar backup (`allowBackup=true`) para dispositivo compartilhado. O APK debug anterior não é release homologado.

### A23 — Médio: dependências vulneráveis além do Capacitor

Evidência: `npm audit` e lockfile.

O jsPDF instalado 4.2.0 tem avisos críticos; a correção mínima de um deles é 4.2.1. Nos caminhos lidos predominam `doc.save`, não as saídas para nova janela citadas no aviso de injeção HTML; exploração por esse caminho não foi demonstrada. Há ainda alertas em DOMPurify, React Router, protobufjs, websocket-driver, Vite e dependências de ferramentas/admin. Separar alcance: Vite dev server não equivale ao site estático publicado; firebase-admin está nos scripts, não foi identificado como SDK do frontend.

Correção: atualizar versões compatíveis com revisão do lockfile, repetir auditoria/testes/builds, priorizar runtime e dependências do APK. Não aplicar `npm audit fix --force` indiscriminadamente: há sugestão de mudança major/downgrade de firebase-admin. [Aviso oficial jsPDF](https://github.com/parallax/jsPDF/security/advisories/GHSA-wfv2-pwc8-crg5).

### A24 — Médio: qualidade e operação não têm gates suficientes

Evidência: `eslint.config.js:7`, `package.json`, ausência de `.github` no diretório examinado.

Lint global inclui bundles/bridge gerados do Android. Não há script central de testes nem pipeline CI no repositório examinado. Os testes existentes são pontuais e não cobrem venda concorrente, caixa, revogação ou permissões. Não foi encontrada instrumentação de erros, ErrorBoundary ou procedimento validado de restore. Headers de segurança e configuração do hosting real não foram inspecionados.

Correção: excluir arquivos gerados do lint, pipeline de build/lint/testes de regras/negócio, staging separado, alertas de falha/custo, backup e exercício de restauração. Revisar CSP, restrições de iframe, HTTPS e cache no ambiente publicado. Testar acessibilidade: zoom está desabilitado no viewport e orientação é paisagem.

## Pontos positivos confirmados

- Uso de Firebase Auth para entrada no painel e regras que bloqueiam leitura básica sem login/sem loja para produtos.
- Alteração de estoque gerencial tem transação e proteção contra saldo negativo no serviço.
- PWA atualiza dados do produto e movimentação juntos quando registra ajuste.
- Anexos são opcionais e limitados no cliente e nas regras; a interface não os oferece no APK.
- Impressão nativa separa solicitações enfileiradas da confirmação do callback e informa falha sem repetir a venda no Android.
- HashRouter e fallback do site estão presentes; telas e PDF usam carregamento dinâmico.
- Escape de conteúdo no HTML do comprovante do navegador; não foi observado uso de `dangerouslySetInnerHTML` nos arquivos pesquisados.
- Arquivos `.env*` não apareceram como rastreados no Git na verificação realizada. Configuração pública do Firebase não substitui autorização; não foi feita auditoria completa do histórico de segredos.

## Ordem de correção recomendada

1. **Segurança:** A01–A06, A09 e A10. Antes de novas instalações/publicações, fechar regras públicas, retirar senhas, corrigir bootstrap e revogação, limitar operações e atualizar Capacitor. Definir se gerência é local ou global.
2. **Integridade financeira:** A07–A08 e A11–A16. Venda completa idempotente, estoque transacional, cancelamento/fechamento seguros, pagamento em centavos e reconciliação histórica por loja. Preservar dados existentes.
3. **Disponibilidade e operação:** A17–A24. Consultas eficientes, anexos com retenção, provisionamento recuperável, status de rede, atualização, release/homologação Android, CI, observabilidade e restore.

Não é necessário reescrever todas as telas. A principal mudança deve estar nos serviços que autorizam e gravam operações, acompanhada de ajustes de interface para estados claros de sucesso/falha.

## Critérios para liberar produção

| Área | Evidência exigida |
|---|---|
| Permissões | Matriz positiva/negativa passando nos emuladores: anônimo, operador, gestor, superadmin, inativo, outra loja/rede |
| Venda | Uma operação por ID; retry/duplo clique não duplicam; falha não deixa itens/estoque pela metade |
| Concorrência | Duas vendas simultâneas, saldo insuficiente e fechamento concorrente com venda/sangria |
| Pagamentos | Soma em centavos igual à venda; troco válido; PIX/cartão nunca viram troco fictício |
| Cancelamento | Autorização no servidor, motivo/autor, estorno único e política de estoque testada |
| Financeiro | Conferência manual de cenário conhecido e reconciliação entre itens, pagamentos, caixa e resumos |
| Revogação | Sessão aberta perde acesso ao ser desativada; nenhum PIN/senha exposto nas listas |
| Nota fiscal | Upload real autorizado, falha recuperável, isolamento de loja, retenção e abertura após atualização |
| PWA | Atualização, popup bloqueado, rede instável, erro de carregamento e retomada sem duplicação |
| Maquineta | APK release corrigido instalado; login, papel, acentos, reimpressão e upgrade físico documentados |
| Operação | Regras publicadas conferidas, staging, backup restaurado, monitoramento e rollback exercitados |

## Como reproduzir os testes locais

```powershell
npx eslint src vite.config.js eslint.config.js
npm run build:lojas
npm run build:android
node scripts/test-comprovante.mjs
node --experimental-vm-modules scripts/test-nota-fiscal.mjs
node --experimental-vm-modules scripts/audit-financeiro.mjs
firebase emulators:exec --project demo-gelato-audit --only "firestore,storage" --config firebase.audit.json "node scripts/audit-firestore.mjs && node scripts/audit-storage.mjs"
npm audit
npm audit --omit=dev
```

Os scripts de emulador exigem localhost e projeto demo; escrevem somente dados fictícios. [Documentação de testes das regras](https://firebase.google.com/docs/rules/unit-tests).

## Pendências fora do alcance desta auditoria local

Verificar regras atualmente publicadas, cadastros legados reais, contas Auth, IAM, App Check, quotas, backups/PITR, domínio/headers/TLS, acessos administrativos, banco histórico, conciliação real, desempenho com usuários simultâneos, navegadores/tablets e equipamento físico. Nada disso foi presumido como aprovado ou como inexistente no ambiente remoto.

A auditoria deixou documentação e scripts reproduzíveis; não corrigiu silenciosamente as regras ou mudou as operações. A aprovação final depende de corrigir os bloqueadores, repetir os testes exigindo comportamento seguro e homologar os fluxos reais.
