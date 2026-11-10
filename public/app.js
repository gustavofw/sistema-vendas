'use strict';

// ================= Configuração =================
const TIPOS_PADRAO = ['Celular', 'Acessório', 'Capinha', 'Película', 'Carregador', 'Fone de ouvido', 'Eletrônico', 'Perfume', 'Relógio', 'Outros'];
const PAGAMENTOS_PADRAO = ['Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito'];

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

let token = localStorage.getItem('token') || '';
let sugestoes = { produtos: [], tipos: [], pagamentos: [] };
let pagamentoSel = '';

// ================= Utilitários =================
const fmtBRL = (centavos) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function parseValor(txt) {
  let s = String(txt).replace(/[^\d,.-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

function hojeISO(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
function horaAgora() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function fmtData(iso) {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}
function diaSemana(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long' });
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
function toast(msg, erro = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('erro-toast', erro);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

async function api(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && !url.endsWith('/login')) {
    sair(false);
    throw new Error('Sessão expirada. Entre novamente.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || 'Erro na comunicação com o servidor');
  return data;
}

// ================= Login =================
function mostrarLogin() {
  $('#app').classList.add('hidden');
  $('#tela-login').classList.remove('hidden');
  $('#login-senha').focus();
}
async function iniciarApp() {
  $('#tela-login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  resetForm();
  await carregarSugestoes();
  carregarHoje();
}

$('#form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-erro').textContent = '';
  try {
    const r = await api('/api/login', { method: 'POST', body: { senha: $('#login-senha').value } });
    token = r.token;
    localStorage.setItem('token', token);
    $('#login-senha').value = '';
    iniciarApp();
  } catch (err) {
    $('#login-erro').textContent = err.message;
  }
});

function sair(avisarServidor = true) {
  if (avisarServidor && token) api('/api/logout', { method: 'POST' }).catch(() => {});
  token = '';
  localStorage.removeItem('token');
  mostrarLogin();
}
$('#btn-sair').addEventListener('click', () => sair());

// ================= Abas =================
function abrirAba(nome) {
  $$('.abas button').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === nome));
  $$('.aba').forEach((s) => s.classList.toggle('hidden', s.id !== `aba-${nome}`));
  if (nome === 'vendas') carregarLista();
  if (nome === 'nova') carregarHoje();
  window.scrollTo(0, 0);
}
$$('.abas button').forEach((b) => b.addEventListener('click', () => abrirAba(b.dataset.aba)));

// ================= Sugestões (autocompletar) =================
async function carregarSugestoes() {
  try {
    sugestoes = await api('/api/sugestoes');
  } catch { /* segue com padrões */ }
  const tipos = [...new Set([...TIPOS_PADRAO, ...sugestoes.tipos])];
  const pagamentos = [...new Set([...PAGAMENTOS_PADRAO, ...sugestoes.pagamentos])];

  $('#lista-produtos').innerHTML = sugestoes.produtos.map((p) => `<option value="${esc(p)}">`).join('');
  $('#lista-tipos').innerHTML = tipos.map((t) => `<option value="${esc(t)}">`).join('');

  const selTipo = $('#r-filtro-tipo'), selPag = $('#r-filtro-pagamento');
  const vTipo = selTipo.value, vPag = selPag.value;
  selTipo.innerHTML = '<option value="">Todos</option>' + tipos.map((t) => `<option>${esc(t)}</option>`).join('');
  selPag.innerHTML = '<option value="">Todas</option>' + pagamentos.map((p) => `<option>${esc(p)}</option>`).join('');
  selTipo.value = vTipo; selPag.value = vPag;

  renderChipsPagamento();
}

function renderChipsPagamento() {
  const opcoes = [...PAGAMENTOS_PADRAO, 'Outro'];
  const ehOutro = pagamentoSel && !PAGAMENTOS_PADRAO.includes(pagamentoSel);
  $('#v-pagamentos').innerHTML = opcoes
    .map((p) => {
      const sel = p === pagamentoSel || (p === 'Outro' && ehOutro);
      return `<button type="button" class="chip${sel ? ' sel' : ''}" data-pag="${esc(p)}">${esc(p)}</button>`;
    })
    .join('');
  $('#v-pagamento-outro').classList.toggle('hidden', !ehOutro && pagamentoSel !== 'Outro');
}

$('#v-pagamentos').addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  pagamentoSel = b.dataset.pag;
  if (pagamentoSel === 'Outro') {
    $('#v-pagamento-outro').value = '';
    renderChipsPagamento();
    $('#v-pagamento-outro').focus();
  } else {
    renderChipsPagamento();
  }
});

// ================= Formulário de venda =================
function atualizaTotal() {
  const v = parseValor($('#v-valor').value);
  const q = parseInt($('#v-qtd').value, 10) || 1;
  $('#v-total').value = Number.isFinite(v) ? fmtBRL(v * q) : '';
}
$('#v-valor').addEventListener('input', atualizaTotal);
$('#v-qtd').addEventListener('input', atualizaTotal);

function resetForm() {
  $('#form-venda').reset();
  $('#v-id').value = '';
  $('#v-qtd').value = 1;
  $('#v-data').value = hojeISO();
  $('#v-hora').value = horaAgora();
  $('#v-total').value = '';
  pagamentoSel = '';
  renderChipsPagamento();
  $('#form-titulo').textContent = 'Registrar venda';
  $('#btn-cancelar-edicao').classList.add('hidden');
}
$('#btn-cancelar-edicao').addEventListener('click', resetForm);

$('#form-venda').addEventListener('submit', async (e) => {
  e.preventDefault();
  let pagamento = pagamentoSel;
  if (pagamento === 'Outro' || (pagamento && !PAGAMENTOS_PADRAO.includes(pagamento))) {
    pagamento = $('#v-pagamento-outro').value.trim();
  }
  if (!pagamento) return toast('Escolha a forma de pagamento', true);

  const valor = parseValor($('#v-valor').value);
  if (!Number.isFinite(valor) || valor < 0) return toast('Valor inválido', true);

  const venda = {
    produto: $('#v-produto').value.trim(),
    tipo: $('#v-tipo').value.trim(),
    quantidade: parseInt($('#v-qtd').value, 10) || 1,
    valor_unitario: valor,
    pagamento,
    data: $('#v-data').value,
    hora: $('#v-hora').value,
    observacao: $('#v-obs').value.trim(),
  };

  const id = $('#v-id').value;
  try {
    if (id) await api(`/api/vendas/${id}`, { method: 'PUT', body: venda });
    else await api('/api/vendas', { method: 'POST', body: venda });
    toast(id ? 'Venda atualizada ✔' : 'Venda registrada ✔');
    resetForm();
    carregarSugestoes();
    carregarHoje();
    $('#v-produto').focus();
  } catch (err) {
    toast(err.message, true);
  }
});

function editarVenda(v) {
  abrirAba('nova');
  $('#v-id').value = v.id;
  $('#v-produto').value = v.produto;
  $('#v-tipo').value = v.tipo;
  $('#v-qtd').value = v.quantidade;
  $('#v-valor').value = (v.valor_unitario / 100).toFixed(2).replace('.', ',');
  $('#v-data').value = v.data;
  $('#v-hora').value = v.hora;
  $('#v-obs').value = v.observacao || '';
  pagamentoSel = v.pagamento;
  renderChipsPagamento();
  if (!PAGAMENTOS_PADRAO.includes(v.pagamento)) $('#v-pagamento-outro').value = v.pagamento;
  atualizaTotal();
  $('#form-titulo').textContent = `Editando venda #${v.id}`;
  $('#btn-cancelar-edicao').classList.remove('hidden');
}

async function excluirVenda(v) {
  if (!confirm(`Excluir a venda "${v.produto}" de ${fmtBRL(v.valor_total)}?`)) return;
  try {
    await api(`/api/vendas/${v.id}`, { method: 'DELETE' });
    toast('Venda excluída');
    carregarHoje();
    if (!$('#aba-vendas').classList.contains('hidden')) carregarLista();
  } catch (err) {
    toast(err.message, true);
  }
}

// ================= Listagens =================
function renderResumo(el, vendas) {
  const total = vendas.reduce((s, v) => s + v.valor_total, 0);
  const itens = vendas.reduce((s, v) => s + v.quantidade, 0);
  el.innerHTML = `
    <div><small>Total vendido</small><strong>${fmtBRL(total)}</strong></div>
    <div><small>Vendas</small><strong>${vendas.length}</strong></div>
    <div><small>Itens</small><strong>${itens}</strong></div>`;
}

function renderVendas(el, vendas, agruparPorDia = false) {
  if (!vendas.length) {
    el.innerHTML = '<p class="vazio">Nenhuma venda encontrada.</p>';
    return;
  }
  let html = '';
  let diaAtual = '';
  vendas.forEach((v, i) => {
    if (agruparPorDia && v.data !== diaAtual) {
      diaAtual = v.data;
      html += `<div class="dia-titulo">${fmtData(v.data)} — ${diaSemana(v.data)}</div>`;
    }
    html += `
      <div class="venda">
        <div class="info">
          <div class="prod">${v.quantidade > 1 ? v.quantidade + 'x ' : ''}${esc(v.produto)}</div>
          <div class="meta">${esc(v.tipo)} · ${esc(v.pagamento)} · ${v.hora}</div>
          ${v.observacao ? `<div class="meta">${esc(v.observacao)}</div>` : ''}
        </div>
        <div class="direita">
          <div class="valor">${fmtBRL(v.valor_total)}</div>
          <div class="botoes">
            <button title="Editar" data-acao="editar" data-i="${i}">✏️</button>
            <button title="Excluir" data-acao="excluir" data-i="${i}">🗑️</button>
          </div>
        </div>
      </div>`;
  });
  el.innerHTML = html;
  el.onclick = (e) => {
    const b = e.target.closest('button[data-acao]');
    if (!b) return;
    const v = vendas[Number(b.dataset.i)];
    if (b.dataset.acao === 'editar') editarVenda(v);
    else excluirVenda(v);
  };
}

async function carregarHoje() {
  try {
    const hoje = hojeISO();
    const vendas = await api(`/api/vendas?inicio=${hoje}&fim=${hoje}`);
    renderResumo($('#resumo-hoje'), vendas);
    renderVendas($('#lista-hoje'), vendas);
  } catch (err) {
    toast(err.message, true);
  }
}

let buscaTimer;
async function carregarLista() {
  const p = new URLSearchParams({ inicio: $('#f-inicio').value, fim: $('#f-fim').value, produto: $('#f-busca').value.trim() });
  try {
    const vendas = await api(`/api/vendas?${p}`);
    renderResumo($('#resumo-lista'), vendas);
    renderVendas($('#lista-vendas'), vendas, true);
  } catch (err) {
    toast(err.message, true);
  }
}
$('#f-inicio').addEventListener('change', carregarLista);
$('#f-fim').addEventListener('change', carregarLista);
$('#f-busca').addEventListener('input', () => {
  clearTimeout(buscaTimer);
  buscaTimer = setTimeout(carregarLista, 300);
});

// ================= Relatórios =================
function periodo(opcao) {
  const h = new Date();
  const d = (y, m, day) => new Date(y, m, day);
  switch (opcao) {
    case 'hoje': return [hojeISO(h), hojeISO(h)];
    case 'ontem': { const o = d(h.getFullYear(), h.getMonth(), h.getDate() - 1); return [hojeISO(o), hojeISO(o)]; }
    case '7': return [hojeISO(d(h.getFullYear(), h.getMonth(), h.getDate() - 6)), hojeISO(h)];
    case 'mes': return [hojeISO(d(h.getFullYear(), h.getMonth(), 1)), hojeISO(d(h.getFullYear(), h.getMonth() + 1, 0))];
    case 'mes-passado': return [hojeISO(d(h.getFullYear(), h.getMonth() - 1, 1)), hojeISO(d(h.getFullYear(), h.getMonth(), 0))];
    case 'ano': return [hojeISO(d(h.getFullYear(), 0, 1)), hojeISO(d(h.getFullYear(), 11, 31))];
    default: return null;
  }
}
function aplicarPeriodo() {
  const p = periodo($('#r-periodo').value);
  if (p) { $('#r-inicio').value = p[0]; $('#r-fim').value = p[1]; }
}
$('#r-periodo').addEventListener('change', aplicarPeriodo);
['#r-inicio', '#r-fim'].forEach((s) => $(s).addEventListener('change', () => { $('#r-periodo').value = 'personalizado'; }));
aplicarPeriodo();

const NOMES_REL = {
  geral: 'Relatório geral de vendas',
  dia: 'Vendas por dia',
  produto: 'Vendas por produto',
  pagamento: 'Vendas por forma de pagamento',
  tipo: 'Vendas por tipo de produto',
  lista: 'Lista de vendas',
};

// Para cada valor de `campo` (dia, tipo...), soma `medida` agrupando por `alvo` e devolve um texto.
function detalhePorCampo(vendas, campo, alvo, medida, fmt) {
  const mapa = new Map();
  for (const v of vendas) {
    if (!mapa.has(v[campo])) mapa.set(v[campo], new Map());
    const m = mapa.get(v[campo]);
    m.set(v[alvo], (m.get(v[alvo]) || 0) + v[medida]);
  }
  return (chave) => [...(mapa.get(chave) || new Map())]
    .sort((a, b) => b[1] - a[1])
    .map(([nome, valor]) => fmt(esc(nome), valor))
    .join('<br>');
}
// "2x Capinha"
const produtosPor = (vendas, campo) => detalhePorCampo(vendas, campo, 'produto', 'quantidade', (n, q) => `${q}x ${n}`);
// "Pix: R$ 100,00"
const pagamentosPor = (vendas, campo) => detalhePorCampo(vendas, campo, 'pagamento', 'valor_total', (n, t) => `${n}: ${fmtBRL(t)}`);

// extras: colunas adicionais [{ titulo, de: (chave) => html }]
function tabelaGrupo(titulo, rotulo, linhas, total, fmtChave = esc, extras = []) {
  if (!linhas.length) return '';
  const corpo = linhas.map((l) => `
    <tr>
      <td>${fmtChave(l.chave)}</td>
      ${extras.map((x) => `<td class="detalhe">${x.de(l.chave)}</td>`).join('')}
      <td class="num">${l.vendas}</td>
      <td class="num">${l.itens}</td>
      <td class="num">${fmtBRL(l.total)}</td>
      <td class="num">${total ? ((l.total / total) * 100).toFixed(1).replace('.', ',') : '0'}%</td>
    </tr>`).join('');
  const sv = linhas.reduce((s, l) => s + l.vendas, 0);
  const si = linhas.reduce((s, l) => s + l.itens, 0);
  return `
    ${titulo ? `<h3>${titulo}</h3>` : ''}
    <div class="tabela-scroll"><table>
      <thead><tr><th>${rotulo}</th>${extras.map((x) => `<th>${x.titulo}</th>`).join('')}<th class="num">Vendas</th><th class="num">Itens</th><th class="num">Total</th><th class="num">%</th></tr></thead>
      <tbody>${corpo}</tbody>
      <tfoot><tr><td colspan="${1 + extras.length}">Total</td><td class="num">${sv}</td><td class="num">${si}</td><td class="num">${fmtBRL(total)}</td><td class="num">100%</td></tr></tfoot>
    </table></div>`;
}

function tabelaVendas(vendas, total) {
  if (!vendas.length) return '';
  const corpo = vendas.map((v) => `
    <tr>
      <td>${fmtData(v.data)} ${v.hora}</td>
      <td>${esc(v.produto)}${v.observacao ? `<br><small>${esc(v.observacao)}</small>` : ''}</td>
      <td>${esc(v.tipo)}</td>
      <td>${esc(v.pagamento)}</td>
      <td class="num">${v.quantidade}</td>
      <td class="num">${fmtBRL(v.valor_unitario)}</td>
      <td class="num">${fmtBRL(v.valor_total)}</td>
    </tr>`).join('');
  return `
    <h3>Vendas detalhadas</h3>
    <div class="tabela-scroll"><table>
      <thead><tr><th>Data</th><th>Produto</th><th>Tipo</th><th>Pagamento</th><th class="num">Qtd</th><th class="num">Unit.</th><th class="num">Total</th></tr></thead>
      <tbody>${corpo}</tbody>
      <tfoot><tr><td colspan="6">Total</td><td class="num">${fmtBRL(total)}</td></tr></tfoot>
    </table></div>`;
}

$('#form-relatorio').addEventListener('submit', async (e) => {
  e.preventDefault();
  const tipoRel = $('#r-tipo-rel').value;
  const inicio = $('#r-inicio').value, fim = $('#r-fim').value;
  if (inicio > fim) return toast('A data inicial é maior que a final', true);

  const filtros = { tipo: $('#r-filtro-tipo').value, pagamento: $('#r-filtro-pagamento').value, produto: $('#r-filtro-produto').value.trim() };
  const p = new URLSearchParams({ inicio, fim, ...filtros });

  try {
    const r = await api(`/api/relatorio?${p}`);
    const total = r.resumo.total;
    const fmtDia = (iso) => `${fmtData(iso)} <small>(${diaSemana(iso)})</small>`;
    const filtrosTxt = [
      filtros.tipo && `Tipo: ${esc(filtros.tipo)}`,
      filtros.pagamento && `Pagamento: ${esc(filtros.pagamento)}`,
      filtros.produto && `Produto contém: "${esc(filtros.produto)}"`,
    ].filter(Boolean).join(' · ');

    let html = `
      <div class="rel-cab">
        <h2>${NOMES_REL[tipoRel]}</h2>
        <p>Período: <strong>${fmtData(inicio)}</strong> a <strong>${fmtData(fim)}</strong></p>
        ${filtrosTxt ? `<p>Filtros: ${filtrosTxt}</p>` : ''}
        <p>Gerado em ${new Date().toLocaleString('pt-BR')}</p>
      </div>
      <div class="resumo">
        <div><small>Total vendido</small><strong>${fmtBRL(total)}</strong></div>
        <div><small>Nº de vendas</small><strong>${r.resumo.vendas}</strong></div>
        <div><small>Itens vendidos</small><strong>${r.resumo.itens}</strong></div>
        <div><small>Ticket médio</small><strong>${fmtBRL(r.resumo.vendas ? Math.round(total / r.resumo.vendas) : 0)}</strong></div>
      </div>`;

    if (!r.resumo.vendas) {
      html += '<p class="vazio">Nenhuma venda no período/filtros selecionados.</p>';
    } else {
      const colProd = (campo) => ({ titulo: 'Produtos vendidos', de: produtosPor(r.vendas, campo) });
      const colPag = (campo) => ({ titulo: 'Formas de pagamento', de: pagamentosPor(r.vendas, campo) });
      const extrasPag = [colProd('pagamento')];
      const extrasTipo = [colProd('tipo'), colPag('tipo')];
      const extrasDia = [colProd('data'), colPag('data')];
      const extrasProd = [colPag('produto')];
      if (tipoRel === 'geral') {
        html += tabelaGrupo('Por forma de pagamento', 'Forma de pagamento', r.por_pagamento, total, esc, extrasPag);
        html += tabelaGrupo('Por tipo de produto', 'Tipo', r.por_tipo, total, esc, extrasTipo);
        html += tabelaGrupo('Por dia', 'Dia', r.por_dia, total, fmtDia, extrasDia);
        html += tabelaGrupo('Por produto', 'Produto', r.por_produto, total, esc, extrasProd);
      } else if (tipoRel === 'dia') {
        html += tabelaGrupo('', 'Dia', r.por_dia, total, fmtDia, extrasDia);
      } else if (tipoRel === 'produto') {
        html += tabelaGrupo('', 'Produto', r.por_produto, total, esc, extrasProd);
      } else if (tipoRel === 'pagamento') {
        html += tabelaGrupo('', 'Forma de pagamento', r.por_pagamento, total, esc, extrasPag);
      } else if (tipoRel === 'tipo') {
        html += tabelaGrupo('', 'Tipo de produto', r.por_tipo, total, esc, extrasTipo);
      }
    }

    if (r.resumo.vendas && (tipoRel === 'lista' || $('#r-detalhado').checked)) {
      html += tabelaVendas(r.vendas, total);
    }

    const box = $('#relatorio');
    box.innerHTML = html;
    box.classList.remove('hidden');
    $('#btn-imprimir').disabled = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    toast(err.message, true);
  }
});

$('#btn-imprimir').addEventListener('click', () => window.print());

// ================= Inicialização =================
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

if (token) iniciarApp();
else mostrarLogin();
