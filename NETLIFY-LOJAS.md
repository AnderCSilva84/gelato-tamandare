# Deploys separados das lojas no Netlify

Use dois sites Netlify ligados ao mesmo repositorio. Cada site executa somente o build de sua loja.

## Gelato Tamandare

- Build command: `npm run build:gelato`
- Publish directory: `dist/gelato-tamandare`
- Dominio: mantenha o dominio atual do Gelato neste site.

## cafe-guajara

- Build command: `npm run build:cafe-guajara`
- Publish directory: `dist/cafe-guajara`
- Dominio: vincule o dominio do cafe-guajara neste segundo site.

Os dois sites usam o mesmo projeto Firebase, mas cada build fica permanentemente vinculado ao seu `lojaId`:

- Gelato: `gelato-local`
- cafe-guajara: `cafe-guajara`

O arquivo `public/_redirects` garante que as rotas do React funcionem ao atualizar a pagina diretamente no Netlify.

Para adicionar outra loja, crie um arquivo `.env.<modo>`, um script `build:<loja>` no `package.json` e configure um novo site Netlify com a pasta de saida correspondente.
