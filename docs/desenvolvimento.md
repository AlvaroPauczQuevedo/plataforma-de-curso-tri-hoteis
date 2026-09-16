# Desenvolvimento

_Como o código está organizado e como se confere que ele funciona._

> Parte da documentação da **Academia Corporativa Tri Hotéis**. Índice em [../README.md](../README.md).

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
| `tests/conclusao-externa.test.ts` | Treinamento presencial: a regra pura, a fonte compartilhada, e a garantia de que Conformidade, Reciclagem e auditoria concordam sobre quem está regular. |
| `tests/whatsapp.test.ts` | Normalização do número (zero de operadora, DDI, formatação humana), faixa de DDD, e a garantia de que o lembrete não leva senha. |
| `tests/reciclagem.test.ts` | Quando o certificado vence: meses de calendário, virada de ano, e o 31 de janeiro que não pode ganhar dias num mês curto. |
| `tests/auditoria-pdf.test.ts` | O relatório sai como PDF válido e quebra em páginas — uma lista que perde a última pessoa da folha é pior que relatório nenhum. |
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
