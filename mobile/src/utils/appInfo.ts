import app from '../../app.json'

// Versão exibida em "Sobre o ARENA"; vem do app.json para não duplicar o número.
export const appVersion: string = app.expo.version
