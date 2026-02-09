# Compactador de PDF (pdfcomp)

## O que faz

Este projeto é um webapp que permite enviar um arquivo PDF, compactá-lo com Ghostscript e baixar o PDF compactado. Há duas formas de uso: **pelo navegador** (servidor Node) ou **aplicativo desktop** (Electron). Os níveis de compressão estão ligados à qualidade das imagens (screen, ebook, printer, prepress): quanto maior a compressão, menor o tamanho e menor a qualidade.

## Início rápido

Coloque o projeto em funcionamento em poucos minutos.

### Pré-requisitos

- **Node.js** 18+ (ou LTS atual)
- **Ghostscript** instalado e acessível no PATH, ou variável `GHOSTSCRIPT_PATH` apontando para o executável (ex.: no Windows: `gswin64c.exe`)

### Instalação (uma vez)

```bash
# Na raiz do projeto
npm install
```

### Rodar na web (servidor)

```bash
npm run dev
```

O servidor sobe em `http://localhost:3000`. Abra essa URL no navegador, escolha um PDF, selecione o nível de compressão e clique em **Compactar**. O arquivo compactado será oferecido para download.

### Rodar no desktop (Electron)

```bash
npm run electron
```

Abre uma janela do aplicativo: clique em **Selecionar PDF**, escolha o arquivo, defina o nível de compressão e **Compactar**. Ao terminar, use **Salvar como** para guardar o PDF compactado onde quiser. O mesmo Ghostscript e presets da versão web são usados.

### Conferir se está funcionando

- **Web:** Acesse `http://localhost:3000`, envie um PDF pequeno e confira o download e os tamanhos na tela.
- **Electron:** Rode `npm run electron`, selecione um PDF, compacte e confira se o diálogo de salvar e o arquivo final aparecem.

## Estrutura do projeto

```
pdfcomp/
├── server/                 # Backend Node.js (Express)
│   ├── index.js            # Servidor HTTP, rota /api/compress, upload e entrega do PDF
│   └── compress.js         # Chamada ao Ghostscript com presets e fallback de comando
├── public/                 # Frontend estático
│   ├── index.html          # Página com formulário de upload e seletor de nível (web)
│   ├── index-electron.html # Página da versão Electron
│   ├── app.js               # Envio do formulário (web), exibição de tamanhos e download
│   ├── app-electron.js     # Lógica da versão Electron (diálogos e IPC)
│   └── styles.css          # Estilos da página
├── electron/               # Aplicativo desktop (Electron)
│   ├── main.js             # Processo principal: janela, IPC, diálogos, compressão
│   └── preload.js          # Bridge seguro para o renderer (contextBridge)
├── docs/                   # Documentação adicional
│   ├── ARCHITECTURE.md     # Visão da arquitetura e fluxo de dados
│   └── API.md              # Documentação do endpoint POST /api/compress
├── package.json
└── README.md               # Este arquivo
```

### Papel dos arquivos principais

- **server/index.js** — Inicia o Express, serve os arquivos de `public/`, trata `POST /api/compress` (upload via multer, chamada a `compressPdf`, resposta em PDF com headers de tamanho e limpeza de temporários).
- **server/compress.js** — Define os presets (low/medium/high/max) e executa o Ghostscript; no Windows tenta `gswin64c`, `gswin32c` e `gs`, ou usa `GHOSTSCRIPT_PATH` se definido.
- **public/index.html** — Formulário com campo de arquivo e select de nível de compressão.
- **public/app.js** — Envia o formulário para a API, mostra mensagens de status, exibe tamanhos e gera o link de download.
- **public/styles.css** — Aparência da interface.

## Conceitos principais

### Presets de compressão

O backend mapeia quatro níveis para as opções do Ghostscript (`-dPDFSETTINGS`):

| Preset  | Valor Ghostscript | Uso típico                          |
|---------|-------------------|-------------------------------------|
| `low`   | /screen           | Máxima compressão, qualidade baixa  |
| `medium`| /ebook            | Bom equilíbrio (padrão)             |
| `high`  | /printer          | Melhor qualidade para impressão     |
| `max`   | /prepress         | Qualidade máxima (pré-impressão)    |

Quanto menor o preset, menor o tamanho do PDF e maior a perda de qualidade (principalmente em imagens).

### Fluxo de dados

1. Usuário escolhe o PDF e o nível no navegador.
2. O frontend envia `multipart/form-data` para `POST /api/compress`.
3. O servidor grava o arquivo em disco temporário e chama o Ghostscript.
4. O Ghostscript gera o PDF compactado em outro arquivo temporário.
5. O servidor envia esse PDF na resposta (download) e remove os arquivos temporários.

## Tarefas comuns

### Rodar em desenvolvimento

```bash
npm run dev
```

O mesmo comando está em `npm start`.

### Versão Electron (desktop)

Para rodar o aplicativo como programa de desktop (sem servidor):

1. **Instale as dependências** (se ainda não fez):
   ```bash
   npm install
   ```

2. **Inicie o aplicativo:**
   ```bash
   npm run electron
   ```
   Ou use o script alternativo: `npm run electron:dev`.

3. **Na janela que abrir:**
   - Clique em **Selecionar PDF** e escolha o arquivo no diálogo do sistema.
   - Selecione o **nível de compressão** (equilibrado/ebook é o padrão).
   - Clique em **Compactar** e aguarde o progresso.
   - Quando terminar, use o diálogo **Salvar como** para escolher onde salvar o PDF compactado.
   - Opcionalmente, use **Abrir pasta do arquivo** para abrir a pasta onde o arquivo foi salvo.

**Requisitos:** Node.js 18+ e Ghostscript no PATH (ou variável `GHOSTSCRIPT_PATH`). O Electron usa a mesma lógica de `server/compress.js`. Se o Ghostscript não estiver no PATH (comum no Windows), defina antes de rodar:

```bash
# Windows (PowerShell) — exemplo
$env:GHOSTSCRIPT_PATH="C:\Program Files\gs\gs10.03.0\bin\gswin64c.exe"
npm run electron
```

### Usar outra porta

Defina a variável de ambiente `PORT`:

```bash
# Windows (PowerShell)
$env:PORT=4000; npm run dev

# Linux/macOS
PORT=4000 npm run dev
```

### Apontar o Ghostscript manualmente

Se o Ghostscript não estiver no PATH, defina `GHOSTSCRIPT_PATH` com o caminho completo do executável:

```bash
# Windows (PowerShell) — exemplo com Ghostscript 10
$env:GHOSTSCRIPT_PATH="C:\Program Files\gs\gs10.03.0\bin\gswin64c.exe"
npm run dev
```

No Windows você pode usar `gswin64c.exe` (64 bits) ou `gswin32c.exe` (32 bits).

### Empacotar e distribuir (executável para usuário final)

É possível gerar um instalador Windows (e um .exe portátil) com **electron-builder**. O usuário final não precisa ter Node.js nem Ghostscript instalado **se** você empacotar o Ghostscript junto (opção 2 abaixo).

#### 1. Gerar o instalador (sem Ghostscript incluído)

O instalador será menor; o usuário precisa ter o Ghostscript instalado no PC (ou verá a mensagem de erro já tratada no app).

```bash
npm install
npm run build
```

Os arquivos saem em `dist/`:
- **Instalador:** `dist/Compactador de PDF 1.0.0.exe` (NSIS)
- **Portátil:** `dist/Compactador de PDF 1.0.0.exe` (portable, na pasta do instalador ou via `npm run build:portable`)

Scripts úteis:
- `npm run build` — build para o sistema atual (Windows: NSIS + portable)
- `npm run build:win` — só Windows
- `npm run build:portable` — só .exe portátil

#### 2. Incluir o Ghostscript no instalador (melhor para usuário leigo)

Assim o usuário **não** precisa instalar nada além do seu instalador. O app usa o Ghostscript que vem dentro do pacote.

1. **Instale o Ghostscript** no seu PC (para desenvolvimento), por exemplo em:  
   `C:\Program Files\gs\gs10.03.0\`
2. **Copie a instalação do Ghostscript** para o projeto:
   - Crie a pasta `vendor/gs` na raiz do projeto.
   - Copie **todo o conteúdo** da pasta do Ghostscript (as pastas `bin`, `lib`, etc.) para dentro de `vendor/gs`. Ao final deve existir `vendor/gs/bin/gswin64c.exe`.
3. **Gere o instalador com Ghostscript incluído:**

```bash
npm run build:with-gs
```

O resultado em `dist/` terá o app e o Ghostscript; ao abrir, o compactador funcionará sem pedir instalação extra.

**Atenção (licença):** O Ghostscript é licenciado sob AGPL. Se você **redistribuir** o Ghostscript junto com o seu app, precisa cumprir a AGPL (por exemplo, disponibilizar o código-fonte do seu app) ou obter licença comercial da [Artifex](https://artifex.com/). Para uso interno ou sem redistribuição do Ghostscript, use o build sem GS (opção 1).

#### Resumo: melhor forma de entregar para usuário leigo

| Situação | Recomendação |
|----------|--------------|
| Uso interno / você controla a máquina | Build sem GS (`npm run build`); instale o Ghostscript uma vez no PC. |
| Entregar para terceiros sem exigir instalação | Build com GS (`npm run build:with-gs`) e cumprir a licença do Ghostscript (AGPL ou licença comercial). |
| Entregar sem incluir Ghostscript | Build sem GS; na primeira execução o app mostra mensagem de erro com link para baixar o Ghostscript — o usuário instala e abre o app de novo. |

## Configuração

### Variáveis de ambiente

| Variável            | Descrição                                      | Exemplo                    | Obrigatória |
|---------------------|------------------------------------------------|---------------------------|-------------|
| `PORT`              | Porta em que o servidor escuta                 | `3000`                     | Não (padrão 3000) |
| `GHOSTSCRIPT_PATH`  | Caminho completo do executável do Ghostscript  | `C:\...\gswin64c.exe`      | Não (usa PATH se não definida) |

## Solução de problemas

### Erro: `spawn gs ENOENT` (ou `spawn gswin64c ENOENT`)

**Causa:** O Node não encontrou o executável do Ghostscript (não está no PATH ou o nome do comando está errado). Vale tanto para a versão web (`npm run dev`) quanto para o Electron (`npm run electron`).

**O que fazer:**

1. **Instalar o Ghostscript** (se ainda não tiver):
   - Windows: baixe o instalador em [ghostscript.com](https://ghostscript.com/releases/gsdnld.html) (64-bit ou 32-bit).
   - Após instalar, o executável costuma ficar em algo como `C:\Program Files\gs\gs10.xx\bin\gswin64c.exe`.

2. **Colocar no PATH** (opcional):
   - Adicione a pasta `bin` do Ghostscript (ex.: `C:\Program Files\gs\gs10.03.0\bin`) às variáveis de ambiente PATH do sistema.
   - Reinicie o terminal e rode `npm run dev` de novo.

3. **Ou usar `GHOSTSCRIPT_PATH`** (recomendado se não quiser alterar o PATH):
   - Defina a variável com o caminho completo do executável, por exemplo:
     - `GHOSTSCRIPT_PATH="C:\Program Files\gs\gs10.03.0\bin\gswin64c.exe"`
   - Inicie o servidor no mesmo ambiente em que definiu a variável.

### Erro 400 (Bad Request)

- **"Arquivo PDF obrigatório"** — Nenhum arquivo foi enviado ou o campo do formulário não se chama `file`.
- Só são aceitos arquivos PDF (`application/pdf`). Outros tipos são rejeitados pelo `fileFilter` do multer.

### Limite de tamanho (413 ou erro ao enviar)

- O tamanho máximo permitido é **1 GB**. O upload é feito em chunks (partes de 2 MB); arquivos maiores que 1 GB são rejeitados. Limites em `server/index.js` (`MAX_FILE_SIZE`, `MAX_CHUNK_SIZE`). Ver [docs/API.md](docs/API.md) para o fluxo init/chunk/finalize.

### Erro 500 ao compactar

- A mensagem costuma vir no corpo da resposta (JSON com `error`).
- Verifique se o Ghostscript está instalado e acessível (veja `spawn gs ENOENT` acima).
- Alguns PDFs podem falhar no Ghostscript (protegidos, corrompidos ou formato incompatível); nesses casos a mensagem de erro do Ghostscript pode aparecer em `error`.

## Documentação adicional

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Arquitetura do sistema e fluxo de dados.
- [docs/API.md](docs/API.md) — Contrato do endpoint `POST /api/compress`.

## Licença

Projeto de uso livre; ver repositório ou autor para detalhes.
