import { useCallback, useRef, useState } from "react";
import { ArrowLeft, Hourglass, ShieldQuestion } from "lucide-react";
import { ApiError } from "../api/client";
import {
  acceptTerms,
  cancelMatch,
  contestWalkover,
  getMatch,
  proposeTerms,
  registerWalkover,
  removeGuest,
  setBooking,
  updateSlots,
  withdrawWalkover,
} from "../api/matches";
import type { MatchDetail, MatchMessageOut, MatchSlotOut, OpenSlots, TermsInput } from "../api/matches";
import { ConditionsCard } from "../components/match/ConditionsCard";
import { MatchChat } from "../components/match/MatchChat";
import { MatchHeader } from "../components/match/MatchHeader";
import { ConfirmSheet, ReasonSheet } from "../components/match/MatchSheets";
import { ResultArea } from "../components/match/ResultArea";
import { SlotsSheet } from "../components/match/SlotsSheet";
import { TermsSheet } from "../components/match/TermsSheet";
import ReportForm from "../components/ReportForm";
import { nameOf, orderedSides, sideName } from "../data/match";
import { useResource } from "../hooks/useResource";
import { useMatchDeadlines } from "../hooks/useMatchDeadlines";
import { useSubmit } from "../hooks/useSubmit";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Glass } from "@/components/ui/glass";
import { glassMessageVariants } from "@/components/ui/glass-variants";
import { LoadError } from "@/components/ui/load-error";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { formatDeadline } from "@/utils/format";

type SheetKind = "terms" | "cancel" | "wo" | "wo-withdraw" | "wo-contest" | "slots";

/** Barra mínima (voltar) das telas sem a partida: carregando, erro e partida inexistente. */
function BareTop({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-none items-center bg-forest py-2 pl-1 text-white">
      <IconButton tone="glass" aria-label="Voltar" onClick={onBack}>
        <ArrowLeft size={21} aria-hidden="true" />
      </IconButton>
      <h1 className="font-sans text-[13px] font-bold text-white">Partida</h1>
    </div>
  );
}

/**
 * Tela da partida (P2 + C1): cabeçalho com os brasões, o cartão de condições fixo e recolhível, o cartão de resultado
 * (ponto de encaixe `ResultArea`) e o chat dos dois elencos. Tudo o que a pessoa pode fazer vem de
 * `detail.permissions`; as folhas (propor condições, cancelar, W.O., vagas) abrem sobre a tela e mostram os erros do
 * servidor sem fechar. A tela relê o detalhe quando chega um evento novo no chat (aceite do outro lado, cancelamento…).
 */
export default function MatchPage({ matchId, viewerId, onBack, onSchedule, onDecide, onExpired }: {
  matchId: number;
  /** Quem vê (a sessão): o cartão de resultado reconhece a própria linha do elenco. */
  viewerId: number;
  onBack: () => void;
  /** Partida de campeonato, organizador: "Agendar" abre a lista de partidas do evento com a folha desta partida. */
  onSchedule?: (eventId: number) => void;
  /** Partida de campeonato, organizador: "Decidir resultado" abre a decisão (D3). */
  onDecide?: () => void;
  onExpired: () => void;
}) {
  const [missing, setMissing] = useState(false);
  const load = useCallback(async () => {
    try {
      const detail = await getMatch(matchId);
      setMissing(false);
      return detail;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 404) setMissing(true);
      throw cause;
    }
  }, [matchId]);
  const match = useResource(load, onExpired, { fallback: "Não foi possível carregar a partida." });
  const detail = match.data;
  const action = useSubmit(onExpired);
  const { setError } = action;
  const [sheet, setSheet] = useState<SheetKind | null>(null);
  const [reporting, setReporting] = useState<MatchMessageOut | null>(null);
  const setDetail = match.setData;
  const root = useRef<HTMLDivElement>(null);

  /** Relê o detalhe sem esconder a tela (a próxima leitura corrige uma falha). */
  const refresh = useCallback(async () => {
    try {
      setDetail(await getMatch(matchId));
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onExpired();
      return false;
    }
  }, [matchId, onExpired, setDetail]);
  useMatchDeadlines(detail, refresh);

  /** "Conversar" no cartão de resultado: leva o foco ao campo do chat (ou, fechado, às mensagens) e o deixa à vista. */
  function focusChat() {
    const target =
      root.current?.querySelector<HTMLElement>('[data-slot="chat-composer"] textarea') ?? root.current?.querySelector<HTMLElement>('[role="log"]');
    target?.focus();
    target?.scrollIntoView?.({ block: "nearest" });
  }

  function open(kind: SheetKind) {
    setError("");
    setSheet(kind);
  }
  function close() {
    setError("");
    setSheet(null);
  }
  /** Executa uma ação que devolve o detalhe novo; a folha só fecha se der certo. */
  async function apply(run: () => Promise<MatchDetail>, success: string | ((next: MatchDetail) => string), fallback: string) {
    const next = await action.run(run, fallback);
    if (!next) return false;
    setDetail(next);
    setSheet(null);
    toast.success(typeof success === "function" ? success(next) : success);
    return true;
  }
  /** Ação sem corpo na resposta (`204`): lê o detalhe de novo. */
  async function applyThenReload(run: () => Promise<void>, success: string, fallback: string) {
    const done = await action.run(async () => {
      await run();
      return await getMatch(matchId);
    }, fallback);
    if (!done) return false;
    setDetail(done);
    setSheet(null);
    toast.success(success);
    return true;
  }

  if (match.loading)
    return (
      <div className="flex h-full flex-col">
        <BareTop onBack={onBack} />
        <p role="status" className="m-0 px-5 py-6 text-center text-[12px] text-ink-muted">
          Carregando partida…
        </p>
      </div>
    );
  if (!detail)
    return (
      <div className="flex h-full flex-col">
        <BareTop onBack={onBack} />
        {missing ? (
          <EmptyState
            Icon={ShieldQuestion}
            title="Partida não encontrada"
            text="Ela não existe ou você não participa dela."
            action={
              <Button variant="secondary" className="mt-4" onClick={onBack}>
                Voltar
              </Button>
            }
          />
        ) : (
          <div className="px-5">
            <LoadError size="screen" title="Não foi possível carregar a partida" text={match.error} cause={match.errorCause} onRetry={match.reload} />
          </div>
        )}
      </div>
    );

  const current: MatchDetail = detail;
  const sides = orderedSides(current);
  const opponent = sides.find((side) => side.side !== current.my_side) ?? sides[1];
  const tennis = current.sport === "tenis";
  const arranging = ["combinando", "agendada", "realizada", "encerrada", "sem_resultado", "cancelada"].includes(current.state);
  const wo = current.walkover;
  const eventId = current.event?.id;

  return (
    <div ref={root} className="flex h-full min-h-0 flex-col" data-match={current.id}>
      <MatchHeader detail={current} onBack={onBack} />
      {!arranging ? (
        <div className="grid flex-1 content-start gap-3 overflow-y-auto px-5 pt-4">
          <div role="note" className="flex gap-2.5 rounded-card bg-white p-3.5 shadow-card">
            <Hourglass size={20} className="mt-px flex-none text-brand" aria-hidden="true" />
            <p className="m-0 min-w-0 flex-1 text-[12px] leading-normal text-ink">
              <b className="block text-[13px]">
                {current.state === "proposta" ? "Proposta aguardando resposta" : current.state === "recusada" ? "Proposta recusada" : "Proposta expirada"}
              </b>
              {current.state === "proposta"
                ? "O chat e as condições abrem quando os dois lados aceitam. Responda pela placa do Jogar."
                : "Esta partida não aconteceu. Os times podem buscar de novo pela placa do Jogar."}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div
            data-slot="match-pinned"
            // Com o cartão de resultado (partida iniciada) o topo ganha mais altura; rola por dentro, com a borda marcando o limite.
            className={cn("flex-none overflow-y-auto overscroll-contain border-b border-solid border-line pb-2", current.result ? "max-h-[62%]" : "max-h-[55%]")}
          >
            <ResultArea
              detail={current}
              viewerId={viewerId}
              onChanged={(next) => (next ? setDetail(next) : void refresh())}
              onOpenChat={focusChat}
              onExpired={onExpired}
            />
            {/* Nova proposta ou mudança de estado: o cartão volta ao aberto/fechado padrão para o que mudou ser notado. */}
            <ConditionsCard
              key={`${current.state}-${current.terms.pending?.id ?? 0}`}
              detail={current}
              busy={action.busy}
              error={sheet === null ? action.error : ""}
              onPropose={() => open("terms")}
              onSchedule={eventId !== undefined && onSchedule ? () => onSchedule(eventId) : undefined}
              onDecide={onDecide}
              onAccept={(terms) =>
                void apply(
                  () => acceptTerms(current.id, terms.id),
                  (next) => (next.state === "agendada" && current.state !== "agendada" ? "Partida agendada. As condições estão valendo." : "Condições aceitas."),
                  "Não foi possível aceitar as condições.",
                )
              }
              onBooking={(confirmed) =>
                void apply(() => setBooking(current.id, confirmed), confirmed ? "Reserva confirmada." : "Reserva marcada como a confirmar.", "Não foi possível atualizar a reserva.")
              }
              onSlots={() => open("slots")}
              onCancel={() => open("cancel")}
              onRegisterWalkover={() => open("wo")}
              onWithdrawWalkover={() => open("wo-withdraw")}
              onContestWalkover={() => open("wo-contest")}
            />
          </div>
          <MatchChat detail={current} onExpired={onExpired} onReport={setReporting} onPropose={() => open("terms")} onEvent={() => void refresh()} />
        </>
      )}

      {sheet === "terms" && (
        <TermsSheet
          detail={current}
          busy={action.busy}
          error={action.error}
          onClose={close}
          onExpired={onExpired}
          onSubmit={(input: TermsInput) =>
            void apply(() => proposeTerms(current.id, input), `Proposta enviada. ${nameOf(current, opponent?.side)} precisa aceitar.`, "Não foi possível enviar a proposta.")
          }
        />
      )}
      {sheet === "cancel" && (
        <ReasonSheet
          title="Cancelar partida"
          description={sides.map((side) => sideName(side)).join(" × ")}
          intro={
            <>
              {current.state === "agendada"
                ? "Os dois elencos e os avulsos escalados são avisados. A partida não pontua e os times podem voltar a buscar."
                : "A partida combinada é encerrada e os dois lados são avisados. Os times podem voltar a buscar."}
              {current.cancel_until && current.state === "agendada" && ` Dá para cancelar até ${formatDeadline(current.cancel_until)}.`}
            </>
          }
          label="Motivo (opcional)"
          placeholder="Ex.: a quadra não está disponível nesse horário."
          min={0}
          max={300}
          confirmLabel="Confirmar cancelamento"
          busyLabel="Cancelando…"
          busy={action.busy}
          error={action.error}
          onClose={close}
          onSubmit={(reason) => void apply(() => cancelMatch(current.id, reason), "Partida cancelada. Os dois lados foram avisados.", "Não foi possível cancelar a partida.")}
        />
      )}
      {sheet === "wo" && (
        <ConfirmSheet
          title="Registrar W.O."
          description={sides.map((side) => sideName(side)).join(" × ")}
          confirmLabel="Registrar W.O."
          busyLabel="Registrando…"
          busy={action.busy}
          error={action.error}
          onClose={close}
          onConfirm={() => void apply(() => registerWalkover(current.id), "W.O. registrado. O outro lado pode contestar até o fim do prazo.", "Não foi possível registrar o W.O.")}
        >
          <p className="m-0">
            Registre só se <b>{sideName(opponent)}</b> não compareceu. A vitória vale <b>{tennis ? "6-0 6-0" : "3 × 0"}</b> para o seu lado.
          </p>
          <p className="m-0 text-ink-muted">
            {sideName(opponent)} pode contestar até {formatDeadline(current.result_deadline)}; se contestar, a administração decide e a partida fica sem resultado até lá.
          </p>
        </ConfirmSheet>
      )}
      {sheet === "wo-withdraw" && (
        <ConfirmSheet
          title="Retirar W.O."
          description={sides.map((side) => sideName(side)).join(" × ")}
          confirmLabel="Retirar W.O."
          busyLabel="Retirando…"
          busy={action.busy}
          error={action.error}
          onClose={close}
          onConfirm={() => void applyThenReload(() => withdrawWalkover(current.id), "W.O. retirado. A partida volta a aguardar o placar.", "Não foi possível retirar o W.O.")}
        >
          <p className="m-0">O W.O. deixa de valer e a partida volta a aguardar o placar dos dois lados.</p>
        </ConfirmSheet>
      )}
      {sheet === "wo-contest" && wo && (
        <ReasonSheet
          title="Contestar W.O."
          description={sides.map((side) => sideName(side)).join(" × ")}
          intro={
            <>
              {wo.registered_by?.name ?? nameOf(current, wo.absent_side === "a" ? "b" : "a")} registrou que o seu lado não compareceu. Conte o que aconteceu: a contestação vai para a administração, que decide.
            </>
          }
          label="O que aconteceu?"
          placeholder="Ex.: estávamos na quadra no horário combinado."
          min={5}
          max={500}
          shortMessage="Conte o que aconteceu."
          confirmLabel="Contestar W.O."
          busyLabel="Enviando…"
          busy={action.busy}
          error={action.error}
          onClose={close}
          onSubmit={(reason) => void apply(() => contestWalkover(current.id, reason), "Contestação enviada à administração.", "Não foi possível contestar o W.O.")}
        />
      )}
      {sheet === "slots" && (
        <SlotsSheet
          detail={current}
          busy={action.busy}
          error={action.error}
          onClose={close}
          onSave={(slots: OpenSlots) => void apply(() => updateSlots(current.id, slots), "Vagas para avulsos atualizadas.", "Não foi possível atualizar as vagas.")}
          onRemove={(slot: MatchSlotOut) => {
            const guest = slot.guest;
            if (guest) void applyThenReload(() => removeGuest(current.id, guest.id), `${guest.name} saiu da partida.`, "Não foi possível remover o avulso.");
          }}
        />
      )}
      {reporting && (
        <Glass variant="screen" label="Denunciar mensagem" title="Denunciar mensagem" onClose={() => setReporting(null)}>
          <blockquote className="m-0 flex flex-col gap-0.5 rounded-xl bg-[#ffffff14] px-2.5 py-[9px]">
            <b className="text-[11.5px]">{reporting.author?.name ?? "Participante"}</b>
            <p className={cn("m-0 text-[11.5px] leading-[1.45] wrap-anywhere whitespace-pre-line")}>{reporting.body}</p>
          </blockquote>
          <p className={glassMessageVariants({ tone: "muted" })}>A administração vê a mensagem, a partida e o autor.</p>
          <ReportForm
            target="match_message"
            targetId={reporting.id}
            title="Por que você quer denunciar esta mensagem?"
            onExpired={onExpired}
            onSent={() => {
              setReporting(null);
              toast.success("Denúncia enviada para análise.");
            }}
          />
        </Glass>
      )}
    </div>
  );
}
