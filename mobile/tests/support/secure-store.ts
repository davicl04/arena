// expo-secure-store depende do runtime do Expo (`__DEV__`, módulos nativos). Testes que não o simulam com `vi.mock` próprio
// (por exemplo, os que simulam todo o `api/client`) ainda carregam o tema (hooks/useTheme), que lê e grava `arena.tema`:
// aqui ele vira um armazenamento em memória vazio.
const items = new Map<string, string>()
export const getItemAsync = async (key: string) => items.get(key) ?? null
export const setItemAsync = async (key: string, value: string) => { items.set(key, value) }
export const deleteItemAsync = async (key: string) => { items.delete(key) }
