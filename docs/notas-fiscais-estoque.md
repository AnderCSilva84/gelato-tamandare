# Anexos de notas fiscais no estoque

Somente no navegador/PWA, o cadastro/edição de produtos permite selecionar uma nota fiscal em PDF, JPG, PNG ou WebP com até 10 MB. O campo é opcional. No Capacitor Android, upload e links de notas ficam ocultos, e o fluxo anterior de atualização do estoque é preservado.

O arquivo é enviado ao Firebase Storage em `notas_fiscais/{lojaId}/{arquivoId}`; nome, tipo, tamanho, caminho e URL ficam no campo `notaFiscalAnexo` do produto. Em uma movimentação com novo arquivo selecionado, os mesmos dados e o número da nota também são gravados no histórico. Substituir o anexo do produto preserva o arquivo anterior para o histórico. Copiar o produto para outra loja não copia o anexo.

No PWA, a atualização do produto e a movimentação são feitas na mesma transação. O upload ocorre antes da gravação; se ele falhar, o lançamento não é gravado. Se a gravação falhar, é tentada a remoção do arquivo enviado sem vínculo.

As novas regras do Storage consultam `acessos_painel`: leitura para usuários com acesso à loja e envio/exclusão para gerência, superadmin ou usuário com `podeGerenciarProdutos`. Tipos e tamanho são limitados também nas regras. A integração segue a [documentação de upload do Firebase](https://firebase.google.com/docs/storage/web/upload-files) e de [acesso ao Firestore pelas regras do Storage](https://firebase.google.com/docs/reference/security/storage).

Para disponibilizar a alteração, publicar a versão web e as regras:

```powershell
firebase deploy --only storage
```

A primeira publicação de regras que consultam o Firestore pode exigir habilitar a permissão de integração entre os serviços. As regras não foram publicadas automaticamente nesta implementação. Validar com usuário autorizado em uma loja: cadastrar com PDF, registrar nova entrada com imagem, abrir o anexo no histórico, substituir a nota sem perder a anterior, tentar arquivo inválido/acima do limite e conferir ausência da opção no APK.
