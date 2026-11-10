# Controle de Vendas

Sistema para registrar vendas de celulares, acessórios e outros produtos **sem cadastro de produtos**:
cada venda é digitada na hora (produto, tipo, quantidade, valor, forma de pagamento).
Funciona no computador (navegador) e no celular (pode ser instalado como app).

## Funcionalidades

- **Nova venda**: produto, tipo, quantidade, valor unitário (total calculado), forma de pagamento
  (Dinheiro, Pix, Débito, Crédito ou "Outro" com texto livre), data/hora e observação.
  O sistema sugere nomes de produtos e tipos já digitados antes (autocompletar), mas nada precisa ser cadastrado.
- **Vendas de hoje** com total do dia, e aba **Vendas** com busca e filtro por período. Editar e excluir vendas.
- **Relatórios**: geral, por dia, por produto, por forma de pagamento, por tipo de produto ou lista de vendas.
  Períodos rápidos (hoje, ontem, 7 dias, mês, mês passado, ano) ou personalizado, e filtros opcionais
  por tipo, pagamento e produto. Botão **Imprimir** (também permite "Salvar como PDF").
- Acesso protegido por senha.

## Rodar no computador

Requer **Node.js 22.13 ou superior** (sem banco externo: usa o SQLite embutido no Node).

```bash
npm install
# Windows (PowerShell):
$env:SENHA="sua-senha-aqui"; npm start
# Linux/Mac:
SENHA="sua-senha-aqui" npm start
```

Abra http://localhost:3000. No celular, na mesma rede Wi-Fi, use `http://IP-DO-COMPUTADOR:3000`.

### Variáveis de ambiente

| Variável   | Padrão     | Descrição                              |
|------------|------------|----------------------------------------|
| `SENHA`    | `1234`     | Senha de acesso (**troque!**)          |
| `PORT`     | `3000`     | Porta do servidor                      |
| `DATA_DIR` | `./dados`  | Pasta onde fica o banco `vendas.db`    |

## Colocar na internet (web + celular de qualquer lugar)

Hospede em qualquer serviço que rode Node.js com disco persistente
(ex.: Railway, Render com disco, Fly.io com volume, ou uma VPS).
Configure `SENHA` e aponte `DATA_DIR` para o volume persistente. Use HTTPS (esses serviços já fornecem).

## Instalar no celular

Abra o endereço do sistema no navegador do celular:
- **Android (Chrome)**: menu ⋮ → "Instalar app" / "Adicionar à tela inicial".
- **iPhone (Safari)**: botão Compartilhar → "Adicionar à Tela de Início".

## Backup

Todos os dados ficam em um único arquivo: `dados/vendas.db`. Basta copiá-lo para fazer backup.
