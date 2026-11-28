import type { ReactNode } from 'react'
import { CalendarDays, Grid3x3 } from 'lucide-react'
import { Tabs } from '@/components/ui/tabs'

const profileTabs = [
  { value: 'Fotos', label: 'Fotos', Icon: Grid3x3 },
  { value: 'Partidas', label: 'Partidas', Icon: CalendarDays },
] as const
export type ProfileTab = (typeof profileTabs)[number]['value']

/*
 * Tablet e computador: as abas ocupam a largura da coluna do perfil (sem o `-mx-5`), centradas e com a largura do
 * rótulo, para o sublinhado não se esticar pela coluna inteira.
 */
const wideTabs = 'md:mx-0 md:mt-7 md:justify-center md:gap-6 md:px-0 md:[&>[role=tab]]:flex-none md:[&>[role=tab]]:px-6 lg:[&>[role=tab]]:text-[12px]'

/** Abas do conteúdo do perfil, fixas abaixo da barra superior, com setas, Home e End (primitivo Tabs). */
export default function ProfileTabs({ value, onChange }: { value: ProfileTab; onChange: (value: ProfileTab) => void }) {
  return <Tabs items={profileTabs} value={value} onChange={onChange} label="Conteúdo do perfil" idPrefix="tab-" controls="profile-content" className={wideTabs} />
}

/*
 * Painel das abas: ocupa ao menos a altura visível abaixo da barra (56 px) e das abas (49 px), em unidades do
 * contêiner `main` (60vh sem suporte a cqh). O estado vazio direto no painel ganha 34 px no topo.
 * Em tablet e computador, a linha do tempo (Partidas) fica na coluna de leitura, centrada; as fotos usam a coluna toda.
 */
export function ProfilePanel({ tab, children }: { tab: ProfileTab; children: ReactNode }) {
  return <div id="profile-content" role="tabpanel" aria-labelledby={`tab-${tab}`}
    className={`min-h-[60vh] supports-[height:100cqh]:min-h-[calc(100cqh-56px-49px)] [&>[data-slot=empty-state]]:pt-[34px]${tab === 'Partidas' ? ' md:mx-auto md:max-w-leitura' : ''}`}>{children}</div>
}
