// expo-status-bar depende do runtime nativo: nos testes, a barra de status não desenha nada (um vi.mock próprio ainda vale).
export const StatusBar = () => null
