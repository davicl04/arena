import { cva } from 'class-variance-authority'

/*
 * Botões ARENA. Cada variante reproduz uma classe do antigo styles.css:
 * primary → .primary · secondary → .secondary (compact → .secondary.compact) · text → .text-button
 * link → .section-title button / .rank-meta button (ação verde compacta; ajuste o tamanho no `className`)
 * glass → .glass-primary · glass-danger → .glass-primary.danger · glass-secondary → .glass-secondary ·
 * glass-link → .glass-link (ação de texto verde-menta sobre o vidro: "Tentar novamente", "Carregar mais").
 * Não há botão de perigo claro na interface aprovada; "perigo" existe só sobre o vidro (glass-danger).
 * Fonte e cor herdadas e fundo/borda/padding zerados vêm do preflight; cursor, opacidade de desabilitado (0.6),
 * foco laranja e transição vêm da base ARENA (`@layer base` em ui.css).
 * Tamanhos de página (ex.: .main-cta, .full-width) ficam no `className` de quem usa.
 * Para rótulos com aparência de botão (ex.: seleção de arquivo), use `buttonVariants` direto no `<label>`.
 * Sem `type` padrão, como os botões atuais: dentro de formulário, informe `type="button"` quando não for envio.
 */
export const buttonVariants = cva('', {
  variants: {
    variant: {
      primary:
        'inline-flex min-h-11 items-center justify-center gap-[9px] rounded-control border-[1.5px] border-transparent bg-brand px-4 py-2.5 text-[12px] font-bold text-white shadow-primary hover:bg-brand-hover motion-safe:active:scale-[0.99]',
      secondary:
        'inline-flex min-h-11 items-center justify-center gap-[9px] rounded-control border-[1.5px] border-line-strong bg-transparent px-4 py-2.5 text-[12px] font-bold text-ink hover:bg-[#fff6]',
      text: 'block min-h-11 border-0 bg-transparent px-0 py-2 text-[12px] text-brand underline',
      link: 'min-h-8 border-0 bg-transparent px-0.5 py-0 text-[12px] font-bold text-brand',
      glass: 'min-h-10 rounded-xl border-0 bg-mint px-4 py-0 text-[11.5px] font-bold text-night disabled:opacity-45',
      'glass-danger': 'min-h-10 rounded-xl border-0 bg-danger-soft px-4 py-0 text-[11.5px] font-bold text-[#2a0710] disabled:opacity-45',
      'glass-secondary': 'min-h-10 rounded-xl border-0 bg-transparent px-4 py-0 text-[11.5px] font-bold text-[#ffffffcc] hover:bg-[#ffffff14]',
      'glass-link': 'min-h-9 self-start border-0 bg-transparent px-0 py-1.5 text-[11px] font-bold text-mint',
    },
    size: {
      default: '',
      compact: 'min-h-[38px] px-2.5 py-1.5 text-[10px]',
    },
  },
  defaultVariants: { variant: 'primary', size: 'default' },
})

/*
 * Botão redondo de ícone (.icon-btn, 44 px). Tons conforme o fundo:
 * default → .icon-btn · glass → .glass .icon-btn ·
 * cover → .profile-topbar .icon-btn (círculo de vidro sobre a capa; volta ao padrão dentro de
 * um ancestral `group/topbar` com `data-condensed="true"`). Sem padding (zerado pelo preflight): o ícone fica
 * centralizado pela grade no mesmo ponto em que ficava com o padding simétrico padrão do navegador.
 * outline/approve → .icon-action / .icon-action.approve (40 px com contorno; aprovar/recusar solicitações).
 * media → círculo de vidro escuro sobre a foto do post (•••), par da etiqueta do autor ·
 * glass-small → .comment-action (32 px, denunciar/excluir comentário) · send → .comment-send (38 px, enviar comentário;
 * desabilitado fica apagado sem a opacidade padrão).
 */
export const iconButtonVariants = cva('grid size-11 place-items-center rounded-full border-0', {
  variants: {
    tone: {
      default: 'bg-transparent hover:bg-[#49505712]',
      glass: 'shrink-0 bg-transparent text-white hover:bg-[#ffffff1a]',
      media: 'size-[38px] border border-solid border-[#ffffff2e] bg-[#0c161199] text-white backdrop-blur-[14px] backdrop-saturate-[1.7] hover:bg-[#0c1611cc]',
      cover:
        'border border-solid border-[#ffffff2e] bg-[#0b221859] text-white backdrop-blur-[10px] hover:bg-[#0b221880] motion-safe:transition-[background-color,border-color,opacity] motion-safe:duration-200 motion-safe:ease-[ease] group-data-[condensed=true]/topbar:border-transparent group-data-[condensed=true]/topbar:bg-transparent group-data-[condensed=true]/topbar:text-ink group-data-[condensed=true]/topbar:backdrop-blur-none group-data-[condensed=true]/topbar:hover:bg-[#49505712]',
      outline: 'size-10 border-[1.5px] border-solid border-line-strong bg-transparent',
      approve: 'size-10 border-[1.5px] border-solid border-brand bg-brand text-white',
      'glass-small': 'size-8 shrink-0 bg-transparent text-[#ffffffb3] hover:bg-[#ffffff1a]',
      send: 'size-[38px] shrink-0 bg-mint text-night disabled:bg-[#ffffff1a] disabled:text-[#ffffff80] disabled:opacity-100',
    },
  },
  defaultVariants: { tone: 'default' },
})

