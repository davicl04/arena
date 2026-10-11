import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'
import { apiUrl } from '../api/client'
import { cn } from '@/lib/utils'

/*
 * Tamanhos da foto (antes .social-avatar, .social-initials e as regras por contexto do antigo styles.css):
 * md 42 px (listas de pessoas) · comment 26 px (comentários e citação na denúncia) · author 34 px com borda branca
 * (autor sobre a foto do post) · lg 56 px (vidro de ações da conta) · face 28 px sobreposta (seguidores em comum)
 * · fill (ocupa o quadro do avatar do perfil visitado). As iniciais são verdes e em extranegrito.
 */
const photoVariants = cva('inline-grid rounded-full bg-app object-cover', {
  variants: {
    size: {
      md: 'size-[42px] flex-[0_0_42px]',
      comment: 'size-[26px] flex-[0_0_26px] text-[9px]',
      author: 'size-[34px] flex-[0_0_34px] border-2 border-solid border-white text-[11px]',
      lg: 'mb-1.5 size-14 flex-[0_0_56px] text-[16px]',
      face: '-ml-2 size-7 flex-[0_0_28px] border-2 border-solid border-app text-[9px] first:ml-0',
      fill: 'size-full flex-none text-[22px]',
    },
    initials: { true: 'place-items-center font-extrabold text-brand', false: '' },
  },
  compoundVariants: [{ size: 'md', initials: true, className: 'text-[12px]' }],
  defaultVariants: { size: 'md', initials: false },
})

/** Foto de perfil de uma conta da comunidade, com iniciais quando não há imagem. */
export function SocialPhoto({ path, name, size, className }: { path: string | null; name: string; className?: string } & Pick<VariantProps<typeof photoVariants>, 'size'>) {
  return path ? <img data-slot="social-photo" className={cn(photoVariants({ size }), className)} src={apiUrl(path)} alt={`Foto de ${name}`} /> :
    <span data-slot="social-photo" className={cn(photoVariants({ size, initials: true }), className)} aria-label={name}>{name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()}</span>
}
