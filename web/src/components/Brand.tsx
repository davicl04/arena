import { cn } from "@/lib/utils";

/*
 * Símbolo do Coliseu (máscara sobre a cor atual). `compact` usa o trecho de muralha.
 * Tamanho padrão 44×32 (30×32 no compacto); cada contexto ajusta pelo `className`.
 */
export function ArenaMark({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-8 flex-none bg-current mask-center mask-contain mask-no-repeat",
        compact
          ? "w-[30px] mask-[url(/images/brand/arena-wall.svg)]"
          : "w-11 mask-[url(/images/brand/coliseum.svg)]",
        className,
      )}
    />
  );
}
/** Marca `arena.`: Coliseu, texto em Sora e ponto verde circular alinhado à base das letras. */
export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-[9px]", className)}>
      <ArenaMark />
      <strong className="font-display text-[26px] font-extrabold tracking-[-0.06em]">
        arena
        <span className="ml-0.5 inline-block size-[5px] -translate-y-1 rounded-full bg-current text-[0px] text-brand">
          .
        </span>
      </strong>
    </div>
  );
}
