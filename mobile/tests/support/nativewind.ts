// Substitui o pacote `nativewind` nos testes (Node, sem Metro): o runtime real importa o react-native verdadeiro.
// `styled` devolve o próprio componente; `className` chega como prop comum ao componente simulado.
export const styled = <T>(component: T) => component
