import { cva } from 'class-variance-authority'

/*
 * Foto de perfil redonda com iniciais (.avatar-preview), aplicada no `Avatar`: md (64 px) no cartão de
 * identidade de Editar perfil; lg (120 px) na prévia da folha de foto (.sheet-preview .avatar-preview).
 */
export const avatarPreviewVariants = cva('grid flex-none place-items-center overflow-hidden rounded-full bg-app font-extrabold text-ink [&_img]:size-full [&_img]:object-cover', {
  variants: {
    size: { md: 'size-16 text-[18px]', lg: 'size-[120px] text-[32px]' },
  },
  defaultVariants: { size: 'md' },
})
