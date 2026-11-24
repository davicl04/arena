import { ArenaMark, Logo } from '@/components/Brand'
import { arenaTagline } from '@/data/landing'

/*
 * Metade da marca da tela de entrada Dividida (escura por design): degradê radial forest, a marca `arena.`, o Coliseu
 * em silhueta dourada esmaecida (decorativo, oculto para leitores de tela) e o título, que acompanha o modo. Até 860 px
 * (`entrada-estreita:`) vira a faixa do topo, com marca, título e subtítulo, e o formulário fica abaixo.
 */
export function AuthBrand({ register }: { register: boolean }) {
  return (
    <div className="relative flex flex-col justify-between gap-6 overflow-hidden bg-radial-[90%_70%_at_25%_15%] from-forest-glow to-forest-deep to-72% p-[clamp(24px,4vw,48px)] motion-safe:animate-side-in entrada-estreita:px-5 entrada-estreita:pt-[22px] entrada-estreita:pb-[26px]">
      <Logo className="relative text-heading" />
      <ArenaMark className="absolute bottom-[16%] -left-[8%] aspect-[260/146] h-auto w-[116%] bg-transparent bg-linear-to-b from-legend to-legend/0 to-95% opacity-16 entrada-estreita:-bottom-[20%] entrada-estreita:left-[30%] entrada-estreita:w-[90%]" />
      <div className="relative">
        <h1 className="max-w-[11ch] text-[clamp(36px,4.6vw,66px)] leading-[1.02] tracking-[-0.03em] entrada-estreita:text-[32px]">
          {register ? (
            <>Sua trajetória <span className="text-mint">começa aqui</span></>
          ) : (
            <>A <span className="text-mint">arena</span> te chama</>
          )}
        </h1>
        <p className="mt-3.5 text-[15px] text-ink-muted">{arenaTagline}</p>
      </div>
    </div>
  )
}
