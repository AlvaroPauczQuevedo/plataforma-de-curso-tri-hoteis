# Modelo de login e criação de usuários

_Documento de referência para reimplementar este modelo em outro sistema._

Descreve as decisões de autenticação da Academia Corporativa Tri Hotéis: o que
foi decidido, **por que**, e o que quebra quando a decisão não é tomada. A
implementação de referência é Next.js 16 + NextAuth 4 + Prisma + SQLite, mas
quase tudo aqui é independente de framework — onde não for, está marcado.

Vários itens existem porque a versão ingênua **já falhou** neste projeto. Esses
casos estão descritos com o sintoma real, não com a teoria.

---

## 1. A restrição que origina o modelo

Antes de copiar qualquer coisa, entenda de onde ela vem: **ninguém nesta rede
tem e-mail corporativo.** São 25 hotéis, com camareiras, recepcionistas e
cozinheiros que não têm caixa de entrada da empresa.

Isso elimina o padrão mais comum de autenticação:

| Padrão usual | Por que não serve aqui |
| --- | --- |
| Login por e-mail | Não existe endereço para usar como identificador |
| "Esqueci minha senha" por e-mail | Não há para onde mandar o link |
| Convite por e-mail | A pessoa nunca recebe |
| Autocadastro | Não há como validar que o cadastro é legítimo |

**Se o seu sistema tem e-mail corporativo para todo mundo, boa parte deste
modelo é mais complexa do que você precisa.** Use o e-mail. O que vale copiar
mesmo assim está na seção 9.

O que sobrou: **quem cadastra escolhe o identificador**, e a senha inicial é
entregue em papel, uma vez.

---

## 2. Identificador de acesso

Sem e-mail e sem matrícula, não havia identificador anterior para reaproveitar.
O nome de usuário é escolhido por quem cadastra e passa a ser a identidade da
pessoa no sistema.

Como é digitado por gente, **o formato precisa ser imposto por código**. Sem
isso é questão de tempo até alguém gravar `Maria Silva`, com espaço e
maiúscula, e ninguém mais acertar aquele login: quem digita não sabe se o
espaço existe, se o M é maiúsculo, se o acento entra.

### Duas funções, separadas de propósito

```ts
// Indulgente: conserta o que dá para consertar.
normalizarNomeDeUsuario("  José Antônio  ")  // → "jose.antonio"

// Rigorosa: decide se grava.
motivoDeNomeInvalido("jose.antonio")         // → null (serve)
motivoDeNomeInvalido("jo")                   // → "precisa de ao menos 3 caracteres"
```

Juntá-las faria a validação aprovar coisas que ela mesma consertou, e o valor
gravado deixaria de ser previsível a partir do que foi digitado.

A normalização: `NFD` → remove diacríticos → minúsculas → espaços viram ponto →
descarta o que não é `[a-z0-9._-]` → colapsa pontos repetidos → apara
separadores das pontas.

A validação recusa: menos de 3 ou mais de 32 caracteres, começo que não é letra,
caractere fora do conjunto, terminar em separador, dois separadores seguidos.

### O detalhe que evita chamados

**A mesma normalização roda no login**, sobre o que foi digitado:

```ts
const username = normalizarNomeDeUsuario(credentials.username);
```

Sem isso, quem cadastrou `maria.silva` e digita `Maria Silva` no celular — que
sugere maiúscula na primeira letra sozinho — recebe "usuário ou senha
inválidos" tendo acertado os dois. Normalizar a entrada alarga o que o login
**aceita** sem alargar o que ele **encontra**.

### Sugestão automática

A partir do nome completo, para o formulário preencher sozinho: primeiro nome +
último sobrenome, descartando conectivos (`de`, `da`, `do`, `das`, `dos`, `e`).
"Maria de Souza dos Santos" vira `maria.santos`, não
`maria.de.souza.dos.santos` — que é longo demais para alguém ditar no balcão.

É **sugestão**: quem cadastra edita antes de salvar, porque só ele sabe quais
dois "João Silva" são pessoas diferentes.

---

## 3. Criação de usuários

Não há autocadastro. Três caminhos, todos partindo de um administrador:

| Caminho | Quando |
| --- | --- |
| Formulário individual | Uma contratação |
| Lote (uma pessoa por linha) | A lista de um hotel inteiro |
| Sincronização com sistema externo | Quando existe um cadastro anterior |

### A senha inicial é gerada pelo sistema, nunca escolhida

```ts
export function senhaProvisoria(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem O/0, I/1/L
  let saida = "";
  for (let i = 0; i < 8; i += 1) saida += alfabeto[randomInt(alfabeto.length)];
  return `Tri-${saida}`;
}
```

Três decisões dentro dessas cinco linhas:

- **`randomInt` do `node:crypto`, não `Math.random()`.** A sequência do
  `Math.random` é previsível a partir de alguns valores observados — quem
  recebesse duas senhas conseguiria estimar as seguintes.
- **Alfabeto sem caracteres ambíguos.** A senha é ditada por telefone e lida de
  um papel. `O`/`0` e `I`/`1`/`l` são o mesmo desenho numa impressão ruim.
- **Uma função só, num módulo só.** Ela já existiu em duas versões: esta, e um
  `randomUUID().slice(0, 10)` no cadastro individual. A segunda rendia ~36 bits
  e trazia um hífen no meio, exatamente onde quem lê em voz alta erra. **Não é
  aceitável que a força de uma senha dependa de qual tela a gerou.**

A senha em texto existe **uma única vez**: na tela, logo após o cadastro. Não é
gravada em lugar nenhum. Fechou a tela, só redefinindo.

A conta nasce com `mustChangePassword: true` — senha gerada por outra pessoa
vale até o primeiro acesso.

### O cadastro em lote é tudo ou nada

Se qualquer linha tiver problema, **nada** é gravado e a lista volta inteira
marcada. Gravar as boas e reclamar do resto deixaria quem cadastra com uma
lista pela metade para reconciliar à mão — pior do que corrigir duas linhas e
colar de novo.

Homônimos são desempatados acrescentando o nome do meio (`joao.pereira.silva`),
não um número (`joao.silva2`). O primeiro o dono reconhece; o segundo não diz
nada a ninguém e some da memória no dia seguinte. Quando nem o nome do meio
resolve, a linha volta marcada em vez de receber sufixo — duas pessoas com nome
inteiro idêntico precisam de olho humano.

---

## 4. Senha

- **bcrypt, custo 10**, via `bcryptjs`.
- **Mínimo de 8 caracteres** para senha escolhida por gente, definido numa
  constante única (`SENHA_MINIMA`) importada por servidor e telas.

Sobre a constante: o valor era 6 e estava escrito em **nove lugares** — três
validações de servidor e seis nas telas, entre `minLength` e texto de ajuda.
Duas cópias da mesma regra acabam discordando, e aqui a discordância teria um
jeito certo de aparecer: mudar só o servidor faria a tela aceitar sete
caracteres para o servidor recusar logo depois.

Por que 8: o bloqueio por tentativas segura quem adivinha pela tela de login,
mas não segura quem tem uma **cópia do banco** — e rotinas de backup geram
cópias, que circulam com menos cuidado que o arquivo em produção. Com bcrypt,
6 caracteres caem numa busca exaustiva que 8 torna muito mais cara.

O mínimo vale só para senha **nova**: quem já tem uma curta continua entrando e
passa a precisar de 8 quando trocar. Ninguém fica trancado do lado de fora.

O módulo da regra **não importa nada**, de propósito: as telas de senha são
componentes de cliente, e qualquer dependência de servidor iria parar no pacote
do navegador.

---

## 5. Login

Ordem das operações no `authorize`, e ela importa:

```
1. normaliza o identificador
2. resolve o IP de origem
3. barreiras de tentativa      ← antes de qualquer comparação de senha
4. busca a conta
5a. não existe  → bcrypt contra hash-isca → registra falha → erro genérico
5b. inativa     → mensagem específica
5c. existe      → bcrypt real → acerto ou falha
6. registra sucesso, atualiza lastLoginAt, grava log de acesso
```

### Duas barreiras independentes, porque são problemas diferentes

| Barreira | Contra o quê | Padrão |
| --- | --- | --- |
| **Por conta** | Insistir numa conta específica, tipicamente a de um administrador | 5 erros → 15 min de bloqueio |
| **Por origem (IP)** | Varrer muitas contas com poucas tentativas em cada | 30 falhas / 5 min |

Só a primeira deixaria passar quem tenta duas senhas em duzentas contas. Só a
segunda deixaria passar quem martela uma conta de um IP novo a cada tentativa.

**O contador zera em duas situações:** no acerto, e quando o bloqueio vence.
A segunda é fácil de esquecer e o sintoma é silencioso — o contador ficava no
limite depois dos 15 minutos, então o primeiro erro seguinte já era o sexto e
travava a conta na hora. Quem esqueceu a senha de verdade ficava com **uma
tentativa a cada quinze minutos, para sempre**, sem nada na tela explicando.
Cumprido o bloqueio, o ciclo recomeça inteiro — que é o que "tente novamente em
quinze minutos" promete a quem lê.

### `x-forwarded-for` só com `TRUST_PROXY` ligado

O cabeçalho é escrito pelo cliente. Sem um proxy de verdade na frente, qualquer
um o forja e escolhe o próprio balde de limite, tornando a barreira por origem
inútil. Com proxy na frente e a variável desligada, o oposto: todo mundo divide
o IP do proxy e um atacante gasta a cota da rede inteira.

**É uma variável de ambiente que precisa casar com a topologia real.** Errar
para qualquer um dos lados desliga a proteção.

### Tempo de resposta: a defesa menos óbvia

O login usa mensagem genérica — "Nome de usuário ou senha inválidos" — para não
revelar quais contas existem. **Isso não basta**, e este projeto descobriu na
prática:

> O login só rodava o bcrypt quando encontrava a conta. Para um usuário
> inexistente, respondia sem comparar hash nenhum. Medido contra o servidor no
> ar: **~95 ms** para conta existente, **~22 ms** para inexistente. Bastava
> cronometrar para enumerar os nomes de usuário sem acertar senha alguma.

A correção é fazer o caminho "não existe" gastar o **mesmo trabalho**:

```ts
if (!user) {
  await compararComHashIsca(credentials.password); // resultado ignorado
  await registrarFalha(username, ip);
  throw new Error("Nome de usuário ou senha inválidos.");
}
```

O hash-isca é calculado uma vez, sob demanda, no mesmo custo 10. Não fica no
topo do módulo porque o arquivo é importado até pelo processo de build, e um
hash no carregamento gastaria ~90 ms em cada avaliação.

**Se você copiar uma coisa só deste documento, copie esta.** Mensagem genérica
com tempo revelador é uma proteção que não protege.

---

## 6. Sessão: as duas checagens

Este é o ponto onde a maioria das implementações erra, e onde este projeto teve
sua falha mais séria.

| Camada | Lê de onde | Serve para |
| --- | --- | --- |
| **Middleware / proxy** | Só o cookie | Redirecionar cedo. **Não protege nada.** |
| **Acesso a dados** | Banco, a cada requisição | Proteger de verdade |

O middleware roda em toda rota, inclusive nas pré-carregadas, e não deve ir ao
banco. Ele é a checagem **otimista**.

### A falha

A sessão é um JWT de 8 horas que carrega o papel da pessoa no momento do login.
Só que o papel muda: rebaixar um administrador a funcionário é uma operação
normal. Quem conferia o papel pelo token — `requireAdmin`, e através dele
**toda tela e toda server action do painel** — deixava o rebaixado cadastrando
e excluindo gente, redefinindo senha e apagando curso por até 8 horas.

A desativação já era relida a cada requisição; o papel, não. A assimetria não
tinha motivo. Pior: o caso realista de rebaixamento é justamente o de quem
**continua na empresa e com a sessão aberta**.

### A correção, na raiz

```ts
export async function revalidarConta<T extends { id: string; role: Papel }>(
  usuario: T
): Promise<T | null> {
  const conta = await db.user.findUnique({
    where: { id: usuario.id },
    select: { active: true, role: true },
  });

  if (!conta?.active) return null;
  return { ...usuario, role: conta.role };   // o papel do BANCO
}
```

Custo zero: a linha do usuário já era lida para conferir `active`, e a mesma
consulta traz o papel junto.

O resto do token — nome, avatar — segue como veio: é exibição, e errar nele por
algumas horas não abre porta nenhuma. **Papel e situação são as duas coisas que
decidem acesso, e são as duas que saem do banco.**

Havia PDFs que já reliam o papel por conta própria. Alguém tinha notado o
problema e corrigido **nas pontas**. A correção precisa ficar na raiz — na
função que todas as telas chamam —, senão a próxima tela nasce furada.

> **Copiando para outro sistema:** o efeito colateral aceitável é que quem
> acabou de ser **promovido** ainda é barrado pelo middleware (cookie antigo)
> até entrar de novo. O inverso — o rebaixado passar — é barrado pela camada de
> dados. Erre sempre para o lado restritivo.

---

## 7. Recuperação de senha

Sem e-mail corporativo, o caminho principal é **humano**: o administrador
redefine e entrega a nova senha provisória. O e-mail é opcional e serve a quem
tem endereço pessoal.

### O e-mail só vale depois de confirmado

O endereço fica numa tabela separada (`EmailConfirmacao`) até o clique no link.
Só então vai para `User.email`.

É a diferença entre "a pessoa digitou um endereço" e "a pessoa **provou** que lê
aquela caixa" — e só a segunda pode valer como recuperação de senha. Sem a
separação, um dígito errado (`gmial.com`) entrega a recuperação da conta a quem
controla o domínio parecido.

Consequência: `User.email` **nunca** contém endereço por confirmar. Ele está
vazio ou conferido.

### O banco guarda o digest, não o token

```ts
export function digestDoToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function novoTokenDeRedefinicao(): { token: string; digest: string } {
  const token = randomUUID();
  return { token, digest: digestDoToken(token) };  // os dois saem juntos
}
```

Antes o token ia para o banco em texto puro. Quem tivesse uma cópia do banco —
e as rotinas de backup geram cópias — podia abrir `/redefinir-senha/<token>` de
qualquer pedido ainda válido e assumir a conta. **O hash da senha não permite
isso; o token em claro permitia.**

SHA-256 e não bcrypt: a senha é escolhida por gente e é adivinhável, então
precisa de hash lento. O token tem 122 bits sorteados, não há o que adivinhar, e
o hash rápido é o que permite buscar pelo digest com índice único.

As duas metades saem juntas da mesma função para nenhum chamador gravar a
errada.

### Resposta sempre idêntica

Pedir redefinição devolve a mesma mensagem existindo a conta ou não, e também
quando o teto de pedidos estoura. Qualquer diferença vira enumeração de contas.

---

## 8. Redirecionamento depois do login

O `callbackUrl` chega pela query (`/login?callbackUrl=...`) e ia direto para o
`router.push`. Um link como `/login?callbackUrl=https://site-falso` fazia a
pessoa **autenticar no site verdadeiro** e, em seguida, ser jogada no site do
atacante, que imita um "sua sessão expirou, entre de novo" e colhe a senha.

```ts
export function destinoSeguro(callbackUrl: string | undefined, padrao: string): string {
  if (!callbackUrl) return padrao;
  if (!/^\/(?![/\\])/.test(callbackUrl)) return padrao;
  return callbackUrl;
}
```

Uma barra, seguida de algo que não seja outra barra nem contrabarra. Barra:

| Entrada | Por que é perigosa |
| --- | --- |
| `https://mau.example` | Tem esquema |
| `//mau.example` | Protocol-relative: o navegador completa o esquema |
| `/\mau.example` | Alguns navegadores tratam `\` como `/` |
| `javascript:...` | Não começa com `/` |

Função pura, sem import: roda no componente de cliente do login.

---

## 9. O que copiar mesmo com e-mail corporativo

Se o seu sistema tem e-mail para todo mundo, ignore as seções 2 e 3 e leve
estas, que independem do identificador:

1. **Tempo de resposta constante no login** (seção 5) — a falha mais fácil de
   deixar passar e a mais fácil de explorar.
2. **Reler papel e situação do banco a cada requisição** (seção 6), na raiz e
   não nas pontas.
3. **Token de redefinição guardado como digest** (seção 7).
4. **Duas barreiras de tentativa**, por conta e por origem, com o contador
   zerando quando o bloqueio vence (seção 5).
5. **Validação de destino do redirecionamento** (seção 8).
6. **Uma constante única para a regra de senha**, importada por servidor e
   telas (seção 4).
7. **`randomInt` do `crypto`, nunca `Math.random()`**, para qualquer credencial.

---

## 10. Tabelas

O essencial, em Prisma. Adapte os tipos ao seu banco.

```prisma
model User {
  id           String   @id @default(cuid())
  name         String
  username     String   @unique          // identificador de acesso
  email        String?  @unique          // opcional, e só depois de confirmado
  passwordHash String
  role         Role     @default(EMPLOYEE)
  active       Boolean  @default(true)
  mustChangePassword Boolean @default(false)
  lastLoginAt  DateTime?

  failedAttempts Int      @default(0)
  lockedUntil    DateTime?               // enquanto no futuro, recusa o login

  createdAt    DateTime @default(now())

  @@index([role, active])
}

/// Tentativas, para a barreira por origem. Guarda o que foi DIGITADO,
/// não a conta encontrada: metade da razão de existir é registrar
/// tentativa contra conta inexistente.
model LoginAttempt {
  id            String   @id @default(cuid())
  identificador String
  ip            String   @default("")
  success       Boolean  @default(false)
  createdAt     DateTime @default(now())

  @@index([identificador, createdAt])
  @@index([ip, createdAt])
}

model PasswordResetToken {
  id        String    @id @default(cuid())
  userId    String
  token     String    @unique             // o DIGEST, não o token
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())
}

/// Endereço aguardando confirmação. Só migra para User.email no clique.
model EmailConfirmacao {
  id        String    @id @default(cuid())
  userId    String
  email     String
  token     String    @unique
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}
```

Guarde `identificador` e não `userId` em `LoginAttempt`: a tentativa contra uma
conta que não existe é justamente a que você quer contar, e nesse caso não há
conta a que se referir.

---

## 11. Variáveis de ambiente

| Variável | Padrão | Observação |
| --- | --- | --- |
| `MAX_FAILED_ATTEMPTS` | 5 | Erros até travar a conta |
| `LOCKOUT_MINUTES` | 15 | Duração do bloqueio |
| `LOGIN_IP_LIMIT` | 30 | Falhas por origem na janela |
| `LOGIN_IP_WINDOW_MINUTES` | 5 | Tamanho da janela |
| `TRUST_PROXY` | `false` | **Ligue somente se houver proxy real na frente** |
| `NEXTAUTH_SECRET` | — | Obrigatória; assina o JWT |

---

## 12. Erros que este projeto cometeu

Se for reimplementar, é aqui que o tempo se economiza.

| Erro | Como apareceu | Correção |
| --- | --- | --- |
| Papel lido do token | Administrador rebaixado seguia com o painel por 8h | Reler do banco na raiz |
| Sem bcrypt no caminho "conta não existe" | 95 ms × 22 ms enumeravam os logins | Comparar contra hash-isca |
| Token de redefinição em claro no banco | Cópia de backup permitia assumir contas | Guardar o digest SHA-256 |
| `callbackUrl` sem validação | Redirecionamento aberto para phishing | Só caminho interno |
| Contador não zerava ao vencer o bloqueio | Uma tentativa a cada 15 min, para sempre | Zerar também na expiração |
| Regra de senha em nove lugares | Tela e servidor discordariam | Constante única |
| Dois geradores de senha provisória | Um deles com ~36 bits | Função única |
| Correções feitas nas pontas | PDFs reliam o papel; as telas, não | Corrigir na função raiz |

---

## 13. Como conferir que está certo

Os testes que valem a pena escrever, porque cobrem regra e não framework:

- **Normalização e validação do identificador** — tabela de casos, sem banco.
- **Liberação por tentativas** — contador, bloqueio, e o zerar na expiração.
- **`destinoSeguro`** — a tabela de entradas perigosas da seção 8.
- **Regra de senha** — limites e mensagens.

E uma medição que teste de unidade não pega: **cronometre o login** contra
conta existente e inexistente, com o servidor no ar, e confirme que os tempos
são indistinguíveis. Foi assim que a falha da seção 5 apareceu, e é assim que
se confirma que ela não voltou.

Limpe `LoginAttempt` e zere os contadores antes de medir — o bloqueio por
tentativas dispara antes do bcrypt e inverte o resultado, dando a impressão de
que contas existentes respondem **mais rápido**.
