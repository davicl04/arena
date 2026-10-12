import { Info } from "lucide-react";
import type { MatchDetail } from "@/api/matches";
import { MatchResultCard } from "@/components/results/MatchResultCard";

/*
 * Área do resultado da partida (R4 + S1), fixa no topo acima do cartão de condições. Depois do início da partida
 * (`detail.result`) renderiza o `MatchResultCard`: informar o placar, esperar o outro lado, divergência, confirmação,
 * sem resultado, W.O., presença e estatísticas. O cartão fica montado ao recarregar o detalhe (mantém o placar digitado
 * e os avisos). Os botões de W.O. (registrar, retirar, contestar) continuam no cartão de condições, sem repetição:
 * o cartão de resultado só mostra o estado do W.O.
 *
 * Antes do início só há uma linha discreta; sem nenhuma das duas coisas (proposta, cancelada), não renderiza nada.
 */
export function ResultArea({
  detail,
  viewerId,
  onChanged,
  onOpenChat,
  onExpired,
}: {
  detail: MatchDetail;
  /** Id de quem vê: a atuação própria nas estatísticas vem da lista do elenco, que a API não marca. */
  viewerId: number;
  /** O cartão mudou algo: com o detalhe novo (placar enviado) ou sem ele (presença, estatísticas), que a tela relê. */
  onChanged: (detail?: MatchDetail) => void;
  /** "Conversar", na divergência: leva ao campo do chat. */
  onOpenChat?: () => void;
  onExpired: () => void;
}) {
  if (detail.result)
    return (
      <div data-slot="result-area" className="mx-3 mt-2.5">
        <MatchResultCard match={detail} viewerId={viewerId} onChanged={onChanged} onOpenChat={onOpenChat} onExpired={onExpired} />
      </div>
    );
  // Antes do início, só uma linha discreta: o cartão do placar aparece depois do horário da partida.
  if (detail.state !== "agendada") return null;
  return (
    <p data-slot="result-area" className="mx-3 mt-2.5 mb-0 flex items-center gap-2 rounded-card bg-forest px-3 py-2.5 text-[11px] leading-snug text-white/80">
      <Info size={15} className="flex-none text-mint" aria-hidden="true" />
      <span>
        <b className="text-white">Placar.</b> Informe o placar depois do horário da partida.
      </span>
    </p>
  );
}
