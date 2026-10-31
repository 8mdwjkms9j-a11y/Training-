# Entreno 💪

Web app para seguir tu pauta de entrenamiento desde el celular (Safari / acceso directo en pantalla de inicio).

## Qué hace
- Lista los días de tu pauta y marca cuál **te toca** según tu último entrenamiento.
- Muestra cada ejercicio con su **video** (YouTube o .mp4; si no hay link, botón para buscarlo).
- **Contador de repeticiones**: toca el círculo grande para sumar cada rep.
- **Temporizador** para ejercicios por tiempo (plancha, isométricos…) y **descanso automático** entre series, con pitidos, aviso por voz y vibración.
- Reloj de la sesión, pantalla siempre encendida mientras entrenas, y el entreno sobrevive si cierras la app.
- **Historial** de entrenamientos con reps/tiempos por serie.
- Funciona sin conexión una vez abierta.

## Pauta cargada: Noviembre 2026
- **Día 1** = Activación → Movilidad → Fuerza (superseries A, B y circuito C), 2 veces por semana.
- Series por entrenamiento según la semana (2 · 3 · 3 · 2), elegidas automáticamente por fecha.
- Tabla RPE/RIR disponible en la app; en ejercicios con RPE se puede anotar el peso usado.

## Editar la pauta
Edita `plan.js` (o en la app: **✏️ Pauta**). Cada ejercicio admite:

| campo | ejemplo | significado |
|---|---|---|
| `name` | `"Sentadilla"` | nombre |
| `sets` | `4` | series |
| `reps` | `12` | repeticiones por serie |
| `time` | `40` | segundos por serie (en vez de `reps`) |
| `rest` | `90` | descanso en segundos |
| `weight` | `"20 kg"` | carga |
| `video` | `"https://youtu.be/..."` | link del video |
| `notes` | `"Por pierna"` | indicaciones |
| `block` | `"Movilidad"` | sección del día |
| `group` | `"A"` | ejercicios seguidos con el mismo grupo se hacen en superserie/circuito |
| `perSide` | `true` | por lado (en ejercicios por tiempo cronometra ambos lados) |
| `rpe` | `"8"` | esfuerzo objetivo |

`sets: "auto"` usa las series de la semana definidas en `weeks`. Si cambias `plan.js`, sube `version` para que el teléfono tome la nueva pauta.

## Usarla en el iPhone
1. Publica el repo con **GitHub Pages**: *Settings → Pages → Deploy from a branch →* elige la rama y carpeta `/ (root)`.
2. Abre la URL (`https://<usuario>.github.io/<repo>/`) en Safari.
3. Botón **Compartir → Agregar a pantalla de inicio**. Se abre a pantalla completa como una app.

Para probar en el computador: `python3 -m http.server` y abre `http://localhost:8000`.
