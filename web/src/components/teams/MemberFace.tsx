import { cva, type VariantProps } from 'class-variance-authority'
import { Armband } from '@/components/arena/Armband'
import { SocialPhoto } from '@/components/SocialPhoto'
import { cn } from '@/lib/utils'

/*
 * Rosto do atleta no elenco (.pav): a foto de perfil (SocialPhoto, com iniciais quando não há foto) e a braçadeira "C"
 * dos representantes. Tamanhos: stack 24 (elenco em miniatura da carteirinha, com contorno da placa) · row 40 (listas) ·
 * grid 44 (grade E1) · sheet 56 (folha do atleta).
 */
const faceVariants = cva('', {
  variants: {
    size: {
      stack: 'size-6 flex-[0_0_24px] text-[7.5px]',
      row: 'size-10 flex-[0_0_40px] text-[12px]',
      grid: 'size-11 flex-[0_0_44px] text-[12px]',
      sheet: 'mb-0 size-14 flex-[0_0_56px] text-[16px]',
    },
  },
  defaultVariants: { size: 'row' },
})

export function MemberFace({ name, avatarUrl, representative = false, size, ring = 'light', className }: {
  name: string
  avatarUrl: string | null
  representative?: boolean
  /** Contorno da braçadeira: `dark` sobre a placa `forest`. */
  ring?: 'light' | 'dark'
  className?: string
} & VariantProps<typeof faceVariants>) {
  return <span data-slot="member-face" className={cn('relative inline-grid flex-none', className)}>
    <SocialPhoto path={avatarUrl} name={name} size={size === 'sheet' ? 'lg' : 'md'} className={faceVariants({ size })} />
    {representative && <Armband size={size === 'sheet' ? 'lg' : size === 'stack' ? 'sm' : 'md'} ring={ring} />}
  </span>
}
