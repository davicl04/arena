import { useState } from "react";
import { Minus, Plus, UserMinus } from "lucide-react";
import type { MatchDetail, MatchSlotOut, OpenSlots } from "@/api/matches";
import { Button, IconButton } from "@/components/ui/button";
import { feedbackVariants } from "@/components/ui/feedback";
import { Sheet, SheetActions } from "@/components/ui/sheet";
import { SocialPhoto } from "@/components/SocialPhoto";
import { footballFormat, positionShort } from "@/data/arena";
import { currentSlotCounts, guestSlots, maxSlots, shortName, sideOf, slotPositions, slotTotal } from "@/data/match";
import type { SlotCounts } from "@/data/match";
import { useNow } from "@/hooks/useNow";
import { cn } from "@/lib/utils";

const stepButton = "size-9 border border-solid border-line-strong disabled:opacity-35";

/**
 * Vagas para avulsos (representante): um passo por posição (no máximo um goleiro e, somando os avulsos já
 * escalados, até o formato menos um) e a lista dos avulsos escalados do meu time, cada um com "Remover" (com
 * confirmação). Remover só vale antes do início; o servidor repete as regras.
 */
export function SlotsSheet({
  detail,
  busy,
  error,
  onSave,
  onRemove,
  onClose,
}: {
  detail: MatchDetail;
  busy: boolean;
  /** Recusa do servidor ao formulário (`422`/`409` com conflito): as demais falhas de ação saem em toast. */
  error: string;
  onSave: (slots: OpenSlots) => void;
  onRemove: (slot: MatchSlotOut) => void;
  onClose: () => void;
}) {
  const initial = currentSlotCounts(detail);
  const guests = guestSlots(detail.slots, detail.my_side);
  const waiting = detail.slots.filter((slot) => slot.side === detail.my_side && slot.state === "oferecida").length;
  const [counts, setCounts] = useState<SlotCounts>(initial);
  const [removing, setRemoving] = useState<MatchSlotOut | null>(null);
  const filledGoalkeepers = guests.filter((slot) => slot.position === "goleiro").length;
  const limit = maxSlots(detail.format);
  const total = slotTotal(counts) + guests.length;
  const format = detail.format ? footballFormat[detail.format] : null;
  const changed = slotPositions.some(({ value }) => counts[value] !== initial[value]);
  const scheduled = detail.state === "agendada";
  const now = useNow();
  const started = detail.starts_at !== null && now >= new Date(detail.starts_at).getTime();
  const mine = sideOf(detail, detail.my_side);

  function step(position: keyof SlotCounts, delta: number) {
    setCounts((old) => ({ ...old, [position]: Math.max(0, old[position] + delta) }));
  }

  if (removing) {
    const name = removing.guest?.name ?? "o avulso";
    return (
      <Sheet title="Remover avulso" description={name} onClose={() => setRemoving(null)}>
        <p className="m-0 pt-1 text-[12px] leading-normal text-ink">
          <b>{name}</b> sai da partida e deixa de ver o chat. A vaga não reabre sozinha: ajuste as vagas se quiser outro avulso.
        </p>
        {error && (
          <p className={cn(feedbackVariants(), "mb-0")} role="alert">
            {error}
          </p>
        )}
        <SheetActions>
          <Button variant="secondary" disabled={busy} onClick={() => setRemoving(null)}>
            Voltar
          </Button>
          <Button disabled={busy} onClick={() => onRemove(removing)}>
            {busy ? "Removendo…" : "Remover"}
          </Button>
        </SheetActions>
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Vagas para avulsos"
      description={`${shortName(mine)}${format ? ` · ${format.label} ${format.size}` : ""} · até ${limit} vagas`}
      onClose={onClose}
    >
      <div className="grid gap-3 pt-2">
        <p className="m-0 text-[11px] leading-normal text-ink-muted">
          {scheduled
            ? "Avulsos da cidade recebem a vaga por 2 h e entram só nesta partida."
            : "As vagas abrem para avulsos quando a partida for agendada. O que você marcar aqui substitui as vagas informadas na busca."}
        </p>
        <ul className="m-0 grid list-none gap-1.5 p-0" aria-label="Vagas por posição">
          {slotPositions.map(({ value, label }) => {
            const goalkeeperBlocked = value === "goleiro" && counts.goleiro + filledGoalkeepers >= 1;
            return (
              <li key={value} className="flex items-center gap-2 text-[12px]">
                <span className="min-w-0 flex-1">
                  <b>{label}</b> <small className="inline text-[10px] text-ink-muted">{positionShort[value]}</small>
                </span>
                <IconButton type="button" className={stepButton} aria-label={`Menos uma vaga de ${label}`} disabled={busy || counts[value] === 0} onClick={() => step(value, -1)}>
                  <Minus size={16} aria-hidden="true" />
                </IconButton>
                <output className="w-6 text-center font-display text-[15px] font-extrabold tabular-nums" aria-label={`Vagas de ${label}`}>
                  {counts[value]}
                </output>
                <IconButton type="button" className={stepButton} aria-label={`Mais uma vaga de ${label}`} disabled={busy || total >= limit || goalkeeperBlocked} onClick={() => step(value, 1)}>
                  <Plus size={16} aria-hidden="true" />
                </IconButton>
              </li>
            );
          })}
        </ul>
        <p className="m-0 text-[10.5px] leading-normal text-ink-muted" aria-live="polite">
          {total} de {limit} vagas{guests.length ? `, contando ${guests.length} ${guests.length === 1 ? "avulso escalado" : "avulsos escalados"}` : ""}. No máximo uma vaga de goleiro.
          {waiting ? ` ${waiting} ${waiting === 1 ? "vaga está reservada" : "vagas estão reservadas"} para avulsos que ainda vão responder.` : ""}
        </p>
        {error && (
          <p className={cn(feedbackVariants(), "my-0")} role="alert">
            {error}
          </p>
        )}
        <Button className="w-full" disabled={busy || (!changed && scheduled)} onClick={() => onSave(counts)}>
          {busy ? "Salvando…" : "Salvar vagas"}
        </Button>

        <div className="grid gap-1.5 border-t border-solid border-line pt-3">
          <h3 className="m-0 text-[12px]">Avulsos escalados</h3>
          {guests.length === 0 ? (
            <p className="m-0 text-[11px] leading-normal text-ink-muted">Nenhum avulso escalado no seu time.</p>
          ) : (
            <ul className="m-0 grid list-none gap-1.5 p-0">
              {guests.map((slot) => (
                <li key={slot.id} className="flex items-center gap-2.5">
                  <SocialPhoto path={slot.guest?.avatar_url ?? null} name={slot.guest?.name ?? "Avulso"} size="md" />
                  <span className="min-w-0 flex-1 text-[12px]">
                    <b className="block truncate">{slot.guest?.name}</b>
                    <small className="text-[10.5px] text-ink-muted">Avulso · {slotPositions.find((item) => item.value === slot.position)?.label}</small>
                  </span>
                  {!started && (
                    <Button variant="secondary" size="compact" disabled={busy} aria-label={`Remover ${slot.guest?.name ?? "avulso"} da partida`} onClick={() => setRemoving(slot)}>
                      <UserMinus size={14} aria-hidden="true" />
                      Remover
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Sheet>
  );
}
