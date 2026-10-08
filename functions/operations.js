import { createHash } from 'node:crypto';

// This module is also exercised against the Firestore/Auth emulators.
export function createOperations({ db, auth, FieldValue: F, HttpsError }) {
  const fail = (code, message) => { throw new HttpsError(code, message); };
  const ref = (collection, id) => db.collection(collection).doc(id);
  const id = (value) => {
    if (typeof value !== 'string' || !/^[\w-]{1,128}$/.test(value)) fail('invalid-argument', 'Identificador invalido.');
    return value;
  };
  const money = (value, positive = false) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10000000) fail('invalid-argument', 'Valor invalido.');
    const cents = Math.round(value * 100);
    if (positive && cents <= 0) fail('invalid-argument', 'O valor deve ser positivo.');
    return cents;
  };
  const text = (value, max = 200) => String(value || '').trim().slice(0, max);
  const loginEmail = (store, name) => {
    const normalize = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `atendente.${normalize(store)}.${normalize(name)}@acs.local`;
  };
  const date = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || !Number.isFinite(Date.parse(`${value}T12:00:00Z`)) || new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value) fail('invalid-argument', 'Data invalida.');
    return value;
  };
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const manage = (p) => ['gerencia', 'superadmin'].includes(p.role);
  const scope = (p, store) => p.role === 'superadmin' || p.lojaId === store || (p.lojaIds || []).includes(store);
  async function access(tx, request, store, management = false) {
    if ((await tx.get(ref('configuracoes', 'operacoes_financeiras'))).data()?.bloqueadas === true) fail('unavailable', 'Operacoes temporariamente pausadas para manutencao.');
    const snap = await tx.get(ref('acessos_painel', request.auth.uid));
    const p = snap.data();
    if (!p || p.ativo !== true || (store && !scope(p, store)) || (management && !manage(p))) fail('permission-denied', 'Acesso nao autorizado.');
    if (store) {
      const loja = (await tx.get(ref('lojas', store))).data();
      if (loja && loja.status !== 'ativa' && p.role !== 'superadmin') fail('failed-precondition', 'Unidade indisponivel.');
    }
    return p;
  }
  function recent(request) {
    if (Date.now() / 1000 - Number(request.auth.token?.auth_time || 0) > 300) fail('failed-precondition', 'Confirme sua senha novamente antes desta acao.');
  }
  function summary(tx, sale, sign = 1) {
    const key = `${sale.uid}__${sale.data}`;
    tx.set(ref('resumo_diario', key), { uid: sale.uid, data: sale.data, totalVendas: F.increment(sign * sale.valor), lucro: F.increment(sign * sale.valor), totalItens: F.increment(sign * sale.quantidade) }, { merge: true });
    if (sale.atendenteId) tx.set(ref('ranking_diario', key), { uid: sale.uid, data: sale.data, atendentes: { [sale.atendenteId]: { nome: sale.atendenteNome, total: F.increment(sign * sale.valor) } } }, { merge: true });
  }
  const paymentFields = { Dinheiro: 'totalDinheiro', PIX: 'totalPix', Debito: 'totalDebito', Credito: 'totalCredito' };
  function cashDelta(sale, sign = 1) {
    const out = { totalVendas: F.increment(sign * sale.valor), totalItens: F.increment(sign * sale.quantidade) };
    for (const [name, field] of Object.entries(paymentFields)) out[field] = F.increment(sign * (sale.pagamentos || []).filter(p => p.forma === name).reduce((n, p) => n + p.valor, 0));
    return out;
  }
  return async (request) => {
    if (!request.auth) fail('unauthenticated', 'Entre no sistema.');
    if ((await ref('configuracoes', 'operacoes_financeiras').get()).data()?.bloqueadas === true) fail('unavailable', 'Operacoes temporariamente pausadas para manutencao.');
    const { action, ...d } = request.data || {};
    if (action === 'copiarAtendente') {
      const sourceId = id(d.id);
      if (!Array.isArray(d.lojaIds) || d.lojaIds.length > 30) fail('invalid-argument', 'Destinos invalidos.');
      return db.runTransaction(async tx => {
        const source = (await tx.get(ref('atendentes', sourceId))).data();
        if (!source || !source.authUid) fail('failed-precondition', 'Migre o cadastro antes de copiar.');
        const p = await access(tx, request, source.uid, true);
        if (source.role === 'superadmin' && p.role !== 'superadmin') fail('permission-denied', 'Perfil nao autorizado.');
        const stores = [...new Set(d.lojaIds.map(id))].filter(s => s !== source.uid);
        if (stores.some(s => !scope(p, s))) fail('permission-denied', 'Destino nao autorizado.');
        const panelRef = ref('acessos_painel', source.authUid), targetPanel = (await tx.get(panelRef)).data();
        const targets = [];
        for (const store of stores) {
          const target = ref('atendentes', `copia_${createHash('sha256').update(`${source.authUid}:${store}`).digest('hex').slice(0, 40)}`);
          const existing = await tx.get(db.collection('atendentes').where('uid', '==', store).where('authUid', '==', source.authUid));
          if (existing.empty) targets.push({ store, target });
        }
        const { senha: _password, ...publicData } = source;
        for (const { store, target } of targets) {
          tx.set(target, { ...publicData, uid: store, cadastroGlobalId: source.cadastroGlobalId || sourceId, criadoEm: F.serverTimestamp() });
          if (source.role === 'atendente' && source.emailAcesso.endsWith('@acs.local')) tx.set(ref('logins_atendentes', loginEmail(store, source.nome)), { email: source.emailAcesso });
        }
        tx.set(panelRef, { lojaIds: [...new Set([targetPanel?.lojaId, ...(targetPanel?.lojaIds || []), ...stores].filter(Boolean))] }, { merge: true });
        return { total: targets.length };
      });
    }
    if (action === 'salvarAtendente') {
      const store = id(d.uid), attendeeId = id(d.id);
      const target = ref('atendentes', attendeeId);
      const [panel, current] = await Promise.all([ref('acessos_painel', request.auth.uid).get(), target.get()]);
      const p = panel.data(), old = current.data();
      if (!p || !p.ativo || !manage(p) || !scope(p, store) || (old && old.uid !== store)) fail('permission-denied', 'Acesso nao autorizado.');
      const role = d.role || old?.role || 'atendente';
      if (!['atendente', 'gerencia', 'superadmin'].includes(role) || ((role === 'superadmin' || old?.role === 'superadmin') && p.role !== 'superadmin')) fail('permission-denied', 'Perfil nao autorizado.');
      if (!text(d.nome) || !Number.isFinite(d.meta) || d.meta < 0) fail('invalid-argument', 'Nome ou meta invalida.');
      const email = text(d.emailAcesso || old?.emailAcesso).toLowerCase();
      const password = d.senha || '';
      const requestedStores = role === 'atendente' ? [store] : (d.lojaIds || (old?.authUid ? (await ref('acessos_painel', old.authUid).get()).data()?.lojaIds : null) || [store]);
      if (!Array.isArray(requestedStores) || requestedStores.some(s => typeof s !== 'string' || !scope(p, s))) fail('permission-denied', 'Unidade nao autorizada.');
      const linkedPanel = old?.authUid ? (await ref('acessos_painel', old.authUid).get()).data() : null;
      if (linkedPanel && ((linkedPanel.role === 'superadmin' && p.role !== 'superadmin') || [linkedPanel.lojaId, ...(linkedPanel.lojaIds || [])].filter(Boolean).some(s => !scope(p, s)))) fail('permission-denied', 'Este acesso compartilhado deve ser editado por um administrador de todas as unidades vinculadas.');
      if (password && (typeof password !== 'string' || password.length < 6 || password.length > 128)) fail('invalid-argument', 'A senha precisa ter pelo menos 6 caracteres.');
      const authUid = old?.authUid || `gelato_${createHash('sha256').update(attendeeId).digest('hex').slice(0, 40)}`;
      let created = false;
      if (!old?.authUid) {
        if (!password || !email) fail('invalid-argument', 'Informe email e senha para o acesso.');
        try { await auth.createUser({ uid: authUid, email, password, displayName: text(d.nome) }); created = true; }
        catch (error) { if (error.code !== 'auth/uid-already-exists') fail('already-exists', 'Este email ja possui uma conta. A vinculacao deve ser feita pela migracao administrativa.'); }
      } else if (password) {
        recent(request);
        await auth.updateUser(authUid, { password });
        await auth.revokeRefreshTokens(authUid);
      }
      try {
        return await db.runTransaction(async tx => {
          const latest = await access(tx, request, store, true);
          const before = (await tx.get(target)).data();
          if (before?.authUid && before.authUid !== authUid) fail('aborted', 'Cadastro alterado. Atualize a tela.');
          if ((role === 'superadmin' || before?.role === 'superadmin') && latest.role !== 'superadmin') fail('permission-denied', 'Perfil nao autorizado.');
          const stores = requestedStores;
          if (!Array.isArray(stores) || stores.some(s => !scope(latest, s))) fail('permission-denied', 'Unidade nao autorizada.');
          const payload = { uid: store, nome: text(d.nome), meta: d.meta, role, emailAcesso: old?.authUid ? old.emailAcesso : email, authUid, avatarTipo: d.avatarTipo === 'feminino' ? 'feminino' : 'masculino', fotoPerfil: text(d.fotoPerfil, 3000), podeGerenciarProdutos: Boolean(d.podeGerenciarProdutos), ativo: before?.ativo !== false, metasMensais: { ...(before?.metasMensais || {}), [today().slice(0, 7)]: d.meta }, atualizadoEm: F.serverTimestamp(), senha: F.delete() };
          tx.set(target, { ...payload, ...(!before ? { criadoEm: F.serverTimestamp() } : {}) }, { merge: true });
          tx.set(ref('acessos_painel', authUid), { atendenteId: attendeeId, nome: payload.nome, role, lojaId: store, lojaIds: stores, email: payload.emailAcesso, ativo: payload.ativo, avatarTipo: payload.avatarTipo, fotoPerfil: payload.fotoPerfil, podeGerenciarProdutos: payload.podeGerenciarProdutos, updatedAt: F.serverTimestamp() }, { merge: true });
          if (role === 'atendente' && payload.emailAcesso.endsWith('@acs.local')) tx.set(ref('logins_atendentes', loginEmail(store, payload.nome)), { email: payload.emailAcesso });
          return { id: attendeeId };
        });
      } catch (error) {
        if (created) await auth.deleteUser(authUid);
        throw error;
      }
    }
    if (action === 'estadoAtendente') {
      return db.runTransaction(async tx => {
        const target = ref('atendentes', id(d.id));
        const old = (await tx.get(target)).data();
        if (!old) fail('not-found', 'Cadastro nao encontrado.');
        const p = await access(tx, request, old.uid, true);
        const linked = old.authUid ? (await tx.get(ref('acessos_painel', old.authUid))).data() : null;
        if (linked && ((linked.role === 'superadmin' && p.role !== 'superadmin') || [linked.lojaId, ...(linked.lojaIds || [])].filter(Boolean).some(s => !scope(p, s)))) fail('permission-denied', 'Acesso compartilhado fora das suas unidades.');
        if (old.role === 'superadmin' && p.role !== 'superadmin') fail('permission-denied', 'Perfil nao autorizado.');
        if (old.authUid === request.auth.uid) fail('failed-precondition', 'Nao desative seu proprio acesso.');
        tx.update(target, { ativo: Boolean(d.ativo), atualizadoEm: F.serverTimestamp(), senha: F.delete() });
        if (old.authUid) tx.set(ref('acessos_painel', old.authUid), { ativo: Boolean(d.ativo), updatedAt: F.serverTimestamp() }, { merge: true });
        return { id: d.id };
      });
    }
    if (action === 'abrirCaixa') {
      const store = id(d.uid), attendeeId = id(d.atendenteId), operation = id(d.operacaoId);
      const cents = money(d.fundoCaixa || 0), day = date(d.data);
      return db.runTransaction(async tx => {
        const p = await access(tx, request, store);
        const a = (await tx.get(ref('atendentes', attendeeId))).data();
        if (!a || a.ativo !== true || a.uid !== store || (!manage(p) && a.authUid !== request.auth.uid)) fail('permission-denied', 'Atendente nao autorizado.');
        if (!manage(p) && day !== today()) fail('permission-denied', 'Data nao autorizada.');
        const lock = ref('caixas_ativos', `${store}__${attendeeId}`);
        const active = (await tx.get(lock)).data();
        const target = ref('caixas', operation);
        const previous = (await tx.get(target)).data();
        if (previous) { if (previous.uid !== store || previous.atendenteId !== attendeeId) fail('already-exists', 'Identificador ja utilizado.'); return { id: operation }; }
        if (active?.caixaId) return { id: active.caixaId };
        tx.create(target, { uid: store, atendenteId: attendeeId, atendenteNome: a.nome, data: day, fundoCaixa: cents / 100, status: 'aberto', abertoEm: F.serverTimestamp(), fechadoEm: null, totalVendas: 0, totalItens: 0, totalDinheiro: 0, totalPix: 0, totalDebito: 0, totalCredito: 0, totalRetiradas: 0, versaoFinanceira: 2 });
        tx.set(lock, { uid: store, caixaId: operation });
        return { id: operation };
      });
    }
    if (action === 'registrarVenda') {
      const store = id(d.uid), cashId = id(d.caixaId), operation = id(d.operacaoId), day = date(d.data);
      if (!Array.isArray(d.itens) || !d.itens.length || d.itens.length > 60) fail('invalid-argument', 'Carrinho invalido (maximo 60 produtos).');
      const hash = createHash('sha256').update(JSON.stringify({ ...d, operacaoId: undefined })).digest('hex');
      return db.runTransaction(async tx => {
        const p = await access(tx, request, store);
        const opRef = ref('operacoes', operation), op = (await tx.get(opRef)).data();
        if (op) { if (op.uid !== store || op.hash !== hash || op.autorUid !== request.auth.uid) fail('already-exists', 'Operacao ja utilizada para outro pedido.'); return op.resultado; }
        const cashRef = ref('caixas', cashId), cash = (await tx.get(cashRef)).data();
        if (!cash || cash.uid !== store || cash.status !== 'aberto' || cash.versaoFinanceira !== 2) fail('failed-precondition', 'Caixa fechado ou legado. Abra um novo caixa apos a conciliacao.');
        const a = (await tx.get(ref('atendentes', cash.atendenteId))).data();
        if (!a || a.ativo !== true || (!manage(p) && a.authUid !== request.auth.uid)) fail('permission-denied', 'Caixa nao autorizado.');
        if (!manage(p) && day !== today()) fail('permission-denied', 'Data nao autorizada.');
        const unique = new Set();
        const items = [];
        for (const input of d.itens) {
          const productId = id(input.produtoId);
          if (unique.has(productId)) fail('invalid-argument', 'Produto duplicado no carrinho.');
          unique.add(productId);
          const productRef = ref('produtos', productId), product = (await tx.get(productRef)).data();
          if (!product || product.uid !== store || product.ativo === false) fail('failed-precondition', 'Produto indisponivel.');
          const kg = product.unidadeVenda === 'kg';
          const price = money(kg ? (product.precoFinal || product.preco || product.precoCusto || 0) : (product.precoFinal ?? product.preco ?? 0), true);
          const quantity = kg ? money(input.valor, true) / price : Number(input.quantidade);
          if (!Number.isFinite(quantity) || quantity <= 0 || (!kg && !Number.isInteger(quantity)) || quantity > Number(product.estoque || 0) + 1e-9) fail('failed-precondition', `Estoque ou quantidade invalida para ${product.nome}.`);
          const cents = kg ? money(input.valor, true) : Math.round(price * quantity);
          if (input.valorUnitario !== undefined && money(input.valorUnitario) !== price && !manage(p)) fail('permission-denied', 'Preco alterado. Atualize o carrinho.');
          const finalPrice = !kg && manage(p) && input.valorUnitario !== undefined ? money(input.valorUnitario, true) : price;
          items.push({ productRef, product, productId, quantity, price: finalPrice, cents: kg ? cents : Math.round(finalPrice * quantity) });
        }
        const total = items.reduce((n, i) => n + i.cents, 0);
        if (!Array.isArray(d.pagamentos) || !d.pagamentos.length || d.pagamentos.length > 10) fail('invalid-argument', 'Pagamento invalido.');
        const payments = d.pagamentos.map(v => {
          if (!paymentFields[v.forma]) fail('invalid-argument', 'Forma de pagamento invalida.');
          return { forma: v.forma, cents: money(v.valor, true) };
        });
        const paid = payments.reduce((n, v) => n + v.cents, 0), cashPaid = payments.filter(v => v.forma === 'Dinheiro').reduce((n, v) => n + v.cents, 0), change = paid - total;
        if (change < 0 || change > cashPaid) fail('invalid-argument', 'Pagamentos inconsistentes. Troco somente em dinheiro.');
        let rest = change;
        for (const pay of payments) if (pay.forma === 'Dinheiro') { const discount = Math.min(pay.cents, rest); pay.cents -= discount; rest -= discount; }
        // Integer-cent allocation: every row and every payment column closes exactly.
        const remaining = payments.map(p => p.cents);
        const rows = items.map(item => {
          const available = remaining.reduce((n, v) => n + v, 0);
          const shares = remaining.map((value, index) => ({ index, exact: item.cents * value / available, value: Math.floor(item.cents * value / available) }));
          let residual = item.cents - shares.reduce((n, s) => n + s.value, 0);
          for (const share of [...shares].sort((a, b) => (b.exact - b.value) - (a.exact - a.value))) if (residual && share.value < remaining[share.index]) { share.value++; residual--; }
          const row = shares.map(share => { remaining[share.index] -= share.value; return { forma: payments[share.index].forma, valor: share.value / 100 }; }).filter(p => p.valor > 0);
          return { item, row };
        });
        const sales = [];
        for (const [index, { item, row }] of rows.entries()) {
          const saleId = `${operation}_${index}`;
          const sale = { uid: store, produto: item.product.nome, produtoId: item.productId, valor: item.cents / 100, quantidade: item.quantity, unidadeVenda: item.product.unidadeVenda || 'un', valorUnitario: item.price / 100, precoCustoHistorico: Number(item.product.precoCusto || 0), custoTotal: Math.round(Number(item.product.precoCusto || 0) * item.quantity * 100) / 100, atendente: cash.atendenteNome, atendenteNome: cash.atendenteNome, atendenteId: cash.atendenteId, caixaId: cashId, formaPagamento: payments.length === 1 ? payments[0].forma : 'Pagamento dividido', pagamentos: row, vendaGrupoId: operation, valorRecebido: cashPaid / 100, troco: change / 100, data: day, horario: new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Fortaleza', hour: '2-digit', minute: '2-digit' }), registradoEmMs: Date.now(), criadoEm: F.serverTimestamp(), autorUid: request.auth.uid, status: 'ativa' };
          tx.create(ref('vendas', saleId), sale);
          tx.update(item.productRef, { estoque: Math.max(0, Number(item.product.estoque) - item.quantity) });
          tx.create(ref('movimentacoes_estoque', saleId), { uid: store, produtoId: item.productId, produto: item.product.nome, quantidade: item.quantity, variacao: -item.quantity, estoqueAnterior: Number(item.product.estoque), estoqueAtual: Math.max(0, Number(item.product.estoque) - item.quantity), tipo: 'SAIDA', observacao: `Venda ${operation}`, vendaId: saleId, criadoEm: F.serverTimestamp() });
          summary(tx, sale);
          tx.update(cashRef, cashDelta(sale));
          sales.push(saleId);
        }
        const result = { id: operation, vendas: sales, atendenteNome: cash.atendenteNome, valorRecebido: cashPaid / 100, itens: items.map(i => ({ nome: i.product.nome, quantidade: i.quantity, unidadeVenda: i.product.unidadeVenda || 'un', precoUnitario: i.price / 100, subtotal: i.cents / 100 })), total: total / 100, troco: change / 100, pagamentos: payments.filter(p => p.cents).map(p => ({ forma: p.forma, valor: p.cents / 100 })) };
        tx.create(opRef, { uid: store, autorUid: request.auth.uid, hash, resultado: result, criadoEm: F.serverTimestamp() });
        return result;
      });
    }
    if (['criarEntrada', 'editarEntrada', 'cancelarEntrada'].includes(action)) {
      const target = ref('entradas_consolidadas', id(d.id));
      return db.runTransaction(async tx => {
        const old = (await tx.get(target)).data();
        const store = old?.uid || id(d.uid);
        await access(tx, request, store, true);
        if (action === 'criarEntrada' && old) return { id: d.id };
        if (!old && action !== 'criarEntrada') fail('not-found', 'Entrada nao encontrada.');
        const dinheiro = money(d.dinheiro ?? old?.dinheiro ?? 0), pix = money(d.pix ?? old?.pix ?? 0), cartao = money(d.cartao ?? old?.cartao ?? 0);
        tx.set(target, { uid: store, data: date(d.data ?? old?.data), dinheiro: dinheiro / 100, pix: pix / 100, cartao: cartao / 100, total: (dinheiro + pix + cartao) / 100, status: action === 'cancelarEntrada' ? 'cancelada' : 'ativa', atualizadoEm: F.serverTimestamp(), ...(!old ? { criadoEm: F.serverTimestamp() } : {}) }, { merge: true });
        tx.create(db.collection('auditoria_financeira').doc(), { uid: store, action, documento: d.id, autorUid: request.auth.uid, criadoEm: F.serverTimestamp() });
        return { id: d.id };
      });
    }
    if (['criarDespesa', 'editarDespesa', 'cancelarDespesa'].includes(action)) {
      const expenseId = id(d.id), target = ref('despesas', expenseId);
      return db.runTransaction(async tx => {
        const old = (await tx.get(target)).data();
        const store = old?.uid || id(d.uid);
        await access(tx, request, store, action !== 'criarDespesa');
        if (action === 'criarDespesa' && old) return { id: expenseId };
        if (action !== 'criarDespesa' && !old) fail('not-found', 'Despesa nao encontrada.');
        if (action === 'cancelarDespesa' && old.status === 'cancelada') return { id: expenseId };
        const next = { ...old, uid: store, descricao: text(d.descricao ?? old?.descricao), observacao: text(d.observacao ?? old?.observacao, 1000), valor: money(d.valor ?? old?.valor, true) / 100, data: date(d.data ?? old?.data), despesaFixaId: text(d.despesaFixaId ?? old?.despesaFixaId), despesaFixaDescricao: text(d.despesaFixaDescricao ?? old?.despesaFixaDescricao) };
        if (!next.descricao) fail('invalid-argument', 'Informe a descricao.');
        const aggregate = (expense, sign) => tx.set(ref('resumo_diario', `${store}__${expense.data}`), { uid: store, data: expense.data, totalDespesas: F.increment(sign * expense.valor), lucro: F.increment(-sign * expense.valor) }, { merge: true });
        if (old && old.status !== 'cancelada') aggregate(old, -1);
        if (action !== 'cancelarDespesa') aggregate(next, 1);
        tx.set(target, { ...next, status: action === 'cancelarDespesa' ? 'cancelada' : 'ativa', atualizadoEm: F.serverTimestamp(), ...(!old ? { criadoEm: F.serverTimestamp() } : {}) }, { merge: true });
        tx.create(db.collection('auditoria_financeira').doc(), { uid: store, action, documento: expenseId, autorUid: request.auth.uid, criadoEm: F.serverTimestamp() });
        return { id: expenseId };
      });
    }
    if (['dataCaixa', 'arquivarCaixa'].includes(action)) {
      return db.runTransaction(async tx => {
        const target = ref('caixas', id(d.caixaId)), cash = (await tx.get(target)).data();
        if (!cash) fail('not-found', 'Caixa nao encontrado.');
        await access(tx, request, cash.uid, true);
        recent(request);
        if (action === 'arquivarCaixa') {
          if (cash.totalVendas || cash.totalRetiradas || cash.status === 'aberto') fail('failed-precondition', 'Caixa com movimentacao deve ser preservado. Cancele os itens e feche o caixa antes de arquivar.');
          tx.update(target, { status: 'arquivado', arquivadoEm: F.serverTimestamp(), arquivadoPor: request.auth.uid });
        } else {
          if (cash.totalVendas || cash.totalRetiradas || cash.versaoFinanceira !== 2) fail('failed-precondition', 'Nao altere a data de um caixa com movimentacoes.');
          tx.update(target, { data: date(d.data) });
        }
        return { id: d.caixaId };
      });
    }
    if (['editarRetirada', 'cancelarRetirada'].includes(action)) {
      return db.runTransaction(async tx => {
        const target = ref('retiradas_caixa', id(d.id)), old = (await tx.get(target)).data();
        if (!old) fail('not-found', 'Retirada nao encontrada.');
        await access(tx, request, old.uid, true);
        const cashRef = ref('caixas', id(old.caixaId)), cash = (await tx.get(cashRef)).data();
        if (!cash || cash.status !== 'aberto' || cash.versaoFinanceira !== 2) fail('failed-precondition', 'Caixa fechado ou legado.');
        if (old.status === 'cancelada') return { id: d.id };
        const nextCents = action === 'cancelarRetirada' ? 0 : money(d.valor ?? old.valor, true);
        const delta = nextCents - money(old.valor);
        const balance = money(cash.fundoCaixa || 0) + money(cash.totalDinheiro || 0) - money(cash.totalRetiradas || 0);
        if (delta > balance) fail('failed-precondition', 'Saldo insuficiente.');
        tx.update(cashRef, { totalRetiradas: F.increment(delta / 100) });
        tx.update(target, { ...(action === 'cancelarRetirada' ? { status: 'cancelada' } : { valor: nextCents / 100, motivo: text(d.motivo ?? old.motivo, 1000), data: date(d.data ?? old.data) }), atualizadoEm: F.serverTimestamp(), autorAlteracao: request.auth.uid });
        tx.create(db.collection('auditoria_financeira').doc(), { uid: old.uid, action, documento: d.id, autorUid: request.auth.uid, valorAnterior: old.valor, valorNovo: nextCents / 100, criadoEm: F.serverTimestamp() });
        return { id: d.id };
      });
    }
    if (['fecharCaixa', 'retirarCaixa', 'cancelarVenda'].includes(action)) {
      return db.runTransaction(async tx => {
        let sale, productRef, product;
        if (action === 'cancelarVenda') sale = (await tx.get(ref('vendas', id(d.id)))).data();
        if (action === 'cancelarVenda' && !sale) fail('not-found', 'Venda nao encontrada.');
        const cashId = id(sale?.caixaId || d.caixaId), cashRef = ref('caixas', cashId), cash = (await tx.get(cashRef)).data();
        if (!cash) fail('not-found', 'Caixa nao encontrado.');
        const p = await access(tx, request, cash.uid, action === 'cancelarVenda');
        const attendee = (await tx.get(ref('atendentes', cash.atendenteId))).data();
        if (!manage(p) && attendee?.authUid !== request.auth.uid) fail('permission-denied', 'Caixa nao autorizado.');
        if (action === 'cancelarVenda') {
          recent(request);
          if (sale.status === 'cancelada') return { id: d.id };
          if (!text(d.motivo, 1000)) fail('invalid-argument', 'Informe o motivo.');
          productRef = ref('produtos', id(sale.produtoId)); product = (await tx.get(productRef)).data();
          if (!product || product.uid !== cash.uid) fail('failed-precondition', 'Produto original nao encontrado.');
        }
        if (action === 'fecharCaixa' && cash.status === 'fechado') return { id: cashId };
        if (cash.status !== 'aberto' || cash.versaoFinanceira !== 2) fail('failed-precondition', 'Caixa legado ou fechado. Concilie os caixas antigos antes de migrar.');
        if (action === 'fecharCaixa') {
          const balance = money(cash.fundoCaixa || 0) + money(cash.totalDinheiro || 0) - money(cash.totalRetiradas || 0);
          const counted = d.dinheiroContado == null ? null : money(d.dinheiroContado);
          tx.update(cashRef, { status: 'fechado', fechadoEm: F.serverTimestamp(), valorEmCaixa: balance / 100, ...(counted === null ? {} : { dinheiroContado: counted / 100, diferencaCaixa: (counted - balance) / 100 }) });
          tx.delete(ref('caixas_ativos', `${cash.uid}__${cash.atendenteId}`));
          return { id: cashId };
        }
        if (action === 'retirarCaixa') {
          const operation = id(d.operacaoId), target = ref('retiradas_caixa', operation);
          // This read must precede all writes (including retry path).
          const old = (await tx.get(target)).data();
          const cents = money(d.valor, true);
          if (old) { if (old.caixaId !== cashId || money(old.valor) !== cents) fail('already-exists', 'Operacao reutilizada.'); return { id: operation }; }
          const available = money(cash.fundoCaixa || 0) + money(cash.totalDinheiro || 0) - money(cash.totalRetiradas || 0);
          if (cents > available || !text(d.motivo, 1000)) fail('failed-precondition', 'Saldo insuficiente ou motivo ausente.');
          tx.create(target, { uid: cash.uid, caixaId: cashId, atendenteId: cash.atendenteId, atendenteNome: cash.atendenteNome, valor: cents / 100, motivo: text(d.motivo, 1000), data: today(), criadoEm: F.serverTimestamp(), autorUid: request.auth.uid });
          tx.update(cashRef, { totalRetiradas: F.increment(cents / 100) });
          return { id: operation };
        }
        tx.update(ref('vendas', d.id), { status: 'cancelada', motivoCancelamento: text(d.motivo, 1000), canceladaEm: F.serverTimestamp(), canceladaPor: request.auth.uid });
        tx.update(productRef, { estoque: Number(product.estoque) + Number(sale.quantidade) });
        summary(tx, sale, -1);
        tx.update(cashRef, cashDelta(sale, -1));
        tx.create(ref('lancamentos', `estorno_${d.id}`), { uid: cash.uid, tipo: 'cancelamento_venda_caixa', data: sale.data, mes: sale.data.slice(0, 7), valor: sale.valor, vendaId: d.id, caixaId: cashId, motivo: text(d.motivo, 1000), autorizadoPor: p.nome || request.auth.uid, criadoEm: F.serverTimestamp() });
        tx.create(ref('movimentacoes_estoque', `estorno_${d.id}`), { uid: cash.uid, produtoId: sale.produtoId, produto: sale.produto, quantidade: sale.quantidade, variacao: sale.quantidade, estoqueAnterior: Number(product.estoque), estoqueAtual: Number(product.estoque) + Number(sale.quantidade), tipo: 'ENTRADA', observacao: text(d.motivo, 1000), vendaId: d.id, criadoEm: F.serverTimestamp() });
        return { id: d.id };
      });
    }
    fail('invalid-argument', 'Operacao desconhecida.');
  };
}
