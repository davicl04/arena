// Isolamento entre testes: a loja de toasts e a de conexão são únicas no módulo; cada teste começa sem toasts e com a
// conexão "online" (temporizadores cancelados). A localização simulada volta a "permissão não decidida, sem posição"; a captura e
// a galeria simuladas, a "permissão concedida, gravação feita"; o menu de compartilhar, a "disponível, fechou sem erro".
import { afterEach, beforeEach } from 'vitest'
import { connection } from '../../src/api/connection'
import { toastStore } from '../../src/components/toast/toastStore'
import { resetLocation } from './location'
import { resetMediaLibrary } from './media-library'
import { resetSharing } from './sharing'
import { resetViewShot } from './view-shot'

beforeEach(() => { resetLocation(); resetViewShot(); resetMediaLibrary(); resetSharing() })

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
