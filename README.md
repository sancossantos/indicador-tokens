# indicador-tokens

Mod para Claude Code que muestra, encima del cuadro donde escribes, cuánto llevas usado y cuánto te queda:

- **Contexto**: cuánto de la ventana de contexto de la conversación está ocupado.
- **5h / 7d**: el uso de los límites de tu plan, con la hora a la que se reinicia cada uno (`↻`).

La barra se ve verde, amarilla desde el 70 % y roja desde el 90 %; al pasar del 90 % de un límite aparece además un aviso. Se adapta al ancho disponible y pasa a un formato más corto si no cabe.

## Instalación

En el prompt de una sesión de Claude Code en un terminal:

```
/plugin install indicador-tokens --marketplace sancossantos/indicador-tokens
```

Responde `y` para añadir el marketplace y elige el ámbito (el de usuario lo activa en todas tus sesiones).

Desde una terminal:

```bash
claude plugin install indicador-tokens --marketplace sancossantos/indicador-tokens
```

En la app de escritorio, donde `/plugin` no funciona: pulsa **+** junto al cuadro del prompt, luego **Plugins**, **Add marketplace** con `sancossantos/indicador-tokens`, y después **Add plugin**.
