// ============================================================
//  PAUTA DE ENTRENAMIENTO — Noviembre 2026
//  (también se puede editar dentro de la app en "✏️ Pauta")
//
//  weeks : progresión semanal. "sets" = series por entrenamiento de esa semana.
//          Los ejercicios con  sets: "auto"  usan ese número.
//
//  Campos por ejercicio:
//    name     : nombre (obligatorio)
//    block    : sección del día (Activación, Movilidad, Fuerza…)
//    group    : ejercicios consecutivos con el mismo "group" se hacen
//               en circuito / superserie (A1 → A2 → descanso → A1 → A2…)
//    sets     : número de series, o "auto" para usar el de la semana
//    reps     : repeticiones por serie   (usa esto O "time")
//    time     : segundos por serie
//    perSide  : true si es por lado (en ejercicios por tiempo cronometra ambos lados)
//    rest     : segundos de descanso después de la serie
//               (en un circuito: el "rest" del ÚLTIMO ejercicio es el descanso entre rondas)
//    tempo    : segundos por repetición → activa el metrónomo con pitido
//    alternate: true si alterna lados en cada repetición (ej. dead bug)
//    rpe      : esfuerzo objetivo (RPE)
//    video    : link de YouTube (o .mp4)
//    start    : minuto donde parte el video para este ejercicio, ej. "1:35"
//    notes    : indicaciones
// ============================================================

window.DEFAULT_PLAN = {
  version: 4,
  name: "Pauta Noviembre",
  frequency: 2, // entrenamientos por semana
  weeks: [
    { start: "2026-11-02", sets: 2 },
    { start: "2026-11-09", sets: 3 },
    { start: "2026-11-16", sets: 3 },
    { start: "2026-11-23", sets: 2 }
  ],
  rpe: [
    ["10", "Esfuerzo máximo"],
    ["9.5", "Sin repeticiones en la recámara, pero no máximo"],
    ["9", "RIR 1"],
    ["8.5", "RIR 1-2"],
    ["8", "RIR 2"],
    ["7.5", "RIR 2-3"],
    ["7", "RIR 3"],
    ["5-6", "RIR 4-6"],
    ["3-4", "Esfuerzo suave"],
    ["1-2", "Sin casi esfuerzo"]
  ],
  days: [
    {
      name: "Día 1",
      exercises: [
        // ---------------- ACTIVACIÓN ----------------
        {
          block: "Activación", group: "Circuito glúteo con banda",
          name: "Aperturas bilaterales con banda", sets: 1, reps: 30, tempo: 2, rest: 0,
          notes: "De espalda en el suelo, talones apoyados y dedos del pie elevados."
        },
        {
          block: "Activación", group: "Circuito glúteo con banda",
          name: "Aperturas unilaterales con banda", sets: 1, reps: 15, perSide: true, tempo: 2, rest: 0,
          notes: "15 por pierna. Misma posición: talones apoyados, dedos elevados."
        },
        {
          block: "Activación", group: "Circuito glúteo con banda",
          name: "Puente glúteo con banda", sets: 1, reps: 30, tempo: 2.5, rest: 0
        },
        {
          block: "Activación", group: "Circuito glúteo con banda",
          name: "Contracción máxima en puente elevado", sets: 1, time: 30, rest: 30,
          notes: "Mantén la posición de puente glúteo arriba, apretando al máximo."
        },
        {
          block: "Activación",
          name: "Dead bug fitball", sets: 3, reps: 10, perSide: true, alternate: true, tempo: 2.5, rest: 30,
          video: "https://www.youtube.com/watch?v=06VJ1qvZyfg",
          notes: "10 por lado × 3. Puede hacerse sin fitball."
        },
        {
          block: "Activación",
          name: "Trabajo escapular · círculos de hombros", sets: 2, reps: 10, tempo: 2.5, rest: 15,
          notes: "Serie 1: 10 círculos hacia afuera. Serie 2: 10 hacia adentro."
        },
        {
          block: "Activación",
          name: "Trabajo escapular · mantenciones I-Y-T", sets: 3, reps: 10, tempo: 3, rest: 15,
          notes: "Serie 1 en \"I\", serie 2 en \"Y\", serie 3 en \"T\". Luego contracciones."
        },
        {
          block: "Activación",
          name: "Dominadas escapulares", sets: "auto", reps: 8, tempo: 3, rest: 60,
          video: "https://www.youtube.com/shorts/I_N7m8WqvOY"
        },

        // ---------------- MOVILIDAD ----------------
        {
          block: "Movilidad", group: "Movilidad",
          name: "Pancake suelo", sets: "auto", reps: 6, tempo: 5, rest: 0,
          video: "https://www.youtube.com/watch?v=UYsvnlpSLdw", start: "3:06"
        },
        {
          block: "Movilidad", group: "Movilidad",
          name: "Posición rana", sets: "auto", time: 60, rest: 0,
          video: "https://www.youtube.com/watch?v=UYsvnlpSLdw", start: "1:15",
          notes: "60–90 segundos. Si quieres llegar a 90 s, usa +15 s o sigue después del pitido."
        },
        {
          block: "Movilidad", group: "Movilidad",
          name: "Pancake pared", sets: "auto", reps: 6, tempo: 5, rest: 0,
          video: "https://www.youtube.com/watch?v=UYsvnlpSLdw", start: "3:06"
        },
        {
          block: "Movilidad", group: "Movilidad",
          name: "Leg lift pancake", sets: "auto", reps: 6, tempo: 3, rest: 45,
          video: "https://www.youtube.com/watch?v=UYsvnlpSLdw", start: "6:47"
        },

        // ---------------- FUERZA · DÍA 1 ----------------
        {
          block: "Fuerza", group: "A",
          name: "Single leg swing", sets: "auto", reps: 12, perSide: true, rpe: "6-7", rest: 0,
          video: "https://www.youtube.com/watch?v=kueKa1bgKmE"
        },
        {
          block: "Fuerza", group: "A",
          name: "Remo gorila", sets: "auto", reps: 8, perSide: true, rpe: "8", rest: 90,
          video: "https://www.youtube.com/watch?v=DhxkHHRez7w"
        },
        {
          block: "Fuerza", group: "B",
          name: "Pinza disco", sets: "auto", time: 20, rpe: "9", rest: 0,
          video: "https://www.youtube.com/shorts/gpY-bitZgks"
        },
        {
          block: "Fuerza", group: "B",
          name: "Puente glúteo con barra", sets: "auto", reps: 10, rpe: "8-9", rest: 90,
          video: "https://www.youtube.com/watch?v=DQv1IMQDbE4"
        },
        {
          block: "Fuerza", group: "C",
          name: "Zottman curl", sets: "auto", reps: 12, rpe: "8-9", rest: 0,
          video: "https://www.youtube.com/watch?v=ZXbOOIOPOi8"
        },
        {
          block: "Fuerza", group: "C",
          name: "Patada mariposa", sets: "auto", time: 30, rpe: "8", rest: 0,
          video: "https://www.youtube.com/watch?v=5V4CETRga4E"
        },
        {
          block: "Fuerza", group: "C",
          name: "Bloqueo 90° 1 brazo", sets: "auto", time: 10, perSide: true, rpe: "8", rest: 90,
          video: "https://www.youtube.com/watch?v=nOZIv9LGi6g",
          notes: "Unilateral. Usa banda elástica si es necesario."
        }
      ]
    }
  ]
};
