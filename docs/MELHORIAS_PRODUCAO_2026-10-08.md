# Melhorias de produ??o ? 08/10/2026

## Primeiro conjunto: autoriza??o e depend?ncias

Implementado localmente:
- Firestore exige acesso ao painel com ativo=true para acessar dados das lojas.
- Suporte exige autentica??o e acesso ativo; somente o dono e superadmin podem ler a conversa. Mensagens de administrador n?o podem ser forjadas por operadores; texto limitado a 4000 caracteres.
- Removida a possibilidade de reivindicar superadmin legado por autoatendimento. O primeiro administrador precisa ser provisionado por ambiente confi?vel (Admin SDK/console), com acessos_painel e atendente vinculados ao UID correto.
- Ger?ncia s? pode conceder lojas j? autorizadas. Cadastro respeita esse limite; removida a expans?o autom?tica da pr?pria lista na aplica??o.
- Edi??o de loja exige acesso ? unidade.
- Notas fiscais rejeitam contas inativas. Permiss?o de administrador do Storage passa a usar o mesmo documento de acesso do aplicativo.
- Modo screenshots limitado a desenvolvimento.
- Capacitor atualizado para 7.6.9, jsPDF para 4.2.1, Vite para 7.3.5 e depend?ncias transitivas atualizadas sem for?ar mudan?as principais.
- Lint ignora artefatos Android gerados; encerramento da sess?o secund?ria garantido quando atualiza??o de senha falha.

## Verifica??o

Emuladores de Firestore e Storage no projeto demo-gelato-audit: bloqueios de acesso an?nimo, acesso inativo, amplia??o de lojas e tomada do superadmin confirmados. Controles positivos: dono e superadmin leem suporte; dono envia mensagem; operador n?o pode imitar administrador; gestor envia nota e operador autorizado l? metadados.

Lint, build PWA, build de assets Android e sincroniza??o Capacitor passaram. Testes de nota fiscal (com --experimental-vm-modules) e comprovante passaram. A compila??o mant?m aviso de chunk PDF acima de 500 KB, registrado para a etapa de desempenho.

O script de auditoria ainda reproduz F04-F07 (credenciais, estoque e grava??es financeiras). Seu c?digo de sa?da zero indica execu??o das expectativas documentadas, n?o aprova??o integral de seguran?a. N?o usar esse script como gate de libera??o enquanto houver expectativas de vulnerabilidade.

## Pend?ncias para os pr?ximos conjuntos

1. Remover senhas dos documentos, migrar usu?rios existentes e substituir confirma??es de senha por Firebase Auth. Provisionamento e redefini??o de contas devem ocorrer em backend confi?vel.
2. Migrar venda completa/estoque/caixa para opera??es autoritativas, at?micas e idempotentes no backend; ap?s integra??o, negar grava??es financeiras diretas. N?o bloquear esses writes isoladamente: isso interromperia o PDV atual.
3. Corrigir agregados, pagamentos em centavos, cancelamentos audit?veis, disponibilidade de sangria e saldo f?sico separado de PIX/cart?o.
4. Consultas por per?odo/caixa com ?ndices, pagina??o, observabilidade, rotinas de backup e ensaio de restaura??o.
5. Reten??o de anexos vinculados, an?lise dos 15 alertas de depend?ncias remanescentes e homologa??o f?sica da maquineta/impressora.

## Publica??o

Nenhuma regra, aplica??o ou dado de produ??o foi publicado ou alterado nesta etapa. Antes de publicar estas regras, conferir que contas v?lidas possuem ativo=true e escopos corretos e que o superadmin existente est? vinculado. Homologar o aplicativo novo junto das regras; o cliente antigo tenta ampliar lojas automaticamente.

A atualiza??o Android foi sincronizada ao projeto nativo. Compila??o de assets/sync n?o equivale a validar a impress?o em equipamento real. O projeto ainda n?o est? aprovado integralmente para produ??o.


## Etapa seguinte implementada

Credenciais, backend financeiro, consultas e homologacao local: veja [relatorio atualizado](SEGURANCA_E_FINANCEIRO_2026-10-08.md). A lista anterior registra a situacao do primeiro conjunto; o novo documento descreve as correcoes e o que ainda depende de publicacao/migracao.
