# Acesso e permissões

_Quem entra, como entra, e o que cada perfil alcança._

> Parte da documentação da **Academia Corporativa Tri Hotéis**. Índice em [../README.md](../README.md).

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

## Isca do console

> **Para auditoria e pentest: isto é proposital.** A credencial que aparece no
> console da tela de login é falsa e não dá acesso a nada.

Quem abre as ferramentas do navegador na tela de login encontra o que parece um
acesso de contingência esquecido:

```
[auth] acesso de contingência ainda habilitado — remover antes do go-live (chamado #4471)
[auth] fallback carregado: { usuario: "suporte.contingencia", senha: "Tri@Contingencia#2024", ... }
```

A conta não existe e não pode existir, porque o cadastro recusa esse nome. A
graça está no que acontece quando alguém tenta usá-la. Nenhum funcionário tem
motivo para digitar aquele usuário, que só aparece no console. Então quem tenta
entrar com ele estava procurando brecha, e a tentativa vira alarme:

- aparece em `/admin/erros` com o IP de origem, e vai por e-mail/webhook se o
  [monitoramento](operacao.md#monitoramento-opcional) estiver configurado;
- diz se a pessoa usou a senha falsa inteira ou só o nome. **A senha digitada
  nunca é gravada**;
- quem tentou recebe "usuário ou senha inválidos", exatamente como um usuário
  desconhecido qualquer, e no mesmo tempo. O login não espera o aviso sair.

O alarme tem teto de `ISCA_TETO_POR_HORA` avisos por hora (padrão 20), para quem
descobrir a isca não conseguir lotar o registro nem a caixa de quem recebe os
avisos. Acima do teto ele se cala. A tentativa continua registrada como toda
tentativa de login.

Sem `TRUST_PROXY=true` atrás de um proxy, o IP registrado sai vazio. É a mesma
regra da proteção do login.

Para desligar, basta tirar `<IscaDeConsole />` de
`src/components/auth/login-form.tsx`. O alarme fica inerte, porque ninguém mais
tem de onde tirar o nome.
