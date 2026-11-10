const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const SENHA = process.env.SENHA || '1234';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'dados');

if (!process.env.SENHA) {
  console.warn('[aviso] Variável SENHA não definida. Usando senha padrão "1234". Defina SENHA antes de colocar em produção.');
}

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'vendas.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS vendas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,              -- YYYY-MM-DD
    hora TEXT NOT NULL,              -- HH:MM
    produto TEXT NOT NULL,
    tipo TEXT NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 1,
    valor_unitario INTEGER NOT NULL, -- centavos
    valor_total INTEGER NOT NULL,    -- centavos
    pagamento TEXT NOT NULL,
    observacao TEXT DEFAULT '',
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_vendas_data ON vendas(data);
  CREATE TABLE IF NOT EXISTS sessoes (
    token TEXT PRIMARY KEY,
    criado_em TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Autenticação ----------
function comparaSenha(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

app.post('/api/login', (req, res) => {
  if (!comparaSenha(req.body?.senha ?? '', SENHA)) {
    return res.status(401).json({ erro: 'Senha incorreta' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessoes (token) VALUES (?)').run(token);
  res.json({ token });
});

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token || !db.prepare('SELECT 1 FROM sessoes WHERE token = ?').get(token)) {
    return res.status(401).json({ erro: 'Não autenticado' });
  }
  req.token = token;
  next();
}

app.post('/api/logout', auth, (req, res) => {
  db.prepare('DELETE FROM sessoes WHERE token = ?').run(req.token);
  res.json({ ok: true });
});

// ---------- Validação ----------
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^\d{2}:\d{2}$/;

function validaVenda(b) {
  const produto = String(b.produto || '').trim();
  const tipo = String(b.tipo || '').trim();
  const pagamento = String(b.pagamento || '').trim();
  const quantidade = parseInt(b.quantidade, 10) || 1;
  const valor_unitario = Math.round(Number(b.valor_unitario));
  const observacao = String(b.observacao || '').trim().slice(0, 500);
  const data = String(b.data || '');
  const hora = String(b.hora || '');

  if (!produto) return { erro: 'Informe o produto' };
  if (!tipo) return { erro: 'Informe o tipo de produto' };
  if (!pagamento) return { erro: 'Informe a forma de pagamento' };
  if (quantidade < 1) return { erro: 'Quantidade inválida' };
  if (!Number.isFinite(valor_unitario) || valor_unitario < 0) return { erro: 'Valor inválido' };
  if (!RE_DATA.test(data)) return { erro: 'Data inválida' };
  if (!RE_HORA.test(hora)) return { erro: 'Hora inválida' };

  return {
    venda: {
      produto: produto.slice(0, 200), tipo: tipo.slice(0, 60), pagamento: pagamento.slice(0, 60),
      quantidade, valor_unitario, valor_total: valor_unitario * quantidade, observacao, data, hora,
    },
  };
}

// ---------- Vendas ----------
app.post('/api/vendas', auth, (req, res) => {
  const { erro, venda } = validaVenda(req.body || {});
  if (erro) return res.status(400).json({ erro });
  const r = db.prepare(`
    INSERT INTO vendas (data, hora, produto, tipo, quantidade, valor_unitario, valor_total, pagamento, observacao)
    VALUES (:data, :hora, :produto, :tipo, :quantidade, :valor_unitario, :valor_total, :pagamento, :observacao)
  `).run(venda);
  res.json({ id: Number(r.lastInsertRowid) });
});

app.put('/api/vendas/:id', auth, (req, res) => {
  const { erro, venda } = validaVenda(req.body || {});
  if (erro) return res.status(400).json({ erro });
  const r = db.prepare(`
    UPDATE vendas SET data=:data, hora=:hora, produto=:produto, tipo=:tipo, quantidade=:quantidade,
      valor_unitario=:valor_unitario, valor_total=:valor_total, pagamento=:pagamento, observacao=:observacao
    WHERE id=:id
  `).run({ ...venda, id: Number(req.params.id) });
  if (!r.changes) return res.status(404).json({ erro: 'Venda não encontrada' });
  res.json({ ok: true });
});

app.delete('/api/vendas/:id', auth, (req, res) => {
  const r = db.prepare('DELETE FROM vendas WHERE id = ?').run(Number(req.params.id));
  if (!r.changes) return res.status(404).json({ erro: 'Venda não encontrada' });
  res.json({ ok: true });
});

// Monta cláusula WHERE a partir dos filtros
function filtros(q) {
  const where = [];
  const params = {};
  if (RE_DATA.test(q.inicio || '')) { where.push('data >= :inicio'); params.inicio = q.inicio; }
  if (RE_DATA.test(q.fim || '')) { where.push('data <= :fim'); params.fim = q.fim; }
  if (q.tipo) { where.push('tipo = :tipo'); params.tipo = String(q.tipo); }
  if (q.pagamento) { where.push('pagamento = :pagamento'); params.pagamento = String(q.pagamento); }
  if (q.produto) { where.push('produto LIKE :produto'); params.produto = `%${String(q.produto)}%`; }
  return { sql: where.length ? 'WHERE ' + where.join(' AND ') : '', params };
}

app.get('/api/vendas', auth, (req, res) => {
  const { sql, params } = filtros(req.query);
  const vendas = db.prepare(`SELECT * FROM vendas ${sql} ORDER BY data DESC, hora DESC, id DESC LIMIT 1000`).all(params);
  res.json(vendas);
});

// Sugestões para autocompletar (não é cadastro, apenas o que já foi digitado antes)
app.get('/api/sugestoes', auth, (req, res) => {
  const produtos = db.prepare(`SELECT produto FROM vendas GROUP BY produto ORDER BY MAX(id) DESC LIMIT 300`).all().map(r => r.produto);
  const tipos = db.prepare(`SELECT DISTINCT tipo FROM vendas ORDER BY tipo`).all().map(r => r.tipo);
  const pagamentos = db.prepare(`SELECT DISTINCT pagamento FROM vendas ORDER BY pagamento`).all().map(r => r.pagamento);
  res.json({ produtos, tipos, pagamentos });
});

// ---------- Relatórios ----------
app.get('/api/relatorio', auth, (req, res) => {
  const { sql, params } = filtros(req.query);
  const resumo = db.prepare(`
    SELECT COUNT(*) AS vendas, COALESCE(SUM(quantidade),0) AS itens, COALESCE(SUM(valor_total),0) AS total
    FROM vendas ${sql}
  `).get(params);

  const agrupa = (col, ordem) => db.prepare(`
    SELECT ${col} AS chave, COUNT(*) AS vendas, SUM(quantidade) AS itens, SUM(valor_total) AS total
    FROM vendas ${sql} GROUP BY ${col} ORDER BY ${ordem}
  `).all(params);

  res.json({
    resumo,
    por_dia: agrupa('data', 'data ASC'),
    por_produto: agrupa('produto', 'total DESC'),
    por_pagamento: agrupa('pagamento', 'total DESC'),
    por_tipo: agrupa('tipo', 'total DESC'),
    vendas: db.prepare(`SELECT * FROM vendas ${sql} ORDER BY data ASC, hora ASC, id ASC`).all(params),
  });
});

app.listen(PORT, () => {
  console.log(`Sistema de vendas rodando em http://localhost:${PORT}`);
});
