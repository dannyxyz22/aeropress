# Documentação da API (pdfcomp)

## Visão geral

O pdfcomp expõe um único endpoint HTTP para compactar PDFs. O processamento é feito no servidor com Ghostscript.

**Base URL (exemplo):** `http://localhost:3000`

**Última atualização:** 2025

## Endpoint: compactar PDF

### O que faz

Recebe um arquivo PDF e um nível de compressão (preset), compacta o PDF no servidor com Ghostscript e devolve o PDF compactado para download. Os headers de resposta informam o tamanho original e o tamanho compactado.

### Endpoint

```
POST /api/compress
```

### Autenticação

Nenhuma. O endpoint é público.

### Formato do corpo (request)

**Content-Type:** `multipart/form-data`

| Campo   | Tipo   | Obrigatório | Descrição |
|---------|--------|-------------|-----------|
| `file`  | arquivo | Sim       | Arquivo PDF a ser compactado. Deve ser `application/pdf`. |
| `preset`| string | Não        | Nível de compressão: `low`, `medium`, `high` ou `max`. Padrão: `medium`. |

**Presets:**

- `low` — Máxima compressão, qualidade mais baixa (Ghostscript: /screen).
- `medium` — Equilíbrio tamanho/qualidade (Ghostscript: /ebook).
- `high` — Melhor qualidade, para impressão (Ghostscript: /printer).
- `max` — Qualidade máxima, pré-impressão (Ghostscript: /prepress).

### Resposta de sucesso (200)

- **Content-Type:** `application/pdf`
- **Content-Disposition:** `attachment; filename="compressed.pdf"`
- **Headers customizados:**

| Header              | Descrição                          |
|---------------------|------------------------------------|
| `X-Original-Size`   | Tamanho do arquivo enviado (bytes). |
| `X-Compressed-Size` | Tamanho do PDF compactado (bytes).  |

O corpo da resposta é o próprio arquivo PDF compactado (binário).

### Respostas de erro

Todas as respostas de erro têm **Content-Type:** `application/json` e corpo no formato:

```json
{
  "error": "Mensagem legível do erro."
}
```

| Código | Situação | Exemplo de mensagem |
|--------|----------|----------------------|
| 400    | Nenhum arquivo enviado ou campo não é `file`. | `"Arquivo PDF obrigatório."` |
| 400    | Arquivo não é PDF (rejeitado pelo fileFilter). | `"Only PDF files are allowed."` |
| 413    | Arquivo maior que o limite (100 MB). | (depende do Express/multer) |
| 500    | Falha ao executar Ghostscript ou ao enviar o arquivo. | `"Falha na compressao. Verifique o Ghostscript."` ou mensagem do Ghostscript |
| 404    | Rota inexistente. | `"Not found"` |

### Limite de tamanho e validação

- O tamanho máximo do upload é **100 MB** (configurável em `server/index.js` via `MAX_FILE_SIZE`).
- Apenas arquivos com `Content-Type` (mimetype) `application/pdf` são aceitos; outros tipos são rejeitados antes de chamar o Ghostscript.

### Exemplo de uso (curl)

```bash
# Substitua /caminho/para/seu.pdf pelo caminho real do arquivo
curl -X POST http://localhost:3000/api/compress \
  -F "file=@/caminho/para/seu.pdf" \
  -F "preset=medium" \
  -o compressed.pdf
```

No Windows (PowerShell), exemplo com arquivo no diretório atual:

```powershell
curl.exe -X POST http://localhost:3000/api/compress -F "file=@.\meu.pdf" -F "preset=medium" -o compressed.pdf
```

### Exemplo no frontend (JavaScript)

O frontend em `public/app.js` envia o formulário assim:

```javascript
const formData = new FormData();
formData.append("file", file);        // File do <input type="file">
formData.append("preset", presetSelect.value);  // "low" | "medium" | "high" | "max"

const response = await fetch("/api/compress", {
  method: "POST",
  body: formData,
});

// Sucesso: response.ok === true, response.body é o PDF
const originalSize = Number(response.headers.get("X-Original-Size"));
const compressedSize = Number(response.headers.get("X-Compressed-Size"));
const blob = await response.blob();
// Criar link de download com URL.createObjectURL(blob), etc.
```

### Erros comuns e como tratar

- **400** — Garantir que o campo do formulário se chama `file` e que o arquivo é PDF.
- **500 com mensagem sobre Ghostscript** — Verificar se o Ghostscript está instalado e no PATH (ou `GHOSTSCRIPT_PATH`). Ver README, seção "Solução de problemas".
- **413** — Reduzir o tamanho do arquivo ou aumentar `MAX_FILE_SIZE` no servidor.

## Referências

- [README.md](../README.md) — Como rodar o projeto e configurar Ghostscript.
- [docs/ARCHITECTURE.md](ARCHITECTURE.md) — Fluxo de dados e decisões de arquitetura.
