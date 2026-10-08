import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import ErroAplicacao from './components/ErroAplicacao';
import "./styles.css";

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <ErroAplicacao><App /></ErroAplicacao>
    </HashRouter>
  </StrictMode>,
)
