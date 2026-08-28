# Academia Corporativa Tri Hotéis

Plataforma web de cursos e treinamentos corporativos, com dois ambientes:
**Portal do Funcionário** e **Painel Administrativo**. Interface totalmente em
português do Brasil.

## Como rodar

```bash
npm install
npx prisma migrate dev      # cria o banco (SQLite) e aplica as migrações
npm run build && npm start  # modo apresentação, acessível na rede local
```

Para desenvolver, use `npm run dev` (recarrega a cada alteração, porém é bem
mais lento) ou `npm run dev:local` para restringir o acesso ao próprio micro.

`npm start` e `npm run dev` sobem em `0.0.0.0` e imprimem o endereço de acesso
na inicialização, então a plataforma fica disponível para toda a rede local:

```
  Nesta máquina:  http://localhost:3000
  Na rede local:  http://172.16.0.55:3000
```

O portal do funcionário fica em `/` e o painel administrativo em `/admin`.

## Primeiro acesso

O banco de demonstração foi limpo: resta apenas a conta de administrador, além
dos departamentos e categorias. **As senhas não ficam neste repositório** — o
administrador cadastra os funcionários em *Painel Administrativo → Funcionários
→ Novo*, e a senha inicial de cada um é exibida uma única vez na tela, no
momento do cadastro.

Para recriar a base de demonstração (funcionários e cursos de exemplo) em um
ambiente de testes:

```bash
npx prisma db seed          # popula com dados de demonstração
npx tsx prisma/limpar-dados.ts   # remove tudo, preservando o administrador
```

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Prisma** + **SQLite** (trocar o `provider` em `prisma/schema.prisma` para
  `postgresql` migra para PostgreSQL sem alterar o restante do código)
- **NextAuth** (credenciais + JWT), senhas com hash **bcrypt**
- **Tailwind CSS**, **Recharts** (gráficos), **@dnd-kit** (arrastar e soltar),
  **pdf-lib** (geração de certificados), **Zod** (validação)

## Identidade visual

Paleta construída a partir do laranja da logo Tri Hotéis:

| Papel | Token | Cor |
| --- | --- | --- |
| Laranja da marca (superfícies, gráficos, destaques) | `brand-500` | `#FF6A00` |
| Laranja de texto e botões (contraste 4.62:1, WCAG AA) | `brand-700` | `#CC4A00` |
| Neutro escuro (títulos, menu lateral) | `ink-900` | `#1C1917` |
| Fundo da aplicação | `--background` | `#FAF9F8` |
| Concluído | `success-600` | `#15803D` |
| Prazo próximo | `warning-600` | `#A16207` |
| Atrasado / erro | `danger-600` | `#B91C1C` |

Os neutros são quentes (grafite, não azul) de propósito: azul e laranja são
complementares e vibram quando usados lado a lado. Os tokens estão em
`src/app/globals.css`.

## Estrutura

```
prisma/schema.prisma      modelos do banco
prisma/seed.ts            dados de demonstração
storage/uploads/          vídeos, PDFs e imagens (fora de /public)
src/app/(auth)/           login, recuperação e redefinição de senha
src/app/(portal)/         portal do funcionário
src/app/admin/            painel administrativo
src/app/api/              autenticação, upload, arquivos e certificados
src/lib/actions/          server actions (CRUD, matrículas, progresso)
src/lib/progress.ts       motor de cálculo de progresso
src/components/           design system e componentes de cada ambiente
```

## Regras de negócio principais

- **Progresso de vídeo**: a aula é concluída automaticamente ao atingir a
  porcentagem assistida configurada no curso (padrão **90%**). O player envia a
  posição periodicamente e retoma de onde o funcionário parou. Quem decide a
  conclusão é o servidor: o limite vem do curso no banco e o avanço por
  requisição é limitado pelo tempo real decorrido, de modo que arrastar a barra
  até o fim (ou forjar a chamada) não conclui a aula.
- **PDF e texto**: exigem clique em **"Marcar como concluído"** — abrir a página
  nunca conclui a aula sozinho.
- **Progresso do curso**: recalculado a cada aula concluída, com base nas aulas
  **obrigatórias**. Ao chegar a 100%, o certificado é emitido automaticamente
  (quando habilitado no curso).
- **Ordem obrigatória**: se o curso tiver "Aulas em ordem obrigatória", as aulas
  seguintes ficam bloqueadas — validado no servidor, não apenas na interface.
- **Acesso a arquivos**: `/api/files/[id]` verifica sessão e matrícula antes de
  entregar o arquivo; vídeos são servidos com suporte a *range requests*
  (streaming e busca na linha do tempo).
- **Desativar funcionário** bloqueia o login mas preserva todo o histórico.
- Ações administrativas relevantes são registradas em **Histórico de atividades**.

## Observações desta entrega

- **Recuperação de senha**: não há serviço de e-mail configurado neste ambiente.
  A tela pública `/esqueci-senha` apenas registra a solicitação e **nunca exibe
  o link** — mostrá-lo ali permitiria que qualquer pessoa que soubesse o e-mail
  de um funcionário assumisse a conta dele. Quem gera o link é o administrador,
  em *Funcionários → (funcionário) → Gerar link de redefinição*: token de uso
  único, válido por 1 hora. Para automatizar, basta plugar um serviço de e-mail
  em `requestPasswordReset` (`src/lib/actions/password-reset.ts`) e enviar o
  token por lá.
- **Armazenamento**: os arquivos ficam em `storage/uploads/` no servidor. A
  camada de acesso está isolada em `src/lib/storage.ts`, o que facilita migrar
  para um serviço de nuvem (S3 ou similar) futuramente.
- **Limite de upload**: configurável em `.env` via `UPLOAD_MAX_SIZE_MB`
  (padrão 500 MB).
- Antes de publicar em produção, troque `NEXTAUTH_SECRET` no `.env` por um
  valor secreto e aleatório.
- **`NEXTAUTH_URL`**: o NextAuth precisa dessa variável para montar os
  redirecionamentos de login — sem ela, ele assume `localhost:3000` e quem
  entrar pelo IP da rede é jogado para a máquina errada depois de autenticar.
  Como o IP vem do DHCP e muda, `scripts/servidor.mjs` o detecta a cada
  inicialização em vez de deixá-lo fixo no `.env`. Quando houver um domínio
  definitivo, basta definir `NEXTAUTH_URL` no `.env` — o script respeita o
  valor já existente.
- **Banco e backups não são versionados**: `prisma/*.db` está no `.gitignore`
  porque contém e-mails e hashes de senha.
