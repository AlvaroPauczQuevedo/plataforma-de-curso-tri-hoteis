# Academia Corporativa Tri Hotéis

Plataforma web de cursos e treinamentos corporativos, com dois ambientes:
**Portal do Funcionário** e **Painel Administrativo**. Interface totalmente em
português do Brasil.

## Documentação

O texto completo vive em [`docs/`](docs/). Ele passou de 1.600 linhas num
arquivo só, e um arquivo desse tamanho não é lido: é pesquisado com Ctrl+F por
quem já sabe o que procura, e ignorado por quem não sabe. A divisão é por
**pergunta de quem lê** — quem publica não precisa do mesmo texto que quem
desenvolve.

| Documento | Responde |
| --- | --- |
| [Operação](docs/operacao.md) | Como subir, publicar e configurar. O que se lê no dia da virada e quando algo para. |
| [Acesso e permissões](docs/acesso.md) | Quem entra, como entra, e o que cada perfil alcança. |
| [Modelo de login](docs/modelo-de-login.md) | As decisões de autenticação e criação de usuários, escritas para serem reimplementadas em outro sistema. |
| [Treinamento](docs/treinamento.md) | Cursos, trilhas, documentos com aceite, presencial e reciclagem. |
| [Conformidade e relatórios](docs/conformidade.md) | Quem deve o quê, e os papéis que a auditoria pede. |
| [Desenvolvimento](docs/desenvolvimento.md) | Como o código está organizado e como se confere que ele funciona. |

## Começando

```bash
npm install
npm run dev
```

O passo a passo completo — variáveis de ambiente, banco, primeiro
administrador — está em [Operação](docs/operacao.md).

## O que é

Plataforma de treinamento da rede Tri Hotéis: 25 casas, sem e-mail
corporativo, sem terminal na hospedagem. Cada decisão do projeto sai de alguma
dessas três restrições, e elas estão explicadas onde aparecem — os comentários
do código dizem **por que**, não o que.
