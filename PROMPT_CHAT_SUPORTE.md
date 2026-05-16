# Prompt para Implementação de Chat de Suporte - Gelato Tamandare

## Contexto do Projeto

Este é um projeto **React 19** com **Vite** e **Firebase (Firestore)** como banco de dados.

**Stack atual:**
- React 19.2.0
- React Router DOM 6.30.0
- Firebase 12.11.0
- React Icons 5.5.0

**Estrutura de pastas:**
```
src/
├── components/      (componentes reutilizáveis)
├── screens/         (telas da aplicação)
├── services/        (lógica de BD e autenticação)
├── styles/          (CSS)
└── utils/           (funções auxiliares)
```

---

## Tarefa: Implementar Chat de Suporte Integrado

### Requisitos Obrigatórios

✅ **Otimização crítica:** NÃO deve aumentar o número de leituras do Firestore
- Use listeners em tempo real APENAS quando necessário (usuario tenha chat aberto)
- Implemente cache local para evitar re-queries
- Use estrutura de dados eficiente

✅ **Componente Cliente (Widget Flutuante)**
- Botão flutuante no canto inferior direito
- Abre/fecha modal com conversa
- Mostra histórico de mensagens
- Input para digitar mensagens
- Apenas para usuários logados
- Deve ter visual que combine com o design atual (glass morfismo)

✅ **Serviço Firestore** (`src/services/suporte.js`)
- Criar nova conversa quando usuário enviar primeira mensagem
- Salvar mensagens com: remetente, texto, timestamp
- Listener apenas quando chat está aberto
- Estrutura otimizada no BD

✅ **Tela Administrativa** (`src/screens/Suporte.jsx`)
- Listar todas as conversas abertas
- Expandir conversa para ver histórico
- Responder mensagens em tempo real
- Marcar conversa como resolvida
- Apenas acessível para usuários com role "admin" ou "gerencia"

✅ **Integração**
- Adicionar item "Suporte" no NAV_ITEMS do App.jsx (apenas para gerentes/admin)
- Usar sistema de roles existente (`access.js`)

---

## Estrutura de Dados no Firestore

```
/conversas/{conversaId}/
  ├── usuarioEmail: string
  ├── usuarioUid: string
  ├── usuarioNome: string
  ├── criadoEm: timestamp
  ├── ultimaMensagem: timestamp
  ├── ativo: boolean
  ├── respondidoPor: string (opcional)
  └── /mensagens/{msgId}/
      ├── remetente: string (email do usuário ou "admin")
      ├── texto: string
      ├── timestamp: timestamp
      └── lido: boolean

```

---

## Implementação Esperada

### 1. Serviço: `src/services/suporte.js`

Funções necessárias:
```javascript
// Enviar mensagem e criar conversa se não existir
export async function enviarMensagemSuporte(usuarioEmail, usuarioUid, usuarioNome, texto)

// Listener para mensagens de uma conversa (USAR COM CUIDADO - apenas quando chat aberto)
export function escutarConversaSuporte(conversaId, callback)

// Obter lista de conversas para admin (snapshot, não listener contínuo)
export async function buscarConversasAbertas()

// Responder mensagem como admin
export async function responderConversaSuporte(conversaId, mensagem, adminEmail)

// Marcar conversa como resolvida
export async function fecharConversaSuporte(conversaId)

// Obter última mensagem da conversa (para cache)
export async function obterUltimaMensagem(conversaId)
```

### 2. Componente: `src/components/ChatSuporte.jsx`

- Botão flutuante com ícone (usar react-icons)
- Modal ao clicar
- Input e botão enviar
- Histórico de mensagens
- Loading states
- Mensagens de erro amigáveis

Requisitos:
- Apenas mostrar se usuário está logado
- Usar email/UID do usuário logado
- Limpar listeners ao desmontar componente
- Implementar scroll automático para última mensagem

### 3. Tela: `src/screens/Suporte.jsx`

- Dashboard com lista de conversas abertas
- Filtro: abertas / resolvidas
- Expandir conversa mostra histórico completo
- Textarea para responder
- Botão "Marcar como Resolvida"
- Apenas acessível para users com `isManagementRole()` = true

### 4. Integrações em `App.jsx`

```javascript
// Adicionar ao NAV_ITEMS (apenas visível para gerencia)
{
  id: "suporte",
  label: "Suporte",
  gerenciaOnly: true,
}

// Adicionar rota lazy
const TelaSuporte = lazy(() => import("./screens/Suporte"));

// Adicionar route
<Route path="/suporte" element={<TelaSuporte />} />

// Adicionar componente de chat flutuante na raiz (fora das rotas)
<ChatSuporte />
```

---

## Considerações Importantes

⚠️ **Otimização do Firestore:**
- NÃO use listener contínuo no admin (causaria leitura a cada mudança em TODAS as conversas)
- Use `buscarConversasAbertas()` como snapshot (uma leitura) no load da tela
- Use listener APENAS para a conversa aberta no momento
- Cache local de mensagens já carregadas

⚠️ **Segurança:**
- Validar no Firestore Rules que usuários só podem ler/escrever suas próprias conversas
- Admin pode ler/escrever em qualquer conversa

⚠️ **UX:**
- Mostrar badge com número de conversas não respondidas para admin
- Feedback visual ao enviar mensagem
- Indicador de conversa resolvida

---

## Exemplo de Firestore Rules (segurança)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    match /conversas/{conversaId} {
      // Usuário pode ler/escrever sua própria conversa
      allow read, write: if request.auth.uid == resource.data.usuarioUid;
      
      // Admin pode ler todas
      allow read: if request.auth.token.customClaims.role in ['admin', 'gerencia'];
      
      match /mensagens/{msgId} {
        allow read, write: if request.auth.uid == resource.data.usuarioUid 
                           || request.auth.token.customClaims.role in ['admin', 'gerencia'];
      }
    }
  }
}
```

---

## Checklist de Entrega

- [ ] Serviço `suporte.js` com funções otimizadas
- [ ] Componente `ChatSuporte.jsx` flutuante
- [ ] Tela `Suporte.jsx` administrativa
- [ ] Integração em `App.jsx`
- [ ] Estilos (usar glass morfismo existente)
- [ ] Firestore Rules atualizadas
- [ ] Sem aumentar leituras de BD (usar snapshots/cache)
- [ ] Teste com múltiplos usuários em tempo real

---

## Notas Técnicas

- Use `unsubscribe()` para cleanup de listeners
- Implementar tratamento de erros try/catch
- Adicionar loading states com spinners
- Usar timestamps do Firestore (`serverTimestamp()`)
- Validar permissões no lado do cliente ANTES de fazer queries
