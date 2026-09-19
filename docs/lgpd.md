# LGPD: aplicabilidade e situação da plataforma

_Levantamento técnico para subsidiar avaliação jurídica. Data: 18/09/2026._

> **Este documento não é parecer jurídico.** Foi escrito por quem conhece o
> código, não por advogado. O que ele faz bem é uma coisa: dizer **exatamente
> qual dado pessoal a plataforma coleta, onde guarda, por quanto tempo e quem
> alcança** — que é o insumo que falta para o jurídico ou o encarregado decidir
> o resto. Onde a decisão é jurídica, está marcado como tal.

---

## 1. Resposta direta

**Sim, a LGPD se aplica.** Não há dúvida razoável aqui.

A Lei 13.709/2018 alcança **qualquer** operação de tratamento de dado pessoal
realizada em território nacional (Art. 3º, I), por pessoa jurídica de direito
privado (Art. 1º). A plataforma trata nome, telefone, e-mail, cargo, lotação,
histórico de acesso, registros de treinamento e endereço IP de funcionários
identificados. Cada um desses é dado pessoal pelo Art. 5º, I.

Não existe exceção aplicável. As três hipóteses de não incidência do Art. 4º —
uso pessoal, jornalístico/artístico/acadêmico, e segurança pública — não têm
relação com o caso.

**A Tri Hotéis é a controladora** (Art. 5º, VI): é ela quem decide o que é
coletado e para quê.

E isso já vale hoje, não em tese: há **funcionários reais cadastrados** na
plataforma — as sete contas de Centro Chapecó, entre outras.

---

## 2. Inventário: o que a plataforma trata

Levantado do schema e do código, não de memória. É a base de um registro de
operações (Art. 37), que a controladora precisa manter.

### 2.1 Dados de identificação e contato

| Dado | Onde | Origem | Obrigatório? |
| --- | --- | --- | --- |
| Nome | `User.name` | Cadastro ou intranet | Sim |
| Nome de usuário | `User.username` | Gerado do nome | Sim |
| Telefone (WhatsApp) | `User.telefone` | Cadastro | Não |
| E-mail pessoal | `User.email` | A própria pessoa, confirmado por link | Não |
| Cargo | `User.position` | Cadastro ou intranet | Não |
| Departamento / hotel | `User.departmentId`, `unidadeId` | Cadastro | Não |
| Foto | `User.avatarUrl` | Upload | Não |
| Matrícula | `User.matricula` | Intranet | Não |

### 2.2 Autenticação

| Dado | Onde | Retenção atual |
| --- | --- | --- |
| Hash da senha (bcrypt) | `User.passwordHash` | Enquanto a conta existir |
| Último acesso | `User.lastLoginAt` | Enquanto a conta existir |
| Tentativas falhas, bloqueio | `User.failedAttempts`, `lockedUntil` | Zera no acerto |
| Tentativas de login + **IP** | `LoginAttempt` | **24 horas** ✅ |
| Token de redefinição | `PasswordResetToken` | Digest SHA-256, expira em 1 h |

### 2.3 Histórico e comportamento

| Dado | Onde | Retenção atual |
| --- | --- | --- |
| Entradas no sistema | `AccessLog` | **Indefinida** ⚠️ |
| Ações administrativas | `AdminActivityLog` | **Indefinida** ⚠️ |
| Progresso por curso e por aula | `CourseProgress`, `LessonProgress` | Indefinida |
| Tentativas e notas de prova | `TentativaProva` | Indefinida |
| Certificados emitidos | `Certificate` | Indefinida |
| Treinamento presencial | `ConclusaoExterna` | Indefinida |
| Aceite de documento + **IP** | `AceiteDeDocumento` | **Indefinida** ⚠️ |
| Presença por QR + **IP** | `PresencaEmSessao` | **Indefinida** ⚠️ |

O IP é dado pessoal na leitura predominante — permite identificação indireta
(Art. 5º, I). Ele é gravado em quatro lugares, e só um tem prazo de descarte.

### 2.4 O que a plataforma **não** coleta

Vale registrar, porque é o que reduz a exposição:

- **Sem CPF, RG ou data de nascimento.**
- **Sem dado de saúde, biometria, filiação sindical, origem racial, religião ou
  opinião política** — nenhuma das categorias sensíveis do Art. 5º, II.
- **Sem dado financeiro ou salarial.**
- **Sem geolocalização** (o IP não é usado para localizar).
- A foto **não** é usada para identificação biométrica, então não é dado
  biométrico na acepção do Art. 5º, II.

Isso é relevante: **não há tratamento de dado sensível.** Sem ele não incidem
as regras mais rígidas dos Art. 11 a 13, e um Relatório de Impacto (Art. 38)
dificilmente seria exigido.

### 2.5 Um ponto que merece atenção do jurídico

A sincronização com a intranet lê o campo `social_name` e grava **apenas o nome
em uso**:

```ts
const nome = funcionario.social_name || funcionario.full_name;
```

Tecnicamente, é a decisão certa e a mais protetiva: a plataforma **não** guarda
o nome de registro ao lado do nome social, então não mantém o par que
revelaria a transição.

Ainda assim, **a existência de nome social pode revelar identidade de gênero**,
e há entendimento de que isso se aproxima das categorias do Art. 5º, II. Como
aqui só um nome é armazenado, e sem marcação de que é social, a exposição é
baixa. Vale a confirmação de quem responde juridicamente.

---

## 3. Base legal: o ponto onde mais se erra

**Não use consentimento.** É o erro mais comum em sistema de RH.

O Art. 7º, I admite consentimento, mas na relação de emprego ele é frágil por
natureza: existe subordinação, e consentimento dado por quem depende do
empregador dificilmente é "livre" como o Art. 5º, XII exige. Pior: consentimento
é **revogável a qualquer momento** (Art. 8º, §5º). Se a base do treinamento
obrigatório fosse consentimento, qualquer funcionário poderia revogá-lo e
inviabilizar o registro de conformidade que a empresa é obrigada a manter.

As bases adequadas aqui, na leitura técnica:

| Tratamento | Base provável | Dispositivo |
| --- | --- | --- |
| Treinamento **obrigatório** por exigência legal ou sanitária | Cumprimento de obrigação legal e regulatória | Art. 7º, II |
| Conta de acesso, progresso, certificado | Execução de contrato de trabalho | Art. 7º, V |
| Registros de acesso e auditoria | Legítimo interesse / obrigação legal | Art. 7º, IX / II |
| **Telefone e e-mail pessoal** | Consentimento — e aqui ele **é** o certo | Art. 7º, I |

A última linha é a exceção que confirma a regra, e o sistema já a trata bem:
telefone e e-mail são **opcionais**, e o e-mail só passa a valer depois que a
pessoa clica no link de confirmação. Fornecer é ato voluntário; não fornecer não
impede o acesso à plataforma. Isso é consentimento na acepção correta.

> **Decisão jurídica, não técnica:** confirmar as bases acima e registrá-las.
> O que o código mostra é que a arquitetura já é compatível com elas.

---

## 4. O que já está adequado

Levantado do código. São medidas do Art. 46 já implementadas, e vale listá-las
porque elas contam numa eventual fiscalização.

**Segurança (Art. 46)**

- Senha em **bcrypt custo 10**; nunca armazenada ou trafegada em claro.
- Token de redefinição guardado como **digest SHA-256** — cópia de backup não
  permite assumir conta.
- **Bloqueio por tentativas**, por conta e por origem.
- **Tempo de resposta constante** no login, para não permitir enumerar quem tem
  conta.
- Papel e situação da conta **relidos do banco a cada requisição** — acesso
  revogado vale na hora, não em até 8 horas.
- Alcance por departamento: administrador de setor não altera conta alheia.
- Arquivos protegidos por sessão (`/api/files` devolve 401 sem login).
- CSV de exportação neutraliza injeção de fórmula.

**Minimização (Art. 6º, III)**

- Não coleta CPF, RG, nascimento, dado de saúde ou financeiro.
- E-mail e telefone opcionais.
- Consultas trazem só os campos que a tela usa — há proteção explícita contra
  vazar `passwordHash` para componente de cliente, com teste de fumaça
  guardando isso.

**Qualidade e transparência parcial (Art. 6º, V e VI)**

- E-mail só é gravado **após confirmação por link** — evita registrar endereço
  errado e atribuir a recuperação de conta a terceiro.
- A senha da isca de segurança **nunca é gravada**, por decisão explícita no
  código.
- Trilha de auditoria de ações administrativas existe e é consultável.

---

## 5. Lacunas

Em ordem de risco.

### ✅ 5.1 Aviso de privacidade — **implementado**

Em `/privacidade`, **pública e sem login** — quem ainda não entrou precisa poder
ler, e a tela de login a linka. Declara controladora, o que é coletado, a base
legal de cada finalidade, com quem é compartilhado, prazos e os direitos do
titular.

É **aviso, não termo de consentimento**, e a diferença é deliberada: o
tratamento se apoia em obrigação legal e contrato, não em consentimento. Pedir
"eu concordo" fingiria uma escolha que não existe na relação de emprego.

O canal do encarregado sai de `ENCARREGADO_NOME`, `ENCARREGADO_EMAIL` e
`ENCARREGADO_WHATSAPP`; sem elas, a página aponta o setor de treinamento — um
canal existente vale mais que um específico inexistente.

> **Ainda pendente:** o texto é factual e foi conferido contra o código, mas
> **precisa de revisão jurídica** antes de ser considerado a peça formal.

<details><summary>Como era antes</summary>

Não existia política de privacidade, aviso de tratamento, nem menção à LGPD em
tela alguma.

O Art. 9º dá ao titular direito a saber a finalidade, a forma, a duração, quem
é o controlador e com quem os dados são compartilhados. O funcionário recebia
uma senha em papel e entrava num sistema que registra o que ele faz, sem nada
que o informasse disso.

</details>

### 🟡 5.2 Retenção — **mecanismo implementado, prazos a confirmar**

`lib/retencao` expurga o que vence e **anonimiza** o IP de aceites e presenças,
preservando o registro que serve de prova (Art. 12). Roda junto da rotina
agendada.

**Nasce desligado**, e de propósito: apagar é irreversível e o prazo é decisão
jurídica. Com `RETENCAO_ATIVA` desligada a rotina ainda **relata** o que está
vencido — dá para rodar semanas e ver o impacto antes de autorizar.

Padrões propostos, todos configuráveis: 180 dias para registros de acesso
(Marco Civil, Art. 15), 5 anos para a trilha administrativa, 180 dias para o IP.
Progresso, certificado e conclusão **não têm prazo** — são a prova de
treinamento que o Art. 16, I autoriza conservar.

> **Ainda pendente:** o jurídico confirmar os prazos e autorizar ligar.

<details><summary>Por que a definição do prazo é jurídica</summary>

O Art. 15 determina o término do tratamento quando a finalidade se exaure, e o
Art. 16 manda eliminar, com exceções.

Hoje só `LoginAttempt` tem prazo (24 h). Todo o resto é indefinido — inclusive
`AccessLog` e `AdminActivityLog`, que crescem para sempre, e os três campos de
IP sem descarte.

**A parte difícil não é técnica, é a definição do prazo**, e ela é jurídica:

- Registros de treinamento obrigatório têm razão de ser mantidos após o
  desligamento — prescrição trabalhista e fiscalização do trabalho. Algo em torno
  de 5 anos é o que se costuma praticar, mas **quem define é o jurídico**.
- Logs de acesso e IPs não têm a mesma justificativa e provavelmente podem ter
  prazo curto.

</details>

### 🟡 5.3 Direitos do titular — **acesso e portabilidade implementados**

A tela `/meus-dados` mostra **tudo** que a plataforma guarda sobre a pessoa —
inclusive o histórico de acesso — e exporta em JSON. Atende o Art. 18, **II**
(acesso) e **V** (portabilidade) sem que ela precise pedir a ninguém nem
esperar prazo.

A rota recusa `?userId=`: o id vem da sessão. A exportação foi verificada
contra vazamento de `passwordHash`, de hash bcrypt e de dado de terceiro.

> **Ainda pendente:** o procedimento declarado para os demais direitos —
> a quem pedir, em quanto tempo responde, como o pedido é registrado.

<details><summary>O que falta no procedimento</summary>

O Art. 18 garante confirmação, acesso, correção, anonimização, eliminação,
portabilidade e informação sobre compartilhamento — com resposta em prazo.

O sistema atende **de fato** a vários deles: a pessoa vê o próprio progresso,
certificados e histórico, e corrige o perfil. Mas não há **procedimento
declarado**: a quem pedir, em quanto tempo responde, como o pedido é
registrado.

**A exclusão de conta é bloqueada** quando a pessoa é autora de conteúdo. Do lado da LGPD isso é defensável — o Art. 16, I
autoriza conservar para cumprimento de obrigação legal, e o Art. 18, §4º
reconhece limites —, mas a recusa precisa ser **fundamentada ao titular**, não
apenas acontecer. O aviso de privacidade já explica o limite em texto; falta o
procedimento de resposta a um pedido individual.

</details>

### 🟡 5.4 Encarregado (DPO) não indicado

O Art. 41 exige que o controlador indique encarregado e **divulgue publicamente
a identidade e o contato**. Não há nada disso.

A ANPD dispensou o *pequeno agente de tratamento* da indicação formal
(Resolução CD/ANPD nº 2/2022), mas mesmo nesse caso é preciso **um canal de
comunicação com o titular**. Se a Tri Hotéis se enquadra como pequeno agente é
avaliação jurídica — mas o canal é necessário nos dois cenários.

### 🟡 5.5 Sincronização com a intranet sem instrumento

A plataforma lê um banco externo e importa nome, matrícula, e-mail corporativo,
cargo e departamento. Está desligada por padrão, mas quando ligada há
**transferência de dados entre sistemas**.

Se os dois sistemas são da mesma controladora, é tratamento interno e o ponto é
menor. Se a intranet é de terceiro, há relação controlador–operador que pede
instrumento contratual (Art. 39). **Questão jurídica**, e depende de quem opera
a intranet.

### 🟢 5.6 Backups e hospedagem

Existe rotina de backup (`npm run backup`), que guarda por padrão as **14
cópias mais recentes** em `BACKUP_DIR` ou em `./backups`. Ou seja: o banco
inteiro, com todos os dados pessoais, existe em até quinze lugares ao mesmo
tempo.

Duas perguntas que não consigo responder pelo código e que o jurídico precisa:

- **Onde as cópias ficam, e quem as alcança?** O projeto já reconhece o risco
  (foi o que motivou guardar o token de redefinição como digest).
- **Onde a aplicação está hospedada?** Se o servidor estiver fora do Brasil, há
  transferência internacional (Art. 33), que tem requisito próprio. Se é
  hospedagem nacional, o ponto não se aplica.

### 🟢 5.7 Sem plano de resposta a incidente

O Art. 48 obriga a comunicar incidente de segurança relevante à ANPD e aos
titulares, em prazo razoável. Não há procedimento definido.

A plataforma tem registro de erros e monitoramento, o que ajuda a **detectar**.
Falta o que fazer depois.

---

## 6. O que fazer, em ordem

Separado pelo que resolve mais com menos esforço.

| # | Ação | Quem faz | Esforço |
| --- | --- | --- | --- |
| 1 | Redigir **aviso de privacidade** e exibi-lo no primeiro acesso e no rodapé | Jurídico redige; eu implemento | Baixo |
| 2 | Definir **prazos de retenção** por tipo de dado | Jurídico | Médio |
| 3 | Implementar **expurgo automático** conforme os prazos | Eu | Baixo |
| 4 | Indicar **encarregado** e publicar o contato | Gestão | Baixo |
| 5 | ~~Escrever o **registro de operações** (Art. 37)~~ — **feito**: `npm run lgpd:registro` gera o PDF | Jurídico revisa | — |
| 6 | Definir **procedimento de atendimento ao titular** (Art. 18) | Jurídico | Médio |
| 7 | Documentar **onde ficam os backups** e restringir o acesso | Gestão/TI | Baixo |
| 8 | Confirmar **local de hospedagem** — transferência internacional? | Gestão/TI | Baixo |
| 9 | Escrever **plano de resposta a incidente** | Jurídico + TI | Médio |
| 10 | Se a intranet for de terceiro, firmar **contrato de operador** | Jurídico | Médio |

Os itens 1, 3, 4 e 7 são os de melhor relação entre risco reduzido e esforço.

**Sobre os itens que são meus:** o expurgo automático (3) tem padrão pronto no
projeto e encaixa na rotina de tarefas que já existe. O aviso de privacidade (1)
eu implemento assim que houver texto — a tela e o registro de ciência são
simples. Diga quando quiser que eu faça.

---

## 6.1 O registro de operações, em PDF

```bash
npm run lgpd:registro          # gera registro-de-tratamento.pdf
```

É o documento do Art. 37, escrito para o jurídico: identificação da
controladora, finalidades com as respectivas bases legais, categorias de dados,
compartilhamento, prazos, medidas de segurança, direitos do titular e os pontos
pendentes de decisão.

**É gerado, não escrito à mão.** Os prazos de retenção, a janela de expediente,
o contato do encarregado e o estado do expurgo saem **lidos da configuração
vigente** — então o papel não tem como discordar do sistema sobre um número. Um
registro de tratamento desatualizado é pior que nenhum: ele afirma, com
aparência de documento oficial, coisas que o sistema deixou de fazer.

O PDF fica fora do versionamento pelo mesmo motivo. Quem precisar, gera.

A prosa continua sendo escrita, e é ela que precisa de revisão jurídica.

## 7. Exposição

As sanções do Art. 52 vão de advertência a multa de até 2% do faturamento,
limitada a R$ 50 milhões por infração. A ANPD considera, na dosimetria, a boa-fé,
a cooperação e as medidas já adotadas (Art. 52, §1º).

Lendo o que existe hoje: **a plataforma está tecnicamente bem posicionada e
formalmente descoberta.** As medidas de segurança do Art. 46 estão acima da
média — várias delas nasceram de falhas encontradas e corrigidas neste projeto,
com registro do motivo. O que falta é quase todo documental: aviso, prazos,
encarregado, procedimentos.

Isso é uma boa posição para estar. O caro de corrigir — arquitetura, segurança,
minimização — já está feito. O que falta se resolve com texto e decisão.

---

## 8. Fontes

- Lei nº 13.709/2018 (LGPD), com as alterações da Lei nº 13.853/2019.
- Resolução CD/ANPD nº 2/2022 — regime do agente de tratamento de pequeno porte.
- CF/88, Art. 7º, XXIX — prescrição trabalhista, relevante para o prazo de
  retenção dos registros de treinamento.

Os artigos citados neste documento vêm do texto da lei. **A interpretação deles
para o caso concreto é atribuição de quem responde juridicamente pela empresa** —
este documento só organiza os fatos técnicos sobre os quais essa interpretação
vai se apoiar.
