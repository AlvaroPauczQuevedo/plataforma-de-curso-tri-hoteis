# Treinamento

_O conteúdo e o caminho que o funcionário percorre._

> Parte da documentação da **Academia Corporativa Tri Hotéis**. Índice em [../README.md](../README.md).

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

O `postinstall` **tenta quatro vezes, com 3 segundos de intervalo**. Onde a
disputa for passageira, isso resolve — e desistir de cara deixaria o banco
desatualizado por azar de um segundo, o cenário que já derrubou este site três
vezes.

**Nesta hospedagem a repetição não resolve**: as quatro tentativas falham
igual, o que mostra um lock sustentado, não um instante de azar.

Por isso a repetição é só a primeira metade. Quando as quatro falham, o script
**confere o estado do banco por outro caminho**: pergunta ao *cliente* do
Prisma quais migrações constam em `_prisma_migrations` e compara com as pastas
de `prisma/migrations`.

A diferença é o ponto todo: quem não consegue o arquivo é o **motor de
migração**; a aplicação continua lendo e escrevendo normalmente, e o cliente
passa por onde o motor tropeça. O log então diz uma de três coisas:

| Situação | O que aparece |
| --- | --- |
| Nada pendente | `NÃO HÁ NADA PENDENTE: o banco já está no schema atual` — sem ação |
| Algo pendente | lista os nomes e alerta em maiúsculas |
| Nem deu para conferir | avisa que o estado é desconhecido |

Sem isso, um lock deixava o log gritando "resolva a migração antes de usar a
plataforma" mesmo sem nada a aplicar. Aviso alarmante e falso é o que ensina
todo mundo a ignorar aviso.

## Trilhas de aprendizagem

Cursos em **ordem**. O curso avulso ensina uma coisa; a trilha ensina um
caminho: "Integração" antes de "Atendimento", "Boas práticas" antes de
"Manipulação de alimentos".

Era a dependência entre cursos que a plataforma não sabia expressar. Sem ela, a
pessoa recebia cinco cursos no primeiro dia e começava pelo mais difícil — que
é como alguém desiste do segundo.

Em `/admin/trilhas` (montar) e `/trilhas` (fazer).

### As três decisões que definem o módulo

**1. A trilha matricula em TODOS os cursos de uma vez.** Não um a um. A
Conformidade precisa enxergar a dívida inteira: matriculando por etapa, o
relatório mostraria uma pendência para quem deve cinco, e ficaria correto e
vazio ao mesmo tempo.

**2. O bloqueio é de apresentação, não de acesso.** O degrau trancado aparece
cinza, sem link, com o motivo escrito. Ele não some: a pessoa precisa ver o
caminho inteiro para saber onde está e quanto falta. Esconder o que vem depois
transformaria a trilha numa fila de surpresas.

**3. Presencial destranca.** A conclusão vem de `lib/conclusoes`, a mesma fonte
da Conformidade, da Reciclagem e do relatório de auditoria. Uma brigada feita
numa sala abre o degrau seguinte, e o degrau ganha o selo *presencial* — senão
a pessoa abre chamado perguntando por que a trilha não reconheceu o treinamento
que ela fez.

### O que a trilha NÃO faz

Ela não é um segundo jeito de matricular. Uma trilha atribuída a um setor
expande em regras do mesmo formato do `CursoObrigatorio`, e a gravação segue
pelo mesmo `criarFaltantes` — inclusive a regra de ouro, **só criar, nunca
remover**. Um segundo lugar que grava `Enrollment` acabaria divergindo do
primeiro, e divergência em matrícula aparece do pior jeito: gente cobrada por
curso que ninguém atribuiu, ou gente sem o treinamento que a lei exige.

Por isso, também:

- **tirar um degrau não desmatricula ninguém** — o curso sai da trilha e
  continua na lista da pessoa, com progresso e certificado intactos;
- **desatribuir um setor não desmatricula ninguém** — a trilha some da tela, a
  dívida permanece;
- **trilha publicada não se exclui.** Ela já matriculou gente, e apagá-la
  deixaria as matrículas órfãs, sem nada explicando por que aqueles cinco
  cursos apareceram. Despublicar é o caminho.

### Curso concluído fora de ordem continua concluído

Acontece de verdade: a pessoa fez o curso avulso antes de a trilha existir, ou
o RH lançou o presencial fora de ordem. Reapresentá-lo como trancado mandaria
refazer treinamento já cumprido — e faria a trilha discordar da Conformidade
sobre a mesma pessoa.

### O gargalo

A tela do painel mostra **em que degrau a equipe parou**. Doze pessoas paradas
no mesmo curso não são doze problemas de disciplina: são um problema daquele
curso — longo demais, confuso, ou com prova impossível. É a informação que muda
uma decisão, e nenhuma outra tela a dava.

O prazo é da **trilha inteira**, e vale igual para todos os degraus. Prazo por
degrau exigiria adivinhar quanto tempo cada curso leva, e errar essa conta vira
cobrança indevida — o jeito mais rápido de a equipe aprender a ignorar
cobrança.

## Aceite de documentos

O curso prova que a pessoa foi **treinada**; o aceite prova que ela foi
**informada**. É o que um auditor pede quando pergunta onde está o registro de
que fulano recebeu a política — e até aqui a plataforma não tinha resposta: o
documento circulava por e-mail ou impresso, e o comprovante era a memória de
quem entregou.

**Como funciona**

1. Em **Documentos**, no painel, envie o PDF (política, norma, código de conduta) e
   escolha quem precisa aceitar. Nasce como **rascunho**.
2. Publicado, ele aparece em **Documentos** no portal do funcionário, que lê o
   PDF, marca "li e concordo" e registra o aceite.
3. O painel mostra a barra de quem já aceitou e a lista de **quem falta** — que
   é a pergunta útil; uma lista só de assinaturas não responde isso.

**Alcance.** Sem nenhum setor marcado, o documento vale para a rede inteira — e
nesse caso só o **proprietário** publica, pelo mesmo motivo que curso sem
departamento é reservado a ele. Com setores, vale o departamento principal e os
adicionais, a mesma regra do treinamento obrigatório.

**Versão é o coração do modelo.** Documento revisado é outro texto: use
**Nova versão** para enviar o PDF novo, e todos voltam à fila de aceite. Os
aceites antigos **não** são apagados — eles provam quem leu a versão anterior, e
é essa a pergunta que a auditoria faz sobre o passado. Quem já tinha assinado
aparece como *"Revisado — leia de novo"*, com texto diferente de quem nunca leu.

**O que fica registrado:** quem, qual documento, **qual versão**, quando e de
qual origem (IP, quando há proxy confiável). Documento com aceite não pode ser
excluído — despublicar tira da frente dos funcionários e preserva a prova.

## Treinamento presencial

A plataforma só conhecia o que ela mesma entregou. Numa rede hoteleira, boa
parte do treinamento obrigatório acontece **em sala** — brigada de incêndio
exige prática, manipulação de alimentos costuma ser presencial.

O efeito era grave e silencioso: a Conformidade cobrava quem **já tinha feito**
o curso, e o relatório de auditoria saía incompleto afirmando estar completo.

Em *Usuários → (pessoa) → Treinamento presencial* dá para reconhecer o que foi
feito fora: curso, data da conclusão, quem aplicou e uma observação. A partir
daí ele conta como concluído na Conformidade, na Reciclagem e no relatório.

### Três decisões que valem entender

**Não emite certificado da plataforma.** Ela não pode certificar o que não
entregou — não viu a aula, não corrigiu prova. O comprovante é o documento de
quem aplicou. No relatório, a coluna de conferência mostra `presencial — <quem
aplicou>` em vez de um código, para a célula vazia não parecer falta de dado
justamente onde o documento ganha valor.

**A data é a da conclusão, não a do lançamento.** É dela que a reciclagem conta
a validade. Quem fez brigada há treze meses aparece como vencido no mesmo dia
em que o registro é criado — que é o correto.

**As três telas leem a mesma fonte** (`src/lib/conclusoes.ts`). Antes, cada uma
consultava um lugar diferente: progresso do curso, certificado, certificado de
novo. Bastava acrescentar uma quarta origem para divergirem — e divergência
aqui aparece do pior jeito: a tela dizendo doze pendentes e o papel dizendo
nove, sem ninguém saber qual vale.

Tendo as duas origens — fez presencialmente e depois refez aqui —, vale a
**mais recente**: escolher a antiga marcaria como vencido quem acabou de
reciclar.

## Check-in presencial por QR

Combate a incêndio, manipulação de alimentos, segurança do trabalho — o treinamento que mais
importa num hotel acontece numa sala, não na plataforma. Ele já era reconhecido
(ver *Treinamento presencial*), mas lançado **à mão, um nome por vez**. Numa
turma de trinta são trinta lançamentos, e é aí que alguém fica de fora sem
ninguém notar. Numa auditoria, o nome que faltou é exatamente o problema.

Em `/admin/presenca`: o instrutor abre a lista, projeta o código, a turma
aponta a câmera do celular, e ele encerra quando acaba.

### Por que o código gira

A objeção óbvia a uma lista de presença por QR é a foto: alguém fotografa o
código, manda no grupo, e três pessoas que não estavam na sala aparecem
treinadas em brigada de incêndio. Isso não é detalhe de segurança — é a
diferença entre um registro que vale numa auditoria e um que não vale.

Por isso o código **não é fixo**. Ele é derivado do segredo da sessão e da
janela de tempo, muda a cada **30 segundos**, e o servidor aceita apenas a
janela corrente e a anterior. A foto de 14h02 não serve às 14h05. Para marcar
presença é preciso estar olhando para a tela naquele instante — que é,
literalmente, estar na sala.

É o desenho de um autenticador de dois fatores, e pelo mesmo motivo: o que se
quer provar não é "sei o segredo", é "estou aqui agora".

Três consequências que sustentam isso:

- **O segredo nunca chega ao navegador.** A tela do instrutor pergunta ao
  servidor qual é o código agora e redesenha o QR. Mandar o segredo e deixar o
  cliente derivar entregaria, a quem abrisse o inspetor, a capacidade de gerar
  códigos válidos de casa.
- **Funcionário não lê a rota do código** (`403`). Se lesse, bastaria pedir o
  código a cada trinta segundos, de qualquer lugar, e a rotação não
  significaria nada.
- **A janela seguinte não é aceita.** Aceitá-la daria 90 segundos de vida ao
  código. A anterior é aceita porque entre apontar a câmera e a página carregar
  passam segundos — sem essa folga, quem mira a tela no segundo 29 é recusado e
  vai dizer que "o QR não funciona".

Quando a câmera falha — reflexo, tela suja, aparelho velho — o código também
aparece em texto, com alfabeto sem `O/0` e `I/1/L`, para ser digitado.

### O bipe não é a conclusão

A sessão **junta presenças**; é o **encerramento** que grava as conclusões. O
instrutor confere a lista, tira quem bipou por engano, e só então confirma.

Um clique errado antes disso é uma linha para remover. Depois, seria um "fulano
está treinado em brigada de incêndio" que alguém precisaria descobrir que é
falso — e a `ConclusaoExterna` é justamente o registro que a auditoria lê.

Por isso, também: depois de encerrada, a presença não se remove por aqui. A
conclusão existe, e apagar a presença a deixaria sem a origem que a explica;
para desfazer, a tela de treinamento presencial remove a conclusão com nome e
responsável.

A conclusão é gravada com a **data do treinamento**, não a do encerramento — é
dela que a reciclagem conta a validade. E quem já tinha conclusão naquele curso
é pulado: `ConclusaoExterna` é única por pessoa e curso, e duplicá-la duplicaria
a pessoa em todo relatório.

### Encaixa no resto

A conclusão entra pela mesma `lib/conclusoes` que a Conformidade, a Reciclagem,
o relatório de auditoria e as Trilhas já leem. Então o check-in de hoje
**destrava o degrau seguinte da trilha** sozinho, e sai na planilha de
conformidade sem nenhum lançamento extra.

## Reciclagem: o certificado ainda vale?

Os treinamentos que mais importam num hotel **vencem** — manipulação de
alimentos, combate a incêndio, segurança do trabalho. Um certificado de 2024 não prova nada em
2026, e é exatamente isso que um auditor pergunta.

Até então a plataforma não tinha noção de validade: concluído era concluído para
sempre. Agora, ao marcar um curso como obrigatório para um departamento, dá para
dizer **de quantos em quantos meses ele precisa ser refeito**. Meses, e não dias,
porque é assim que a norma fala — "reciclagem anual", "a cada dois anos".

Quem está vencido ou vence em até **30 dias** aparece num painel no topo da
Conformidade. A janela é maior que os 7 dias da conformidade comum de propósito:
reciclagem exige turma, instrutor e escala coberta, e avisar em cima da hora
seria avisar tarde demais para servir.

### Por que ela detecta e não rematricula sozinha

A tentação era zerar o progresso de quem venceu, para a pessoa reaparecer como
pendente. Só que `recalculateCourseProgress` **apaga o certificado** quando o
curso deixa de estar completo — então uma reciclagem automática destruiria,
sozinha e em silêncio, o comprovante de que o treinamento foi feito no ano
passado.

É o oposto do que o recurso serve. Numa auditoria, *"fez em 2025 e está
vencendo"* é uma resposta; *"não há registro"* não é. O princípio que o resto do
sistema já segue — histórico e certificado sobrevivem a tudo — vale mais aqui do
que a comodidade de não clicar.

Então o painel diz **quem** precisa refazer, e a rematrícula continua sendo um
ato de quem administra, pela tela de Matrículas, com o registro antigo intacto.
