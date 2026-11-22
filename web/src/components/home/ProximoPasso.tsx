import { ChevronRight, Medal } from 'lucide-react'
import { IconTile } from '@/components/ui/icon-tile'
import { SectionTitle } from '@/components/ui/section-title'

/**
 * "Seu próximo passo" do Início: o cartão "Complete seu perfil esportivo", com "Mostre onde e como você gosta de jogar.", que
 * abre a tela de modalidades. Quem usa só o renderiza enquanto falta alguma das três modalidades (`missingSportsCount`).
 * O Início do Expo tem o mesmo cartão, com os mesmos textos.
 */
export function ProximoPasso({ onOpen }: { onOpen: () => void }) {
  return <section aria-labelledby="proximo-passo-title" data-slot="proximo-passo">
    <SectionTitle title={<span id="proximo-passo-title">Seu próximo passo</span>} />
    <button
      type="button"
      className="flex w-full cursor-pointer items-center gap-[11px] rounded-card border border-solid border-line bg-surface p-3.5 text-left noite:border-surface-edge"
      onClick={onOpen}
    >
      <IconTile className="flex-none">
        <Medal size={22} aria-hidden="true" />
      </IconTile>
      <span className="min-w-0 flex-1">
        <b className="text-[12px] text-heading">Complete seu perfil esportivo</b>
        <small className="mt-1 block text-[10px] leading-[1.5] text-ink-muted">Mostre onde e como você gosta de jogar.</small>
      </span>
      <ChevronRight size={19} className="flex-none" aria-hidden="true" />
    </button>
  </section>
}
