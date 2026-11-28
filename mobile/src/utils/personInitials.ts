/**
 * Iniciais da pessoa sem foto: a primeira letra das duas primeiras palavras do nome ("Rafael Moreira" → "RM"), a mesma
 * regra do servidor (`person_initials`, que manda as iniciais prontas na prévia do elenco, onde só vai o primeiro nome).
 */
export const personInitials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
