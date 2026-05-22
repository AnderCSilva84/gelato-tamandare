import { useEffect, useMemo, useState } from "react";
import {
  deleteCaixa,
  fecharCaixa,
  getCaixas,
  subscribeCaixasAbertos,
} from "../services/caixas";
import { subscribeProdutos } from "../services/produtos";
import { DEFAULT_SYSTEM_CONFIG, saveSystemConfig } from "../services/sistema";
import { isSuperAdminRole } from "../utils/access";

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
  return `${dia}/${mes}/${ano}`;
}

function formatDateTimeLabel(valor) {
  if (!valor) return "";

  if (typeof valor?.toDate === "function") {
    return valor.toDate().toLocaleString("pt-BR");
  }

  if (valor instanceof Date) {
    return valor.toLocaleString("pt-BR");
  }

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? "" : data.toLocaleString("pt-BR");
}

export default function Gerencia({ uid, dataHoje, onNavigate, accessUser, systemConfig }) {
  const [produtos, setProdutos] = useState([]);
  const [caixasHoje, setCaixasHoje] = useState([]);
  const [caixasAbertosAtuais, setCaixasAbertosAtuais] = useState([]);
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

    const unsubProdutos = subscribeProdutos(uid, setProdutos);
    const unsubCaixasAbertos = subscribeCaixasAbertos(setCaixasAbertosAtuais);

    let ativo = true;
    getCaixas(dataHoje, dataHoje).then((items) => {
      if (ativo) setCaixasHoje(items);
    });

    return () => {
      ativo = false;
      unsubProdutos();
      unsubCaixasAbertos();
    };
  }, [uid, dataHoje]);

  useEffect(() => {
    setMaintenanceMode(systemConfig?.maintenanceMode === true);
    setMaintenanceTitle(systemConfig?.maintenanceTitle || DEFAULT_SYSTEM_CONFIG.maintenanceTitle);
    setMaintenanceMessage(systemConfig?.maintenanceMessage || DEFAULT_SYSTEM_CONFIG.maintenanceMessage);
  }, [systemConfig]);

  const caixasAbertos = useMemo(
    () => caixasAbertosAtuais.filter((item) => item.status === "aberto"),
    [caixasAbertosAtuais]
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
  const totalAlertasEstoque = estoqueBaixo.length + semEstoque.length;
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

        await fecharCaixa(caixa.id, {
          totalVendas: Number(caixa.totalVendas || 0),
          totalItens: Number(caixa.totalItens || 0),
          totalDinheiro: Number(caixa.totalDinheiro || 0),
          totalRetiradas: Number(caixa.totalRetiradas || 0),
          valorEmCaixa: Number(caixa.valorEmCaixa || 0),
        });

        setCaixasHoje((prev) =>
          prev.map((item) =>
            item.id === caixa.id
              ? {
                  ...item,
                  status: "fechado",
                  fechadoEm: new Date(),
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
          <span className="pdv-eyebrow">Central Gerencial</span>
          <h1 className="screen-title app-hero-title-blue">Hub de operacao</h1>
          <p className="screen-description">
            Use esta tela para acompanhar alertas, caixas abertos e acessos rapidos. Os detalhes financeiros ficam no Fluxo e no Relatorio.
          </p>
        </div>
        <span className="screen-badge">{formatDateLabel(dataHoje)}</span>
      </div>

      <div className="stats-grid gerencia-stats-grid gerencia-stats-grid-compact">
        <div className="section-card stat-card">
          <span className="stat-label">Caixas abertos</span>
          <strong className="stat-value">{caixasAbertos.length}</strong>
          <small className="stat-note">Turnos em operacao neste momento.</small>
        </div>
        <div className="section-card stat-card">
          <span className="stat-label">Alertas</span>
          <strong className={`stat-value ${totalAlertasEstoque ? "negative" : "positive"}`}>
            {totalAlertasEstoque}
          </strong>
          <small className="stat-note">Produtos sem estoque ou abaixo do limite.</small>
        </div>
      </div>

      <div className="gerencia-micro-grid">
        <div className="section-card gerencia-micro-card">
          <span className="stat-label">PDV</span>
          <strong>{caixasAbertos.length ? "Turnos ativos" : "Sem turno aberto"}</strong>
        </div>
        <div className="section-card gerencia-micro-card">
          <span className="stat-label">Fluxo</span>
          <strong>Conferencia financeira</strong>
        </div>
        <div className="section-card gerencia-micro-card">
          <span className="stat-label">Estoque</span>
          <strong>{totalAlertasEstoque ? `${totalAlertasEstoque} alertas` : "Sem alertas"}</strong>
        </div>
        <div className="section-card gerencia-micro-card">
          <span className="stat-label">Relatorio</span>
          <strong>Analise consolidada</strong>
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
            <div className="section-title">Acoes rapidas</div>
            <span className="section-subtitle">Atalhos principais</span>
          </div>
          <div className="gerencia-focus-list">
            <div className="gerencia-focus-item">
              <span>PDV</span>
              <strong>{caixasAbertos.length ? "Em uso" : "Disponivel"}</strong>
            </div>
            <div className="gerencia-focus-item">
              <span>Fluxo de caixa</span>
              <strong>Conferir</strong>
            </div>
            <div className="gerencia-focus-item">
              <span>Estoque</span>
              <strong>{totalAlertasEstoque ? "Atencao" : "Normal"}</strong>
            </div>
            <div className="gerencia-focus-item">
              <span>Relatorio</span>
              <strong>Consultar</strong>
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
                  <small>
                    Fundo <span className="positive">{formatMoney(caixa.fundoCaixa || 0)}</span> • {formatDateLabel(caixa.data)}
                  </small>
                  <small>Abertura: {formatDateTimeLabel(caixa.abertoEm) || "Nao disponivel"}</small>
                  <small>
                    Fechamento: {caixa.status === "fechado" ? formatDateTimeLabel(caixa.fechadoEm) || "Nao disponivel" : "Em aberto"}
                  </small>
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
    </div>
  );
}
