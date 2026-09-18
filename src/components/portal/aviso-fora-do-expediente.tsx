import { Clock } from "lucide-react";
import { descreverJanela, foraDoExpediente } from "@/lib/horario-de-trabalho";

/**
 * Aviso para quem abre treinamento OBRIGATÓRIO fora do horário de trabalho.
 *
 * Treinamento obrigatório é tempo à disposição do empregador. Se a pessoa o faz
 * às 23h de um domingo, a plataforma registra isso com precisão de segundos — e
 * esse registro é da própria empresa.
 *
 * O aviso existe para **não gerar** o registro, em vez de ter que lidar com ele
 * depois. É a intervenção mais barata possível: uma frase no momento em que a
 * decisão está sendo tomada.
 *
 * ---
 *
 * **Avisa, não bloqueia.** Num hotel tem gente trabalhando às três da manhã,
 * legitimamente — a recepção da madrugada que estuda no horário dela está
 * dentro do próprio expediente. Bloquear impediria justamente quem tem razão
 * para estar ali, e a plataforma não conhece a escala de ninguém.
 *
 * Só aparece em curso **obrigatório**. Curso opcional feito em casa, por
 * vontade própria, não é tempo à disposição — avisar ali seria atrapalhar quem
 * está estudando porque quis.
 */
export function AvisoForaDoExpediente({
  obrigatorio,
  agora = new Date(),
}: {
  obrigatorio: boolean;
  agora?: Date;
}) {
  if (!obrigatorio || !foraDoExpediente(agora)) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-warning-600/30 bg-warning-100/40 p-4">
      <Clock className="mt-0.5 h-5 w-5 shrink-0 text-warning-600" />
      <div className="text-sm text-ink-800">
        <p className="font-medium text-ink-900">
          Este é um treinamento obrigatório, e você está fora do horário de trabalho.
        </p>
        <p className="mt-1">
          O horário previsto é {descreverJanela()}. Treinamento obrigatório deve ser
          feito durante a sua jornada — se você está em turno agora, siga normalmente.
        </p>
        <p className="mt-1 text-ink-700/70">
          Na dúvida, fale com o seu gestor antes de continuar.
        </p>
      </div>
    </div>
  );
}
