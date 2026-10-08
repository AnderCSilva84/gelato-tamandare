import { Component } from 'react';

export default class ErroAplicacao extends Component {
  state = { falha: false };
  static getDerivedStateFromError() { return { falha: true }; }
  render() {
    if (this.state.falha) return (
      <main className="section-card" role="alert">
        <h1>Nao foi possivel carregar esta tela</h1>
        <p>Recarregue o sistema. Se houve uma venda em andamento, confira o historico ou verifique a venda pendente antes de registrar novamente.</p>
        <button className="button" onClick={() => window.location.reload()}>Recarregar sistema</button>
      </main>
    );
    return this.props.children;
  }
}
