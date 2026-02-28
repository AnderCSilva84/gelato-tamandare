import { useEffect, useMemo, useState } from "react";
import { observeAuth, login, logout } from "./services/auth";
import {
  criarLancamento,
  escutarLancamentosMes,
  escutarTodosLancamentos,
  hojeISO,
  mesISO,
  apagarLancamento, // ✅ NOVO
} from "./services/lancamentos";
import "./styles.css";

function formatMoney(valor, ocultar) {
  if (ocultar) return "R$ •••••";
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarDataBR(dataISO) {
  if (!dataISO) return "";
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

function getMonthFromDate(dateStr) {
  return String(dateStr || "").slice(0, 7); // "YYYY-MM"
}

function isRetroativo(mesLancamento) {
  return mesLancamento !== mesISO();
}

function getLastNMonths(n = 3) {
  const meses = [];
  const base = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    meses.push(`${y}-${m}`);
  }
  return meses;
}

// garante que o mês selecionado e o mês do retroativo apareçam no dropdown
function buildMonthsOptions({ mesSelecionado, mesDoLancamento }) {
  const set = new Set(getLastNMonths(3));
  if (mesSelecionado) set.add(mesSelecionado);
  if (mesDoLancamento) set.add(mesDoLancamento);

  // ordena desc (YYYY-MM é lexicográfico ok)
  return Array.from(set).sort((a, b) => (a < b ? 1 : -1));
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erroLogin, setErroLogin] = useState("");

  const [lancamentos, setLancamentos] = useState([]);
  const [mesSelecionado, setMesSelecionado] = useState(mesISO());

  const [filtroAtivo, setFiltroAtivo] = useState(false);
  const [dataInicial, setDataInicial] = useState("");
  const [dataFinal, setDataFinal] = useState("");
  const [buscaDataAtiva, setBuscaDataAtiva] = useState(false);

  const [descricaoSaida, setDescricaoSaida] = useState("");
  const [valorSaida, setValorSaida] = useState("");
  const [outroValor, setOutroValor] = useState("");

  // Data usada para criar lançamentos (pode ser retroativa)
  const [dataLancamento, setDataLancamento] = useState(hojeISO());

  // ✅ data temporária com botão OK
  const [dataTemp, setDataTemp] = useState(hojeISO());
  const [mostrarLancamentoRetroativo, setMostrarLancamentoRetroativo] = useState(false);
  function confirmarData() {
    setDataLancamento(dataTemp);
  }

  // Embarcação
  const [embarcacao, setEmbarcacao] = useState("");
  const [embarcacaoOutra, setEmbarcacaoOutra] = useState("");

  const [ocultarValores, setOcultarValores] = useState(false);



  // ✅ TOTAL GERAL cache (pra não “sumir” ao abrir)
  const [todosLancamentos, setTodosLancamentos] = useState([]);
  const [totalGeralCache, setTotalGeralCache] = useState(() => {
    const v = localStorage.getItem("TOTAL_GERAL_CACHE");
    return v ? Number(v) : 0;
  });

  const mesDoLancamento = useMemo(
    () => getMonthFromDate(dataLancamento),
    [dataLancamento]
  );

  const mesesDropdown = useMemo(() => {
    return buildMonthsOptions({ mesSelecionado, mesDoLancamento });
  }, [mesSelecionado, mesDoLancamento]);

  const lancamentosFiltrados = useMemo(() => {
    if (!buscaDataAtiva || !dataInicial || !dataFinal) return lancamentos;

    return todosLancamentos.filter(
      (l) => l.data >= dataInicial && l.data <= dataFinal
    );
  }, [lancamentos, todosLancamentos, buscaDataAtiva, dataInicial, dataFinal]);

  const lancamentosOrdenados = useMemo(() => {
    return [...lancamentosFiltrados].sort((a, b) => {
      const dataA = String(a?.data || "");
      const dataB = String(b?.data || "");

      const byDate = dataB.localeCompare(dataA);
      if (byDate !== 0) return byDate;

      const idA = String(a?.id || "");
      const idB = String(b?.id || "");
      return idB.localeCompare(idA);
    });
  }, [lancamentosFiltrados]);

  function toggleFiltro() {
    setFiltroAtivo((prev) => {
      const novo = !prev;
      if (!novo) {
        setBuscaDataAtiva(false);
        setDataInicial("");
        setDataFinal("");
        setMesSelecionado(mesISO());
      }
      return novo;
    });
  }

  function toggleBuscaData() {
    if (buscaDataAtiva) {
      setBuscaDataAtiva(false);
      setDataInicial("");
      setDataFinal("");
      setMesSelecionado(mesISO());
      setFiltroAtivo(false);
      return;
    }

    if (!dataInicial || !dataFinal) {
      alert("Selecione data inicial e data final para buscar o extrato.");
      return;
    }

    setBuscaDataAtiva(true);
  }

  // AUTH
  useEffect(() => {
    const unsub = observeAuth((u) => {
      setUser(u);
      setLoadingAuth(false);
      if (!u) setLancamentos([]);
      if (!u) setTodosLancamentos([]);
    });
    return () => unsub();
  }, []);

  // FIRESTORE LISTENER (por mês selecionado no extrato)
  useEffect(() => {
    if (!user) return;

    const unsub = escutarLancamentosMes(
      user.uid,
      mesSelecionado,
      (itens) => setLancamentos(itens)
    );
    return () => unsub && unsub();
  }, [user, mesSelecionado]);

  // ✅ LISTENER GLOBAL (TOTAL GERAL DA VIDA)
  useEffect(() => {
    if (!user) return;

    const unsub = escutarTodosLancamentos(user.uid, (itens) => {
      setTodosLancamentos(itens);
    });

    return () => unsub && unsub();
  }, [user]);

  // ✅ TOTAL GERAL (vida toda, incluindo retroativos)
  const totalGeral = useMemo(() => {
    return todosLancamentos.reduce((acc, l) => {
      return l.tipo === "ENTRADA"
        ? acc + Number(l.valor)
        : acc - Number(l.valor);
    }, 0);
  }, [todosLancamentos]);

  // ✅ atualiza cache do total no localStorage
  useEffect(() => {
    if (Number.isFinite(totalGeral)) {
      setTotalGeralCache(totalGeral);
      localStorage.setItem("TOTAL_GERAL_CACHE", String(totalGeral));
    }
  }, [totalGeral]);

  const totalExibido =
    Number.isFinite(totalGeral) && totalGeral !== 0 ? totalGeral : totalGeralCache;

  function toggleLancamentoRetroativo() {
    setMostrarLancamentoRetroativo((prev) => {
      const novo = !prev;
      if (!novo) {
        const hoje = hojeISO();
        setDataTemp(hoje);
        setDataLancamento(hoje);
      }
      return novo;
    });
  }

  // SALDOS (mantive teu saldoMes/saldoDia intacto, mas agora você usa Total Geral)
  const saldoMes = useMemo(() => {
    return lancamentos.reduce((acc, l) => {
      return l.tipo === "ENTRADA"
        ? acc + Number(l.valor)
        : acc - Number(l.valor);
    }, 0);
  }, [lancamentos]);

  const saldoDia = useMemo(() => {
    const hoje = hojeISO();
    return lancamentos
      .filter((l) => l.data === hoje)
      .reduce((acc, l) => {
        return l.tipo === "ENTRADA"
          ? acc + Number(l.valor)
          : acc - Number(l.valor);
      }, 0);
  }, [lancamentos]);

  async function handleLogin(e) {
    e.preventDefault();
    setErroLogin("");
    try {
      await login(email, senha);
    } catch {
      setErroLogin("Email ou senha inválidos.");
    }
  }

  function getEmbarcacaoFinal() {
    if (embarcacao === "OUTRA") return (embarcacaoOutra || "").trim();
    return (embarcacao || "").trim();
  }

  async function registrarEntrada(valor) {
    if (!user) return;

    const v = Number(valor);
    if (!Number.isFinite(v) || v <= 0) return;

    const data = dataLancamento || hojeISO();
    const mes = getMonthFromDate(data);

    const embarcacaoFinal = getEmbarcacaoFinal();
    if (!embarcacaoFinal) {
      alert("Selecione a embarcação antes de registrar a entrada.");
      return;
    }

    await criarLancamento({
      uid: user.uid,
      tipo: "ENTRADA",
      valor: v,
      data,
      mes,
      descricao: embarcacaoFinal,
      embarcacao: embarcacaoFinal,
    });

    if (mes !== mesSelecionado) setMesSelecionado(mes);

    // limpa campos após envio
    setOutroValor("");
    setEmbarcacao("");
    setEmbarcacaoOutra("");
  }

  async function registrarSaida() {
    if (!user) return;

    const v = Number(valorSaida);
    if (!Number.isFinite(v) || v <= 0) return;

    const data = dataLancamento || hojeISO();
    const mes = getMonthFromDate(data);

    await criarLancamento({
      uid: user.uid,
      tipo: "SAIDA",
      valor: v,
      data,
      mes,
      descricao: (descricaoSaida || "Saída").trim(),
    });

    if (mes !== mesSelecionado) setMesSelecionado(mes);

    // limpa campos após envio
    setDescricaoSaida("");
    setValorSaida("");
  }

  // apagar lançamento
  async function handleApagarLancamento(l) {
    if (!user) return;
    if (!l?.id) return;

    const confirma = window.confirm(
      `Apagar este lançamento?\n\n${formatarDataBR(l.data)} • ${l.descricao}\n${l.tipo} • ${formatMoney(l.valor, false)}`
    );
    if (!confirma) return;

    try {
      await apagarLancamento(user.uid, l.id);
      setLancamentos((prev) => prev.filter((item) => item.id !== l.id));
      setTodosLancamentos((prev) => prev.filter((item) => item.id !== l.id));
    } catch (err) {
      console.error(err);
      alert("Não foi possível apagar. Verifique sua conexão e tente novamente.");
    }
  }

  function exportarPDF() {
    const itens = lancamentosFiltrados.length ? lancamentosFiltrados : lancamentos;

    const linhas = itens.map((l) => {
      const descricao = l.embarcacao ? l.embarcacao : l.descricao;
      return `${formatarDataBR(l.data)} | ${descricao} | ${l.tipo} | ${formatMoney(l.valor, false)}`;
    });

    const textoLinhas = [
      "BANCO DO PORTO",
      `Extrato do mês: ${mesSelecionado}`,
      "",
      ...linhas,
      "",
      `Saldo do mês (filtro atual): ${formatMoney(saldoMes, false)}`,
      `Total geral (vida toda): ${formatMoney(totalGeral, false)}`
    ];

    const normalizeAscii = (value) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\x20-\x7E]/g, " ");

    const escapePdfText = (value) =>
      normalizeAscii(value)
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)");

    const pdfText = ["BT", "/F1 11 Tf", "40 800 Td"];
    textoLinhas.forEach((linha, i) => {
      if (i > 0) pdfText.push("0 -16 Td");
      pdfText.push(`(${escapePdfText(linha)}) Tj`);
    });
    pdfText.push("ET");

    const stream = `${pdfText.join("\n")}\n`;

    const objects = [
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
      "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n",
      `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`,
      "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    ];

    let pdf = "%PDF-1.4\n";
    const offsets = [0];

    objects.forEach((obj) => {
      offsets.push(pdf.length);
      pdf += obj;
    });

    const xrefStart = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (let i = 1; i <= objects.length; i++) {
      pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
    }

    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

    const blob = new Blob([pdf], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `extrato-${mesSelecionado}.pdf`;
    a.click();

    URL.revokeObjectURL(url);
  }

  if (loadingAuth) return <div className="app-container">Carregando...</div>;

  if (!user) {
    return (
      <div className="app-container">
        <div className="card">
          <h2>Login</h2>
          <form onSubmit={handleLogin}>
            <input
              className="input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              className="input"
              type="password"
              placeholder="Senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
            <button className="button" type="submit">
              Entrar
            </button>
          </form>
          {erroLogin && <p style={{ color: "red" }}>{erroLogin}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* HEADER com data atual fixa (BR) */}
      <div className="header">
        Banco do Porto
        <div className="header-date">{formatarDataBR(hojeISO())}</div>
      </div>

      {/* CARD do usuário (nome fixo) */}
      <div className="card data-card">
        <div className="data-label">Logado como</div>
        <div className="data-value">
          <strong>Moises Pinheiro</strong>
        </div>
      </div>

      {/* TOTAL GERAL */}
      <div className="saldo-container">
        <div className="saldo-grid">
          <div className={`card saldo-card saldo-card-single ${totalExibido >= 0 ? "total-positivo" : "total-negativo"}`}>
            <div className="saldo-top">
              <div className="saldo-label">Total Geral</div>
              <button
                className="eye-toggle-in"
                onClick={() => setOcultarValores(!ocultarValores)}
                type="button"
                title="Ocultar/mostrar valores"
              >
                {ocultarValores ? "🙈" : "👁️"}
              </button>
            </div>

            {/* ✅ mostra cache enquanto snapshot não chega */}
            <div className="saldo-value saldo-value-big">
              {formatMoney(totalExibido, ocultarValores)}
            </div>
          </div>
        </div>
      </div>

      {/* ENTRADA */}
      <div className="card section">
        <div className="section-title">Registrar Entrada</div>

        <select
          className="input"
          value={embarcacao}
          onChange={(e) => setEmbarcacao(e.target.value)}
        >
          <option value="">Selecione a embarcação</option>
          <option value="CAMPEÃO 6">CAMPEÃO 6</option>
          <option value="CLICIA XIII">CLICIA XIII</option>
          <option value="ERICK FABIAN IV">AERICK FABIAN IV</option>
          <option value="EXPRESSO A. ORCA III (SAMUELLY VIII)">
            EXPRESSO A. ORCA III (SAMUELLY VIII)
          </option>
          <option value="EXPRESSO MARUSA">EXPRESSO MARUSA</option>
          <option value="LUZ DA AURORA III">LUZ DA AURORA III</option>
          <option value="RAQUEL">RAQUEL</option>
          <option value="JOSYANNE I">JOSYANNE I</option>
        </select>

        {embarcacao === "OUTRA" && (
          <input
            className="input"
            placeholder="Digite o nome da embarcação"
            value={embarcacaoOutra}
            onChange={(e) => setEmbarcacaoOutra(e.target.value)}
          />
        )}

        <div className="button-group">
          <button className="button button-entrada" onClick={() => registrarEntrada(150)}>
            +150
          </button>
          <button className="button button-entrada" onClick={() => registrarEntrada(75)}>
            +75
          </button>
          <button
            className="button secondary"
            onClick={() => {
              if (outroValor) registrarEntrada(outroValor);
            }}
          >
            OK
          </button>
        </div>

        <input
          className="input"
          type="number"
          placeholder="Digite outro valor"
          value={outroValor}
          onChange={(e) => setOutroValor(e.target.value)}
        />
      </div>

      {/* SAÍDA */}
      <div className="card section">
        <div className="section-title">Registrar Saída</div>

        <input
          className="input"
          placeholder="Descrição"
          value={descricaoSaida}
          onChange={(e) => setDescricaoSaida(e.target.value)}
        />

        <input
          className="input"
          type="number"
          placeholder="Valor"
          value={valorSaida}
          onChange={(e) => setValorSaida(e.target.value)}
        />

        <button className="button button-saida" onClick={registrarSaida}>
          REGISTRAR
        </button>
      </div>

      {/* EXTRATO */}
      <div className="card section">
        <div className="section-title">Extrato</div>

        <div style={{ marginBottom: 10 }}>
          {/* mantém “mês atual” via dropdown/mesSelecionado */}
          <button
            className={`button button-filtro ${filtroAtivo ? "botao-ativo" : "botao-inativo"}`}
            onClick={toggleFiltro}
            type="button"
          >
            Filtrar por Data
          </button>

          {filtroAtivo && (
            <div style={{ marginTop: 10 }}>
              <input
                className="input"
                type="date"
                value={dataInicial}
                onChange={(e) => setDataInicial(e.target.value)}
              />
              <input
                className="input"
                type="date"
                value={dataFinal}
                onChange={(e) => setDataFinal(e.target.value)}
                style={{ marginTop: 6 }}
              />

              <button
                className="button secondary"
                onClick={toggleBuscaData}
                type="button"
                style={{ marginTop: 8 }}
              >
                {buscaDataAtiva ? "Voltar para Mês Atual" : "Ativar Busca no Extrato"}
              </button>
            </div>
          )}
        </div>

        <div className="extrato-list">
          {lancamentosOrdenados.map((l) => {
            const retro = isRetroativo(l.mes);

            return (
              <div
                key={l.id}
                className={`extrato-item ${
                  l.tipo === "ENTRADA" ? "entrada" : "saida"
                }`}
              >
                <div className="extrato-left">
                  <span className="descricao">
                    {l.embarcacao ? l.embarcacao : l.descricao}
                    {retro && <span className="badge-retroativo">Retroativo</span>}
                  </span>
                  <small>{formatarDataBR(l.data)}</small>
                </div>

                <span className="valor">
                  {formatMoney(l.valor, ocultarValores)}
                </span>

                <button
                  className="delete-icon"
                  onClick={() => handleApagarLancamento(l)}
                  title="Apagar lançamento"
                  type="button"
                >
                  🗑
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* LANÇAMENTO RETROATIVO + EXPORTAÇÃO */}
      <div className="card section">
        <button
          className={`button button-retroativo ${mostrarLancamentoRetroativo ? "botao-ativo" : "botao-inativo"}`}
          onClick={toggleLancamentoRetroativo}
          type="button"
        >
          Lançamento retroativo
        </button>

        {mostrarLancamentoRetroativo && (
          <>
            <div className="section-title">Data do Lançamento</div>
            <input
              className="input"
              type="date"
              value={dataTemp}
              onChange={(e) => setDataTemp(e.target.value)}
            />
            <button className="button secondary" onClick={confirmarData}>
              Confirmar Data
            </button>
            <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
              Data ativa: <strong>{formatarDataBR(dataLancamento)}</strong>
            </div>
          </>
        )}

        <button
          className="button button-exportar"
          style={{ marginTop: 15 }}
          onClick={exportarPDF}
        >
          Exportar PDF
        </button>
      </div>

      <button className="button logout" onClick={logout}>
        Sair
      </button>
    </div>
  );
}
