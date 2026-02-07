# Visão da arquitetura (pdfcomp)

## O que este documento cobre

Este documento descreve a arquitetura do pdfcomp: como o frontend, o backend e o Ghostscript se conectam, o fluxo de dados e as decisões principais de desenho.

**Público:** Desenvolvedores que precisam entender o sistema antes de alterar comportamento ou estender funcionalidades.

## Desenho do sistema

### Diagrama de alto nível

```
┌─────────────────┐       ┌─────────────────────────────────────────┐
│   Navegador     │       │  Servidor Node.js (Express)              │
│   (public/)     │       │  ├── express.static(public)              │
│                 │ POST  │  └── POST /api/compress                   │
│  index.html     │──────▶│        ├── multer (upload → temp)        │
│  app.js         │       │        ├── compressPdf() → Ghostscript    │
│  styles.css     │       │        └── res.download(PDF) + limpeza    │
│                 │◀──────│                                         │
└─────────────────┘  PDF  └─────────────────┬───────────────────────┘
       │                                      │
       │                                      ▼
       │                             ┌─────────────────┐
       │                             │  Ghostscript    │
       │                             │  (CLI: gs /     │
       │                             │  gswin64c)      │
       │                             └─────────────────┘
       │
       └── Download do PDF compactado + headers X-Original-Size, X-Compressed-Size
```

**Componentes:**

1. **Navegador** — Carrega a página estática, envia o formulário (PDF + preset) e exibe o resultado (tamanhos e link de download).
2. **Express** — Serve os arquivos de `public/` e expõe a rota `POST /api/compress`.
3. **Multer** — Recebe o upload, valida o tipo (PDF) e grava em diretório temporário.
4. **compress.js** — Invoca o Ghostscript com o preset escolhido e trata fallback de comando (Windows).
5. **Ghostscript** — Gera o PDF compactado em disco; o servidor depois envia esse arquivo na resposta e remove os temporários.

### Stack tecnológica

| Camada     | Tecnologia   | Motivo da escolha                                      |
|------------|-------------|--------------------------------------------------------|
| Frontend   | HTML/CSS/JS | Simplicidade; sem build; fácil de hospedar com o backend |
| Backend    | Node.js + Express | Ecossistema comum, upload com multer, fácil de rodar em qualquer OS |
| Compressão | Ghostscript (CLI) | Presets de qualidade prontos (-dPDFSETTINGS), amplamente usado |

## Estrutura de diretórios

```
pdfcomp/
├── server/                 # Backend
│   ├── index.js            # Servidor, rota /api/compress, limpeza
│   └── compress.js         # Wrapper Ghostscript (presets + fallback)
├── public/                 # Frontend estático
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── docs/
│   ├── ARCHITECTURE.md
│   └── API.md
├── package.json
└── README.md
```

- **server/** — Toda a lógica de servidor: HTTP, upload, chamada ao Ghostscript e entrega do PDF.
- **public/** — Recursos estáticos servidos pelo Express; o frontend não faz build, só referência a esses arquivos.

## Fluxo de dados

### Fluxo de compressão (passo a passo)

1. **Usuário** — Seleciona o PDF e o nível no formulário e clica em "Compactar".
2. **public/app.js** — Monta um `FormData` com o campo `file` e o campo `preset`, e envia `POST /api/compress`.
3. **server/index.js** — Multer grava o arquivo em um diretório temporário (ex.: `os.tmpdir()/pdfcomp-uploads/`).
4. **server/index.js** — Cria outro diretório temporário para a saída e chama `compressPdf(arquivoUpload, arquivoSaida, preset)`.
5. **server/compress.js** — Monta os argumentos do Ghostscript (incluindo `-dPDFSETTINGS` conforme o preset) e executa o binário; em caso de ENOENT, tenta o próximo comando (gswin64c → gswin32c → gs no Windows).
6. **Ghostscript** — Escreve o PDF compactado no caminho de saída.
7. **server/index.js** — Lê o tamanho do arquivo compactado, define os headers (`Content-Type`, `Content-Disposition`, `X-Original-Size`, `X-Compressed-Size`) e chama `res.download()`.
8. **Callback de res.download** — Após o envio (ou em caso de erro), remove o arquivo de upload e o diretório temporário de saída.
9. **public/app.js** — Recebe a resposta, cria um blob e um object URL, exibe os tamanhos e o link de download.

## Decisões de desenho

### Uso do Ghostscript para compressão

- **Decisão:** Usar o Ghostscript via linha de comando em vez de bibliotecas JS puras ou outros binários (qpdf, etc.).
- **Motivo:** Ghostscript oferece presets de qualidade bem definidos (`-dPDFSETTINGS=/screen`, `/ebook`, `/printer`, `/prepress`) e reduz bem o tamanho, principalmente quando há imagens.
- **Trade-off:** Exige instalação do Ghostscript no servidor e cuidado com PATH (ou `GHOSTSCRIPT_PATH`) no Windows.

### Arquivos temporários e limpeza

- **Decisão:** Upload e PDF de saída em diretórios temporários do sistema (`os.tmpdir()`); limpeza feita no callback de `res.download` (sucesso ou erro) e no `catch` da rota.
- **Motivo:** Evitar deixar arquivos no disco após enviar a resposta; em caso de falha antes do download, a limpeza já é feita no `catch`.
- **Trade-off:** O callback de `res.download` é assíncrono; se der erro depois de os headers serem enviados, não é possível enviar um JSON de erro, apenas registrar e garantir que a limpeza ocorra.

### Fallback de comando no Windows e GHOSTSCRIPT_PATH

- **Decisão:** No Windows, tentar em ordem `gswin64c`, `gswin32c`, `gs`; se a variável `GHOSTSCRIPT_PATH` estiver definida, usar só ela.
- **Motivo:** O instalador do Ghostscript no Windows usa `gswin64c`/`gswin32c`, que muitas vezes não estão no PATH; `GHOSTSCRIPT_PATH` permite apontar para o executável exato sem alterar o PATH do sistema.
- **Implementação:** Em `compress.js`, `runWithFallbacks` só tenta o próximo comando quando o erro é `ENOENT` (executável não encontrado); qualquer outro erro do Ghostscript interrompe o loop para não mascarar a mensagem real.

## Dependências entre módulos

```
public/app.js     →  POST /api/compress (fetch)
server/index.js   →  compress.js (compressPdf)
server/compress.js →  child_process.spawn (Ghostscript)
```

Não há dependência do frontend em módulos Node; a comunicação é apenas HTTP.

## Onde estender

- **Novos presets:** Alterar o objeto `PRESETS` em `server/compress.js` e o `<select>` em `public/index.html` (e o valor enviado em `app.js`).
- **Limite de tamanho:** Alterar `MAX_FILE_SIZE` em `server/index.js`.
- **Porta ou Ghostscript:** Variáveis de ambiente `PORT` e `GHOSTSCRIPT_PATH` (documentadas no README).

## Referências

- [README.md](../README.md) — Início rápido e solução de problemas.
- [docs/API.md](API.md) — Contrato do endpoint `POST /api/compress`.
