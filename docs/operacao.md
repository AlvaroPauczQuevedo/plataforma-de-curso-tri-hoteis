# Operação

_Subir, publicar e configurar. É o que se lê no dia da virada e quando algo para._

> Parte da documentação da **Academia Corporativa Tri Hotéis**. Índice em [../README.md](../README.md).

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

## Publicação

A plataforma sobe como **uma aplicação Node**, servindo API e interface no
mesmo processo. Requer Node 20 ou superior.

```bash
npm ci
npm run build
npm start
```

Copie `.env.example` para `.env` e ajuste — ele documenta cada variável.

### O build usa Webpack, e não Turbopack — não "conserte" isto

O script de build é `next build --webpack`. **Não troque para o padrão**, por mais
que o Next recomende Turbopack em toda a documentação.

O Turbopack exige as bindings NATIVAS do SWC. A hospedagem desta plataforma tem
glibc antiga demais para elas:

```
⚠ Attempted to load @next/swc-linux-x64-gnu, but an error occurred:
  /lib64/libm.so.6: version `GLIBC_2.29' not found
> Build error occurred
Error: Turbopack is not supported on this platform (linux/x64) because native
bindings are not available.
```

O Next cai para as bindings WASM, que servem para compilar mas **não** para o
Turbopack — e o build morre aí. Com `--webpack` ele compila normalmente.

Isso derrubou uma publicação **depois** de as migrações já terem sido aplicadas,
o que deixa o pior estado possível: banco novo, aplicação velha. Ver *Publicar
com migração de schema* logo abaixo.

O desenvolvimento (`npm run dev`) continua no Turbopack, que é local e tem as
bindings nativas. O CI usa `npm run build`, portanto compila do mesmo jeito que
a produção — é de propósito: um CI que constrói com outro bundler não está
verificando o que vai ao ar.

### Publicar com migração de schema

As migrações rodam no `npm ci`/`npm install`, **antes** do build. Se o build
falhar depois disso, o banco já está no schema novo enquanto a aplicação no ar
ainda é a antiga — e código antigo não conhece as colunas novas. Um cadastro de
funcionário, por exemplo, morre em `NOT NULL constraint failed: User.username`.

Por isso, ao publicar algo que traga migração:

1. **`npm run backup` antes de tudo.** Migração reescreve tabela.
2. Se o build falhar, **conserte e publique de novo antes de usar o sistema** —
   não é um erro que dá para deixar para amanhã.
3. Depois de publicar, confira uma tela que dependa do que mudou.

**As migrações se aplicam na instalação de dependências.** O `postinstall`
chama `scripts/pos-instalacao.mjs`, que roda `prisma generate` sempre e
`prisma migrate deploy` quando `NODE_ENV=production` — ou quando
`MIGRAR_NA_INSTALACAO=1` está definida, para hospedagens que não definem
`NODE_ENV` durante a instalação.

Isso existe porque o contrário já custou caro três vezes: publicar código que
espera uma coluna nova deixa o site quebrado até alguém lembrar de rodar a
migração à mão, e o intervalo entre uma coisa e outra é tempo fora do ar.

`migrate deploy` só aplica migrações já versionadas no repositório — nunca gera
migração nova, nunca apaga dados, e não faz nada quando não há pendência.

Fora de produção nada é aplicado, de propósito: quem desenvolve usa
`prisma migrate dev`, e um `deploy` disparado por `npm install` atropelaria
esse fluxo sem aviso.

#### Por que na instalação, e não na subida do servidor

Foi a primeira tentativa, e ela não funciona em hospedagem que constrói em modo
`standalone` — o caso desta aqui. Nesse modo o Next gera o próprio
`server.js` e monta um `node_modules` podado, só com o que rastreou como
necessário em execução. O CLI do Prisma não é dependência de execução, então não
entra; e o `scripts/servidor.mjs` sequer é chamado, porque quem sobe o site é o
`server.js` gerado. Qualquer automação colocada na inicialização simplesmente
não roda.

A instalação de dependências é o oposto: acontece antes da poda, com o
`node_modules` completo. É o único ponto do ciclo de publicação em que dá para
migrar sem depender de alguém lembrar.

`scripts/servidor.mjs` mantém a mesma migração para quem sobe com `npm start`
em servidor próprio, onde ela funciona.

**Falhando, a publicação segue**, com aviso destacado no log (procure por
`[migracao]`). Recusar trocaria "algumas telas com erro" por "site inteiro fora
do ar", que é pior — mas nesse estado a plataforma precisa de atenção imediata.
`prisma generate` é a exceção: falhando, a instalação para, porque sem o
cliente gerado a aplicação nem sobe.

#### A migração na subida acontece uma vez, mesmo com vários processos

A rede de segurança de `src/lib/migracoes.ts` roda na subida de **cada**
processo, e a hospedagem sobe vários. Dois processos aplicando a mesma migração
ao mesmo tempo passavam batido em `CREATE TABLE` e `ADD COLUMN` — a
reconciliação de desvio tolera "o objeto já existe" —, mas não na reescrita de
tabela que o Prisma gera para SQLite: ela cria `new_User`, copia, **derruba** a
antiga e renomeia. O segundo processo chegava para copiar de uma tabela que o
primeiro tinha acabado de derrubar.

Agora quem chega primeiro cria `migracao-em-curso.lock` (ao lado de
`ultima-migracao.json`, na pasta de estado do servidor) e os outros **esperam**
— em vez de servir requisição com o banco no schema antigo, que é o apagão que
tudo isto existe para acabar.

- A trava só é pedida quando há migração pendente. No caso normal a subida não
  toca em arquivo nenhum.
- `MIGRACAO_ESPERA_MINUTOS` (padrão 5) é quanto o perdedor espera. Esgotado o
  prazo, o servidor sobe assim mesmo e o motivo aparece em `/api/saude`.
- Trava parada há mais de 10 minutos é considerada abandonada — processo morto
  no meio — e o próximo assume o lugar. Sem esse prazo, um único apagão
  deixaria o servidor sem nunca mais migrar.

Se precisar destravar à mão, apague o arquivo `migracao-em-curso.lock` com o
servidor parado.

#### Aplicar à mão, se precisar

Da pasta com o código-fonte do build, uma linha por vez:

```bash
export PATH=/opt/alt/alt-nodejs22/root/usr/bin:$PATH
export DATABASE_URL=file:/caminho/para/o/banco.db
npx prisma@6.19.3 migrate deploy
```

Fixe a versão. `npx prisma` sem versão baixa a `latest`, que pode ser uma
candidata a lançamento incompatível com o schema — e ela falha sem aplicar nada.

Para conferir o que está aplicado sem depender do Prisma, basta ler o arquivo do
banco:

```bash
grep -ao "20260[0-9]*_[a-z_]*" /caminho/para/o/banco.db | sort -u
```

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

### Senha esquecida pela linha de comando

```bash
npm run senha:redefinir -- maria.silva      # sorteia uma senha nova
npm run senha:redefinir -- --listar-admins  # mostra as contas administrativas
```

É a **saída de emergência da plataforma**, e existe por um motivo específico: a
conta protegida ("proprietário") só pode ser alterada pelo próprio titular — nem
outro proprietário a alcança. Com o login por nome de usuário e a maior parte da
rede sem e-mail confirmado, `/esqueci-senha` não vale para ela. Sem este script,
o dono que esquecesse a senha ficaria trancado do lado de fora, e a única saída
seria editar o SQLite à mão gerando um hash bcrypt por fora.

Roda no servidor de propósito, e não como botão na interface: quem alcança o
disco da aplicação já pode tudo de qualquer forma, então esta é a autoridade
certa para "o dono perdeu a senha" — e não uma porta nova. A senha é impressa
**uma única vez**, destrava a conta bloqueada por tentativas e exige troca no
primeiro acesso.

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

### Conferir se o backup presta

```bash
npm run backup:conferir              # o mais recente
npm run backup:conferir -- caminho   # um específico
```

Restaura numa pasta **temporária** e examina lá. Nunca escreve no banco em uso
nem na pasta de uploads viva — e recusa rodar se o alvo coincidir com qualquer
um dos dois.

Existe porque `npm run backup` rodava havia meses sem reclamar e **restaurar
nunca tinha sido testado**. Backup que ninguém restaurou não é backup, é
esperança: a hora de descobrir que o arquivo está truncado não pode ser a hora
em que ele é necessário.

| Conferência | Pega |
| --- | --- |
| `PRAGMA integrity_check` | corrupção e truncamento, o que uma cópia interrompida produz |
| Cada `FileAsset` tem seu arquivo | **banco e uploads que não viajaram juntos** |
| Tamanhos batem com o registro | cópia parcial de arquivo |
| `_prisma_migrations` × `prisma/migrations` | backup mais antigo que o código |
| Há contas e cursos | banco íntegro e vazio, que passaria em tudo acima |

A segunda é a que mais importa, e é a falha que o próprio backup avisa ser
possível: a plataforma sobe, as telas abrem, e só quem clica no vídeo descobre
que ele não veio.

Sai com código **1** quando algo reprova, então serve para agendar junto do
backup — um cron que grava sem conferir só descobre o problema tarde demais.

O script **apaga sozinho os backups antigos**, mantendo os `BACKUP_KEEP` mais
recentes (padrão 14) — sem isso, um backup diário encheria o disco em poucos
meses. Só remove pastas com o formato de carimbo que ele mesmo cria, então nada
que estiver no destino por outro motivo é tocado. A limpeza acontece **depois**
de o novo backup estar gravado: com o disco cheio, é melhor terminar com os
antigos intactos do que com nenhum.

Agendamento diário (ajuste o caminho da aplicação):

```
0 3 * * * cd /caminho/para/last-source && \
  DATABASE_URL="file:/home/usuario/dados-faculdade/dev.db" \
  STORAGE_DIR="/home/usuario/dados-faculdade/uploads" \
  BACKUP_DIR="/home/usuario/backups-faculdade" \
  node scripts/backup.mjs >> /home/usuario/backup.log 2>&1
```

O script é **JavaScript puro, e não TypeScript**, por um motivo operacional:
em produção a aplicação roda no build `standalone` do Next, cujo `node_modules`
contém apenas o que a aplicação importa. O `tsx` não está lá, e um backup que só
roda na máquina do desenvolvedor não é backup. Assim basta o `node`, que existe
em qualquer lugar onde a plataforma esteja no ar.

Em hospedagem CloudLinux (Hostinger, por exemplo), o `node` não está no `PATH` do
cron — use o caminho completo, algo como
`/opt/alt/alt-nodejs22/root/usr/bin/node`.

### Mudar de servidor sem perder nada

Trocar de conta de hospedagem, ou de hospedagem inteira. O código vem do
repositório; o que precisa viajar são **três coisas**:

| O quê | Onde está |
| --- | --- |
| O banco | `DATABASE_URL` |
| Os arquivos enviados | `STORAGE_DIR` |
| A configuração | as variáveis de ambiente |

#### Não copie o arquivo do banco

É o erro que custa caro, e ele parece funcionar.

O SQLite roda em **modo WAL** aqui. Nesse modo as escritas recentes ficam num
arquivo separado (`dev.db-wal`) antes de serem incorporadas ao `.db`. Copiar só
o `dev.db` de uma aplicação no ar leva um banco **sem as últimas escritas** — e
não há erro nenhum: ele abre, as telas funcionam, e faltam as matrículas da
última hora. Copiar os três arquivos com a aplicação rodando é pior ainda,
porque eles podem estar inconsistentes entre si.

Use o backup, que existe exatamente para isso:

```bash
npm run backup
```

Ele usa `VACUUM INTO`, que produz um instantâneo **consistente mesmo com a
plataforma no ar** — e copia os uploads junto, na mesma pasta. Banco e arquivos
precisam viajar juntos: o banco guarda só o id e o caminho de cada arquivo, e
um sem o outro dá aulas apontando para vídeos que não existem.

#### O procedimento

**1. No servidor antigo — gere e confira**

```bash
npm run backup
npm run backup:conferir
```

O segundo restaura numa pasta temporária e confere que todo arquivo citado pelo
banco veio junto, que os tamanhos batem e que o schema é o que o código espera.
**Não pule**: um backup que ninguém restaurou não é backup, é esperança.

**2. Transfira a pasta do backup** para a conta nova, inteira.

**3. No servidor novo — confira de novo, antes de apontar qualquer coisa**

```bash
BACKUP_DIR=/caminho/do/backup/transferido npm run backup:conferir
```

É aqui que se descobre transferência truncada — enquanto ainda dá para repetir,
com o servidor antigo no ar.

**4. Coloque no lugar**, com a aplicação parada:

```bash
mkdir -p /home/NOVO_USUARIO/dados-academia
cp backup/AAAA-MM-DD-HHMM/dev.db      /home/NOVO_USUARIO/dados-academia/dev.db
cp -r backup/AAAA-MM-DD-HHMM/uploads  /home/NOVO_USUARIO/dados-academia/uploads
```

Não copie `dev.db-wal` nem `dev.db-shm`: o backup já os incorporou, e arquivos
antigos ao lado do banco novo confundem o SQLite.

**5. Ajuste as variáveis** — os caminhos absolutos mudaram de usuário:

```
DATABASE_URL="file:/home/NOVO_USUARIO/dados-academia/dev.db"
STORAGE_DIR="/home/NOVO_USUARIO/dados-academia/uploads"
ERROS_DIR="/home/NOVO_USUARIO/dados-academia/erros"
BACKUP_DIR="/home/NOVO_USUARIO/dados-academia/backups"
```

**6. Suba e confira** — `/api/saude` responde se o banco abriu e se as migrações
estão em dia. Depois entre e abra uma aula com vídeo: é o que prova que os
uploads vieram.

**7. Só então** desligue o servidor antigo.

#### Quando não dá para rodar o backup

Conta suspensa, sem terminal, hospedagem que só oferece Gerenciador de Arquivos.
Aqui a regra acima **se inverte**, e a inversão é a parte que custa caro.

O `VACUUM INTO` incorpora o WAL ao arquivo que gera — por isso o backup normal
dispensa os arquivos auxiliares. Copiando **cru**, ninguém incorporou nada: as
escritas mais recentes ainda estão no `dev.db-wal`, e copiar só o `dev.db` leva
um banco que abre sem erro e **sem os últimos cadastros**.

Então baixe, com a aplicação parada:

```
dev.db
dev.db-wal     <- indispensável
dev.db-shm
uploads/       <- a pasta inteira
```

O SQLite reaplica o WAL sozinho na primeira abertura. O `-shm` é recriado, mas
levar não atrapalha.

Para conferir que veio inteiro, antes de confiar: ponha os arquivos numa pasta
no formato que o backup usa e rode `npm run backup:conferir` apontando para ela.

**Conta desativada não é conta apagada.** A hospedagem costuma manter os
arquivos por um período antes da exclusão definitiva — é uma janela, e ela
fecha. Depois dela não há procedimento que recupere.

#### O que quebra se o endereço mudar

**Não rode `admin:criar` no servidor novo.** As contas vieram no banco; o script
recusaria de qualquer forma, mas o reflexo de "instalação nova, criar admin"
existe e aqui ele está errado.

**`NEXTAUTH_SECRET`:** mantenha o mesmo, ou todas as sessões caem e todo mundo
precisa entrar de novo. Não é grave — é um aviso para não assustar.

**Os certificados já impressos** são o ponto sutil. O PDF é gerado na hora, então
os baixados a partir de agora trazem o endereço novo. Mas o QR dos que já foram
impressos e guardados aponta para o **domínio antigo** — e quem confere é gente
de fora: auditor, outro empregador. Se o domínio mudar, mantenha um
redirecionamento do antigo para o novo, ou aqueles certificados param de ser
conferíveis.

**Reagende o cron.** Ele não viaja com o backup: sem refazê-lo no servidor novo,
os lembretes silenciam e o backup para de rodar — as duas falhas mais silenciosas
que esta plataforma tem.

## Erros do servidor

Quando uma tela quebra, o usuário vê *"Código para o suporte: 2268569496"*. Esse
número é o `digest` do erro, e **/admin/erros** (só o proprietário) é onde ele
vira uma pilha de chamadas com arquivo e linha.

A tela existe por uma lacuna concreta: o `stderr` da hospedagem chegou **vazio**
quando fomos procurar o rastro de uma quebra em produção, e o diagnóstico levou
dois dias por falta desse arquivo. Agora a plataforma grava o próprio registro,
em `ERROS_DIR`, fora da pasta publicada — publicar substitui a aplicação, e é
justamente depois de publicar que se quer olhar.

A captura acontece em `src/instrumentation.ts`, envolvendo `console.error`. É
rústico. Era o preço de estar no Next 14, onde o gancho `onRequestError` —
feito exatamente para isto — ainda não existia. Com a subida para o Next 16 ele
passou a estar disponível, e trocar a captura por ele é uma simplificação
pendente: o envelope de `console.error` continua funcionando, mas deixou de ser
a única opção.

### Teste de fumaça

```bash
FUMACA_EMAIL=... FUMACA_SENHA=... npm run fumaca
FUMACA_EMAIL=... FUMACA_SENHA=... npm run fumaca -- https://seu-dominio
```

Faz login e **navega por todas as telas**, exigindo que respondam. Não verifica
conteúdo: verifica que a página renderiza.

Parece pouco, e cobre exatamente o que os testes de unidade não alcançam. São
mais de duzentos e **nenhum renderiza uma página** — todos exercitam regras
puras. Por isso passou duas vezes o mesmo tipo de falha: erro de serialização
entre componente de servidor e de cliente, que os tipos não pegam, o build não
pega, e só aparece quando a tela é aberta.

Ele **navega** em vez de percorrer uma lista fixa: as telas mais frágeis são as
que dependem de dado real, e os endereços delas contêm ids que só existem no
banco. Seguindo os links a partir das listagens, alcança curso, aula, prova e
funcionário sem conhecer id nenhum — e cobre sozinho o que for criado depois.

Rode contra produção depois de publicar. As credenciais vêm do ambiente e nunca
ficam no arquivo.

### Teste de fumaça das rotas de API

```bash
npm run fumaca:preparar                     # prepara o cenário, imprime os ids
FUMACA_ADMIN=... FUMACA_SENHA_ADMIN=... npm run fumaca:rotas
```

O roteiro acima navega por TELAS. Este cobre o que nenhuma tela alcança:

- **entrega de arquivo por trecho** (`Range`) — o caminho que o player de vídeo
  usa, com `Content-Range`, contagem de bytes e o 416 de quem pede além do fim;
- **downloads em PDF** — certificado e prova, com as duas recusas que importam:
  403 para o certificado alheio e 401 sem sessão;
- **o teto de avisos** de `/api/erros`.

`scripts/preparar-fumaca.mjs` existe para que o cenário seja o MESMO toda vez.
O `prisma db seed` não cria prova nenhuma e nenhum administrador dele é
proprietário — sem esse preparo, sete telas ficariam de fora, entre elas as três
de prova, onde mora a regra de alcance mais delicada da plataforma. O script é
idempotente e imprime os ids no formato `CHAVE=valor`.

### Verificação automática

O arquivo `.github/workflows/verificacao.yml` roda a bateria inteira a cada
push em `main` e a cada pull request:

| Passo | O que roda |
| --- | --- |
| Tipos | `tsc --noEmit` |
| Lint | `npm run lint` |
| Testes | `npm test` — os 208 |
| Build | `npm run build` |
| Fumaça | sobe o servidor e navega como proprietário e como funcionário |
| Rotas | o roteiro de API acima, com as recusas |
| Teto | confere no ARQUIVO que o limitador parou a gravação |

A ordem é do mais barato para o mais caro, para a falha aparecer cedo. É um
trabalho só, e não vários em paralelo, porque a fumaça depende do build —
dividir obrigaria a instalar e construir duas vezes.

Se algo falhar, o último passo despeja a saída do servidor e o registro de erros
da própria plataforma, que costuma ser onde está a resposta.

O passo do teto também **resume os erros que a plataforma registrou durante a
fumaça** e emite cada assinatura distinta como anotação da execução. Isso não é
capricho: o log do Actions só é legível por quem tem direitos de administração
no repositório, e quem investiga nem sempre tem — a anotação aparece na API
pública da execução. O resumidor serve fora do CI também:

```bash
cat ../erros/2026-09-02.jsonl | node scripts/resumir-erros.mjs
```

Esses erros **não reprovam** o build. São sinal diferente do teto, e enquanto
não estiverem caracterizados só ficam visíveis; quando se souber o que são,
decide-se se devem derrubar a verificação.

O banco do CI é criado do zero a cada execução e descartado com a máquina. O
`NEXTAUTH_SECRET` de lá é descartável e **não deve ser reutilizado** em lugar
nenhum.

### Prisma em Linux

`prisma/schema.prisma` declara `binaryTargets` com os alvos Debian (OpenSSL 1.1
e 3.x) além do `native`, para o caso de o build acontecer em ambiente diferente
do de execução. Se a hospedagem usar outra distribuição (Alpine, por exemplo),
acrescente o alvo correspondente e rode `npx prisma generate` de novo.

### Primeiro acesso

```bash
npx tsx prisma/criar-proprietario.ts seu.nome "Seu Nome"
npx tsx prisma/criar-admins.ts    # contas por setor, se for o caso
```

As senhas são sorteadas com `randomInt` e impressas **uma única vez**, no
terminal do servidor. Não ficam salvas em texto puro em lugar nenhum e não há
como recuperá-las depois.

Comece pelo proprietário: só ele consegue definir o departamento dos demais
administradores, e **enquanto um administrador estiver sem departamento ele
enxerga tudo e não altera nada**.

A senha inicial vale só até o primeiro acesso — a plataforma exige a troca antes
de liberar qualquer tela.

## Ordem de configuração após publicar

Cada passo destrava o próximo.

**1. Crie as pastas de dados, FORA da aplicação.** Publicar substitui o
diretório; dado guardado dentro dele morre na segunda publicação.

```bash
mkdir -p /home/SEU_USUARIO/dados-academia/{uploads,erros,backups}
```

**2. Importe as variáveis de ambiente.** Aponte `DATABASE_URL`, `STORAGE_DIR`,
`ERROS_DIR` e `BACKUP_DIR` para as pastas acima, e defina `NEXTAUTH_URL` com o
domínio real. Ver *Variáveis obrigatórias em produção*.

**3. Crie o proprietário.** É a única conta que existe num banco novo — sem
ela ninguém entra.

```bash
npx tsx prisma/criar-proprietario.ts seu.nome "Seu Nome"
```

Anote a senha: ela aparece uma vez. No primeiro acesso a plataforma exige a
troca, e não dá para pular.

**4. Defina o departamento de cada administrador.** Sem isso eles veem tudo e
não alteram nada — e só o proprietário consegue atribuir.

**5. Atribua os cursos a um departamento.** Curso sem departamento só o
proprietário altera.

**6. Agende o backup** no cron. É o único item cuja ausência pode custar dados
irrecuperáveis. O `node` precisa do caminho completo: no cron da CloudLinux ele
não está no `PATH`.

```
0 3 * * * cd /home/SEU_USUARIO/public_html &&   /opt/alt/alt-nodejs22/root/usr/bin/node scripts/backup.mjs   >> /home/SEU_USUARIO/backup.log 2>&1
```

**7. Agende a rotina diária.** Ela dispara os lembretes de treinamento e a
retenção de dados. Sem alguém chamando esta URL, os lembretes existem e nunca
saem — é a falha mais silenciosa da plataforma, porque nada dá erro.

```
0 8 * * * curl -s -H "x-cron-secret: SEU_CRON_SECRET"   https://SEU_DOMINIO/api/tarefas
```

**8. Preencha o encarregado de dados** (`ENCARREGADO_NOME`, `ENCARREGADO_EMAIL`,
`ENCARREGADO_WHATSAPP`). Sem eles o aviso de privacidade aponta o setor de
treinamento — funciona, mas a LGPD pede canal identificado (Art. 41).

**9. Preencha SMTP e alertas**, se quiser envio de e-mail e aviso de erro.
Precisa das credenciais do domínio de vocês. Vazio, a plataforma não tenta
enviar nada e não quebra por isso.

**10. Rode o teste de fumaça** apontando para o domínio. Leva segundos e pega
tela quebrada antes do primeiro usuário. A verificação automática roda a cada
push, mas ela testa o CÓDIGO — só a fumaça contra o domínio testa a
PUBLICAÇÃO: variável faltando, banco não migrado, arquivo fora do lugar.

**11. Gere o Registro de Operações** (`npm run lgpd:registro`) depois que tudo
acima estiver no lugar. Ele lê a configuração vigente, então gerado antes sai
com os valores errados.

## Monitoramento (opcional)

Erro em produção vira aviso ativo, por e-mail (`ALERTA_EMAIL`, usa o SMTP acima)
ou por webhook (`ALERTA_WEBHOOK_URL`, um POST com JSON — Slack, Discord, n8n).
Sem nenhum dos dois, só o log, que é como a plataforma sempre funcionou.

Avisos iguais ficam em silêncio por `ALERTA_INTERVALO_MIN` minutos (padrão 30).
Uma página quebrada é aberta dezenas de vezes por minuto; sem agrupamento, o
alerta viraria ruído que se aprende a ignorar.

O monitoramento **nunca lança**: derrubar a requisição por não conseguir avisar
sobre a falha seria pior do que monitoramento nenhum.

## E-mail (opcional)

A plataforma **funciona sem SMTP configurado**, exatamente como funcionava antes
de o envio existir: o administrador entrega senha e link à mão. Configurado, três
fluxos passam a avisar a pessoa direto:

| Quando | O que sai | Para quem |
| --- | --- | --- |
| *Perfil → Meu e-mail* | Link de confirmação do endereço | Quem está cadastrando |
| `/esqueci-senha` | Link de redefinição | Só quem já confirmou um endereço |
| Senha redefinida no painel | Login e senha provisória | Só quem já confirmou |
| Administrador gera link de redefinição | O mesmo link | Só quem já confirmou |

**Todo envio depende de a pessoa ter confirmado um e-mail.** Quem não tem
recebe do mesmo jeito de sempre: a senha aparece na tela do administrador, para
entrega em mãos. Nada falha por falta de endereço.

O `/esqueci-senha` é o que mais muda na prática: quem cadastrou a caixa se
resolve sozinho, sem procurar ninguém. E continua seguro, porque **o link nunca
é devolvido na tela**, só enviado ao endereço confirmado — devolvê-lo ali
permitiria que qualquer um que soubesse o e-mail de um funcionário assumisse a
conta dele.

Precisa das **cinco** variáveis (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS`, `SMTP_FROM`). Faltando uma, o envio fica desligado de propósito:
melhor não enviar do que falhar a cada cadastro. Uma falha de envio nunca
invalida a operação — o funcionário é cadastrado de qualquer forma e a senha
aparece na tela para entrega manual.

### Conferir se o envio funciona

```bash
npm run email:testar -- voce@gmail.com
```

Mostra quais das cinco variáveis estão preenchidas (a senha nunca é impressa,
só o tamanho) e manda uma mensagem de teste pelo **mesmo caminho da
aplicação** — não por uma conexão própria, senão o teste poderia passar
enquanto a plataforma falha.

Existe porque o SMTP falha em silêncio **de propósito**: senha errada ou porta
bloqueada não derrubam nada, `enviarEmail` devolve `{ enviado: false }` e a
plataforma segue. Isso é o certo em produção — ninguém perde um cadastro porque
a mensagem não saiu —, mas sem este comando a única forma de descobrir que o
envio está quebrado seria alguém precisar dele e não receber.

Em caso de falha ele imprime o erro real do servidor (`ECONNREFUSED`,
autenticação recusada, etc.), que a aplicação engole.

**Se a mensagem chegar no spam, o problema não é a configuração daqui**: falta
SPF, DKIM e DMARC no domínio remetente. Como todos os endereços dos
funcionários são Gmail, Hotmail e Outlook, sem esses registros no DNS o link de
confirmação e o de nova senha somem na caixa de spam de todo mundo — e o
recurso parece quebrado sem dar erro nenhum.

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
  o banco da intranet, aparece em *Painel Administrativo → Usuários* o
  bloco **Cadastro da intranet**, com o botão *Sincronizar agora*, que espelha
  os funcionários de lá com a mesma matrícula. Sem a variável, o bloco não é
  renderizado.
- **Mesmo visual** — este não depende de configuração: as duas usam a mesma
  estrutura de tela (menu lateral escuro, barra superior, barra inferior no
  celular) e a mesma paleta. A casca está em
  `src/components/shell/app-shell.tsx` e os estilos no fim de
  `src/app/globals.css`, portados de `web/src/styles.css` da intranet.

**O login não é compartilhado.** A intranet autentica por CPF; aqui é por nome
de usuário, derivado do nome da pessoa e desempatado pela matrícula quando dois
coincidem. Senhas são hashes e não podem ser copiadas de um sistema para o
outro, então cada conta criada pela sincronização nasce com uma **senha
provisória**, exibida uma única vez ao administrador no momento da
sincronização. No primeiro acesso a plataforma exige a troca dessa senha antes
de liberar qualquer tela.

A leitura do cadastro é **somente-leitura** e feita direto no arquivo SQLite da
intranet: a integração não exige que ela esteja no ar, e nada é escrito lá.
Quem é desligado na intranet é **desativado** aqui, nunca apagado — o histórico
de treinamento e os certificados precisam sobreviver ao desligamento.
