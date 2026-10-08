# Identidade PDV ACS

O nome do sistema é **PDV ACS**, com assinatura **Gestão e Vendas**. Café Guajará, Gelato e Sabor & Açaí são unidades cadastradas no sistema; suas logomarcas, permissões, identificação em comprovantes e dados financeiros continuam pertencendo às unidades.

A identidade foi aplicada no login, menu, saudação, título do navegador, manifestos das duas distribuições PWA e nome/ícones do aplicativo Android. O título combina `PDV ACS | nome da unidade` para identificar a loja ativa. Os identificadores técnicos do Firebase, aplicativo Android e armazenamento de sessões continuam os mesmos, preservando a instalação e os dados existentes.

Os arquivos originais vieram de `ACS_Brand_Kit_Master/pdv-acs`: SVGs horizontal e ícone e PNGs de logo/ícones. Os SVGs fornecidos pelo kit contêm PNGs incorporados, sem desenho vetorial puro. A interface usa a logo horizontal SVG sem distorção; PWA e Android usam os PNGs quadrados originais por compatibilidade. Os arquivos de Radar ACS indicados posteriormente não foram usados, pois correspondem a outra marca.

Após a observação do usuário sobre o fundo da logo, foi preparada uma versão PNG transparente com a ferramenta de edição de imagem, usando a logo original como referência. Login e menu usam `pdv-acs-horizontal-transparent.png`. Ela tem transparência e não é um SVG vetorial; os arquivos originais permanecem disponíveis. Os ícones de instalação continuam sendo os arquivos quadrados do kit.

O usuário também pediu um ícone que exiba o nome PDV ACS. Foi criada a versão quadrada `pdv-acs-app-icon.png`, com carrinho e letras PDV/ACS, aplicada ao favicon, Apple Touch Icon, aos dois manifestos PWA e aos recursos de launcher Android. O ícone do kit contendo somente o carrinho foi substituído nas referências ativas. O fundo claro do ícone é próprio do aplicativo; a logo horizontal de login/menu continua transparente.

Os recursos públicos ficam em `public/branding`. Os manifestos receberam versões novas na referência HTML. Navegadores podem demorar a atualizar nome/ícone de PWA já instalado; conferir após publicar. Não remover instalações nem trocar o ID do aplicativo para forçar atualização.

Esta mudança prepara a identidade visual localmente. Não cria lojas, altera nomes no Firestore, une redes, libera permissões ou publica aplicativos. A estrutura e os filtros existentes continuam valendo para cada distribuição.

Validação em 08/10/2026: lint, builds Gelato e Café e compilação Android debug concluídos. Conferidos título e manifesto nos dois builds e presença da logo SVG nos assets Android. Prévias de login em 1366px e 390px foram inspecionadas; recursos preservam a proporção original. O APK de homologação está em `android/app/build/outputs/apk/debug/app-debug.apk`; publicação e impressão física não foram realizadas nesta mudança.
