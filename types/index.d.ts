export type Medida = {
  nombre: string
  usado?: number
  reinicio?: string
  detalle?: string
}

declare module 'claude-code' {
  interface PluginState {
    'indicador-tokens': { medidas: Medida[]; coste: number | null }
  }
}
