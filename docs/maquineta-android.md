# Gelato na maquineta VT-Q2i

A versão Android é uma distribuição adicional. O site mantém seus comandos de build, telas e impressão pelo navegador em 80 mm. O APK tem identidade `com.acsinformatica.gelato`, versão 1.0/código 1, e incorpora as telas em `dist/android-gelato`. Não há publicação automática do site nem instalação automática no equipamento.

## Compilar

Requisitos: Node 20+, JDK 21 e Android SDK com plataforma 35. Configure `android/local.properties` com o caminho do SDK (`sdk.dir=C:/caminho/android-sdk`); esse arquivo é local e ignorado pelo Git.

```powershell
npm ci
npm run android:apk
```

APK: `android/app/build/outputs/apk/debug/app-debug.apk`. Para instalar em um dispositivo autorizado:

```powershell
adb devices
adb -s SERIAL install -r android/app/build/outputs/apk/debug/app-debug.apk
```

Para distribuição, gerar release assinado, guardar a chave e incrementar `versionCode`. Atualizar preservando assinatura e applicationId. As telas são locais: alterações exigem novo APK. A conexão com Firebase e as regras existentes continuam necessárias; não foram implementadas vendas offline.

## Impressão

No Android, `comprovanteTermico.js` encaminha texto de 32 colunas para `NaviaPrinter`, registrado em `MainActivity`. O plugin conecta ao serviço `com.iposprinter.iposprinterservice`, ação `com.iposprinter.iposprinterservice.IPosPrintService`, via Binder/AIDL. As interfaces foram copiadas do NAVIA sem alterar a ordem/assinatura dos métodos. O adaptador também preserva suporte a imagem e QR, mas o comprovante do Gelato envia somente texto.

O comprovante inclui loja, identificação da venda, atendente, caixa, itens, quantidade em KG/unidades, total, pagamentos e troco. A largura física e os acentos devem ser conferidos na bobina de 58 mm.

Os status sem papel, superaquecimento e ocupação são propagados. Não há troca automática para outra impressora quando o serviço falha. Uma trava impede solicitações simultâneas neste aplicativo; outros APKs compartilham o serviço e precisam de teste de concorrência.

O resultado `printed: true` corresponde ao callback de sucesso do serviço. `printed: false, queued: true` indica retorno da chamada sem callback final. Após 12 segundos, `pending: true` libera a tela sem cancelar ou reenviar o trabalho. Nenhum desses retornos substitui a conferência física do papel. A trava JS permanece até a promessa nativa concluir.

Somente no APK, uma falha de impressão depois do registro da venda informa que a venda já foi salva. O botão “Reimprimir último comprovante” usa os dados daquela venda sem gravar uma nova operação. Ele fica disponível na sessão atual da tela e é limpo ao reiniciar a sessão do caixa; não é um histórico persistente.

## Reutilizar e homologar

Para outro sistema, configurar identidade própria no Capacitor/Gradle, copiar plugin e AIDL, registrar o plugin, habilitar AIDL e declarar as queries do serviço. Adaptar o texto do comprovante. Referência do registro de plugins: [documentação Capacitor](https://capacitorjs.com/docs/android/custom-code).

Antes de colocar em operação, testar no equipamento: abertura e login, venda e impressão, nomes longos e acentos, KG, pagamentos mistos e troco, falta de papel e reimpressão, cliques repetidos, alternância com outros APKs e atualização preservando dados. Registrar modelo, firmware, versão e resultado físico. A compilação local não homologa a impressora.
