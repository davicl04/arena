import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { ArrowDown, CalendarPlus, EyeOff, Flag, Info, MessagesSquare, SendHorizontal, WifiOff } from "lucide-react";
import { MESSAGE_MAX } from "@/api/matches";
import type { MatchDetail, MatchMessageOut } from "@/api/matches";
import { Armband } from "@/components/arena/Armband";
import { TeamCrest } from "@/components/arena/TeamCrest";
import { SocialPhoto } from "@/components/SocialPhoto";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadError } from "@/components/ui/load-error";
import { eventWhen, sideOf, shortName } from "@/data/match";
import { useMatchChat } from "@/hooks/useMatchChat";
import { cn } from "@/lib/utils";
import { formatClock, parseIso } from "@/utils/format";
import { chatRows } from "./chatRows";

/*
 * Chat da partida (C1): o meu time à direita (eu em verde-escuro, colegas em verde-claro) e o adversário à esquerda,
 * em branco; mensagens seguidas da mesma pessoa se agrupam, com nome, time, hora e a braçadeira "C" dos
 * representantes; os eventos da partida são faixas com o brasão. Leitura a cada 4 s com a tela visível, envio
 * com Enter (Shift+Enter quebra a linha) e denúncia de mensagem pelo formulário de denúncias.
 */

const clock = (iso: string) => {
  const date = parseIso(iso);
  return date ? formatClock(date) : "";
};

function EventStrip({ detail, message }: { detail: MatchDetail; message: MatchMessageOut }) {
  const team = sideOf(detail, message.side)?.team ?? null;
  const when = eventWhen(message.payload);
  return (
    <div data-slot="chat-event" data-event={message.event_type} className="flex items-center gap-2 self-stretch rounded-[12px] bg-white/65 px-3 py-2 text-[11px] leading-snug text-ink">
      {team ? (
        <TeamCrest name={team.name} initials={team.initials} path={team.crest_url} size="xs" className="h-[18px] w-4" />
      ) : (
        <Info size={15} className="flex-none text-brand" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1 wrap-anywhere">
        {when && <b>{when} · </b>}
        {message.body}
      </span>
      <time dateTime={message.created_at} className="flex-none text-[9.5px] text-ink-muted tabular-nums">
        {clock(message.created_at)}
      </time>
    </div>
  );
}

function Bubble({ message, own, onReport }: { message: MatchMessageOut; own: boolean; onReport?: () => void }) {
  const mine = message.is_mine;
  if (message.removed) {
    return (
      <div className="flex max-w-full items-center gap-1.5 rounded-[16px] bg-white/60 px-3 py-2 text-[11.5px] text-ink-muted italic">
        <EyeOff size={14} className="flex-none" aria-hidden="true" />
        Mensagem removida
      </div>
    );
  }
  return (
    <div className={cn("group/bubble flex max-w-full items-center gap-1", own && "flex-row-reverse")}>
      <p
        className={cn(
          "m-0 min-w-0 rounded-[16px] px-3 py-2 text-[12px] leading-[1.45] wrap-anywhere whitespace-pre-line",
          mine ? "rounded-br-[6px] bg-brand text-white" : own ? "bg-[#d5e9dc] text-ink" : "rounded-bl-[6px] bg-white text-ink",
        )}
      >
        {message.body}
      </p>
      {!mine && onReport && (
        <IconButton
          type="button"
          aria-label={`Denunciar mensagem de ${message.author?.name ?? "participante"}`}
          className="size-8 flex-none text-ink-muted opacity-70 hover:opacity-100 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/bubble:opacity-70 [@media(hover:hover)]:focus-visible:opacity-100"
          onClick={onReport}
        >
          <Flag size={14} aria-hidden="true" />
        </IconButton>
      )}
    </div>
  );
}

function Group({ detail, messages, onReport }: { detail: MatchDetail; messages: MatchMessageOut[]; onReport: (message: MatchMessageOut) => void }) {
  const first = messages[0];
  const last = messages[messages.length - 1];
  const side = sideOf(detail, first.side);
  // O meu time (eu e os colegas) fala à direita; o adversário, à esquerda. O organizador (sem lado) fala à direita só para ele.
  const own = first.is_mine || (detail.my_side !== null && first.side === detail.my_side);
  const organizer = first.author_role === "organizador";
  const name = first.is_mine ? "Você" : (first.author?.name ?? "Participante");
  return (
    <div data-slot="chat-group" data-mine={first.is_mine || undefined} data-side={first.side ?? undefined} className={cn("flex max-w-[88%] items-end gap-2", own ? "flex-row-reverse self-end" : "self-start")}>
      <span className="relative inline-grid flex-none">
        <SocialPhoto path={first.author?.avatar_url ?? null} name={first.author?.name ?? "Participante"} size="comment" className="size-[30px] flex-[0_0_30px] bg-tile text-[10px]" />
        {side?.team && (
          <TeamCrest name={side.team.name} initials={side.team.initials} path={side.team.crest_url} size="xs" decorative className="absolute -right-1 -bottom-[3px] h-[14px] w-[13px]" />
        )}
      </span>
      <div className={cn("grid min-w-0 gap-[3px]", own && "justify-items-end")}>
        <div className={cn("flex min-w-0 items-center gap-1.5 px-1 text-[10.5px]", own && "flex-row-reverse")}>
          <b className="truncate text-ink">{name}</b>
          {first.author_role === "representante" && <Armband variant="inline" />}
          {organizer ? (
            <span data-slot="organizer-tag" className="flex-none rounded-md bg-forest px-1.5 py-px text-[9px] font-extrabold text-mint">Organizador</span>
          ) : (
            <span className="truncate text-ink-muted">{shortName(side)}</span>
          )}
          <time dateTime={last.created_at} className="flex-none text-[9.5px] text-ink-muted tabular-nums">
            {clock(last.created_at)}
          </time>
        </div>
        {messages.map((message) => (
          <Bubble key={message.id} message={message} own={own} onReport={message.kind === "texto" && !message.removed ? () => onReport(message) : undefined} />
        ))}
      </div>
    </div>
  );
}

function Composer({
  detail,
  sending,
  error,
  onSend,
  onPropose,
}: {
  detail: MatchDetail;
  sending: boolean;
  error: string;
  onSend: (body: string) => Promise<boolean>;
  onPropose?: () => void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const { write_chat: canWrite, read_chat: canRead, propose_terms: canPropose } = detail.permissions;

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    if (await onSend(body)) {
      setText("");
      input.current?.focus();
    }
  }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra a linha. Durante a composição de acentos (IME) o Enter pertence ao teclado.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  if (!canWrite) {
    const admin = detail.my_role === "administracao";
    return (
      <p data-slot="chat-closed" className="m-0 flex flex-none items-center gap-2 border-t border-solid border-line bg-white px-4 py-3 text-[11.5px] text-ink-muted">
        <Info size={15} className="flex-none" aria-hidden="true" />
        {detail.my_role === 'historico' ? 'O acesso pelo histórico não inclui o chat.' : !canRead ? "O chat abre quando os dois lados aceitam a proposta." : admin ? "A administração só lê o chat." : "O chat desta partida está fechado."}
      </p>
    );
  }
  return (
    <form data-slot="chat-composer" className="relative flex flex-none items-end gap-1 border-t border-solid border-line bg-white p-2" onSubmit={(event) => void submit(event)}>
      {canPropose && onPropose && (
        <IconButton type="button" aria-label="Propor dia, horário e quadra" className="text-brand" onClick={onPropose}>
          <CalendarPlus size={20} aria-hidden="true" />
        </IconButton>
      )}
      <label htmlFor={`${id}-message`} className="sr-only">
        Mensagem
      </label>
      <textarea
        ref={input}
        id={`${id}-message`}
        rows={1}
        maxLength={MESSAGE_MAX}
        value={text}
        placeholder={detail.sport === "tenis" ? "Mensagem para a partida" : "Mensagem para os dois times"}
        autoComplete="off"
        aria-describedby={`${id}-status`}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className="max-h-28 min-h-10 min-w-0 flex-1 resize-none rounded-[20px] border border-solid border-line-strong bg-subtle px-3.5 py-2.5 text-[13px] leading-[1.35] text-ink placeholder:text-placeholder focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus [field-sizing:content]"
      />
      <IconButton type="submit" aria-label="Enviar mensagem" className="text-brand disabled:opacity-40" disabled={sending || !text.trim()}>
        <SendHorizontal size={20} aria-hidden="true" />
      </IconButton>
      <p id={`${id}-status`} role="status" aria-live="polite" className={cn("m-0", error || sending ? "absolute -top-6 right-3 left-3 rounded-field px-2 py-1 text-[11px]" : "sr-only", error ? "bg-error-bg text-error" : "bg-white text-ink-muted")}>
        {sending ? "Enviando mensagem…" : error}
      </p>
    </form>
  );
}

/** Estados em que a partida acabou: o chat é só leitura e nada mais chega. */
const FINISHED: MatchDetail["state"][] = ["encerrada", "sem_resultado", "cancelada"];

export function MatchChat({
  detail,
  onExpired,
  onReport,
  onPropose,
  onEvent,
}: {
  detail: MatchDetail;
  onExpired: () => void;
  onReport: (message: MatchMessageOut) => void;
  onPropose?: () => void;
  /** Chegou um evento novo da partida (aceite, cancelamento, vagas…): a tela relê o detalhe. */
  onEvent?: () => void;
}) {
  const chat = useMatchChat(detail.id, detail.permissions.read_chat, onExpired, onEvent, !FINISHED.includes(detail.state));
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastSeen = useRef<number | null>(null);
  const [unseen, setUnseen] = useState(0);
  const rows = chatRows(chat.items);
  const newest = chat.items[chat.items.length - 1]?.id ?? null;

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (stick.current) setUnseen(0);
  }
  function scrollToEnd() {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
    stick.current = true;
    setUnseen(0);
  }
  // Sem rolar para cima, o chat acompanha as mensagens novas; rolando para cima, só avisa que chegaram.
  useLayoutEffect(() => {
    if (newest === null || newest === lastSeen.current) return;
    const first = lastSeen.current === null;
    const mineNew = chat.items[chat.items.length - 1]?.is_mine;
    lastSeen.current = newest;
    if (first || stick.current || mineNew) scrollToEnd();
    else setUnseen((count) => count + 1);
  }, [newest, chat.items]);
  // Teclado virtual e mudança de tamanho: quem estava no fim continua no fim.
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const readable = detail.permissions.read_chat;
  return (
    <section aria-label="Chat da partida" className="relative flex min-h-0 flex-1 flex-col">
      {!readable ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <EmptyState Icon={MessagesSquare} title={detail.my_role === 'historico' ? 'Chat indisponível no histórico' : 'O chat ainda não abriu'} text={detail.my_role === 'historico' ? 'O acesso pelo histórico permite consultar a partida e suas estatísticas.' : 'Ele abre quando os dois lados aceitam a proposta de partida.'} />
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            ref={scroller}
            role="log"
            aria-label="Mensagens da partida"
            aria-relevant="additions"
            tabIndex={0}
            onScroll={onScroll}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-x-hidden overflow-y-auto overscroll-contain px-3.5 py-3 outline-offset-[-3px] focus-visible:outline-3 focus-visible:outline-focus"
          >
            {chat.hasOlder && (
              <Button variant="secondary" size="compact" className="self-center" disabled={chat.loadingOlder} onClick={() => void chat.loadOlder()}>
                {chat.loadingOlder ? "Carregando…" : "Carregar anteriores"}
              </Button>
            )}
            {chat.loading && (
              <p role="status" className="m-0 py-4 text-center text-[12px] text-ink-muted">
                Carregando o chat…
              </p>
            )}
            {chat.error && !chat.items.length && <LoadError size="section" text={chat.error} cause={chat.errorCause} onRetry={chat.reload} />}
            {!chat.loading && !chat.error && rows.length === 0 && (
              <p className="m-0 py-4 text-center text-[12px] leading-normal text-ink-muted">Nenhuma mensagem ainda. Combinem dia, horário e quadra por aqui.</p>
            )}
            {rows.map((row) =>
              row.kind === "day" ? (
                <div key={row.key} className="self-center rounded-full bg-white/60 px-2.5 py-[3px] text-[10px] font-bold text-ink-muted">
                  {row.label}
                </div>
              ) : row.kind === "event" ? (
                <EventStrip key={row.key} detail={detail} message={row.message} />
              ) : (
                <Group key={row.key} detail={detail} messages={row.messages} onReport={onReport} />
              ),
            )}
          </div>
          {chat.offline && (
            <p role="status" className="absolute top-2 left-1/2 m-0 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-forest px-3 py-1.5 text-[10.5px] font-semibold text-white shadow-soft">
              <WifiOff size={13} aria-hidden="true" />
              Sem conexão. Tentando de novo…
            </p>
          )}
          {unseen > 0 && (
            <Button className="absolute right-3 bottom-3 min-h-9 gap-1.5 rounded-full px-3 text-[11px] shadow-primary" onClick={scrollToEnd}>
              <ArrowDown size={14} aria-hidden="true" />
              {unseen === 1 ? "1 nova mensagem" : `${unseen} novas mensagens`}
            </Button>
          )}
        </div>
      )}
      <Composer detail={detail} sending={chat.sending} error={chat.sendError} onSend={chat.send} onPropose={onPropose} />
    </section>
  );
}
