import Link from "next/link";
import { Logo } from "@/components/ui/logo";

/**
 * Aviso de privacidade — Art. 9º da LGPD.
 *
 * O artigo dá ao titular direito a saber, de forma clara e acessível, a
 * finalidade, a forma, a duração, quem é o controlador e com quem os dados são
 * compartilhados. Até esta página existir, o funcionário recebia uma senha em
 * papel e entrava num sistema que registra o que ele faz, sem nada que o
 * informasse disso.
 *
 * ---
 *
 * **É AVISO, não termo de consentimento.** A diferença não é de palavra.
 *
 * O tratamento aqui se apoia em obrigação legal (as NRs mandam treinar) e na
 * execução do contrato de trabalho — Art. 7º, II e V. Não em consentimento.
 * Pedir "eu concordo" numa relação de emprego seria fingir uma escolha que não
 * existe, e pior: consentimento é revogável a qualquer tempo (Art. 8º, §5º),
 * então bastaria alguém revogá-lo para a empresa perder a prova de treinamento
 * que a lei a obriga a manter.
 *
 * Por isso a página **informa** e não pede assinatura. Onde o consentimento é
 * de fato a base — e-mail e telefone pessoais — ele já é colhido onde deve:
 * são campos opcionais, e o e-mail só vale depois da confirmação por link.
 *
 * ---
 *
 * **Pública, sem login.** Quem ainda não entrou precisa poder ler — e a página
 * é linkada da tela de login justamente por isso. Exigir sessão para saber
 * como os próprios dados são tratados inverteria o sentido do artigo.
 */
export const metadata = {
  title: "Aviso de privacidade",
};

/**
 * Canal do encarregado (Art. 41, §2º, I).
 *
 * Vem do ambiente porque o contato ainda vai ser definido pela empresa, e
 * escrevê-lo no código exigiria uma publicação para trocar um e-mail. Sem a
 * variável, a página aponta para o setor de treinamento em vez de mostrar um
 * espaço em branco — um canal genérico funcionando é melhor que um canal
 * específico inexistente.
 */
function canalDoEncarregado(): string | null {
  const contato = process.env.ENCARREGADO_CONTATO?.trim();
  return contato ? contato : null;
}

export default function PrivacidadePage() {
  const encarregado = canalDoEncarregado();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/" className="inline-block">
        <Logo className="h-9 w-auto" />
      </Link>

      <h1 className="mt-8 text-2xl font-semibold text-ink-900">Aviso de privacidade</h1>
      <p className="mt-2 text-sm text-ink-700/70">
        Como a Academia Corporativa trata os seus dados pessoais, conforme a Lei Geral de
        Proteção de Dados (Lei 13.709/2018).
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-ink-700">
        <Bloco titulo="Quem trata os seus dados">
          <p>
            A rede <strong className="text-ink-900">Tri Hotéis</strong> é a controladora:
            é ela quem decide quais dados são coletados nesta plataforma e para quê.
          </p>
        </Bloco>

        <Bloco titulo="O que coletamos">
          <p>Apenas o necessário para registrar o seu treinamento:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-ink-900">Identificação:</strong> nome, nome de
              usuário, cargo, departamento e hotel.
            </li>
            <li>
              <strong className="text-ink-900">Contato, se você quiser informar:</strong>{" "}
              e-mail pessoal e telefone. Os dois são <strong>opcionais</strong> — não
              informar não impede o seu acesso.
            </li>
            <li>
              <strong className="text-ink-900">Treinamento:</strong> cursos atribuídos,
              progresso, notas de prova, certificados e presenças.
            </li>
            <li>
              <strong className="text-ink-900">Uso da plataforma:</strong> data e hora das
              entradas, e o endereço de rede (IP) no momento de aceitar um documento ou
              marcar presença.
            </li>
          </ul>
          <p className="mt-3">
            <strong className="text-ink-900">Não coletamos</strong> CPF, RG, data de
            nascimento, dados de saúde, biometria, dados financeiros nem a sua
            localização.
          </p>
        </Bloco>

        <Bloco titulo="Por que tratamos, e com que base legal">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong className="text-ink-900">Treinamentos obrigatórios</strong> — porque
              a lei exige que a empresa capacite e comprove (Art. 7º, II da LGPD). Brigada
              de incêndio, manipulação de alimentos e as Normas Regulamentadoras entram
              aqui.
            </li>
            <li>
              <strong className="text-ink-900">Sua conta, progresso e certificados</strong>{" "}
              — para executar o contrato de trabalho (Art. 7º, V).
            </li>
            <li>
              <strong className="text-ink-900">Registros de acesso</strong> — para
              segurança da plataforma e para você mesma poder conferir o seu histórico.
            </li>
            <li>
              <strong className="text-ink-900">E-mail e telefone</strong> — com o seu
              consentimento (Art. 7º, I), que você pode retirar a qualquer momento
              apagando o campo em <em>Meu perfil</em>.
            </li>
          </ul>
        </Bloco>

        <Bloco titulo="Quem vê os seus dados">
          <p>
            O setor de treinamento e os administradores do seu departamento. Um
            administrador de um setor <strong>não</strong> alcança as contas de outro.
          </p>
          <p className="mt-2">
            Os dados <strong className="text-ink-900">não são vendidos</strong> nem
            compartilhados com terceiros para fins comerciais. Comprovantes de treinamento
            podem ser apresentados a auditorias e à fiscalização do trabalho — que é a
            razão de eles existirem.
          </p>
        </Bloco>

        <Bloco titulo="Por quanto tempo guardamos">
          <p>
            Registros de treinamento são mantidos enquanto forem necessários para
            comprovar o cumprimento das normas — inclusive depois de um desligamento,
            conforme a lei autoriza (Art. 16, I).
          </p>
          <p className="mt-2">
            Dados de uso têm prazo menor: tentativas de login são descartadas em{" "}
            <strong className="text-ink-900">24 horas</strong>, e o endereço de rede
            registrado em aceites e presenças é apagado do registro depois do prazo
            definido, preservando o aceite em si.
          </p>
        </Bloco>

        <Bloco titulo="Seus direitos">
          <p>O Art. 18 da LGPD garante a você, e esta plataforma atende:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-ink-900">Ver tudo que temos sobre você</strong> — em{" "}
              <Link href="/meus-dados" className="font-medium text-brand-texto hover:underline">
                Meus dados
              </Link>
              , sem precisar pedir a ninguém.
            </li>
            <li>
              <strong className="text-ink-900">Levar os seus dados</strong> — o botão
              naquela mesma tela exporta tudo em arquivo.
            </li>
            <li>
              <strong className="text-ink-900">Corrigir</strong> — nome, e-mail e telefone
              em <em>Meu perfil</em>; o resto, pelo setor de treinamento.
            </li>
            <li>
              <strong className="text-ink-900">Saber com quem compartilhamos</strong> —
              está descrito acima.
            </li>
          </ul>
          <p className="mt-3">
            Sobre <strong className="text-ink-900">apagar</strong>: registros de
            treinamento obrigatório não podem ser eliminados enquanto servirem de prova do
            cumprimento da norma — é o limite que o próprio Art. 16, I estabelece. Pedidos
            de exclusão são analisados, e a recusa, quando houver, é justificada a você.
          </p>
        </Bloco>

        <Bloco titulo="Como a plataforma protege">
          <ul className="list-disc space-y-1 pl-5">
            <li>Sua senha é guardada cifrada e de forma irreversível — ninguém a lê, nem os administradores.</li>
            <li>O acesso é bloqueado temporariamente após tentativas seguidas de senha errada.</li>
            <li>Arquivos e certificados só abrem para quem está autenticado.</li>
            <li>Toda ação administrativa sobre a sua conta fica registrada.</li>
          </ul>
        </Bloco>

        <Bloco titulo="Fale conosco">
          {encarregado ? (
            <p>
              Dúvidas ou pedidos sobre os seus dados:{" "}
              <strong className="text-ink-900">{encarregado}</strong>.
            </p>
          ) : (
            <p>
              Dúvidas ou pedidos sobre os seus dados: procure o{" "}
              <strong className="text-ink-900">setor de treinamento</strong> ou o seu
              gestor, que encaminham ao responsável.
            </p>
          )}
        </Bloco>
      </div>

      <p className="mt-10 border-t border-border pt-5 text-xs text-ink-700/50">
        Este aviso descreve o funcionamento atual da plataforma. Ele é revisto sempre que
        o tratamento mudar.
      </p>
    </div>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-semibold text-ink-900">{titulo}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}
