import { Stepper } from './Stepper'
import { needsTiebreak, setWinner, showsThirdSet } from './tennis'
import type { SetDraft } from './tennis'

/**
 * Placar do tênis por sets (R4): os games de cada lado com o tie-break em 7-6 e o terceiro set (ou o super tie-break combinado)
 * só quando os dois primeiros foram divididos. O rascunho fica do ponto de vista do primeiro nome (`mineName`); quem usa converte
 * para os lados A e B com `draftToInput`. Serve ao cartão de resultado dos times e à decisão do organizador (D3).
 */
export function TennisSets({ sets, onPatch, mineName, theirName, superTiebreak, disabled = false }: {
  sets: SetDraft[]
  onPatch: (index: number, change: Partial<SetDraft>) => void
  /** Nome do primeiro lado (os valores `mine`); no cartão do atleta, "Você". */
  mineName: string
  theirName: string
  superTiebreak: boolean
  disabled?: boolean
}) {
  return (
    <div className="grid gap-2" role="group" aria-label="Placar por sets">
      <div className="grid grid-cols-[52px_minmax(0,1fr)_14px_minmax(0,1fr)] items-end gap-1.5 text-[10px] font-bold text-ink-muted">
        <span />
        <span className="truncate text-center">{mineName}</span>
        <span />
        <span className="truncate text-center">{theirName}</span>
      </div>
      {sets.slice(0, showsThirdSet(sets) ? 3 : 2).map((set, index) => {
        const number = index + 1
        const isSuper = index === 2 && superTiebreak
        const name = isSuper ? 'super tie-break' : `set ${number}`
        const max = isSuper ? 99 : 7
        const mine = mineName === 'Você' ? 'seus' : `de ${mineName}`
        return (
          <div key={index} role="group" aria-label={isSuper ? 'Super tie-break' : `Set ${number}`} className="grid gap-1.5">
            <div className="grid grid-cols-[52px_minmax(0,1fr)_14px_minmax(0,1fr)] items-center gap-1.5">
              <span className="text-[11px] leading-tight text-ink-muted">{isSuper ? 'Super tie-break' : `Set ${number}`}</span>
              <Stepper className="justify-self-center" label={`${isSuper ? 'Pontos' : 'Games'} ${mine} no ${name}`} value={set.mine} max={max} disabled={disabled}
                onChange={value => onPatch(index, { mine: value })} />
              <span aria-hidden="true" className="text-center text-ink-muted">–</span>
              <Stepper className="justify-self-center" label={`${isSuper ? 'Pontos' : 'Games'} de ${theirName} no ${name}`} value={set.theirs} max={max} disabled={disabled}
                onChange={value => onPatch(index, { theirs: value })} />
            </div>
            {!isSuper && needsTiebreak(set) && (
              <div className="grid grid-cols-[52px_minmax(0,1fr)_14px_minmax(0,1fr)] items-center gap-1.5">
                <span className="text-[10px] leading-tight text-ink-muted">Tie-break</span>
                <Stepper className="justify-self-center" label={`Pontos ${mine} no tie-break do set ${number}`} value={set.tbMine} max={99} disabled={disabled}
                  onChange={value => onPatch(index, { tbMine: value })} />
                <span aria-hidden="true" className="text-center text-ink-muted">–</span>
                <Stepper className="justify-self-center" label={`Pontos de ${theirName} no tie-break do set ${number}`} value={set.tbTheirs} max={99} disabled={disabled}
                  onChange={value => onPatch(index, { tbTheirs: value })} />
              </div>
            )}
          </div>
        )
      })}
      {!showsThirdSet(sets) && setWinner(sets[0]) && setWinner(sets[1]) && (
        <p className="m-0 text-[10.5px] leading-normal text-ink-muted">Quem venceu os dois primeiros sets já ganhou a partida.</p>
      )}
      {showsThirdSet(sets) && superTiebreak && (
        <p className="m-0 text-[10.5px] leading-normal text-ink-muted">Os dois primeiros sets ficaram divididos: o desempate é um super tie-break até 10, com 2 de vantagem.</p>
      )}
    </div>
  )
}
