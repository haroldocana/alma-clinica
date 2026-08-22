import { Dsm5EvaluationTemplate } from './types';

export const BDI_QUESTIONS: string[] = [
  "Tristeza",
  "Pesimismo",
  "Fracaso",
  "Pérdida de placer",
  "Sentimientos de culpa"
];

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
  }
];
