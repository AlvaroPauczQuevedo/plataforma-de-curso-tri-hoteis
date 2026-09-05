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

## Como se entra: nome de usuário

**O login é um nome de usuário, não um e-mail.** A rede não tem caixa
corporativa — governança, cozinha, manutenção e lavanderia não têm e-mail de
trabalho —, e não existe matrícula. Não havia nenhum identificador anterior para
reaproveitar, então a plataforma passou a emitir o seu:

```
usuário:  maria.silva
senha:    Tri-K7M2XP4Q   (provisória, troca obrigatória no 1º acesso)
```

Quem cadastra escolhe o nome; o formulário sugere `primeiro.ultimo` a partir do
nome completo e deixa editar — o desempate entre duas pessoas homônimas é
decisão de quem cadastra, porque é ele que sabe que são duas pessoas.

O formato é imposto por `src/lib/nome-de-usuario.ts`: minúsculo, sem acento, sem
espaço, começando por letra. Não é preciosismo. Um identificador que aceita
variação é um login que a própria pessoa não consegue reproduzir — ela não
lembra se digitou com acento, com espaço ou com maiúscula no dia do cadastro. O
campo normaliza a cada tecla, para quem cadastra anotar no papel exatamente o
que foi gravado.

O **login também normaliza o que é digitado**, e isso importa mais do que
parece: o teclado do celular capitaliza a primeira letra sozinho, e é do celular
que a maior parte da rede entra. Sem isso, "Marina Costa" seria recusado com
"usuário ou senha inválidos" tendo os dois certos.

### E-mail: pessoal, opcional e confirmado

O e-mail continua existindo, agora **opcional** e **da própria pessoa** — ela o
cadastra em *Perfil → Meu e-mail*, não o RH.

Ele serve para **uma coisa só**: recuperar a própria senha sem depender de
ninguém. Não é dado de contato — é a chave da conta, porque quem lê aquela caixa
pede "esqueci minha senha" e entra. Por isso:

- **só é gravado depois do clique no link de confirmação.** O endereço fica em
  `EmailConfirmacao` até lá; nunca existe endereço por confirmar no cadastro. Um
  dígito errado — `gmial.com`, ou a caixa de um estranho — poria a chave da
  conta de um funcionário na mão de terceiro;
- **é único.** Duas pessoas não registram a mesma caixa. O caso real é o casal
  que divide um e-mail, os dois funcionários da rede: sem essa trava, um pediria
  redefinição da conta do outro e entraria nela;
- **o administrador não o edita.** Ele foi confirmado pela pessoa. Deixar o
  painel reescrevê-lo daria um caminho de uma etapa para tomar a conta alheia:
  aponta o e-mail para si, pede nova senha, entra.

Quem não cadastrar e-mail — hoje, a maioria — depende do RH para recuperar a
senha. É o preço de uma rede sem caixa corporativa, e é explícito na tela.

> **Antes de anunciar isso à rede**, confira com quem cuida do domínio se
> `trihoteis.com.br` tem **SPF, DKIM e DMARC** configurados. Todos os endereços
> serão Gmail, Hotmail e Outlook; sem esses registros a confirmação e o link de
> redefinição caem no spam, e o recurso inteiro parece não funcionar sem
> nenhuma mensagem de erro em lugar nenhum.

## Primeiro acesso

O banco de demonstração foi limpo: restam apenas as contas administrativas, os
departamentos e as categorias. **As senhas não ficam neste repositório** — o
administrador cadastra as pessoas em *Painel Administrativo → Usuários → Novo*,
e a senha inicial de cada uma é exibida uma única vez na tela, no momento do
cadastro. Ela vale até o primeiro acesso: a plataforma exige a troca antes de
liberar qualquer tela.

**Nenhum e-mail é enviado no cadastro**, e não por falta de configuração: a
conta ainda não tem endereço nenhum. A entrega do usuário e da senha provisória
é em mãos.

Para recriar a base de demonstração (funcionários e cursos de exemplo) em um
ambiente de testes:

```bash
npx prisma db seed          # popula com dados de demonstração
npx tsx prisma/limpar-dados.ts   # remove tudo, preservando o administrador
```

## Curso de boas-vindas

```bash
npm run curso:boas-vindas -- --simular            # confere sem gravar
npm run curso:boas-vindas                         # cria
npm run curso:boas-vindas -- --matricular-todos   # cria e matricula
```

Cria o curso **"Como usar a Academia Corporativa"** — três módulos, sete aulas
em texto e uma prova final de oito questões, com 70% de nota mínima.

É o curso que explica a própria plataforma: como entrar com nome de usuário,
onde ficam os cursos, como cada tipo de aula é concluída, o que é treinamento
obrigatório, como a prova corrige e para que serve o QR do certificado. Serve
de primeiro curso para quem acabou de receber a senha em papel — e faz a pessoa
passar por todos os mecanismos uma vez antes de precisar deles a sério.

Ele é `sequential`, de propósito: ensina que existem cursos em ordem sendo um.

**O conteúdo é texto PLANO.** A tela do aluno renderiza `textContent` com
`whitespace-pre-line` e nada mais — asterisco de negrito e cerquilha de título
apareceriam crus para o funcionário. Ao editar o script, escreva como se
escreve num bloco de notas.

Roda por linha de comando, e não por uma tela, porque montar oito aulas e oito
questões pelo formulário é meia hora de digitação — e o texto precisa poder ser
corrigido e recriado sem esse custo. O script **recusa** se já houver curso com
o mesmo título: recriar por cima duplicaria o conteúdo e o progresso de quem já
o fez.

O autor é a primeira conta protegida encontrada, ou outra via `--autor <usuário>`.

É `.mjs` e roda com **node puro**, sem `tsx`. Não é detalhe de estilo: ele
precisa ser chamado durante a publicação (ver abaixo), e depender do `tsx`
estar presente naquele momento seria uma aposta a mais.

### Sem terminal no servidor

Esta hospedagem não dá acesso a terminal, e a publicação é o único momento em
que um script nosso roda no servidor com o banco à mão. Por isso o
`postinstall` sabe criar o curso, **quando pedido**:

| Variável | Efeito |
| --- | --- |
| `CRIAR_CURSO_BOAS_VINDAS=1` | A próxima publicação cria o curso |
| `CURSO_MATRICULAR_TODOS=1` | Matricula todo funcionário ativo junto |
| `CURSO_AUTOR=usuario` | Quem consta como autor (padrão: a conta protegida) |

Defina no painel da hospedagem e publique. Depois **pode deixar ligado**: o
script recusa se já houver curso com aquele título, então republicar não
duplica conteúdo nem toca no progresso de quem já fez.

Uma falha aqui **avisa e deixa a publicação seguir**, pelo mesmo motivo da
migração: trocar "o curso não foi criado" por "site fora do ar" seria péssimo
negócio. Conteúdo não é infraestrutura.

O passo roda **mesmo quando a migração falha**, e isso foi uma correção. Na
primeira publicação com a variável ligada, o `migrate deploy` bateu num
`database is locked` — falha transitória, sem nenhuma migração pendente — e o
curso não foi criado por causa de um problema sem relação com ele. Pior: nada
no log explicava a ausência. Hoje o log diz em qual dos casos você está,
inclusive quando a variável está desligada.

### "database is locked" na migração

O banco é um arquivo SQLite, e durante a publicação a aplicação **antiga**
continua no ar segurando esse arquivo. O `migrate deploy` precisa escrever em
`_prisma_migrations` e às vezes esbarra nisso:

```
Error: SQLite database error
database is locked
 0: sql_schema_connector::sql_migration_persistence::initialize
```

Não é configuração errada nem schema quebrado — é disputa de acesso, e passa em
segundos. Por isso o `postinstall` **tenta quatro vezes, com 3 segundos de
intervalo**, antes de desistir. Desistir na primeira deixaria o banco
desatualizado por um instante de azar, que é exatamente o cenário que já
derrubou este site três vezes.

Se as quatro falharem, o aviso sai alto e a publicação segue — mas aí é para
resolver antes de usar a plataforma.

## Hierarquia de administradores

Todo administrador **enxerga a plataforma inteira** — todos os usuários, todos
os cursos. O que a hierarquia limita é o que cada um pode **alterar**.

| | Administrador de departamento | Proprietário |
| --- | --- | --- |
| Ver usuários e cursos | todos | todos |
| Alterar usuário | só do seu departamento | qualquer um |
| Matricular / remover matrícula | só do seu departamento | qualquer um |
| Criar curso | nasce no seu departamento | escolhe o departamento |
| Alterar curso, módulos e aulas | só do seu departamento | qualquer um |
| Marcar treinamento obrigatório | só para o seu departamento | qualquer um |
| Criar departamento | não | sim |
| Ter a própria conta alterada por outro | sim | **não** |

### O proprietário

É uma conta administradora com duas particularidades: **nenhum outro
administrador pode editá-la, desativá-la ou redefinir a senha dela**, e ela é a
única isenta da regra de departamento.

A isenção não é privilégio decorativo: sem ela ninguém poderia definir o
departamento de um usuário recém-criado nem atribuir um curso a um time, e o
sistema travaria sozinho.

```bash
# criar do zero (a senha é impressa uma única vez)
npx tsx prisma/criar-proprietario.ts fulano.tal "Nome Completo"

# ou promover uma conta que já existe
npx tsx prisma/definir-proprietario.ts fulano.tal
```

Ambos rodam **por linha de comando de propósito**. Fosse um botão na interface,
qualquer administrador poderia se autopromover e a proteção não valeria nada.
Quem tem acesso ao servidor já tem acesso ao banco de qualquer forma.

**O risco que isso traz:** perdido o acesso a essa conta, nenhum colega
consegue destravá-la pela interface. A recuperação só é possível pelo servidor.

### Por que as quatro portas, e não só a edição

As travas valem para **editar, desativar, redefinir senha e gerar link de
redefinição**. Proteger só a edição não protegeria nada: redefinir a senha já
entrega a conta inteira a quem redefiniu.

Pelo mesmo motivo, um administrador comum **não troca o próprio departamento**.
Como toda conta pode editar a si mesma, sem essa trava bastaria mudar de setor
para alcançar qualquer pessoa da plataforma.

Curso **sem departamento** fica reservado ao proprietário — é o estado dos
cursos criados antes desta regra, e obriga uma atribuição consciente em vez de
deixá-los abertos a todos por omissão.

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

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Prisma** + **SQLite** (trocar o `provider` em `prisma/schema.prisma` para
  `postgresql` migra para PostgreSQL sem alterar o restante do código)
- **NextAuth** (credenciais + JWT), senhas com hash **bcrypt**
- **Tailwind CSS**, **Recharts** (gráficos), **@dnd-kit** (arrastar e soltar),
  **pdf-lib** (geração de certificados), **Zod** (validação)
- **Nodemailer** para e-mail — carregado só quando há SMTP configurado
- **qrcode-generator** para o QR do certificado (sem dependências próprias; os
  módulos são desenhados como retângulos vetoriais pelo pdf-lib)

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

### Imagem de capa dos cursos

**Envie 1600 × 500 px** (proporção 3,2:1), em JPEG ou WebP, abaixo de 300 KB.

A mesma imagem é usada em dois lugares com formatos bem diferentes, e o
navegador corta o que não couber (`object-cover`, sempre pelo centro):

| Onde aparece | Altura | Largura máxima | Proporção |
| --- | --- | --- | --- |
| Cartão do curso — portal | 144 px | ~440 px | ~3:1 |
| Cartão do curso — painel | 112 px | ~440 px | ~3,9:1 |
| Banner da página do curso | 224 px (176 px no celular) | 1352 px | ~6:1 |

Os 3,2:1 recomendados acertam o cartão quase na mosca e sacrificam o banner,
que é a escolha certa: o cartão aparece no início, em "Meus cursos" e na lista
do painel; o banner aparece uma vez só.

**Área segura.** Como o corte muda conforme a tela, mantenha texto e logotipo
dentro da **metade central na vertical** e dos **75% centrais na horizontal**.
Fora disso, some: o banner corta cerca de metade da altura, e o cartão no
celular corta cerca de um quinto da largura.

**O peso importa mais do que parece.** A otimização de imagem do Next está
desligada em `next.config.mjs` — o arquivo enviado é exatamente o que cada
funcionário baixa, no tamanho original, toda vez que abre a lista de cursos.
Uma capa de 4 MB multiplicada por doze cursos na tela é o que transforma um
portal rápido em um portal lento.

Formatos aceitos: JPEG, PNG e WebP. WebP costuma entregar o mesmo resultado
com metade do peso do JPEG — vale como padrão.

## Estrutura

```
prisma/schema.prisma      modelos do banco
prisma/seed.ts            dados de demonstração
storage/uploads/          vídeos, PDFs e imagens (fora de /public)
src/app/(auth)/           login, recuperação e redefinição de senha
src/app/(portal)/         portal do funcionário
src/app/admin/            painel administrativo
src/app/validar/          conferência pública de certificado
src/app/error.tsx         tela de erro — avisa o servidor quando algo quebra
src/app/api/              autenticação, upload, arquivos e certificados
src/lib/actions/          server actions (CRUD, matrículas, progresso)
src/lib/progress.ts       motor de cálculo de progresso
src/components/           design system e componentes de cada ambiente
```

Quatro módulos concentram as decisões que mais lugares precisam respeitar:

| Arquivo | Decide |
| --- | --- |
| `src/lib/permissoes-usuario.ts` | Quem pode alterar quem — funções puras, sem banco. As server actions, as telas e os testes chamam **as mesmas funções**; duplicada, a regra divergiria em silêncio e a tela ofereceria botões que o servidor recusa. |
| `src/lib/alcance-admin.ts` | Traduz a decisão acima para as server actions, buscando os registros. Fica fora dos arquivos `"use server"` porque lá todo export vira endpoint. |
| `src/lib/matricula-automatica.ts` | Quem deve estar matriculado em quê, por departamento. |
| `src/lib/video-credito.ts` | Quanto de vídeo realmente foi assistido. |

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
- **Treinamento obrigatório por departamento**: marcado na tela do curso, o
  curso alcança **todo mundo do departamento na hora** — e quem for contratado
  ou transferido para lá depois entra sozinho. Com prazo opcional em dias,
  contado a partir da matrícula.

  A regra é **só criar, nunca remover**: quem já estava matriculado por fora
  continua, quem mudou de departamento não perde o histórico do curso antigo, e
  retirar a obrigatoriedade **não desmatricula ninguém**. Remover em massa
  apagaria progresso e certificados já emitidos — a operação mais destrutiva da
  plataforma. Saídas individuais continuam sendo feitas uma a uma, com
  confirmação.

  Administradores ficam de fora da matrícula automática: eles gerenciam o
  treinamento, e matriculá-los encheria o portal deles com os cursos que eles
  mesmos publicaram.
- **Senha provisória**: senha criada por outra pessoa — cadastro de funcionário,
  redefinição pelo painel, sincronização com a intranet — vale **até o primeiro
  acesso**. Portal e painel administrativo bloqueiam a navegação até a troca. A
  verificação é no servidor e não no proxy: o proxy só enxerga o token
  da sessão, que não acompanha a troca feita depois do login.
- **Certificado conferível**: cada certificado tem um código único e uma página
  pública em `/validar/<código>`, cujo endereço vai impresso no PDF. Mostra
  apenas nome, curso e data — sem e-mail, sem cargo, sem matrícula — e não há
  listagem nem busca, então nada ali permite varrer a base. O código é sorteado
  com `crypto.getRandomValues`; previsível, permitiria adivinhar códigos válidos
  e ler o nome de quem concluiu.
- **Excluir um curso** apaga em cascata módulos, aulas, matrículas, progresso e
  **certificados já emitidos**. A confirmação diz quantos registros serão
  destruídos e sugere arquivar. Arquivar tira o curso do portal preservando todo
  o histórico.
- **Proteção do login**: 5 erros seguidos bloqueiam a conta por 15 minutos, e
  há um teto de tentativas por origem para barrar quem varre muitas contas.
  Ajustável no `.env`.
- **Arquivos enviados** são conferidos pela assinatura do conteúdo, não pelo
  tipo que o navegador declara.
- Ações administrativas relevantes são registradas em **Histórico de atividades**.

## Relatórios

| Tela | Responde |
| --- | --- |
| **Relatórios** | Como vai cada curso e cada departamento — visão consolidada, em percentuais. |
| **Conformidade** | Nome a nome: quem está em dia, atrasado, ou vence nos próximos 7 dias. É a pergunta que auditoria e RH fazem, e que a consolidação não responde. |
| **Primeiro acesso** | A senha que eu entreguei virou acesso? Quem nunca entrou, quem entrou e parou, e quem sequer tem curso atribuído. |

Conformidade considera **apenas matrículas obrigatórias**. Curso opcional não é
dívida de ninguém, e misturá-lo inflaria as pendências até o relatório virar
ruído.

### Primeiro acesso

Existe por uma limitação da rede, e não por pedido de relatório: **ninguém tem
e-mail**. Não há lembrete automático possível para o funcionário — nem de
senha, nem de treinamento vencendo. A única cobrança é humana, e depende de
alguém saber a quem cobrar.

A senha provisória é entregue em papel, uma vez. Depois disso ninguém sabe se
ela foi usada, se o papel se perdeu, ou se a pessoa entrou e parou na primeira
tela. O `lastLoginAt` já era gravado a cada login, mas só aparecia na ficha
individual: descobrir quem faltava exigia abrir uma conta por vez.

Quatro situações, e a ordem entre as duas primeiras é a decisão do módulo:

| Situação | O que fazer, e **quem** faz |
| --- | --- |
| **Sem curso** | Ninguém atribuiu treinamento. Quem age é o **administrador**. |
| **Nunca entrou** | A senha não virou acesso. Quem age é o **gestor**, indo atrás da pessoa. |
| **Entrou, não começou** | Usou a senha e parou. Vale um empurrão. |
| **Ativo** | Concluiu ao menos uma aula. |

`sem_curso` vem antes de `nunca_entrou` de propósito: cobrar alguém por não ter
feito um treinamento que ninguém atribuiu a ela desmoraliza a cobrança inteira.
São ações de donos diferentes, e a tela precisa separar isso.

A lista é ordenada **por urgência, não por nome**: quem está parado há mais
tempo aparece primeiro. Uma senha entregue há dois meses e nunca usada é um
problema diferente de uma entregue ontem.

É pergunta distinta da Conformidade, e por isso mora separado: lá é "quem está
atrasado no que devia"; aqui é anterior a qualquer dívida. Alguém sem curso
obrigatório não aparece na conformidade nunca, e ainda assim pode ter recebido
uma senha que jamais usou.

## Datas e fuso horário

A formatação acontece no **servidor**, e servidor Linux roda em UTC.
`Intl.DateTimeFormat("pt-BR")` define o formato (dd/mm/aaaa) mas **não o
fuso** — sem a opção `timeZone` ele usa o do processo. O resultado era todo
horário três horas adiantado, e um acesso da noite de quarta aparecendo como
quinta. O dado no banco sempre esteve certo; quem mentia era a tela.

São duas coisas diferentes, e `src/lib/utils.ts` tem uma função para cada:

| Função | Para | Fuso |
| --- | --- | --- |
| `formatDateTime`, `formatDate` | **Instantes** — último acesso, emissão de certificado, conclusão de aula | `TZ_EXIBICAO`, padrão `America/Sao_Paulo` |
| `formatPrazo` | **Datas de calendário** — o prazo de uma matrícula | UTC, de propósito |

O `formatPrazo` parece errado e não é. O `<input type="date">` manda
`"2026-09-05"`, que o `new Date()` lê como meia-noite **UTC**. Exibir esse
instante em São Paulo dá 05/09 menos três horas, ou seja **04/09**: o prazo
apareceria um dia antes do digitado e o funcionário seria cobrado cedo demais.
Prazo não é um momento no tempo, é um dia do calendário — lê-lo no mesmo fuso
em que foi gravado devolve o dia escolhido.

> **Ao mexer nisso, rode a suíte com `TZ=UTC npm test`.** O defeito original
> passava despercebido justamente porque a máquina de quem desenvolve está em
> São Paulo e o servidor não.

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

## Resumo de conformidade por e-mail (opcional)

```bash
npm run conformidade:resumo            # levanta e envia
npm run conformidade:resumo -- --seco  # mostra o que sairia, sem enviar
```

A tela `/admin/conformidade` responde a pergunta que auditoria e RH fazem —
nome a nome, quem está em dia e quem está atrasado. O problema é que ela espera
alguém lembrar de abri-la, e treinamento obrigatório vencido não avisa que
venceu. Este resumo faz a pergunta chegar sozinha.

Defina `RESUMO_CONFORMIDADE_EMAIL` e agende:

```
0 8 * * 1  cd /caminho/do/projeto && npm run conformidade:resumo
```

Roda por agendador, e não dentro da aplicação, de propósito: a plataforma sobe
em modo standalone, sem processo de fundo, e um temporizador interno dispararia
de novo a cada reinício.

Três decisões que valem saber:

- **Sem nada a cobrar, nenhum e-mail.** Um resumo que chega toda semana dizendo
  "está tudo bem" é o que ensina quem recebe a arquivá-lo sem ler — e aí o da
  semana que importa vai junto.
- **Falha de envio termina com erro**, ao contrário do resto do sistema. Nos
  outros pontos o e-mail é um extra sobre algo que já deu certo; aqui é a única
  razão do script existir, e falhar em silêncio faria o agendador marcar
  sucesso enquanto o resumo parou de chegar.
- **A conta é a mesma da tela.** Ela mora em `src/lib/conformidade.ts`, usada
  pelos dois — uma tela dizendo doze atrasados e um e-mail dizendo nove é pior
  do que não ter o e-mail.

Sem `RESUMO_CONFORMIDADE_EMAIL` ou sem SMTP, o resumo é impresso na saída e o
script termina bem: dá para agendá-lo antes de configurar o e-mail e conferir o
que sairia.

## Monitoramento (opcional)

Erro em produção vira aviso ativo, por e-mail (`ALERTA_EMAIL`, usa o SMTP acima)
ou por webhook (`ALERTA_WEBHOOK_URL`, um POST com JSON — Slack, Discord, n8n).
Sem nenhum dos dois, só o log, que é como a plataforma sempre funcionou.

Avisos iguais ficam em silêncio por `ALERTA_INTERVALO_MIN` minutos (padrão 30).
Uma página quebrada é aberta dezenas de vezes por minuto; sem agrupamento, o
alerta viraria ruído que se aprende a ignorar.

O monitoramento **nunca lança**: derrubar a requisição por não conseguir avisar
sobre a falha seria pior do que monitoramento nenhum.

## Testes

```bash
npm test
```

228 testes em 20 arquivos, sem dependência extra — usam o executor nativo do
Node (`node --test`)
com `tsx` para o TypeScript. Cada execução cria um banco SQLite próprio em pasta
temporária e aplica as migrações reais; **o banco de desenvolvimento nunca é
tocado**.

| Arquivo | O que cobre |
| --- | --- |
| `tests/video-credito.test.ts` | A regra que impede forjar a conclusão de um vídeo: arrastar a barra, repetir a chamada, deixar a aba parada, e o caminho honesto que precisa continuar funcionando. |
| `tests/progresso.test.ts` | Cálculo do percentual, aulas opcionais fora da conta, isolamento entre alunos, emissão única do certificado e ordem obrigatória das aulas. |
| `tests/login.test.ts` | Bloqueio por conta e por origem, expiração, e o `x-forwarded-for` só valendo com proxy confiável. |
| `tests/arquivos.test.ts` | Assinatura dos arquivos enviados: aceita os formatos reais, recusa executável disfarçado. |
| `tests/permissoes-usuario.test.ts` | Quem altera quem: conta protegida, alcance por departamento, e a trava que impede um administrador de trocar o próprio setor para alcançar a plataforma toda. |
| `tests/matricula-automatica.test.ts` | Matrícula obrigatória: idempotência ao rodar várias vezes, prazo contado a partir da matrícula, inativo e administrador fora, e a garantia de que retirar a obrigatoriedade não desmatricula ninguém. |
| `tests/email.test.ts` | Só liga com as cinco variáveis; escapa o que veio do cadastro antes de montar o HTML. |
| `tests/monitoramento.test.ts` | Agrupamento de avisos e a garantia de que uma falha ao avisar não derruba quem chamou. |
| `tests/certificado-codigo.test.ts` | Imprevisibilidade e ausência de colisão no código do certificado — que virou segredo quando a conferência ficou pública. |
| `tests/liberacao-de-aulas.test.ts` | Ordem obrigatória: qual aula abre depois de qual, e o mapa que a tela e o servidor precisam calcular igual. |
| `tests/prova.test.ts` | Correção, nota mínima, questão sem gabarito, o que o reprovado NÃO vê, e a estatística por pessoa e por questão. |
| `tests/alcance-de-provas.test.ts` | Quem alcança qual prova: departamento principal, adicional, prova geral e a porta por matrícula em curso. Inclui a invariante de que listar e conferir nunca discordam. |
| `tests/aplicar-prova.test.ts` | Quem pode APLICAR uma prova numa aula — regra distinta da de alterá-la, porque prova geral serve a qualquer curso. |
| `tests/acesso-a-arquivos.test.ts` | A única barreira entre um id e o acervo: vídeo e PDF de curso matriculado, capa de publicado contra rascunho, avatar, arquivo órfão. |
| `tests/painel.test.ts` | Os indicadores do painel, com destaque para "atrasado conta pessoas, não matrículas". |
| `tests/senha-provisoria.test.ts` | Formato e entropia da senha gerada, e a redefinição destravando conta bloqueada por tentativas. |
| `tests/faixa-de-bytes.test.ts` | O trecho de arquivo pedido pelo cliente, contido no arquivo real — bordas, arquivo vazio, e a garantia de que nenhum tamanho sai negativo. |
| `tests/teto-de-avisos.test.ts` | O limitador da rota de avisos: teto por janela, virada, e a enxurrada contínua que não pode reabrir a janela. |
| `tests/datas.test.ts` | O fuso da exibição: hora de São Paulo para instantes, e o dia digitado para prazos. Compara com valores fixos, e não com o relógio local, senão passaria na máquina do desenvolvedor e falharia no servidor. |
| `tests/primeiro-acesso.test.ts` | A credencial virou acesso: a ordem entre "sem curso" e "nunca entrou" (ações de donos diferentes), administrador e inativo fora da conta, e a ordenação por tempo parado. |
| `tests/conformidade.test.ts` | Quem está em dia: concluído vence prazo vencido, a borda do último dia, obrigação sem prazo, e a regra de que o resumo por e-mail não sai quando não há o que cobrar. |
| `tests/nome-de-usuario.test.ts` | O formato do identificador de acesso: normalização do que foi digitado, o que a validação recusa, e a invariante de que tudo que a normalização produz a validação aceita. |
| `tests/email-pessoal.test.ts` | A confirmação do e-mail pessoal: uso único, prazo, e as duas contas que tentam registrar a mesma caixa — inclusive a corrida em que os dois links são emitidos antes de qualquer confirmação. |
| `tests/certificado-pdf.test.ts` | O PDF sai válido com e sem endereço público, e o QR de conferência tem os três padrões de localização nas quinas certas — espelhado, nenhum leitor o abre. |

**Teste que grava em disco precisa desviar o destino.** `tests/ambiente.ts`
aponta o `DATABASE_URL` para um banco temporário, e `tests/erros-temporarios.ts`
faz o mesmo com o `ERROS_DIR` — importado ANTES do módulo que grava, porque o
caminho é resolvido no carregamento. Sem esse cuidado, a suíte despeja erros
inventados dentro do registro real que a tela `/admin/erros` lê; foram 225
linhas de lixo acumuladas até a verificação automática denunciar. Se você
escrever um teste que chame `registrarErro`, importe esse módulo primeiro.

A regra de crédito de vídeo mora em `src/lib/video-credito.ts` como função pura,
separada da server action que a usa: é a única parte do sistema cujo resultado
depende do relógio, e assim pode ser exercitada com o tempo controlado, em
milissegundos em vez de minutos.

**O nível HTTP é coberto separadamente**, pelos dois roteiros de fumaça
descritos adiante: eles sobem o servidor de verdade e conferem código de status,
cabeçalho e corpo — inclusive as recusas (401, 403, 416), que é a metade da
regra que um teste de "funciona" nunca alcança.

**O que ainda não é coberto por nada automático**: interação de arrastar e
soltar na montagem de módulos e aulas. A fumaça confirma que a tela responde,
não que o arraste reordena. Depois de mexer em `module-lesson-builder.tsx`,
confira à mão.

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

### Erros do servidor

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

## Observações desta entrega

- **Recuperação de senha**, em três degraus:
  1. **A própria pessoa**, se cadastrou e confirmou um e-mail pessoal
     (*Perfil → Meu e-mail*): `/esqueci-senha` resolve sozinho. Exige `SMTP_*`
     configurado.
  2. **O administrador**, para todo o resto — que hoje é a maioria: *Usuários →
     (pessoa) → Gerar link de redefinição*, ou redefinir a senha direto. O link
     nunca é exibido na tela pública, só no painel.
  3. **A linha de comando**, `npm run senha:redefinir`, para o que nenhum dos
     dois alcança: a conta protegida do proprietário, que nenhum outro
     administrador pode redefinir.

  Token de uso único, válido por 1 hora, em todos os caminhos.
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
- **A conferência de certificado é pública** (`/validar`), e é isso que a torna
  útil: quem confere é gente de fora — auditor, cliente, outro empregador —, que
  não tem login aqui. O PDF traz um **QR** apontando para `/validar/<codigo>`,
  ao lado do endereço por extenso: o QR é o que faz alguém de fato conferir em
  vez de digitar vinte caracteres, e o texto é o que sobrevive a uma fotocópia
  ruim. O QR só é desenhado quando `NEXTAUTH_URL` está definida — sem endereço
  público não há para onde apontar.

## Ordem de configuração após publicar

Cada passo destrava o próximo:

1. **Crie o proprietário** (`criar-proprietario.ts`) e troque a senha no
   primeiro acesso, em *Minha conta*.
2. **Defina o departamento de cada administrador.** Sem isso eles veem tudo e
   não alteram nada — e só o proprietário consegue atribuir.
3. **Atribua os cursos existentes a um departamento.** Curso sem departamento só
   o proprietário altera.
4. **Agende o backup** no cron. É o único item da lista cuja ausência pode custar
   dados irrecuperáveis.
5. **Preencha SMTP e alertas**, se quiser envio de e-mail e aviso de erro.
   Precisa das credenciais do domínio de vocês.
6. **Rode o teste de fumaça** apontando para o domínio. Leva segundos e é o que
   pega tela quebrada antes de o primeiro usuário encontrá-la. A verificação
   automática já roda a bateria a cada push, mas ela testa o código — só a
   fumaça contra o domínio testa a PUBLICAÇÃO: variável faltando, banco não
   migrado, arquivo fora do lugar.
