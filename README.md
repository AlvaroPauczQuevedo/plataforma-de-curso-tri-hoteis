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

## Integração com a intranet (opcional, desligada por padrão)

Esta plataforma **funciona sozinha** e é publicada de forma independente. A
integração com a [intranet](https://github.com/AlvaroPauczQuevedo/intranet-tri-hoteis)
existe, está pronta e testada, mas fica **desativada** enquanto as variáveis
abaixo estiverem em branco — sem elas, nada na interface menciona um segundo
sistema.

Mesmo integrados, continuam sendo **dois sistemas separados**, cada um com o
próprio banco e o próprio login. O que a integração acrescenta:

- **Atalho na intranet** — com `FACULDADE_URL` preenchida no `.env` da
  intranet, o menu lateral dela passa a mostrar *Aprendizagem → Faculdade*,
  abrindo esta plataforma em outra aba. Em branco, o atalho não existe.
- **Mesmas pessoas, mesma matrícula** — com `INTRANET_DB_PATH` apontando para
  o banco da intranet, aparece em *Painel Administrativo → Funcionários* o
  bloco **Cadastro da intranet**, com o botão *Sincronizar agora*, que espelha
  os funcionários de lá com a mesma matrícula. Sem a variável, o bloco não é
  renderizado.
- **Mesmo visual** — este não depende de configuração: as duas usam a mesma
  estrutura de tela (menu lateral escuro, barra superior, barra inferior no
  celular) e a mesma paleta. A casca está em
  `src/components/shell/app-shell.tsx` e os estilos no fim de
  `src/app/globals.css`, portados de `web/src/styles.css` da intranet.

**O login não é compartilhado.** A intranet autentica por CPF; aqui é por
e-mail corporativo. Senhas são hashes e não podem ser copiadas de um sistema
para o outro, então cada conta criada pela sincronização nasce com uma **senha
provisória**, exibida uma única vez ao administrador no momento da
sincronização. No primeiro acesso a plataforma exige a troca dessa senha antes
de liberar qualquer tela.

A leitura do cadastro é **somente-leitura** e feita direto no arquivo SQLite da
intranet: a integração não exige que ela esteja no ar, e nada é escrito lá.
Quem é desligado na intranet é **desativado** aqui, nunca apagado — o histórico
de treinamento e os certificados precisam sobreviver ao desligamento.

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
- **"Oferecer download dos materiais"**: quando desligado, a plataforma não
  apresenta botão de download e serve o PDF embutido no visualizador. Não é —
  e não pode ser — um bloqueio absoluto: o arquivo chega ao navegador para ser
  exibido, então quem insistir consegue guardá-lo. A opção controla o que a
  plataforma oferece, não o que o navegador é capaz de fazer.
- **Progresso do curso**: recalculado a cada aula concluída, com base nas aulas
  **obrigatórias**. Ao chegar a 100%, o certificado é emitido automaticamente
  (quando habilitado no curso).
- **Ordem obrigatória**: se o curso tiver "Aulas em ordem obrigatória", as aulas
  seguintes ficam bloqueadas — validado no servidor, não apenas na interface.
- **Acesso a arquivos**: `/api/files/[id]` verifica sessão e matrícula antes de
  entregar o arquivo; vídeos são servidos com suporte a *range requests*
  (streaming e busca na linha do tempo).
- **Desativar funcionário** bloqueia o login **e encerra a sessão já aberta**
  na requisição seguinte, preservando todo o histórico. A situação da conta é
  relida do banco a cada requisição — a sessão é um token de 8 horas e, sem
  essa releitura, quem fosse desligado seguiria com acesso até o token expirar.
- **Proteção do login**: 5 erros seguidos bloqueiam a conta por 15 minutos, e
  há um teto de tentativas por origem para barrar quem varre muitas contas.
  Ajustável no `.env`.
- **Arquivos enviados** são conferidos pela assinatura do conteúdo, não pelo
  tipo que o navegador declara.
- Ações administrativas relevantes são registradas em **Histórico de atividades**.

## Testes

```bash
npm test
```

47 testes, sem dependência extra — usam o executor nativo do Node (`node --test`)
com `tsx` para o TypeScript. Cada execução cria um banco SQLite próprio em pasta
temporária e aplica as migrações reais; **o banco de desenvolvimento nunca é
tocado**.

| Arquivo | O que cobre |
| --- | --- |
| `tests/video-credito.test.ts` | A regra que impede forjar a conclusão de um vídeo: arrastar a barra, repetir a chamada, deixar a aba parada, e o caminho honesto que precisa continuar funcionando. |
| `tests/progresso.test.ts` | Cálculo do percentual, aulas opcionais fora da conta, isolamento entre alunos, emissão única do certificado e ordem obrigatória das aulas. |
| `tests/login.test.ts` | Bloqueio por conta e por origem, expiração, e o `x-forwarded-for` só valendo com proxy confiável. |
| `tests/arquivos.test.ts` | Assinatura dos arquivos enviados: aceita os formatos reais, recusa executável disfarçado. |

A regra de crédito de vídeo mora em `src/lib/video-credito.ts` como função pura,
separada da server action que a usa: é a única parte do sistema cujo resultado
depende do relógio, e assim pode ser exercitada com o tempo controlado, em
milissegundos em vez de minutos.

**O que os testes não cobrem**: comportamento no nível HTTP — cabeçalhos de
segurança, respostas 401/403 das rotas e o fluxo de sessão do NextAuth. Isso foi
verificado manualmente e exigiria subir o servidor a cada execução.

## Publicação

A plataforma sobe como **uma aplicação Node**, servindo API e interface no
mesmo processo. Requer Node 20 ou superior.

```bash
npm ci
npx prisma migrate deploy     # aplica as migrações (não recria nada)
npm run build
npm start
```

Copie `.env.example` para `.env` e ajuste — ele documenta cada variável.

### Variáveis obrigatórias em produção

Com `NODE_ENV=production`, `scripts/servidor.mjs` **recusa subir** se alguma
faltar — as três falham em silêncio se passarem despercebidas:

| Variável | Por quê |
| --- | --- |
| `NEXTAUTH_URL` | Endereço público real. Sem ela o NextAuth assume `localhost` e o login devolve o usuário para a máquina errada. |
| `NEXTAUTH_SECRET` | Mínimo de 32 caracteres, gerado por você. Quem souber o valor fabrica uma sessão de administrador. |
| `STORAGE_DIR` | Pasta dos vídeos e PDFs, **fora do diretório do projeto**. |
| `DATABASE_URL` | Caminho do banco, também **fora do diretório do projeto**. |

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

### Onde os dados precisam morar

Este é o ponto que mais causa estrago: hospedagem que publica **substituindo o
diretório da aplicação** apaga tudo que estiver dentro dele. Se o banco e os
uploads ficarem em `prisma/dev.db` e `storage/uploads`, a primeira publicação
funciona e a **segunda apaga matrículas, progresso, certificados e todos os
vídeos das aulas** — e eles não voltam do repositório, porque estão (com
razão) no `.gitignore`.

```bash
DATABASE_URL="file:/home/usuario/dados-faculdade/dev.db"
STORAGE_DIR="/home/usuario/dados-faculdade/uploads"
```

### Backup

```bash
npm run backup                 # grava em BACKUP_DIR ou ./backups
npm run backup -- /mnt/backup  # ou num destino específico
```

Copia **banco e arquivos juntos** — o banco referencia os arquivos por id, então
um sem o outro não reconstrói as aulas. O banco é copiado com `VACUUM INTO`, e
não com cópia de arquivo: o SQLite pode estar no meio de uma escrita, e copiar o
arquivo cru produziria um backup corrompido justamente quando ele é necessário.
Pode rodar com a plataforma no ar.

Para restaurar: pare a plataforma, coloque `dev.db` no caminho de `DATABASE_URL`
e a pasta `uploads` no caminho de `STORAGE_DIR`.

### Prisma em Linux

`prisma/schema.prisma` declara `binaryTargets` com os alvos Debian (OpenSSL 1.1
e 3.x) além do `native`, para o caso de o build acontecer em ambiente diferente
do de execução. Se a hospedagem usar outra distribuição (Alpine, por exemplo),
acrescente o alvo correspondente e rode `npx prisma generate` de novo.

### Primeiro acesso

`npx tsx prisma/criar-admins.ts` cria as contas administrativas com senhas
aleatórias, impressas uma única vez. **Troque-as depois do primeiro acesso.**

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
- **`INTRANET_DB_PATH`**: caminho do banco da intranet, para a sincronização de
  funcionários. Em branco, o botão de sincronizar fica desabilitado e a
  plataforma funciona de forma independente.
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
