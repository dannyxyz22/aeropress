# Documentação da API (pdfcomp)

## Visão geral

O pdfcomp compacta PDFs no servidor com Ghostscript. O upload é feito **em chunks** (partes), permitindo arquivos até **1 GB** e melhor tolerância a conexões instáveis.

**Base URL (exemplo):** `http://localhost:3000`

**Fluxo:** `POST /api/compress/init` → várias vezes `POST /api/compress/chunk` → `POST /api/compress/finalize` (resposta = PDF).

---

## Limites

| Limite | Valor |
|--------|--------|
| Tamanho máximo do arquivo | 1 GB |
| Tamanho máximo por chunk | 5 MB |
| Chunks enviados em ordem | Obrigatório (0, 1, 2, …) |

---

## 1. Iniciar upload — `POST /api/compress/init`

### Corpo (JSON)

| Campo | Tipo | Obrigatório | Descrição |
|--------|------|--------------|-----------|
| `filename` | string | Não | Nome do arquivo (informativo). |
| `totalSize` | number | Sim | Tamanho total do arquivo em bytes (máx. 1 GB). |
| `totalChunks` | number | Sim | Número total de chunks (inteiro, 1–20000). |
| `preset` | string | Não | `low`, `medium`, `high`, `max`. Padrão: `medium`. |

### Resposta de sucesso (200)

```json
{ "uploadId": "uuid" }
```

Guarde o `uploadId` para as próximas requisições.

### Erros (onde: `init`)

| Código | Situação | Campo `where` |
|--------|----------|----------------|
| 400 | `totalSize` ou `totalChunks` ausentes | `init` |
| 400 | Tamanho > 1 GB | `init` |
| 400 | `totalChunks` inválido (não inteiro ou fora de 1–20000) | `init` |

Corpo de erro: `{ "error": "mensagem", "where": "init" }`.

---

## 2. Enviar chunk — `POST /api/compress/chunk`

### Corpo (multipart/form-data)

| Campo | Tipo | Obrigatório | Descrição |
|--------|------|-------------|-----------|
| `uploadId` | string | Sim | Retornado por `init`. |
| `chunkIndex` | number | Sim | Índice do chunk (0, 1, 2, …). Deve ser enviado em ordem. |
| `chunk` | arquivo | Sim | Conteúdo binário do chunk (máx. 5 MB). |

### Resposta de sucesso (200)

```json
{ "received": 0 }
```

### Erros (onde: `chunk`)

| Código | Situação | Campo `where` |
|--------|----------|----------------|
| 400 | `uploadId` ou `chunkIndex` ausentes/inválidos | `chunk` |
| 400 | Chunk excede 5 MB | `chunk` |
| 400 | Chunk fora de ordem (ex.: enviou 2 antes do 1) | `chunk` |
| 400 | Nenhum dado no campo `chunk` | `chunk` |
| 404 | `uploadId` não encontrado ou expirado | `chunk` |

Corpo de erro: `{ "error": "mensagem", "where": "chunk" }`.

---

## 3. Finalizar e obter PDF — `POST /api/compress/finalize`

### Corpo (JSON)

| Campo | Tipo | Obrigatório | Descrição |
|--------|------|-------------|-----------|
| `uploadId` | string | Sim | O mesmo de `init` e `chunk`. |

### Resposta de sucesso (200)

- **Content-Type:** `application/pdf`
- **Content-Disposition:** `attachment; filename="compressed.pdf"`
- **Headers:** `X-Original-Size`, `X-Compressed-Size`
- Corpo: arquivo PDF compactado (binário).

### Erros (onde: `finalize` ou `ghostscript`)

| Código | Situação | Campo `where` |
|--------|----------|----------------|
| 400 | `uploadId` ausente | `finalize` |
| 400 | Upload incompleto (nem todos os chunks recebidos) | `finalize` |
| 404 | `uploadId` não encontrado ou expirado | `finalize` |
| 500 | Falha ao compactar (Ghostscript) | `ghostscript` |

Corpo de erro: `{ "error": "mensagem", "where": "finalize" }` ou `"where": "ghostscript"`.

---

## Respostas de erro (geral)

Todas as respostas de erro são **application/json** e podem incluir o campo **`where`** indicando a etapa em que o erro ocorreu:

- **`init`** — Validação ao iniciar o upload (tamanho, número de chunks).
- **`chunk`** — Envio de um chunk (ordem, tamanho, uploadId).
- **`finalize`** — Finalização (uploadId, integridade do upload).
- **`ghostscript`** — Falha na compactação pelo Ghostscript (binário não encontrado ou erro ao processar o PDF).

Exemplo:

```json
{
  "error": "Upload incompleto. Recebidos 10 de 20 chunks.",
  "where": "finalize"
}
```

---

## Presets de compressão

| Valor | Descrição (Ghostscript) |
|--------|--------------------------|
| `low` | /screen — máxima redução |
| `medium` | /ebook — equilibrado (padrão) |
| `high` | /printer — alta qualidade |
| `max` | /prepress — mínima alteração |

---

## Referências

- [README.md](../README.md) — Como rodar o projeto e configurar Ghostscript.
- [docs/ARCHITECTURE.md](ARCHITECTURE.md) — Fluxo de dados e decisões de arquitetura.
