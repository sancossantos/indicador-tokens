import { atom, read, update } from 'claude-code'
import type { Register, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Medida } from '../types'

const medidas = atom({ plugin: 'indicador-tokens', key: 'medidas' } as const, [] as Medida[])

const NOMBRES: Record<string, string> = {
  five_hour: '5h',
  seven_day: '7d',
  spend_limit: 'Gasto',
}

function dos(n: number): string {
  return String(n).padStart(2, '0')
}

function reinicio(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const hora = `${dos(d.getHours())}:${dos(d.getMinutes())}`
  const hoy = new Date()
  const mismoDia = d.toDateString() === hoy.toDateString()
  return mismoDia ? hora : `${d.getDate()}/${d.getMonth() + 1} ${hora}`
}

function calcular(context: SessionContextUsage, limites: SessionRateLimit[]): Medida[] {
  const out: Medida[] = []
  if (context.percent !== undefined) out.push({ nombre: 'Contexto', usado: context.percent })
  for (const l of limites) {
    out.push({ nombre: NOMBRES[l.kind] ?? l.kind, usado: l.percentUsed, reinicio: l.resetsAt })
  }
  return out
}

function barra(p: number, celdas: number): string {
  const n = Math.max(0, Math.min(celdas, Math.round((p / 100) * celdas)))
  return '█'.repeat(n) + '░'.repeat(celdas - n)
}

// Tres niveles de detalle: del más completo al más corto.
function segmento(m: Medida, nivel: number): string {
  const usado = Math.round(m.usado)
  const resta = Math.max(0, 100 - usado)
  const r = reinicio(m.reinicio)
  if (nivel === 0) return `${m.nombre} ${barra(m.usado, 8)} ${usado}% · quedan ${resta}%${r ? ` · ↻${r}` : ''}`
  if (nivel === 1) return `${m.nombre} ${barra(m.usado, 5)} ${usado}%${r ? ` ↻${r}` : ''}`
  return `${m.nombre} ${usado}%`
}

const SEP = '  │  '

// Reparte los segmentos en filas que quepan en el ancho dado.
function empaquetar(lista: Medida[], nivel: number, ancho: number): Medida[][] {
  const filas: Medida[][] = []
  let fila: Medida[] = []
  let largo = 0
  for (const m of lista) {
    const s = segmento(m, nivel).length
    const extra = fila.length === 0 ? s : SEP.length + s
    if (fila.length > 0 && largo + extra > ancho) {
      filas.push(fila)
      fila = [m]
      largo = s
    } else {
      fila.push(m)
      largo += extra
    }
  }
  if (fila.length > 0) filas.push(fila)
  return filas
}

function color(p: number): 'error' | 'warning' | 'success' {
  return p >= 90 ? 'error' : p >= 70 ? 'warning' : 'success'
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    const u = await $.session.usage()
    await update($, medidas, () => calcular(u.context, u.rateLimits))
    return r
  })

  on('session.measure', async ($, e, next) => {
    await update($, medidas, () => calcular(e.context, e.rateLimits))
    if (e.changed.includes('rateLimits')) {
      for (const l of e.rateLimits) {
        if (l.percentUsed >= 90) $.ui.toast(`Límite ${NOMBRES[l.kind] ?? l.kind}: ${l.percentUsed}% usado`)
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const lista = await read($, medidas)
    if (e.props.hasSurvey || lista.length === 0) return next(e)

    const ancho = Math.max(10, e.props.bodyColumns)
    const alto = Math.max(1, e.props.maxRows)

    // Elige el nivel más detallado que quepa entero en el espacio disponible.
    let nivel = 0
    let filas = empaquetar(lista, nivel, ancho)
    while (nivel < 2 && (filas.length > alto || filas.some(f => f.length === 1 && segmento(f[0], nivel).length > ancho))) {
      nivel += 1
      filas = empaquetar(lista, nivel, ancho)
    }

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {filas.map((fila, i) => (
          <Box key={`f${i}`}>
            <Text wrap="truncate-end">
              {fila.map((m, j) => (
                <Text key={m.nombre}>
                  {j > 0 ? <Text dimColor>{SEP}</Text> : null}
                  <Text color={color(m.usado)}>{segmento(m, nivel)}</Text>
                </Text>
              ))}
            </Text>
          </Box>
        ))}
      </Box>
    )
  })
}
