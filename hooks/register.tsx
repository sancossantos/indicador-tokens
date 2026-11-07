import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionCost, SessionRateLimit } from 'claude-code'

import type { Medida } from '../types'

const medidas = atom({ plugin: 'indicador-tokens', key: 'medidas' } as const, [] as Medida[])
const coste = atom({ plugin: 'indicador-tokens', key: 'coste' } as const, null as number | null)

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
  const mismoDia = d.toDateString() === new Date().toDateString()
  return mismoDia ? hora : `${d.getDate()}/${d.getMonth() + 1} ${hora}`
}

function k(n: number): string {
  if (n >= 1000000) return `${Math.round(n / 100000) / 10}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

function calcular(context: SessionContextUsage, limites: SessionRateLimit[]): Medida[] {
  const out: Medida[] = [
    {
      nombre: 'Contexto',
      usado: context.percent,
      detalle: `${k(context.tokens ?? 0)}/${k(context.window)}`,
    },
  ]
  const vistos = new Set<string>()
  for (const l of limites) {
    vistos.add(l.kind)
    out.push({ nombre: NOMBRES[l.kind] ?? l.kind, usado: l.percentUsed, reinicio: l.resetsAt })
  }
  // 5h y 7d se muestran siempre, aunque todavía no haya lectura.
  for (const kind of ['five_hour', 'seven_day']) {
    if (!vistos.has(kind)) out.push({ nombre: NOMBRES[kind] })
  }
  return out
}

function barra(p: number, celdas: number): string {
  const n = Math.max(0, Math.min(celdas, Math.round((p / 100) * celdas)))
  return '█'.repeat(n) + '░'.repeat(celdas - n)
}

// Tres niveles de detalle: del más completo al más corto.
function segmento(m: Medida, nivel: number): string {
  if (m.usado === undefined) {
    if (nivel === 2) return `${m.nombre} —`
    return `${m.nombre} sin datos${m.detalle && nivel === 0 ? ` (${m.detalle})` : ''}`
  }
  const usado = Math.round(m.usado)
  const resta = Math.max(0, 100 - usado)
  const r = reinicio(m.reinicio)
  const det = m.detalle ? ` (${m.detalle})` : ''
  if (nivel === 0) return `${m.nombre} ${barra(m.usado, 8)} ${usado}%${det} · quedan ${resta}%${r ? ` · ↻${r}` : ''}`
  if (nivel === 1) return `${m.nombre} ${barra(m.usado, 5)} ${usado}%${r ? ` ↻${r}` : ''}`
  return `${m.nombre} ${usado}%`
}

const SEP = '  │  '

// Reparte los textos en filas que quepan en el ancho dado.
function empaquetar(textos: string[], ancho: number): number[][] {
  const filas: number[][] = []
  let fila: number[] = []
  let largo = 0
  textos.forEach((t, i) => {
    const extra = fila.length === 0 ? t.length : SEP.length + t.length
    if (fila.length > 0 && largo + extra > ancho) {
      filas.push(fila)
      fila = [i]
      largo = t.length
    } else {
      fila.push(i)
      largo += extra
    }
  })
  if (fila.length > 0) filas.push(fila)
  return filas
}

type Tono = 'error' | 'warning' | 'success' | 'inactive'

function color(p?: number): Tono {
  if (p === undefined) return 'inactive'
  return p >= 90 ? 'error' : p >= 70 ? 'warning' : 'success'
}

async function guardar($: EngineInterface, c: SessionContextUsage, l: SessionRateLimit[], s?: SessionCost) {
  await update($, medidas, () => calcular(c, l))
  await update($, coste, () => (s ? s.usd : null))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    const u = await $.session.usage()
    await guardar($, u.context, u.rateLimits, u.cost)
    return r
  })

  on('session.measure', async ($, e, next) => {
    await guardar($, e.context, e.rateLimits, e.cost)
    if (e.changed.includes('rateLimits')) {
      for (const l of e.rateLimits) {
        if (l.percentUsed >= 90) $.ui.toast(`Límite ${NOMBRES[l.kind] ?? l.kind}: ${l.percentUsed}% usado`)
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    let lista = await read($, medidas)
    let usd = await read($, coste)
    if (lista.length === 0) {
      // Tras una recarga del mod aún no hay medidas guardadas: pídelas ya.
      const u = await $.session.usage()
      lista = calcular(u.context, u.rateLimits)
      usd = u.cost ? u.cost.usd : null
    }

    const ancho = Math.max(10, e.props.bodyColumns)
    const alto = Math.max(1, e.props.maxRows)

    const textos = (nivel: number): string[] => {
      const t = lista.map(m => segmento(m, nivel))
      if (usd !== null) t.push(nivel === 2 ? `$${usd.toFixed(2)}` : `Coste $${usd.toFixed(2)}`)
      return t
    }

    // Elige el nivel más detallado que quepa entero en el espacio disponible.
    let nivel = 0
    let ts = textos(nivel)
    let filas = empaquetar(ts, ancho)
    while (nivel < 2 && (filas.length > alto || ts.some(t => t.length > ancho))) {
      nivel += 1
      ts = textos(nivel)
      filas = empaquetar(ts, ancho)
    }

    const colores: Tono[] = lista.map(m => color(m.usado))
    colores.push('inactive')

    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {filas.map((fila, i) => (
          <Box key={`f${i}`}>
            <Text wrap="truncate-end">
              {fila.map((idx, j) => (
                <Text key={`s${idx}`}>
                  {j > 0 ? <Text dimColor>{SEP}</Text> : null}
                  <Text color={colores[idx]}>{ts[idx]}</Text>
                </Text>
              ))}
            </Text>
          </Box>
        ))}
      </Box>
    )
  })
}
