import { InviteFlow } from '../components/teams/InviteFlow'
import { DarkScreen } from '../components/arena/TeamsPlate'
import { TeamTokenContext } from '../components/teams/ui'
import { useSessionToken } from '../hooks/useSessionToken'
import type { ScreenProps } from '../navigation/screens'

/**
 * Convidar (I5 + Q2 + Q5): tela escura com as abas Escolher atleta | Link e QR. `link` abre já na aba Link e QR (botão de
 * QR da carteirinha). A barra escura fecha e volta para Meus times; no passo 2 o voltar (e o botão do Android) volta ao passo 1.
 */
export default function TeamInviteScreen({ navigation, onExpired, params }: ScreenProps<'team-invite'>) {
  const token = useSessionToken()
  return <TeamTokenContext.Provider value={token}>
    <DarkScreen>
      <InviteFlow key={`${params.teamId}-${params.link ? 'link' : 'pessoa'}`} teamId={params.teamId} initialTab={params.link ? 'link' : 'pessoa'} onClose={navigation.back} onExpired={onExpired} />
    </DarkScreen>
  </TeamTokenContext.Provider>
}
