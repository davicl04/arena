import type { City } from '@/api/client'
import { CitySearch } from '@/components/cities/CitySearch'
import { Sheet } from '@/components/ui/sheet'

/**
 * Escolha da cidade na busca do catálogo nacional (servidor): do time ou, com `title`, do evento e do pedido de
 * organizador. `selected` é a cidade atual, marcada mesmo fora dos resultados.
 */
export function CitySheet({ selected, onSelect, onClose, title = 'Cidade do time', description = 'O pareamento de partidas usa a cidade do time.' }: {
  selected: City | null
  onSelect: (city: City) => void
  onClose: () => void
  title?: string
  description?: string
}) {
  return <Sheet title={title} description={description} onClose={onClose}>
    <CitySearch selected={selected} onSelect={onSelect} autoFocus />
  </Sheet>
}
