# Compatibilidade do login por nome — 08/10/2026

O aplicativo local consultava `logins_atendentes` antes de autenticar. As regras locais permitem obter um alias, mas as regras publicadas ainda negam essa consulta sem login: HTTP 403 confirmado para alias fictício no projeto correto. Isso apresentava `Missing or insufficient permissions` antes de conferir a senha.

O resolvedor agora usa o endereço determinístico de Auth quando a consulta opcional retorna `permission-denied`. Continua usando aliases autorizados para nomes alterados; erros de rede não são mascarados. A senha permanece validada exclusivamente pelo Firebase Auth e as verificações de ativação, função e loja no painel continuam obrigatórias. Nenhuma regra publicada ou conta foi modificada.

A conferência administrativa somente de leitura encontrou seis cadastros com função atendente, todos com conta vinculada e endereço Auth compatível com o cálculo. Foram exibidas apenas contagens, sem nomes, emails, senhas ou hashes. Isso não verifica a senha fornecida pela usuária nem equivale a um login real.

Teste automatizado cobre regras legadas negando alias, ausência de alias, alias de nome alterado e erro de rede. Lint e builds das duas lojas passaram. A correção está local e é carregada pelo Vite; a versão publicada ainda depende da ativação coordenada.
