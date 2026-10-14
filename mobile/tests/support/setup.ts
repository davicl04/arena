// Isolamento entre testes: a loja de toasts e a de conexão são únicas no módulo; cada teste começa sem toasts e com a
// conexão "online" (temporizadores cancelados).
import { afterEach } from 'vitest'
import { connection } from '../../src/api/connection'
import { toastStore } from '../../src/components/toast/toastStore'

afterEach(() => {
  // Árvores de teste que ficaram montadas ouvem as lojas: sem o ambiente de `act`, o reset não gera aviso de atualização fora dele.
  const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const previous = globals.IS_REACT_ACT_ENVIRONMENT
  globals.IS_REACT_ACT_ENVIRONMENT = false
  try {
    toastStore.reset()
    connection.reset()
  } finally { globals.IS_REACT_ACT_ENVIRONMENT = previous }
})
