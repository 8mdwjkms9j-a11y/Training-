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

## Cargar tu pauta
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

## Usarla en el iPhone
1. Publica el repo con **GitHub Pages**: *Settings → Pages → Deploy from a branch →* elige la rama y carpeta `/ (root)`.
2. Abre la URL (`https://<usuario>.github.io/<repo>/`) en Safari.
3. Botón **Compartir → Agregar a pantalla de inicio**. Se abre a pantalla completa como una app.

Para probar en el computador: `python3 -m http.server` y abre `http://localhost:8000`.
