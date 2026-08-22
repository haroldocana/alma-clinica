
import { Dsm5EvaluationTemplate } from './types';

export const DSM5_EVALUATIONS: Dsm5EvaluationTemplate[] = [
  {
    id: 'dsm-gad',
    name: 'Trastorno de Ansiedad Generalizada (TAG)',
    questions: [
      'Se ha sentido nervioso, ansioso o con los nervios de punta',
      'No ha sido capaz de parar o controlar su preocupación',
      'Se ha preocupado demasiado por diferentes cosas',
      'Ha tenido dificultad para relajarse',
      'Se ha sentido tan inquieto que es difícil quedarse quieto'
    ],
    options: ["Nunca", "Pocos días", "Más de la mitad", "Casi siempre"]
  },
  {
    id: 'dsm-mdd',
    name: 'Trastorno Depresivo Mayor',
    questions: [
      'Poco interés o placer en hacer cosas',
      'Se ha sentido decaído, deprimido o sin esperanzas',
      'Problemas para dormir o mantenerse dormido',
      'Sentirse cansado o tener poca energía',
      'Poco apetito o comer en exceso'
    ],
    options: ["Nunca", "Pocos días", "Más de la mitad", "Casi siempre"]
  },
  {
    id: 'dsm-ptsd',
    name: 'Trastorno de Estrés Postraumático',
    questions: [
      'Recuerdos repetidos e inquietantes de una experiencia estresante',
      'Sentir mucha molestia cuando algo le recordaba la experiencia',
      'Evitar recuerdos, pensamientos o sentimientos relacionados',
      'Tener creencias o expectativas negativas sobre uno mismo',
      'Estar "superalerta" o vigilante'
    ],
    options: ["Nunca", "Pocos días", "Más de la mitad", "Casi siempre"]
  },
    {
    id: 'dsm-asrs',
    name: 'TDAH en Adultos (ASRS-v1.1)',
    questions: [
      '¿Con qué frecuencia tiene problemas para finalizar los detalles de un proyecto una vez hechas las partes difíciles?',
      '¿Con qué frecuencia tiene dificultad para poner en orden las cosas cuando tiene que realizar una tarea organizada?',
      '¿Con qué frecuencia tiene problemas para recordar citas u obligaciones?',
      '¿Con qué frecuencia evita o retrasa empezar una tarea que requiere mucho pensamiento?',
      '¿Con qué frecuencia mueve en exceso las manos o los pies cuando tiene que estar sentado(a)?',
      '¿Con qué frecuencia se siente demasiado activo(a) o impulsado(a) a hacer cosas, como si tuviera un motor?'
    ],
    options: ["Nunca", "Rara vez", "A veces", "Con frecuencia", "Muy frecuentemente"]
  },
  {
    id: 'dsm-spin',
    name: 'Fobia Social (SPIN)',
    questions: [
      'Tengo miedo a las personas con autoridad.',
      'Me molesta sonrojarme delante de la gente.',
      'Las fiestas y reuniones sociales me dan miedo.',
      'Evito hablar con personas que no conozco.',
      'Tengo miedo a ser criticado(a).',
      'Evito hacer presentaciones o hablar en público.'
    ],
    options: ["Nada", "Un poco", "Algo", "Mucho", "Extremadamente"]
  },
  {
    id: 'dsm-audit-c',
    name: 'Consumo de Sustancias (AUDIT-C)',
    questions: [
      '¿Con qué frecuencia consume bebidas alcohólicas?',
      '¿Cuántas consumiciones suele realizar en un día normal de consumo?',
      '¿Con qué frecuencia toma 6 o más consumiciones en una sola ocasión?',
    ],
    options: ["Nunca", "Mensual o menos", "2 a 4 veces al mes", "2 a 3 veces/semana", "4+ veces/semana"]
  }
];
