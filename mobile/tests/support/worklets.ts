// react-native-worklets depende do runtime nativo. Nos testes não há thread de UI: `scheduleOnRN` chama a função na hora.
export const scheduleOnRN = <Args extends unknown[]>(fn: (...args: Args) => unknown, ...args: Args) => { fn(...args) }
