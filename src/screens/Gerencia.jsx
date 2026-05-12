import { useEffect, useMemo, useState } from "react";
import { deleteCaixa, fecharCaixa, getCaixas, subscribeRetiradasDoDia } from "../services/caixas";
import { subscribeProdutos } from "../services/produtos";
import { DEFAULT_SYSTEM_CONFIG, saveSystemConfig } from "../services/sistema";
import { isSuperAdminRole } from "../utils/access";
import { subscribeDespesasDoDia, subscribeVendasDoDia } from "../services/vendas";
import { calcularResumoFinanceiro } from "../utils/financeiro";

function formatMoney(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDateLabel(valor) {
  if (!valor) return "";
  const [ano, mes, dia] = String(valor).split("-");
  if (!ano || !mes || !dia) return String(valor);
  return `${dia}-${mes}-${ano}`;
}

export default function Gerencia({ uid, dataHoje, onNavigate, accessUser, systemConfig }) {
  const [vendasHoje, setVendasHoje] = useState([]);
  const [despesasHoje, setDespesasHoje] = useState([]);
  const [retiradasHoje, setRetiradasHoje] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [caixasHoje, setCaixasHoje] = useState([]);
  const [acaoCaixa, setAcaoCaixa] = useState(null);
  const [senhaGerencia, setSenhaGerencia] = useState("");
  const [feedbackAcaoCaixa, setFeedbackAcaoCaixa] = useState("");
  const [salvandoAcaoCaixa, setSalvandoAcaoCaixa] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceTitle, setMaintenanceTitle] = useState(DEFAULT_SYSTEM_CONFIG.maintenanceTitle);
  const [maintenanceMessage, setMaintenanceMessage] = useState(DEFAULT_SYSTEM_CONFIG.maintenanceMessage);
  const [maintenanceFeedback, setMaintenanceFeedback] = useState("");
  const [salvandoManutencao, setSalvandoManutencao] = useState(false);
  const isSuperAdmin = isSuperAdminRole(accessUser?.role);

  useEffect(() => {
    if (!uid || !dataHoje) return;

    const unsubVendas = subscribeVendasDoDia(uid, dataHoje, setVendasHoje);
    const unsubDespesas = subscribeDespesasDoDia(uid, dataHoje, setDespesasHoje);
    const unsubProdutos = subscribeProdutos(uid, setProdutos);
    const unsubRetiradas = subscribeRetiradasDoDia(dataHoje, setRetiradasHoje);

    let ativo = true;
    getCaixas(dataHoje, dataHoje).then((items) => {
      if (ativo) setCaixasHoje(items);
    });

    return () => {
      ativo = false;
      unsubVendas();
      unsubDespesas();
      unsubProdutos();
      unsubRetiradas();
    };
  }, [uid, dataHoje]);

  useEffect(() => {
    setMaintenanceMode(systemConfig?.maintenanceMode === true);
    setMaintenanceTitle(systemConfig?.maintenanceTitle || DEFAULT_SYSTEM_CONFIG.maintenanceTitle);
    setMaintenanceMessage(systemConfig?.maintenanceMessage || DEFAULT_SYSTEM_CONFIG.maintenanceMessage);
  }, [systemConfig]);

  const caixasAbertos = useMemo(
    () => caixasHoje.filter((item) => item.status === "aberto"),
    [caixasHoje]
  );
  const caixaIdsDoDia = useMemo(
    () => new Set(caixasHoje.map((item) => item.id)),
    [caixasHoje]
  );
  const vendasHojeVinculadas = useMemo(
    () => vendasHoje.filter((item) => item.caixaId && caixaIdsDoDia.has(item.caixaId)),
    [caixaIdsDoDia, vendasHoje]
  );
  const retiradasHojeVinculadas = useMemo(
    () => retiradasHoje.filter((item) => item.caixaId && caixaIdsDoDia.has(item.caixaId)),
    [caixaIdsDoDia, retiradasHoje]
  );
  const resumoFinanceiro = useMemo(
    () =>
      calcularResumoFinanceiro({
        vendas: vendasHojeVinculadas,
        despesas: despesasHoje,
        retiradas: retiradasHojeVinculadas,
        caixas: caixasAbertos,
      }),
    [caixasAbertos, despesasHoje, retiradasHojeVinculadas, vendasHojeVinculadas]
  );
  const estoqueBaixo = useMemo(
    () =>
      produtos.filter((produto) => {
        const estoque = Number(produto.estoque || 0);
        return produto.ativo !== false && estoque > 0 && estoque <= 5;
      }),
    [produtos]
  );
  const semEstoque = useMemo(
    () =>
      produtos.filter((produto) => produto.ativo !== false && Number(produto.estoque || 0) === 0),
    [produtos]
  );
  const totalItensVendidos = useMemo(
    () => vendasHojeVinculadas.reduce((acc, item) => acc + Number(item.quantidade || 0), 0),
    [vendasHojeVinculadas]
  );
  const totalSaidasHoje = despesasHoje.length + retiradasHojeVinculadas.length;
  const totalAlertasEstoque = estoqueBaixo.length + semEstoque.length;
  const ultimasVendas = vendasHojeVinculadas.slice(0, 5);
  const ultimasSaidas = useMemo(
    () =>
      [
        ...despesasHoje.map((item) => ({
          ...item,
          titulo: item.descricao,
          detalhe: "Despesa operacional",
        })),
        ...retiradasHojeVinculadas.map((item) => ({
          ...item,
          titulo: item.motivo || "Sangria de caixa",
          detalhe: item.atendenteNome || "Sem atendente",
        })),
      ].slice(0, 5),
    [despesasHoje, retiradasHojeVinculadas]
  );
  const caixasDoDia = useMemo(
    () =>
      [...caixasHoje].sort((a, b) => {
        if (a?.status !== b?.status) return a?.status === "aberto" ? -1 : 1;
        return String(a?.atendenteNome || "").localeCompare(String(b?.atendenteNome || ""));
      }),
    [caixasHoje]
  );

  function abrirAcaoCaixa(tipo, caixa) {
    setAcaoCaixa({ tipo, caixa });
    setSenhaGerencia("");
    setFeedbackAcaoCaixa("");
  }

  function fecharPainelAcao() {
    setAcaoCaixa(null);
    setSenhaGerencia("");
    setFeedbackAcaoCaixa("");
    setSalvandoAcaoCaixa(false);
  }

  async function confirmarAcaoCaixa() {
    if (!acaoCaixa?.caixa?.id) return;

    const senhaCadastrada = String(accessUser?.senha || "");
    const senhaInformada = String(senhaGerencia || "");

    if (!senhaCadastrada) {
      setFeedbackAcaoCaixa("Cadastre uma senha para a gerencia antes de usar esta acao.");
      return;
    }

    if (senhaInformada !== senhaCadastrada) {
      setFeedbackAcaoCaixa("Senha da gerencia invalida.");
      return;
    }

    setSalvandoAcaoCaixa(true);
    setFeedbackAcaoCaixa("");

    try {
      if (acaoCaixa.tipo === "fechar") {
        const caixa = acaoCaixa.caixa;
        const vendasDoCaixa = vendasHoje.filter((item) => item.caixaId === caixa.id);
        const retiradasDoCaixa = retiradasHoje.filter((item) => item.caixaId === caixa.id);
        const totalVendas = vendasDoCaixa.reduce((acc, item) => acc + Number(item.valor || 0), 0);
        const totalItens = vendasDoCaixa.reduce((acc, item) => acc + Number(item.quantidade || 0), 0);
        const totalDinheiro = vendasDoCaixa
          .filter((item) => item.formaPagamento === "Dinheiro")
          .reduce((acc, item) => acc + Number(item.valor || 0), 0);
        const totalRetiradas = retiradasDoCaixa.reduce((acc, item) => acc + Number(item.valor || 0), 0);
        const valorEmCaixa =
          Number(caixa.fundoCaixa || 0) + totalVendas - totalRetiradas;

        await fecharCaixa(caixa.id, {
          totalVendas,
          totalItens,
          totalDinheiro,
          totalRetiradas,
          valorEmCaixa,
        });

        setCaixasHoje((prev) =>
          prev.map((item) =>
            item.id === caixa.id
              ? {
                  ...item,
                  status: "fechado",
                  totalVendas,
                  totalItens,
                  totalDinheiro,
                  valorEmCaixa,
                }
              : item
          )
        );
      }

      if (acaoCaixa.tipo === "excluir") {
        await deleteCaixa(acaoCaixa.caixa.id);
        setCaixasHoje((prev) => prev.filter((item) => item.id !== acaoCaixa.caixa.id));
      }

      fecharPainelAcao();
    } catch {
      setFeedbackAcaoCaixa("Nao foi possivel concluir a acao no caixa.");
      setSalvandoAcaoCaixa(false);
    }
  }

  async function salvarManutencao(e) {
    e.preventDefault();
    setSalvandoManutencao(true);
    setMaintenanceFeedback("");

    try {
      await saveSystemConfig(uid, {
        maintenanceMode,
        maintenanceTitle,
        maintenanceMessage,
      });
      setMaintenanceFeedback(maintenanceMode ? "Modo manutencao ativado." : "Modo manutencao desativado.");
    } catch {
      setMaintenanceFeedback("Nao foi possivel salvar a configuracao de manutencao.");
    } finally {
      setSalvandoManutencao(false);
    }
  }

  return (
    <div className="dashboard-screen">
      <div className="gerencia-hero section-card">
        <div>
          <span className="pdv-eyebrow">Resumo Gerencial</span>
          <h1 className="screen-title app-hero-title-blue">Operacao do dia</h1>
          <p className="screen-description">
            Priorize caixa, resultado e alertas. Os detalhes ficam logo abaixo, sob demanda.
          </p>
        </div>
        <span className="screen-badge">{formatDateLabel(dataHoje)}</span>
      </div>

      <div className="stats-grid gerencia-stats-grid gerencia-stats-grid-compact">
        <div className="section-card stat-card">
          <span className="stat-label">Em caixa</span>
          <strong
            className={`stat-value ${resumoFinanceiro.emCaixa >= 0 ? "positive" : "negative"}`}
            style={{ color: resumoFinanceiro.emCaixa >= 0 ? "var(--green-dark)" : "var(--red)" }}
          >
            {formatMoney(resumoFinanceiro.emCaixa)}
          </strong>
          <small className="stat-note">Fundo + entradas - despesas - retiradas.</small>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Alertas</span>
          <strong className={`stat-value ${totalAlertasEstoque ? "negative" : "positive"}`}>
            {totalAlertasEstoque}
          </strong>
        </div>
      </div>

      <div className="gerencia-micro-grid">
        <div className="section-card gerencia-micro-card">
          <span className="stat-label">Entradas</span>
          <strong
            className={resumoFinanceiro.entradas >= 0 ? "positive" : "negative"}
            style={{ color: resumoFinanceiro.entradas >= 0 ? "var(--green-dark)" : "var(--red)" }}
          >
            {formatMoney(resumoFinanceiro.entradas)}
          </strong>
          <small className="stat-note">Soma das vendas.</small>
        </div>
        <div className="section-card gerencia-micro-card">
          <span className="stat-label">Gastos</span>
          <strong
            className={resumoFinanceiro.gastos >= 0 ? "positive" : "negative"}
            style={{ color: resumoFinanceiro.gastos >= 0 ? "var(--green-dark)" : "var(--red)" }}
          >
            {formatMoney(resumoFinanceiro.gastos)}
          </strong>
          <small className="stat-note">Despesas + retiradas.</small>
        </div>
        <div className="section-card gerencia-micro-card">
          <span className="stat-label">Caixas abertos</span>
          <strong>{caixasAbertos.length}</strong>
        </div>
        <div className="section-card gerencia-micro-card">
          <span className="stat-label">Itens vendidos</span>
          <strong>{totalItensVendidos}</strong>
        </div>
      </div>

      <div className="gerencia-actions gerencia-actions-compact">
        <button className="action-btn action-btn-primary" type="button" onClick={() => onNavigate("pdv")}>
          PDV
        </button>
        <button className="action-btn action-btn-warning" type="button" onClick={() => onNavigate("fluxo")}>
          Fluxo
        </button>
        <button className="action-btn action-btn-info" type="button" onClick={() => onNavigate("estoque")}>
          Estoque
        </button>
        <button className="action-btn action-btn-secondary" type="button" onClick={() => onNavigate("relatorio")}>
          Relatorio
        </button>
      </div>

      {isSuperAdmin ? (
        <div className="section-card maintenance-admin-card">
          <div className="section-header">
            <div className="section-title">Modo manutencao</div>
            <span className={`screen-badge ${maintenanceMode ? "maintenance-badge-active" : ""}`}>
              {maintenanceMode ? "Ativo" : "Inativo"}
            </span>
          </div>
          <form className="stack-form" onSubmit={salvarManutencao}>
            <label className="maintenance-toggle" htmlFor="maintenance-mode">
              <div>
                <strong>Tirar sistema do ar</strong>
                <p className="screen-description">
                  Quando ativo, apenas usuarios com role Superadmin conseguem entrar para reativar o sistema.
                </p>
              </div>
              <input
                id="maintenance-mode"
                type="checkbox"
                checked={maintenanceMode}
                onChange={(e) => setMaintenanceMode(e.target.checked)}
              />
            </label>
            <input
              className="input"
              value={maintenanceTitle}
              onChange={(e) => setMaintenanceTitle(e.target.value)}
              placeholder="Titulo da mensagem"
            />
            <textarea
              className="input maintenance-textarea"
              value={maintenanceMessage}
              onChange={(e) => setMaintenanceMessage(e.target.value)}
              placeholder="Mensagem exibida na tela de manutencao"
              rows="4"
            />
            <button className="action-btn action-btn-warning" type="submit" disabled={salvandoManutencao}>
              {salvandoManutencao ? "Salvando..." : "Salvar manutencao"}
            </button>
            {maintenanceFeedback ? <p className="inline-feedback">{maintenanceFeedback}</p> : null}
          </form>
        </div>
      ) : null}

      <div className="screen-grid gerencia-focus-grid">
        <div className="section-card gerencia-focus-card">
          <div className="section-header">
            <div className="section-title">Operacao agora</div>
            <span className="section-subtitle">Leitura rapida</span>
          </div>
          <div className="gerencia-focus-list">
            <div className="gerencia-focus-item">
              <span>Caixas em operacao</span>
              <strong>{caixasAbertos.length}</strong>
            </div>
            <div className="gerencia-focus-item">
              <span>Vendas registradas</span>
              <strong>{vendasHojeVinculadas.length}</strong>
            </div>
            <div className="gerencia-focus-item">
              <span>Saidas do dia</span>
              <strong>{totalSaidasHoje}</strong>
            </div>
            <div className="gerencia-focus-item">
              <span>Alertas de estoque</span>
              <strong className={totalAlertasEstoque ? "negative" : "positive"}>
                {totalAlertasEstoque}
              </strong>
            </div>
          </div>
        </div>

        <div className="section-card gerencia-focus-card">
          <div className="section-header">
            <div className="section-title">Caixas do dia</div>
            <span className="section-subtitle">{caixasDoDia.length} registros</span>
          </div>
          <div className="scroll-list">
            {caixasDoDia.map((caixa) => (
              <div className="list-row" key={caixa.id}>
                <div>
                  <strong>{caixa.atendenteNome}</strong>
                  <small>Fundo <span className="positive">{formatMoney(caixa.fundoCaixa || 0)}</span> • {formatDateLabel(caixa.data)}</small>
                </div>
                <div className="list-row-actions">
                  <strong className={caixa.status === "aberto" ? "positive" : ""}>
                    {caixa.status === "aberto" ? "Aberto" : "Fechado"}
                  </strong>
                  {caixa.status === "aberto" ? (
                    <button
                      className="mini-btn"
                      type="button"
                      onClick={() => abrirAcaoCaixa("fechar", caixa)}
                    >
                      Fechar
                    </button>
                  ) : (
                    <button
                      className="mini-btn danger"
                      type="button"
                      onClick={() => abrirAcaoCaixa("excluir", caixa)}
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!caixasDoDia.length && <p className="empty-state">Nenhum caixa registrado no momento.</p>}
          </div>
        </div>
      </div>

      {acaoCaixa ? (
        <div className="section-card gerencia-action-card">
          <div className="section-header">
            <div className="section-title">
              {acaoCaixa.tipo === "fechar" ? "Fechar caixa pela gerencia" : "Excluir caixa pela gerencia"}
            </div>
            <span className="section-subtitle">{acaoCaixa.caixa.atendenteNome}</span>
          </div>
          <div className="stack-form">
            <p className="screen-description gerencia-action-description">
              Digite a senha da gerencia para {acaoCaixa.tipo === "fechar" ? "fechar" : "excluir"} este caixa.
            </p>
            <input
              className="input"
              type="password"
              value={senhaGerencia}
              onChange={(e) => setSenhaGerencia(e.target.value)}
              placeholder="Senha da gerencia"
            />
            <div className="section-actions gerencia-action-buttons">
              <button
                className="action-btn action-btn-secondary"
                type="button"
                onClick={fecharPainelAcao}
                disabled={salvandoAcaoCaixa}
              >
                Cancelar
              </button>
              <button
                className={acaoCaixa.tipo === "fechar" ? "action-btn action-btn-warning" : "action-btn action-btn-danger"}
                type="button"
                onClick={confirmarAcaoCaixa}
                disabled={salvandoAcaoCaixa}
              >
                {salvandoAcaoCaixa
                  ? "Processando..."
                  : acaoCaixa.tipo === "fechar"
                    ? "Confirmar fechamento"
                    : "Confirmar exclusao"}
              </button>
            </div>
            {feedbackAcaoCaixa ? <p className="inline-feedback">{feedbackAcaoCaixa}</p> : null}
          </div>
        </div>
      ) : null}

      <details className="section-card gerencia-disclosure" open>
        <summary className="gerencia-disclosure-summary">
          <div>
            <strong>Estoque em alerta</strong>
            <small>{totalAlertasEstoque} produtos em atencao</small>
          </div>
        </summary>
        <div className="scroll-list gerencia-disclosure-body">
          {semEstoque.map((produto) => (
            <div className="list-row stock-low" key={`zero-${produto.id}`}>
              <div>
                <strong>{produto.nome}</strong>
                <small>Sem estoque • venda <span className="positive">{formatMoney(produto.precoFinal ?? produto.preco ?? 0)}</span></small>
              </div>
              <strong className="negative">0</strong>
            </div>
          ))}
          {estoqueBaixo.map((produto) => (
            <div className="list-row stock-low" key={`low-${produto.id}`}>
              <div>
                <strong>{produto.nome}</strong>
                <small>Estoque baixo • venda <span className="positive">{formatMoney(produto.precoFinal ?? produto.preco ?? 0)}</span></small>
              </div>
              <strong className="negative">{produto.estoque}</strong>
            </div>
          ))}
          {!estoqueBaixo.length && !semEstoque.length && (
            <p className="empty-state">Nenhum alerta de estoque no momento.</p>
          )}
        </div>
      </details>

      <details className="section-card gerencia-disclosure">
        <summary className="gerencia-disclosure-summary">
          <div>
            <strong>Movimento do dia</strong>
            <small>{ultimasVendas.length} vendas recentes e {ultimasSaidas.length} saidas recentes</small>
          </div>
        </summary>
        <div className="screen-grid gerencia-details-grid">
          <div>
            <div className="section-header">
              <div className="section-title">Ultimas vendas</div>
              <span className="section-subtitle">{vendasHojeVinculadas.length} registros</span>
            </div>
            <div className="scroll-list gerencia-disclosure-body">
              {ultimasVendas.map((item) => (
                <div className="list-row" key={item.id}>
                  <div>
                    <strong>{item.produto}</strong>
                    <small>
                      {item.quantidade} un. • {item.formaPagamento || "Sem forma"} • {item.atendenteNome || item.atendente}
                    </small>
                  </div>
                  <strong className="positive">{formatMoney(item.valor)}</strong>
                </div>
              ))}
              {!vendasHojeVinculadas.length && <p className="empty-state">Nenhuma venda registrada hoje.</p>}
            </div>
          </div>

          <div>
            <div className="section-header">
              <div className="section-title">Saidas do dia</div>
              <span className="section-subtitle">{totalSaidasHoje} registros</span>
            </div>
            <div className="scroll-list gerencia-disclosure-body">
              {ultimasSaidas.map((item, index) => (
                <div className="list-row" key={`${item.id}-${index}`}>
                  <div>
                    <strong>{item.titulo || "Saida"}</strong>
                    <small>{item.detalhe}</small>
                  </div>
                  <strong className="negative">{formatMoney(item.valor)}</strong>
                </div>
              ))}
              {!despesasHoje.length && !retiradasHojeVinculadas.length && (
                <p className="empty-state">Nenhuma saida registrada hoje.</p>
              )}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
