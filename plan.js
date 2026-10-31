// ============================================================
//  PAUTA DE ENTRENAMIENTO
//  Edita este archivo (o usa "Editar pauta" dentro de la app).
//
//  Cada día tiene una lista de ejercicios. Campos por ejercicio:
//    name     : nombre del ejercicio (obligatorio)
//    sets     : número de series
//    reps     : repeticiones por serie (usa esto O "time")
//    time     : segundos por serie, para ejercicios por tiempo (plancha, etc.)
//    rest     : segundos de descanso entre series
//    weight   : peso / carga (texto libre, ej. "20 kg")
//    video    : link de YouTube (o .mp4). Si se omite, se ofrece búsqueda.
//    notes    : indicaciones (texto libre)
// ============================================================

window.DEFAULT_PLAN = {
  name: "Mi pauta",
  days: [
    {
      name: "Día 1 · Tren superior",
      exercises: [
        { name: "Flexiones de brazos", sets: 3, reps: 12, rest: 60, video: "https://www.youtube.com/watch?v=IODxDxX7oi4", notes: "Cuerpo recto, baja hasta casi tocar el suelo." },
        { name: "Remo con mancuerna", sets: 3, reps: 10, rest: 60, weight: "12 kg", notes: "Cada brazo." },
        { name: "Press militar", sets: 3, reps: 10, rest: 75, weight: "10 kg" },
        { name: "Plancha", sets: 3, time: 40, rest: 30, video: "https://www.youtube.com/watch?v=pSHjTRCQxIw" }
      ]
    },
    {
      name: "Día 2 · Tren inferior",
      exercises: [
        { name: "Sentadilla", sets: 4, reps: 12, rest: 90, video: "https://www.youtube.com/watch?v=aclHkVaku9U" },
        { name: "Zancadas", sets: 3, reps: 10, rest: 60, notes: "Por pierna." },
        { name: "Puente de glúteo", sets: 3, reps: 15, rest: 45 },
        { name: "Sentadilla isométrica en pared", sets: 3, time: 45, rest: 45 }
      ]
    },
    {
      name: "Día 3 · Full body",
      exercises: [
        { name: "Burpees", sets: 3, reps: 10, rest: 60 },
        { name: "Mountain climbers", sets: 3, time: 30, rest: 30 },
        { name: "Peso muerto rumano", sets: 3, reps: 12, rest: 75, weight: "2×10 kg" },
        { name: "Abdominales bicicleta", sets: 3, reps: 20, rest: 30 }
      ]
    }
  ]
};
