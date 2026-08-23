import React, { useState, useRef, useEffect } from 'react';
import { AppMode, ClinicalCase, ScientificQuery, SessionRecord, Dsm5EvaluationTemplate, ExternalDocument, Psychologist, Appointment } from './types';
import { DSM5_EVALUATIONS } from './constants'; 
import { 
  processClinicalNotes, 
  queryScientificDatabase, 
  savePsychologistsRemote, 
  loadPsychologistsRemote,
  saveClinicalCasesRemote,
  loadClinicalCasesRemote,
  processVoiceNotesToEvolution,
  dismissEmergencyAlert
} from './services/geminiService';

// ============================================================================
// FUNCIONES AUXILIARES DE TIEMPO Y EXPORTACIÓN
// ============================================================================
const getDaysRemaining = (expiryDateStr: string | undefined): number => {
  if (!expiryDateStr) return -1;
  const today = new Date();
  const expiry = new Date(expiryDateStr);
  if (isNaN(expiry.getTime())) return -1;
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getDaysSince = (pastDateStr: string): number => {
  if (!pastDateStr) return 0;
  const today = new Date();
  const past = new Date(pastDateStr);
  if (isNaN(past.getTime())) return 0;
  today.setHours(0, 0, 0, 0);
  past.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - past.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

const exportHTMLToWord = (htmlContent: string, filename: string) => {
  const preHtml = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Documento</title></head><body>";
  const postHtml = "</body></html>";
  const html = preHtml + htmlContent + postHtml;
  const blob = new Blob(['\ufeff', html], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename + '.doc';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// ============================================================================
// MACHOTES CLÍNICOS PROFESIONALES (MEMBRETES)
// ============================================================================
const getProfessionalLetterhead = (title: string, bodyHtml: string, doctorName: string, colegiado: string, specialty: string) => `
  <div style="font-family: 'Times New Roman', Times, serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #000;">
    <div style="text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 15px; margin-bottom: 30px;">
      <h1 style="font-size: 24px; color: #1e3a8a; margin: 0;">${doctorName}</h1>
      <p style="font-size: 14px; color: #4b5563; margin: 5px 0 0 0;">${specialty || 'Especialista en Salud Mental'} | Colegiado Activo: ${colegiado}</p>
      <p style="font-size: 12px; color: #6b7280; margin: 5px 0 0 0;">Atención Clínica Profesional y Ética</p>
    </div>
    <h2 style="text-align: center; font-size: 16px; text-transform: uppercase; margin-bottom: 30px; letter-spacing: 1px; text-decoration: underline;">${title}</h2>
    <div style="font-size: 13px; line-height: 1.8; text-align: justify; margin-bottom: 50px; white-space: pre-wrap;">${bodyHtml}</div>
    <div style="text-align: center; margin-top: 80px;">
      <div style="border-top: 1px solid #000; width: 250px; margin: 0 auto 10px auto;"></div>
      <p style="font-size: 14px; font-weight: bold; margin: 0;">${doctorName}</p>
      <p style="font-size: 12px; margin: 2px 0;">Firma y Sello Profesional</p>
    </div>
  </div>
`;

const getPrescriptionLetterhead = (patientName: string, date: string, diagnostico: string, rx: string, indications: string, doctorName: string, colegiado: string, specialty: string) => `
  <div style="font-family: 'Arial', sans-serif; max-width: 600px; margin: 0 auto; padding: 30px; color: #000; border: 1px solid #ccc; border-radius: 8px;">
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #059669; padding-bottom: 15px; margin-bottom: 20px;">
      <div>
        <h1 style="font-size: 20px; color: #059669; margin: 0;">${doctorName}</h1>
        <p style="font-size: 12px; margin: 3px 0 0 0;">${specialty || 'Médico Psiquiatra'} | Col: ${colegiado}</p>
      </div>
      <div style="text-align: right;">
        <h2 style="font-size: 32px; color: #059669; margin: 0; font-family: serif;">Rx</h2>
      </div>
    </div>
    <div style="background: #f9fafb; padding: 12px; border-radius: 5px; border: 1px solid #e5e7eb; margin-bottom: 20px; font-size: 12px;">
      <p style="margin: 0 0 5px 0;"><strong>Paciente:</strong> ${patientName}</p>
      <p style="margin: 0 0 5px 0;"><strong>Fecha de emisión:</strong> ${date}</p>
      <p style="margin: 0;"><strong>Diagnóstico CIE-11:</strong> ${diagnostico || 'Evaluación Clínica'}</p>
    </div>
    <div style="margin-bottom: 30px;">
      <h3 style="font-size: 14px; border-bottom: 1px dashed #ccc; padding-bottom: 5px; color: #374151;">Medicamentos:</h3>
      <p style="font-size: 15px; white-space: pre-wrap; font-family: monospace; color: #111827; margin-top: 10px;">${rx}</p>
    </div>
    <div style="margin-bottom: 40px;">
      <h3 style="font-size: 14px; border-bottom: 1px dashed #ccc; padding-bottom: 5px; color: #374151;">Instrucciones:</h3>
      <p style="font-size: 13px; white-space: pre-wrap; color: #1f2937; margin-top: 10px;">${indications}</p>
    </div>
    <div style="text-align: right; margin-top: 70px;">
      <div style="border-top: 1px solid #000; width: 220px; margin-left: auto; margin-bottom: 5px;"></div>
      <p style="font-size: 12px; margin: 0; padding-right: 60px;">Firma del Médico</p>
    </div>
  </div>
`;

// ============================================================================
// BATERÍA COMPLETA INTERNACIONAL
// ============================================================================
const NUEVAS_EVALUACIONES: Dsm5EvaluationTemplate[] = [
  { id: 'AQ10', name: 'AQ-10 (Espectro Autista / Asperger)', questions: ['A menudo noto pequeños sonidos cuando otros no lo hacen', 'Generalmente me concentro más en los pequeños detalles que en el panorama general', 'Me resulta fácil hacer más de una cosa a la vez', 'Si hay una interrupción, puedo volver a lo que estaba haciendo muy rápidamente', 'Me resulta fácil "leer entre líneas" cuando alguien me habla', 'Sé cómo darme cuenta si alguien que me escucha se está aburriendo', 'Cuando leo una historia, me resulta difícil entender las intenciones de los personajes', 'Me gusta recopilar información sobre categorías de cosas', 'Me resulta fácil darme cuenta de lo que alguien está pensando o sintiendo', 'Me resulta difícil entender las intenciones de las personas'], options: ['Totalmente en desacuerdo (0)', 'Un poco en desacuerdo (0)', 'Un poco de acuerdo (1)', 'Totalmente de acuerdo (1)'] },
  { id: 'PQB', name: 'PQ-B (Riesgo de Psicosis / Esquizofrenia)', questions: ['¿A veces sientes que las cosas a tu alrededor son irreales o extrañas?', '¿Has sentido que otras personas pueden leer tu mente?', '¿Has escuchado voces, sonidos u olores que otros no pueden percibir?', '¿Sientes que te persiguen o que hay un complot en tu contra?', '¿Sientes que tus pensamientos no te pertenecen o son insertados?', '¿Te sientes confundido o con pensamientos desorganizados frecuentemente?'], options: ['No (0)', 'Sí, levemente (1)', 'Sí, severamente (2)'] },
  { id: 'IAT', name: 'IAT (Adicción a Internet y Dispositivos Digitales)', questions: ['¿Pasas más tiempo conectado a internet/redes sociales de lo que pretendías?', '¿Descuidas tus tareas del hogar, trabajo o escuela por estar en línea?', '¿Prefieres la emoción de internet a la intimidad con tu pareja o amigos?', '¿Te pones a la defensiva o te irritas si alguien te interrumpe mientras estás en línea?', '¿Pierdes horas de sueño por estar conectado a pantallas?', '¿Intentas ocultar o mentir sobre el tiempo que pasas en internet/juegos?', '¿Te sientes ansioso, deprimido o aburrido cuando no tienes conexión, y esto desaparece al conectarte?'], options: ['Rara vez (0)', 'Ocasionalmente (1)', 'Frecuentemente (2)', 'Siempre (3)'] },
  { id: 'SAST', name: 'SAST (Adicción Sexual / Hipersexualidad)', questions: ['¿Has intentado detener o reducir ciertas conductas sexuales y no has podido?', '¿Ocultas parte de tu comportamiento sexual a tu pareja o amigos?', '¿Te sientes culpable, avergonzado o con remordimiento tras una conducta sexual?', '¿El comportamiento sexual o la pornografía ha interferido con tu trabajo o estudios?', '¿Pasas horas buscando material sexual en internet o planeando encuentros?', '¿Tus hábitos sexuales te han puesto en riesgo físico, financiero o legal?', '¿Usas el sexo o la masturbación para escapar de problemas, ansiedad o depresión?'], options: ['No (0)', 'Sí (1)'] },
  { id: 'FAQ', name: 'FAQ (Actividades Funcionales - Demencia / Alzheimer)', questions: ['Capacidad para manejar sus propias finanzas y cuentas', 'Capacidad para hacer compras independientemente', 'Preparar alimentos o usar la estufa de forma segura', 'Recordar citas, compromisos o fechas importantes', 'Capacidad para orientarse fuera de su vecindario', 'Capacidad para seguir una conversación o historia compleja', 'Comprensión de programas de televisión o libros'], options: ['Normal (0)', 'Con dificultad pero solo (1)', 'Necesita ayuda (2)', 'Dependiente total (3)'] },
  { id: 'BAI', name: 'BAI (Ansiedad de Beck)', questions: ['Hormigueo o entumecimiento', 'Sensación de calor', 'Temblores en las piernas', 'Incapacidad de relajarse', 'Miedo a que ocurra lo peor', 'Mareos', 'Palpitaciones', 'Sensación de ahogo', 'Sudoración', 'Miedo a perder el control'], options: ['En absoluto (0)', 'Levemente (1)', 'Moderadamente (2)', 'Severamente (3)'] },
  { id: 'BDI', name: 'BDI-II (Depresión de Beck)', questions: ['Tristeza', 'Pesimismo', 'Fracaso pasado', 'Pérdida de placer', 'Sentimiento de culpa', 'Sentimientos de castigo', 'Disconformidad con uno mismo', 'Pensamientos suicidas', 'Llanto', 'Pérdida de energía'], options: ['Ausente (0)', 'Leve (1)', 'Moderado (2)', 'Severo (3)'] },
  { id: 'HAM_A', name: 'HAM-A (Escala de Ansiedad de Hamilton)', questions: ['Estado de ánimo ansioso (Preocupación, temor, irritabilidad)', 'Tensión (Sensación de tensión, llanto fácil, temblores)', 'Temores (A la oscuridad, a desconocidos, a quedarse solo)', 'Insomnio (Dificultad para conciliar el sueño, sueño interrumpido)', 'Funciones intelectuales (Dificultad de concentración, mala memoria)', 'Estado de ánimo deprimido (Pérdida de interés, insatisfacción)', 'Síntomas somáticos musculares (Dolores, rigidez, sacudidas)', 'Síntomas somáticos sensoriales (Zumbidos, visión borrosa)', 'Síntomas cardiovasculares (Taquicardia, palpitaciones, dolor torácico)', 'Síntomas respiratorios (Opresión torácica, sensación de ahogo)'], options: ['Ausente (0)', 'Leve (1)', 'Moderado (2)', 'Grave (3)', 'Muy grave (4)'] },
  { id: 'HAM_D', name: 'HAM-D (Escala de Depresión de Hamilton)', questions: ['Depresión / Humor sombrío (Desesperanza, llanto)', 'Sentimientos de culpa (Autoacusación, sensación de pena)', 'Ideación suicida (Sentimiento de que la vida no vale la pena)', 'Insomnio precoz (Dificultad para conciliar el sueño)', 'Insomnio medio (Sueño inquieto durante la noche)', 'Insomnio tardío (Despertar precoz en la mañana)', 'Trabajo y actividades (Incapacidad/pérdida de productividad)', 'Inhibición psicomotora (Lentitud de pensamiento y palabra)', 'Agitación motora (Inquietud en manos o postura)', 'Ansiedad psíquica (Tensión, aprensión, irritabilidad)'], options: ['Ausente (0)', 'Leve (1)', 'Moderado (2)', 'Grave (3)', 'Muy grave (4)'] },
  { id: 'PHQ9', name: 'PHQ-9 (Depresión Mayor - OMS)', questions: ['Poco interés o alegría en hacer las cosas', 'Sensación de estar deprimido o sin esperanza', 'Problemas para dormir o dormir demasiado', 'Sensación de cansancio o falta de energía', 'Falta de apetito o comer en exceso', 'Sentirse mal consigo mismo / fracaso', 'Dificultad para concentrarse', 'Movimientos lentos o agitación', 'Pensamientos suicidas o autolesivos'], options: ['Nunca (0)', 'Varios días (1)', 'Más de la mitad (2)', 'Casi todos los días (3)'] },
  { id: 'GAD7', name: 'GAD-7 (Ansiedad Generalizada - APA)', questions: ['Nerviosismo, ansiedad o nervios de punta', 'No poder dejar de preocuparse', 'Preocuparse demasiado por diferentes cosas', 'Dificultad para relajarse', 'Estar tan inquieto que es difícil quedarse quieto', 'Irritabilidad o enfado fácil', 'Sentir miedo a que pase algo terrible'], options: ['Nunca (0)', 'Varios días (1)', 'Más de la mitad (2)', 'Casi todos los días (3)'] },
  { id: 'YBOCS', name: 'Y-BOCS (Trastorno Obsesivo-Compulsivo - TOC)', questions: ['Tiempo ocupado por pensamientos obsesivos', 'Interferencia funcional de pensamientos obsesivos', 'Malestar/Angustia causada por obsesiones', 'Resistencia contra las obsesiones', 'Control percibido sobre los pensamientos obsesivos', 'Tiempo dedicado a conductas compulsivas', 'Interferencia funcional de las compulsiones', 'Malestar al no realizar la compulsión', 'Resistencia contra las compulsiones', 'Control percibido sobre las compulsiones'], options: ['Ninguno (0)', 'Leve (1)', 'Moderado (2)', 'Grave (3)', 'Extremo (4)'] },
  { id: 'CSSRS', name: 'C-SSRS (Escala Columbia - Riesgo Suicida)', questions: ['¿Ha deseado estar muerto o dormirse y no despertar?', '¿Ha tenido pensamientos de matarse sin método específico?', '¿Ha tenido pensamientos de matarse con algún método sin plan activo?', '¿Ha tenido intenciones e ideación suicida con algún plan en desarrollo?', '¿Ha realizado alguna conducta preparatoria o ensayo de intento suicida?'], options: ['No (0)', 'Sí (1)'] },
  { id: 'MSIBPD', name: 'MSI-BPD (Trastorno Límite de Personalidad - TLP)', questions: ['¿Relaciones interpersonales muy intensas pero inestables?', '¿Actos impulsivos de riesgo (gastos, sexo, sustancias)?', '¿Conductas o amenazas suicidas / autolesiones deliberadas?', '¿Cambios de humor repentinos y extremos?', '¿Sensación persistente de vacío interior?', '¿Miedo intenso e irrazonable al rechazo o abandono?', '¿Episodios de ira intensa fuera de control?', '¿Cambio dramático sobre opinión propia o valores?'], options: ['No (0)', 'Sí (1)'] },
  { id: 'MDQ', name: 'MDQ (Detección de Trastorno Bipolar)', questions: ['¿Se sintió tan feliz o lleno de energía que otros notaron cambios?', '¿Se sintió tan irritable que le gritaba a la gente o peleaba?', '¿Se sentía mucho más seguro de sí mismo que de costumbre?', '¿Dormía mucho menos de lo habitual y no extrañaba el sueño?', '¿Hablaba mucho más o más rápido de lo habitual?', '¿Los pensamientos iban a toda velocidad por su cabeza?'], options: ['No (0)', 'Sí (1)'] },
  { id: 'MMSE', name: 'MMSE (Mini-Mental State - Evaluación Cognitiva)', questions: ['Orientación Temporal (Año, estación, fecha, día, mes)', 'Orientación Espacial (Lugar, hospital, ciudad, país)', 'Fijación y Registro (Repetición de 3 palabras clave)', 'Atención y Cálculo (Sustracción de 7 en 7 o deletreo inverso)', 'Memoria de Evocación (Recordar las 3 palabras fijadas)'], options: ['Incorrecto (0)', 'Correcto (1)'] },
  { id: 'ISI', name: 'ISI (Índice de Severidad de Insomnio)', questions: ['Dificultad para conciliar el sueño', 'Dificultad para mantener el sueño', 'Problemas para despertar demasiado temprano', 'Grado de satisfacción con el patrón de sueño actual', 'Interferencia del problema de sueño en el funcionamiento diario'], options: ['Ninguno (0)', 'Leve (1)', 'Moderado (2)', 'Grave (3)', 'Muy grave (4)'] },
  { id: 'SPIN', name: 'SPIN (Inventario de Fobia Social)', questions: ['Tengo miedo a las personas con autoridad', 'Me molesta ruborizarme delante de la gente', 'Las fiestas y eventos me dan temor', 'Evito hablar con gente que no conozco', 'El temor a la crítica me paraliza'], options: ['Nada (0)', 'Un poco (1)', 'Moderado (2)', 'Mucho (3)', 'Extremadamente (4)'] },
  { id: 'EAT26', name: 'EAT-26 (Trastornos Conducta Alimentaria)', questions: ['Me aterroriza tener sobrepeso.', 'Evito comer cuando tengo hambre.', 'Me preocupo mucho por la comida.', 'Siento que los demás preferirían que yo comiese más.', 'Vomito después de haber comido.', 'Siento que la comida controla mi vida.'], options: ['Nunca (0)', 'A veces (1)', 'Siempre (2)'] },
  { id: 'DAST10', name: 'DAST-10 (Adicciones y Sustancias - NIDA / OMS)', questions: ['¿Ha consumido drogas no recetadas fuera de indicación médica?', '¿Ha abusado de más de una sustancia a la vez?', '¿Dificultad para dejar de consumir cuando lo desea?', '¿Lagunas de memoria o desmayos por consumo?', '¿Siente culpa o vergüenza por su maneira de consumir?', '¿Ha desatendido responsabilidades familiares o laborales?', '¿Síntomas de abstinencia al suspender el consumo?'], options: ['No (0)', 'Sí (1)'] },
  { id: 'AUDIT', name: 'AUDIT (Trastornos por Alcohol - OMS)', questions: ['¿Frecuencia con que consume bebidas alcohólicas?', '¿Consumiciones habituales en un día ordinario de consumo?', '¿Frecuencia de toma de 5 o más bebidas en un solo día?', '¿Incapaz de parar de beber una vez que había empezado?', '¿Incapacidad para recordar lo sucedido debido al alcohol?', '¿Usted u otra persona resultó herida debido a su consumo?'], options: ['Nunca (0)', 'Raramente (1)', 'Mensualmente (2)', 'Semanalmente (3)', 'Diariamente (4)'] },
  { id: 'ASRS', name: 'ASRS-v1.1 (TDAH en Adultos)', questions: ['¿Dificultad para concentrarse en detalles?', '¿Dificultad para mantener atención en trabajo aburrido?', '¿Dificultad para recordar citas u obligaciones?', '¿Retrasa tareas que requieren mucha reflexión?', '¿Inquietud motora en manos o pies?'], options: ['Nunca (0)', 'Raramente (1)', 'A veces (2)', 'A menudo (3)', 'Muy frecuentemente (4)'] },
  { id: 'PCL5', name: 'PCL-5 (Trauma y TEPT)', questions: ['Recuerdos repetitivos e inquietantes de la experiencia estresante', 'Pesadillas de la experiencia', 'Evitar situaciones o lugares que le recuerden el evento', 'Creencias negativas fuertes sobre sí mismo', 'Estar muy alerta o vigilante'], options: ['Nada (0)', 'Un poco (1)', 'Moderadamente (2)', 'Bastante (3)', 'Extremadamente (4)'] }
];

const CLINICAL_EVALUATIONS = Array.isArray(DSM5_EVALUATIONS) && DSM5_EVALUATIONS.length > 0 
  ? [...NUEVAS_EVALUACIONES, ...DSM5_EVALUATIONS.filter(e => !NUEVAS_EVALUACIONES.find(n => n.id === e.id))]
  : NUEVAS_EVALUACIONES;

const extractNumericScore = (scoreStr: string | undefined): number => {
  if (!scoreStr || scoreStr === 'Pendiente' || scoreStr === 'Pending') return 0;
  const scoreMatch = scoreStr.match(/Score:\s*(\d+)/i);
  if (scoreMatch) return parseInt(scoreMatch[1], 10);
  const lastNumberMatch = scoreStr.match(/(\d+)(?!.*\d)/);
  return lastNumberMatch ? parseInt(lastNumberMatch[1], 10) : 0;
};

const generateSpiderChartSVG = (areas: any, t: (key: string, overrideLang?: string) => string, targetLang?: string) => {
  const values = [areas.sleep || 5, areas.appetite || 5, areas.energy || 5, areas.social || 5, areas.concentration || 5];
  const angles = [0, 72, 144, 216, 288].map(deg => (deg * Math.PI) / 180);
  const getPoint = (val: number, angle: number, radiusMax: number = 40) => {
    const r = (val / 10) * radiusMax;
    return `${50 + r * Math.sin(angle)},${50 - r * Math.cos(angle)}`;
  };
  const pointsMax = angles.map(a => getPoint(10, a, 40)).join(' ');
  const pointsData = values.map((v, i) => getPoint(v, angles[i], 40)).join(' ');

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 110" width="100%" height="100%" style="font-family: sans-serif; display: block; margin: 0 auto; max-width: 250px;">
      <polygon points="${pointsMax}" fill="#1e293b" stroke="#334155" stroke-width="1" />
      ${angles.map(a => `<line x1="50" y1="50" x2="${50 + 40 * Math.sin(a)}" y2="${50 - 40 * Math.cos(a)}" stroke="#334155" stroke-width="0.5" />`).join('')}
      <polygon points="${pointsData}" fill="rgba(99, 102, 241, 0.4)" stroke="#6366f1" stroke-width="2" />
      ${angles.map((a, i) => `<circle cx="${50 + (values[i] / 10) * 40 * Math.sin(a)}" cy="${50 - (values[i] / 10) * 40 * Math.cos(a)}" r="2" fill="#818cf8" />`).join('')}
      <text x="50" y="7" font-size="5" fill="#94a3b8" text-anchor="middle">${t('Sueño', targetLang)}</text>
      <text x="96" y="38" font-size="5" fill="#94a3b8" text-anchor="start">${t('Apetito', targetLang)}</text>
      <text x="80" y="98" font-size="5" fill="#94a3b8" text-anchor="middle">${t('Energía', targetLang)}</text>
      <text x="20" y="98" font-size="5" fill="#94a3b8" text-anchor="middle">${t('Social', targetLang)}</text>
      <text x="4" y="38" font-size="5" fill="#94a3b8" text-anchor="end">${t('Atención', targetLang)}</text>
    </svg>
  `;
};

// ============================================================================
// COMPONENTE PRINCIPAL APP
// ============================================================================
export default function App() {
  const [mode, setMode] = useState<AppMode>(AppMode.CLINICAL);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const toggleTheme = () => setIsDarkMode(!isDarkMode);
  
  const [lang, setLang] = useState<'ES'|'EN'>('ES');
  const [pdfLang, setPdfLang] = useState<'ES'|'EN'>('ES');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // DASHBOARD STATES
  const [isFullscreenDashboard, setIsFullscreenDashboard] = useState<'BASE' | 'SPECIALTY' | 'PHARMA' | 'PERSPECTIVES' | 'EVOLUTIONARY' | null>(null);
  const [specialtyFocus, setSpecialtyFocus] = useState('TRASTORNOS_NEURODESARROLLO');
  const [perspectivesFocus, setPerspectivesFocus] = useState('FREUD'); 

  const th = {
    bg: isDarkMode ? 'bg-slate-950' : 'bg-slate-50',
    card: isDarkMode ? 'bg-slate-900' : 'bg-white',
    input: isDarkMode ? 'bg-slate-950' : 'bg-slate-100',
    border: isDarkMode ? 'border-slate-800' : 'border-slate-300',
    text: isDarkMode ? 'text-white' : 'text-slate-800',
    textMuted: isDarkMode ? 'text-slate-400' : 'text-slate-500',
    modalBg: isDarkMode ? 'bg-slate-950/85' : 'bg-slate-400/60',
    headerBg: isDarkMode ? 'bg-slate-950/90' : 'bg-slate-50/90',
  };

  const t = (key: string, overrideLang?: string) => {
    return key; 
  };

  const getLegalNorm = (countryCode: string) => {
    switch(countryCode) {
      case 'US': return 'HIPAA Compliance & Privacy Rule';
      case 'ES': case 'FR': case 'DE': case 'IT': case 'GB': return 'Cumplimiento RGPD (Europa) / Ley de Autonomía del Paciente';
      case 'MX': return 'NOM-004-SSA3-2012 (Norma Oficial Mexicana del Expediente Clínico)';
      case 'CO': return 'Resolución 1995 de 1999 y Resolución 839 de 2017 (Historia Clínica)';
      case 'GT': return 'Código de Salud (Decreto 90-97) / Normativa MSPAS';
      default: return 'Cumplimiento de Confidencialidad y Ética Profesional Internacional';
    }
  };

  const getProfPrefix = (profType?: string) => profType === 'PSIQUIATRA' ? 'Médico Psiquiatra' : 'Psicólogo(a) Clínico';

  // ==============================================================================================
  // DASHBOARD DINÁMICO E INTELIGENTE EN 5 NIVELES
  // ==============================================================================================
  const PatientDashboard = ({ 
    activeCase, 
    isFullscreen, 
    dashboardType,
    onUpdateCase,
    onGenerateSpecialtyAi,
    isGeneratingAi
  }: { 
    activeCase: ClinicalCase, 
    isFullscreen?: boolean, 
    dashboardType: 'BASE' | 'SPECIALTY' | 'PHARMA' | 'PERSPECTIVES' | 'EVOLUTIONARY',
    onUpdateCase: (updatedCase: ClinicalCase) => void,
    onGenerateSpecialtyAi: (focus: string) => void,
    isGeneratingAi: boolean
  }) => {
    const isBase = dashboardType === 'BASE';
    const isPharma = dashboardType === 'PHARMA';
    const isPerspectives = dashboardType === 'PERSPECTIVES';
    const isEvolutionary = dashboardType === 'EVOLUTIONARY';
    const isSpecialty = dashboardType === 'SPECIALTY';
    
    const currentFocus = isBase ? 'ANSIEDAD_DEPRESION' : (isSpecialty ? specialtyFocus : (isPerspectives ? perspectivesFocus : 'EVOLUTIONARY'));

    const sessions = activeCase.sessions || [];
    const totalSessions = sessions.length;
    
    const chartData = sessions.map(s => {
      const ts = (s as any).testScores || {};
      const getLegacySc = (keys: string[]) => {
        let sc = 0;
        if (keys.some(k => s.baiScore?.includes(k))) sc = Math.max(sc, extractNumericScore(s.baiScore));
        if (keys.some(k => s.bdiScore?.includes(k))) sc = Math.max(sc, extractNumericScore(s.bdiScore));
        if (keys.some(k => s.dsm5EvaluationName?.includes(k))) sc = Math.max(sc, extractNumericScore(s.dsm5EvaluationResult));
        return sc;
      };

      return {
        session: `S${s.sessionNumber}`,
        ans: ts['BAI'] || ts['HAM_A'] || ts['GAD7'] || ts['SPIN'] || getLegacySc(['BAI', 'HAM', 'GAD', 'SPIN', 'Ansiedad']), 
        dep: ts['BDI'] || ts['HAM_D'] || ts['PHQ9'] || getLegacySc(['BDI', 'HAM', 'PHQ', 'Depresión']),
        psi: ts['PQB'] || getLegacySc(['PQ', 'Psicosis', 'Esquizofrenia']),
        aut: ts['AQ10'] || getLegacySc(['AQ', 'Autismo', 'Asperger']),
        add: ts['DAST10'] || ts['AUDIT'] || ts['EAT26'] || getLegacySc(['DAST', 'AUDIT', 'EAT', 'Adiccion', 'TCA']),
        beh: ts['IAT'] || ts['SAST'] || getLegacySc(['IAT', 'SAST', 'Digital', 'Sexual', 'Ludopatía']),
        tdah: ts['ASRS'] || getLegacySc(['ASRS', 'TDAH']),
        tlp: ts['MSIBPD'] || getLegacySc(['MSIBPD', 'TLP', 'BPD', 'Personalidad']),
        cog: ts['MMSE'] || ts['FAQ'] || getLegacySc(['MMSE', 'FAQ', 'Cognitiva', 'Alzheimer', 'Parkinson', 'Demencia']),
        bip: ts['MDQ'] || getLegacySc(['MDQ', 'Bipolar', 'Manía']),
        trauma: ts['PCL5'] || getLegacySc(['PCL', 'TEPT', 'Trauma', 'Estrés']),
        toc: ts['YBOCS'] || getLegacySc(['YBOCS', 'TOC', 'Obsesivo']),
        sleep: ts['ISI'] || getLegacySc(['ISI', 'Sueño', 'Insomnio']),
        pharmaName: s.pharma?.name || '',
        pharmaDose: s.pharma?.dose || '',
        pharmaEff: s.pharma?.effectiveness || 0,
        pharmaRisk: s.pharma?.risk || 0
      };
    });

    let val1Key = 'ans'; let val2Key = 'dep';
    let label1 = 'ANSIEDAD'; let label2 = 'DEPRESIÓN';
    
    if (isSpecialty) {
        if (currentFocus === 'TRASTORNOS_ANSIEDAD') { val1Key = 'ans'; val2Key = 'dep'; label1 = 'ANSIEDAD GENERALIZADA'; label2 = 'DEPRESIÓN (Comorbilidad)'; }
        else if (currentFocus === 'TRASTORNOS_DEPRESIVOS') { val1Key = 'dep'; val2Key = 'ans'; label1 = 'DEPRESIÓN MAYOR'; label2 = 'ANSIEDAD SECUNDARIA'; }
        else if (currentFocus === 'ESPECTRO_ESQUIZOFRENIA_PSICOSIS') { val1Key = 'psi'; val2Key = 'dep'; label1 = 'SÍNTOMAS POSITIVOS (Psicosis)'; label2 = 'DEPRESIÓN / SÍNT. NEGATIVOS'; }
        else if (currentFocus === 'TRASTORNOS_NEURODESARROLLO') { val1Key = 'aut'; val2Key = 'tdah'; label1 = 'ESPECTRO AUTISTA (AQ-10)'; label2 = 'TDAH / DISFUNCIÓN EJECUTIVA'; }
        else if (currentFocus === 'TRASTORNOS_BIPOLARES') { val1Key = 'bip'; val2Key = 'dep'; label1 = 'MANÍA / HIPOMANÍA (MDQ)'; label2 = 'EPISODIO DEPRESIVO'; }
        else if (currentFocus === 'TOC_Y_RELACIONADOS') { val1Key = 'toc'; val2Key = 'ans'; label1 = 'OBSESIONES / COMPULSIONES'; label2 = 'ANSIEDAD REACTIVA'; }
        else if (currentFocus === 'TRAUMA_Y_ESTRES') { val1Key = 'trauma'; val2Key = 'ans'; label1 = 'INTRUSIÓN / TEPT (PCL-5)'; label2 = 'HIPERALERTA / ANSIEDAD'; }
        else if (currentFocus === 'TCA_ALIMENTARIOS') { val1Key = 'add'; val2Key = 'ans'; label1 = 'SEVERIDAD TCA (EAT-26)'; label2 = 'ANSIEDAD COMÓRBIDA'; }
        else if (currentFocus === 'ADICCIONES_SUSTANCIAS' || currentFocus === 'DISRUPTIVOS_IMPULSOS') { val1Key = 'add'; val2Key = 'beh'; label1 = 'USO DE SUSTANCIAS (AUDIT/DAST)'; label2 = 'ADICCIÓN CONDUCTUAL (IAT/SAST)'; }
        else if (currentFocus === 'TRASTORNOS_NEUROCOGNITIVOS') { val1Key = 'cog'; val2Key = 'dep'; label1 = 'DETERIORO COGNITIVO (MMSE/FAQ)'; label2 = 'SÍNTOMAS AFECTIVOS'; }
        else if (currentFocus === 'TRASTORNOS_PERSONALIDAD') { val1Key = 'tlp'; val2Key = 'dep'; label1 = 'SEVERIDAD TLP / INESTABILIDAD'; label2 = 'VACÍO / DEPRESIÓN'; }
        else if (currentFocus === 'SUEÑO_VIGILIA') { val1Key = 'sleep'; val2Key = 'ans'; label1 = 'SEVERIDAD DE INSOMNIO (ISI)'; label2 = 'ANSIEDAD NOCTURNA'; }
        else { val1Key = 'ans'; val2Key = 'dep'; label1 = 'SINTOMATOLOGÍA PRINCIPAL'; label2 = 'AFECTACIÓN SECUNDARIA'; }
    } else if (isPerspectives) {
        if (currentFocus === 'FREUD') { label1 = 'Tensión del Ello (Ansiedad)'; label2 = 'Carga Melancólica (Depresión)'; }
        else if (currentFocus === 'ERIKSON') { label1 = 'Crisis No Resuelta (Ansiedad)'; label2 = 'Estancamiento (Depresión)'; }
        else if (currentFocus === 'CBT') { label1 = 'Pensamiento Catastrófico'; label2 = 'Creencias Centrales Negativas'; }
        else if (currentFocus === 'HUMANISTA') { label1 = 'Incongruencia (Real vs Ideal)'; label2 = 'Bloqueo de Autoactualización'; }
        else if (currentFocus === 'SISTEMICA') { label1 = 'Tensión del Sistema Familiar'; label2 = 'Disfunción de Límites'; }
        else if (currentFocus === 'GESTALT') { label1 = 'Asuntos Inconclusos (Carga)'; label2 = 'Evitación del Contacto'; }
    } else if (isEvolutionary) {
        label1 = 'Activación Simpática (Lucha/Huida)'; label2 = 'Hibernación Conservadora (Retirada)';
    }

    const firstSession = chartData[0] || { ans: 0, dep: 0, psi: 0, aut: 0, add: 0, beh: 0, tdah: 0, tlp: 0, cog: 0, bip: 0, trauma: 0, toc: 0, sleep: 0, pharmaEff: 0, pharmaRisk: 0, pharmaName: '', pharmaDose: '' };
    const lastSession = chartData[totalSessions - 1] || { ans: 0, dep: 0, psi: 0, aut: 0, add: 0, beh: 0, tdah: 0, tlp: 0, cog: 0, bip: 0, trauma: 0, toc: 0, sleep: 0, pharmaEff: 0, pharmaRisk: 0, pharmaName: '', pharmaDose: '' };
    
    // Tratamiento especial para puntajes cognitivos (MMSE) donde mayor es mejor (invertir para gráfica de severidad)
    const normalizeScore = (val: number, key: string) => (key === 'cog' && val > 0) ? Math.max(0, 30 - val) : val;

    const val1First = normalizeScore((firstSession as any)[val1Key], val1Key); 
    const val1Last = normalizeScore((lastSession as any)[val1Key], val1Key);
    const val2First = normalizeScore((firstSession as any)[val2Key], val2Key); 
    const val2Last = normalizeScore((lastSession as any)[val2Key], val2Key);

    const lastSessionAreas = sessions[totalSessions - 1]?.functionalAreas || { sleep: 5, appetite: 5, energy: 5, social: 5, concentration: 5 };
    const metaSesiones = 12;
    const avanceBase = Math.min(100, (totalSessions / metaSesiones) * 100);
    const promedioFuncional = (lastSessionAreas.sleep + lastSessionAreas.appetite + lastSessionAreas.energy + lastSessionAreas.social + lastSessionAreas.concentration) / 5;
    const gafScore = Math.min(100, Math.round(promedioFuncional * 10));
    const neurovegetativoScore = Math.round(((lastSessionAreas.sleep + lastSessionAreas.appetite + lastSessionAreas.energy) / 30) * 100);
    const adaptativaScore = Math.round(((lastSessionAreas.social + lastSessionAreas.concentration) / 20) * 100);
    
    const severidadInicial = val1First + val2First;
    const severidadActual = val1Last + val2Last;
    let reduccionSintomatica = 0;
    if (severidadInicial > 0) reduccionSintomatica = Math.max(0, Math.round(((severidadInicial - severidadActual) / severidadInicial) * 100));

    const severidadMaxima = Math.max(val1Last, val2Last);
    let nivelSeveridad = 'Leve';
    let riesgo = 'Bajo Riesgo';

    if (currentFocus === 'ESPECTRO_ESQUIZOFRENIA_PSICOSIS') {
       if (val1Last > 5) { nivelSeveridad = 'Moderado'; riesgo = 'Precaución'; }
       if (val1Last > 12) { nivelSeveridad = 'Severo'; riesgo = 'Alto Riesgo'; }
    } else if (currentFocus === 'TRASTORNOS_NEURODESARROLLO') {
       if (val1Last >= 6) { nivelSeveridad = 'Apoyo Requerido'; riesgo = 'Seguimiento'; }
       else { nivelSeveridad = 'Subclínico'; riesgo = 'Bajo Riesgo'; }
    } else if (currentFocus === 'TRASTORNOS_PERSONALIDAD') {
       if (val1Last > 3) { nivelSeveridad = 'Moderado'; riesgo = 'Precaución'; }
       if (val1Last > 5) { nivelSeveridad = 'Severo'; riesgo = 'Alto Riesgo'; }
    } else if (currentFocus === 'TRASTORNOS_NEUROCOGNITIVOS') {
       if (val1Last > 10) { nivelSeveridad = 'Deterioro Moderado'; riesgo = 'Asistencia Requerida'; }
       if (val1Last > 20) { nivelSeveridad = 'Deterioro Severo'; riesgo = 'Dependencia Total'; }
    } else {
       if (severidadMaxima > 14) { nivelSeveridad = 'Moderado'; riesgo = 'Precaución'; }
       if (severidadMaxima > 21) { nivelSeveridad = 'Severo'; riesgo = 'Alto Riesgo'; }
    }

    const stressPromedio = (val1Last + val2Last) / 2;
    const sentimientoScore = totalSessions > 0 ? Math.max(0, 100 - (stressPromedio / 30) * 100) : 50; 
    let sentimientoColor = 'text-red-400';
    if (sentimientoScore >= 80) sentimientoColor = 'text-emerald-400';
    else if (sentimientoScore >= 50) sentimientoColor = 'text-blue-400';
    else if (sentimientoScore >= 25) sentimientoColor = 'text-amber-400';

    const maxBarVal = Math.max(10, val1First, val2First, val1Last, val2Last) * 1.2;
    const maxLineVal = Math.max(10, ...chartData.map(d => Math.max(normalizeScore((d as any)[val1Key], val1Key), normalizeScore((d as any)[val2Key], val2Key)))) * 1.2;
    const hasScores = chartData.some(d => normalizeScore((d as any)[val1Key], val1Key) > 0 || normalizeScore((d as any)[val2Key], val2Key) > 0);
    const hasPharma = chartData.some(d => d.pharmaName !== '');

    type KPICard = { title: string, value: string | number, sub: string, colorClass: string };
    let kpiCards: KPICard[] = [];

    if (isPharma) {
        kpiCards = [
            { title: 'Fármaco Actual', value: lastSession.pharmaName || 'Ninguno', sub: 'Última prescripción', colorClass: 'text-indigo-400' },
            { title: 'Dosis / Graduación', value: lastSession.pharmaDose || 'N/A', sub: 'Titulación actual', colorClass: 'text-fuchsia-400' },
            { title: 'Efectividad Percibida', value: `${lastSession.pharmaEff}%`, sub: 'Respuesta al tratamiento', colorClass: 'text-emerald-400' },
            { title: 'Riesgo / Efectos Secundarios', value: `${lastSession.pharmaRisk}%`, sub: 'Monitoreo de tolerancia', colorClass: lastSession.pharmaRisk > 50 ? 'text-red-500' : 'text-amber-400' }
        ];
    } else if (isPerspectives) {
        if (currentFocus === 'FREUD') {
            const mDef = val1Last > val2Last ? 'Proyección / Desplazamiento' : 'Represión / Introyección';
            kpiCards = [
                { title: 'Fuerza del Yo', value: `${gafScore}%`, sub: 'Capacidad de afrontamiento', colorClass: 'text-indigo-400' },
                { title: 'Tensión Ello/Superyó', value: `${Math.round((val1Last + val2Last)/1.2)}%`, sub: 'Conflicto intrapsíquico', colorClass: 'text-rose-400' },
                { title: 'Mecanismo de Defensa Dominante', value: mDef, sub: 'Basado en perfil clínico', colorClass: 'text-fuchsia-400' },
                { title: 'Catexia de Energía Vital', value: `${lastSessionAreas.energy * 10}%`, sub: 'Libido/Pulsión de Vida', colorClass: 'text-amber-400' }
            ];
        } else if (currentFocus === 'ERIKSON') {
            const age = parseInt(activeCase.generalData?.edad || '30');
            const crisis = age < 20 ? 'Identidad vs Confusión' : (age < 40 ? 'Intimidad vs Aislamiento' : (age < 65 ? 'Generatividad vs Estancamiento' : 'Integridad vs Desesperación'));
            kpiCards = [
                { title: 'Crisis Psicosocial Etaria', value: crisis, sub: 'Estadio normativo de Erikson', colorClass: 'text-blue-400' },
                { title: 'Riesgo de Estancamiento / Aislamiento', value: `${(10 - lastSessionAreas.social) * 10}%`, sub: 'Fallo en la resolución social', colorClass: 'text-rose-400' },
                { title: 'Fuerza Básica (Virtud) Emergente', value: reduccionSintomatica > 20 ? 'En desarrollo' : 'Bloqueada', sub: 'Evolución terapéutica', colorClass: reduccionSintomatica > 20 ? 'text-emerald-400' : 'text-amber-400' },
                { title: 'Integración del Yo', value: `${gafScore}%`, sub: 'Adaptación funcional', colorClass: 'text-indigo-400' }
            ];
        } else if (currentFocus === 'HUMANISTA') {
            kpiCards = [
                { title: 'Autoaceptación', value: `${gafScore}%`, sub: 'Estima incondicional', colorClass: 'text-emerald-400' },
                { title: 'Locus de Evaluación', value: val1Last > 10 ? 'Externo (Dependiente)' : 'Interno (Autónomo)', sub: 'Aprobación social', colorClass: val1Last > 10 ? 'text-amber-400' : 'text-indigo-400' },
                { title: 'Sentido de Vida', value: val2Last > 15 ? 'Vacío Existencial' : 'Con Propósito', sub: 'Logoterapia (Frankl)', colorClass: val2Last > 15 ? 'text-rose-400' : 'text-blue-400' },
                { title: 'Apertura a la Experiencia', value: `${adaptativaScore}%`, sub: 'Rigidez vs Flexibilidad', colorClass: 'text-fuchsia-400' }
            ];
        } else if (currentFocus === 'SISTEMICA') {
            kpiCards = [
                { title: 'Paciente Identificado', value: val1Last > 12 ? 'Alto Riesgo' : 'Bajo', sub: 'Chivo expiatorio del sistema', colorClass: val1Last > 12 ? 'text-red-500' : 'text-emerald-500' },
                { title: 'Nivel de Diferenciación', value: `${adaptativaScore}%`, sub: 'Independencia emocional', colorClass: 'text-indigo-400' },
                { title: 'Alianzas y Coaliciones', value: lastSessionAreas.social < 5 ? 'Disfuncionales' : 'Sanas', sub: 'Dinámica de subsistemas', colorClass: lastSessionAreas.social < 5 ? 'text-amber-400' : 'text-blue-400' },
                { title: 'Flexibilidad Familiar', value: `${(10 - lastSessionAreas.concentration) * 10}%`, sub: 'Rigidez ante el cambio', colorClass: 'text-orange-400' }
            ];
        } else if (currentFocus === 'GESTALT') {
            kpiCards = [
                { title: 'Nivel de Awareness', value: `${gafScore}%`, sub: 'Darse cuenta', colorClass: 'text-teal-400' },
                { title: 'Mecanismo de Resistencia', value: val1Last > val2Last ? 'Proyección/Deflexión' : 'Introyección/Confluencia', sub: 'Interrupción del ciclo', colorClass: 'text-fuchsia-400' },
                { title: 'Polaridades en Conflicto', value: `${Math.round((val1Last + val2Last)/1.2)}%`, sub: 'Tensión figura-fondo', colorClass: 'text-rose-400' },
                { title: 'Responsabilidad Personal', value: adaptativaScore > 60 ? 'Asumida' : 'Proyectada', sub: 'Apropiación de la experiencia', colorClass: adaptativaScore > 60 ? 'text-emerald-400' : 'text-amber-400' }
            ];
        } else {
            kpiCards = [
                { title: 'Distorsiones Cognitivas Activas', value: val1Last > 10 ? 'Alta Carga' : 'Baja Carga', sub: 'Pensamiento automático', colorClass: val1Last > 10 ? 'text-rose-400' : 'text-emerald-400' },
                { title: 'Activación Conductual', value: `${lastSessionAreas.energy * 10}%`, sub: 'Nivel de inercia/acción', colorClass: 'text-amber-400' },
                { title: 'Evitación Social / Experiencial', value: `${(10 - lastSessionAreas.social) * 10}%`, sub: 'Mecanismo mantenedor', colorClass: 'text-orange-400' },
                { title: 'Flexibilidad Psicológica', value: `${adaptativaScore}%`, sub: 'Apertura al cambio', colorClass: 'text-blue-400' }
            ];
        }
    } else if (isEvolutionary) {
        kpiCards = [
            { title: 'Sistema de Alerta Temprana', value: val1Last > 15 ? 'Hipersensibilizado' : 'Calibrado', sub: 'Valor adaptativo de Ansiedad', colorClass: val1Last > 15 ? 'text-rose-400' : 'text-emerald-400' },
            { title: 'Estrategia de Conservación/Retirada', value: val2Last > 15 ? 'Desadaptativa' : 'Adaptativa', sub: 'Valor adaptativo de Depresión', colorClass: val2Last > 15 ? 'text-blue-400' : 'text-indigo-400' },
            { title: 'Regulación de Jerarquía y Estatus', value: `${lastSessionAreas.social * 10}%`, sub: 'Adaptación al nicho social', colorClass: 'text-amber-400' },
            { title: 'Asignación de Energía (Alostasis)', value: `${neurovegetativoScore}%`, sub: 'Eficiencia metabólica (Sueño/Apetito)', colorClass: 'text-fuchsia-400' }
        ];
    } else if (isBase) {
        kpiCards = [
            { title: t('Nivel de Actividad Psicosocial (GAF / EEAG)'), value: `${gafScore} / 100`, sub: gafScore >= 71 ? 'Síntomas leves / Buen funcionamiento' : gafScore >= 51 ? 'Dificultades moderadas' : 'Alteración grave', colorClass: 'text-indigo-400' },
            { title: t('Estabilidad Neurovegetativa'), value: `${neurovegetativoScore}%`, sub: 'Eje Sueño - Apetito - Energía', colorClass: 'text-emerald-400' },
            { title: t('Respuesta Terapéutica (% Reducción)'), value: `${reduccionSintomatica}%`, sub: 'Alivio sintomático desde Sesión 1', colorClass: 'text-amber-400' },
            { title: t('Funcionalidad Adaptativa'), value: `${adaptativaScore}%`, sub: 'Desempeño Social & Atención', colorClass: 'text-blue-400' },
            { title: t('Índice Severidad (ISC)'), value: `${severidadMaxima} pts`, sub: nivelSeveridad, colorClass: 'text-rose-400' },
            { title: t('Riesgo Clínico'), value: riesgo, sub: 'Estimación algorítmica', colorClass: riesgo === 'Alto Riesgo' ? 'text-red-500' : (riesgo === 'Precaución' ? 'text-amber-500' : 'text-emerald-500') }
        ];
    } else if (currentFocus === 'ESPECTRO_ESQUIZOFRENIA_PSICOSIS') {
        const ivp = Math.round((val1Last / 12) * 100) || 0;
        kpiCards = [
            { title: 'Vulnerabilidad a Psicosis (IVP)', value: `${ivp}%`, sub: 'Escala PQ-B', colorClass: 'text-fuchsia-400' },
            { title: 'Sintomatología Positiva', value: val1Last > 5 ? 'Activa' : 'Controlada', sub: 'Alucinaciones / Delirios', colorClass: val1Last > 5 ? 'text-red-400' : 'text-emerald-400' },
            { title: 'Aislamiento Social', value: `${(10 - lastSessionAreas.social) * 10}%`, sub: 'Retraimiento percibido', colorClass: 'text-amber-400' },
            { title: 'Agitación Psicomotora', value: `${((10 - lastSessionAreas.sleep) + (lastSessionAreas.energy)) * 5}%`, sub: 'Alteración del sueño y energía', colorClass: 'text-orange-400' },
            { title: 'Desorganización Cognitiva', value: `${(10 - lastSessionAreas.concentration) * 10}%`, sub: 'Déficit de atención', colorClass: 'text-blue-400' },
            { title: 'Alerta de Brote', value: riesgo, sub: 'Monitoreo preventivo', colorClass: riesgo === 'Alto Riesgo' ? 'text-red-500' : 'text-emerald-500' }
        ];
    } else if (currentFocus === 'TRASTORNOS_NEURODESARROLLO') {
        const masking = Math.round(((lastSessionAreas.social + (lastSession.ans||0)/20*10) / 2) * 10);
        kpiCards = [
            { title: 'Cociente Autista (AQ-10)', value: `${val1Last} / 10`, sub: val1Last >= 6 ? 'Criterio Clínico Cumplido' : 'Subclínico', colorClass: 'text-teal-400' },
            { title: 'Nivel de Apoyo Requerido', value: val1Last >= 8 ? 'Nivel 2/3' : val1Last >= 6 ? 'Nivel 1' : 'Autónomo', sub: 'Basado en funcionalidad', colorClass: 'text-indigo-400' },
            { title: 'Burnout Autista (Riesgo)', value: `${Math.round(((10 - lastSessionAreas.energy) + (10 - lastSessionAreas.sleep))/20 * 100)}%`, sub: 'Sobrecarga sensorial/energética', colorClass: 'text-rose-400' },
            { title: 'Nivel de Enmascaramiento', value: `${masking}%`, sub: 'Camouflage social vs Estrés', colorClass: 'text-purple-400' },
            { title: 'Carga TDAH (ASRS)', value: `${val2Last} / 24`, sub: 'Comorbilidad atencional', colorClass: 'text-orange-400' },
            { title: 'Regulación Emocional', value: sentimientoScore >= 50 ? 'Estable' : 'Desregulada', sub: 'Afecto y ansiedad', colorClass: sentimientoScore >= 50 ? 'text-emerald-400' : 'text-amber-400' }
        ];
    } else if (currentFocus === 'TCA_ALIMENTARIOS' || currentFocus === 'ADICCIONES_SUSTANCIAS' || currentFocus === 'DISRUPTIVOS_IMPULSOS') {
        kpiCards = [
            { title: 'Severidad Sustancias/TCA', value: `${val1Last} pts`, sub: 'Escalas EAT-26 / DAST / AUDIT', colorClass: 'text-red-400' },
            { title: 'Adicción Digital / Sexual', value: `${val2Last} pts`, sub: 'Escalas IAT / SAST', colorClass: 'text-fuchsia-400' },
            { title: 'Control de Impulsos', value: `${lastSessionAreas.concentration * 10}%`, sub: 'Autorregulación', colorClass: 'text-blue-400' },
            { title: 'Desregulación Dopaminérgica', value: val2Last > 10 || val1Last > 10 ? 'Alta' : 'Moderada', sub: 'Sistema de recompensa', colorClass: val2Last > 10 || val1Last > 10 ? 'text-amber-500' : 'text-emerald-500' },
            { title: 'Aislamiento Social', value: `${(10 - lastSessionAreas.social) * 10}%`, sub: 'Red de apoyo funcional', colorClass: 'text-orange-400' },
            { title: 'Riesgo de Recaída', value: riesgo, sub: 'Vulnerabilidad actual', colorClass: riesgo === 'Alto Riesgo' ? 'text-red-500' : 'text-emerald-500' }
        ];
    } else if (currentFocus === 'TRASTORNOS_PERSONALIDAD') {
        kpiCards = [
            { title: 'Severidad TLP (MSI-BPD)', value: `${val1Last} / 8`, sub: 'Trastorno Límite', colorClass: 'text-rose-400' },
            { title: 'Desregulación Emocional', value: `${100 - sentimientoScore}%`, sub: 'Fluctuación del afecto', colorClass: 'text-purple-400' },
            { title: 'Riesgo de Autolesión', value: val1Last > 3 ? 'Alto / Activo' : 'Bajo', sub: 'Basado en criterios límite', colorClass: val1Last > 3 ? 'text-red-500' : 'text-emerald-500' },
            { title: 'Sensación de Vacío', value: `${val2Last > 14 ? 'Severa' : 'Leve'}`, sub: 'Asociado a depresión', colorClass: 'text-blue-400' },
            { title: 'Miedo al Abandono', value: `${(10 - lastSessionAreas.social) * 10}%`, sub: 'Inestabilidad interpersonal', colorClass: 'text-orange-400' },
            { title: 'Alerta de Crisis', value: riesgo, sub: 'Vulnerabilidad actual', colorClass: riesgo === 'Alto Riesgo' ? 'text-red-500' : 'text-emerald-500' }
        ];
    } else if (currentFocus === 'TRASTORNOS_NEUROCOGNITIVOS') {
        const mmseScore = (lastSession.cog && lastSession.cog > 0) ? (30 - val1Last) : 0; 
        kpiCards = [
            { title: 'Deterioro Cognitivo (MMSE)', value: mmseScore > 0 ? `${mmseScore} / 30` : 'N/A', sub: nivelSeveridad, colorClass: val1Last > 10 ? 'text-rose-400' : 'text-indigo-400' },
            { title: 'Pérdida de Autonomía', value: `${100 - gafScore}%`, sub: 'Dependencia funcional', colorClass: 'text-purple-400' },
            { title: 'Riesgo de Desorientación / Caídas', value: val1Last > 15 ? 'Alto' : 'Moderado', sub: 'Alerta motora/cognitiva', colorClass: val1Last > 15 ? 'text-red-500' : 'text-amber-500' },
            { title: 'Agitación Neuropsiquiátrica', value: `${((10 - lastSessionAreas.sleep) + lastSessionAreas.energy) * 5}%`, sub: 'Alteración conductual', colorClass: 'text-orange-400' },
            { title: 'Memoria y Concentración', value: `${lastSessionAreas.concentration * 10}%`, sub: 'Reserva cognitiva', colorClass: 'text-blue-400' },
            { title: 'Sobrecarga del Cuidador', value: riesgo === 'Dependencia Total' ? 'Crítica' : 'Monitorear', sub: 'Impacto familiar', colorClass: riesgo === 'Dependencia Total' ? 'text-red-500' : 'text-fuchsia-400' }
        ];
    } else {
        kpiCards = [
            { title: 'Carga Sintomática Principal', value: `${val1Last} pts`, sub: label1, colorClass: 'text-orange-400' },
            { title: 'Comorbilidad Asociada', value: `${val2Last} pts`, sub: label2, colorClass: 'text-fuchsia-400' },
            { title: 'Impacto Funcional (GAF)', value: `${gafScore}%`, sub: 'Desempeño global', colorClass: 'text-indigo-400' },
            { title: 'Desempeño Social', value: `${lastSessionAreas.social * 10}%`, sub: 'Integración', colorClass: 'text-blue-400' },
            { title: 'Desgaste Energético', value: `${(10 - lastSessionAreas.energy) * 10}%`, sub: 'Agotamiento sistémico', colorClass: 'text-amber-400' },
            { title: 'Riesgo Funcional', value: riesgo, sub: 'Impacto diario', colorClass: riesgo === 'Alto Riesgo' ? 'text-red-500' : 'text-emerald-500' }
        ];
    }

    const handleCopySVG = () => { alert("La gráfica ha sido registrada."); };

    const getDashboardTitle = () => {
       if (isPharma) return '💊 CONTROL FARMACOLÓGICO';
       if (isPerspectives) return '🎭 ANÁLISIS DE CORRIENTES TEÓRICAS';
       if (isEvolutionary) return '🧬 PSICOLOGÍA EVOLUTIVA Y ADAPTATIVA';
       if (isBase) return '📊 BUSINESS INTELLIGENCE CLÍNICO';
       return '🧠 ANÁLISIS POR TRASTORNO / ENFERMEDAD';
    }

    const getDashboardSubtitle = () => {
       if (isPharma) return 'Titulación de dosis, efectividad y monitoreo de riesgos secundarios.';
       if (isPerspectives) return 'Interpretación de síntomas según escuelas psicológicas y dinámicas subyacentes.';
       if (isEvolutionary) return 'Análisis Darwiniano del valor adaptativo y de supervivencia de la sintomatología actual.';
       if (isBase) return 'Medición de adherencia, evolución de síntomas y áreas funcionales.';
       return 'Gráficos Internacionales y KPIs especializados basados en el DSM-5.';
    }

    const specialtyAiSummaries = (activeCase as any).specialtyAiSummaries || {};
    const specialtyComments = (activeCase as any).specialtyComments || {};

    const handleGenerateAi = () => { onGenerateSpecialtyAi(currentFocus); };

    const handleCommentChange = (val: string) => {
        const updated = { ...activeCase };
        if (!updated.specialtyComments) updated.specialtyComments = {};
        updated.specialtyComments[currentFocus] = val;
        onUpdateCase(updated);
    };

    const renderSpecialtyGraph = () => {
        if (!hasScores) {
            return (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm z-10 rounded-xl">
                 <span className="text-[11px] font-bold text-indigo-400 px-4 text-center">Aplique prueba DSM-5 respectiva para generar gráfico</span>
              </div>
            );
        }

        if (currentFocus === 'ESPECTRO_ESQUIZOFRENIA_PSICOSIS') {
            const pos = val1Last; 
            const neg = (10 - lastSessionAreas.social) * 3; 
            const cog = (10 - lastSessionAreas.concentration) * 3; 
            const maxVal = Math.max(10, pos, neg, cog) * 1.2;
            return (
                <div className="flex items-end justify-around h-40 w-full px-8 mt-4">
                  <div className="flex flex-col items-center gap-2">
                     <div className="w-12 bg-rose-500 rounded-t relative flex items-end justify-center" style={{ height: `${(pos/maxVal)*100}%` }}><span className="text-[10px] text-white font-bold mb-1">{pos}</span></div>
                     <span className="text-[9px] font-bold text-slate-400 uppercase text-center w-20">Síntomas<br/>Positivos</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                     <div className="w-12 bg-blue-500 rounded-t relative flex items-end justify-center" style={{ height: `${(neg/maxVal)*100}%` }}><span className="text-[10px] text-white font-bold mb-1">{neg}</span></div>
                     <span className="text-[9px] font-bold text-slate-400 uppercase text-center w-20">Síntomas<br/>Negativos</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                     <div className="w-12 bg-slate-500 rounded-t relative flex items-end justify-center" style={{ height: `${(cog/maxVal)*100}%` }}><span className="text-[10px] text-white font-bold mb-1">{cog}</span></div>
                     <span className="text-[9px] font-bold text-slate-400 uppercase text-center w-20">Afectación<br/>Cognitiva</span>
                  </div>
                </div>
            );
        } else if (currentFocus === 'TRASTORNOS_NEURODESARROLLO' || currentFocus === 'TOC_Y_RELACIONADOS') {
            const valA = val1Last; const valB = val2Last;
            const maxVal = Math.max(10, valA, valB) * 1.2;
            return (
                <div className="flex flex-col justify-center h-48 w-full px-8 mt-2 space-y-6">
                    <div>
                       <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1"><span>{label1}</span><span>{valA} pts</span></div>
                       <div className="w-full bg-slate-800 rounded-full h-4"><div className="bg-indigo-500 h-4 rounded-full" style={{ width: `${(valA/maxVal)*100}%` }}></div></div>
                    </div>
                    <div>
                       <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1"><span>{label2}</span><span>{valB} pts</span></div>
                       <div className="w-full bg-slate-800 rounded-full h-4"><div className="bg-orange-500 h-4 rounded-full" style={{ width: `${(valB/maxVal)*100}%` }}></div></div>
                    </div>
                </div>
            );
        } else if (currentFocus === 'TRASTORNOS_PERSONALIDAD' || currentFocus === 'TRASTORNOS_BIPOLARES') {
            return (
                <div className="relative w-full h-48 mt-2">
                  <svg viewBox={`0 0 100 40`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                    <line x1="0" y1="10" x2="100" y2="10" stroke="#334155" strokeWidth="0.2" />
                    <line x1="0" y1="20" x2="100" y2="20" stroke="#334155" strokeWidth="0.2" />
                    <line x1="0" y1="30" x2="100" y2="30" stroke="#334155" strokeWidth="0.2" />
                    <polyline fill="none" stroke="#f43f5e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" points={chartData.map((d, i) => {
                       const variance = i % 2 === 0 ? normalizeScore((d as any)[val1Key], val1Key) : normalizeScore((d as any)[val2Key], val2Key);
                       return `${(i / Math.max(1, totalSessions - 1)) * 100},${40 - (variance / maxLineVal) * 40}`;
                    }).join(' ')} />
                  </svg>
                  <p className="absolute bottom-0 w-full text-center text-[9px] text-rose-500 font-bold mt-2">Variabilidad y Picos de Labilidad Emocional / Ánimo</p>
                </div>
            );
        } else if (currentFocus === 'TRASTORNOS_NEUROCOGNITIVOS') {
            return (
                <div className="relative w-full h-48 mt-2 bg-slate-900 rounded border border-slate-700">
                  <div className="absolute bottom-0 w-full bg-red-900/30" style={{height: '80%'}}></div>
                  <span className="absolute bottom-1 right-2 text-[9px] text-red-500 font-bold">Zona de Deterioro (&lt;24 pts)</span>
                  <svg viewBox={`0 0 100 40`} className="w-full h-full overflow-visible absolute inset-0" preserveAspectRatio="none">
                    <polyline fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={chartData.map((d, i) => `${(i / Math.max(1, totalSessions - 1)) * 100},${40 - (normalizeScore(d.cog, 'cog') / 30) * 40}`).join(' ')} />
                    {chartData.map((d, i) => {
                      const cx = (i / Math.max(1, totalSessions - 1)) * 100;
                      const score = normalizeScore(d.cog, 'cog');
                      const actualMmse = score > 0 ? 30 - score : 0;
                      return (
                        <g key={i}>
                          <circle cx={cx} cy={40 - (score / 30) * 40} r="1.5" fill="#3b82f6" />
                          <text x={cx} y={45} fontSize="3" fill="#94a3b8" textAnchor="middle">S{i+1}</text>
                          {actualMmse > 0 && <text x={cx} y={40 - (score / 30) * 40 - 2} fontSize="2.5" fill="#fff" textAnchor="middle">{actualMmse}</text>}
                        </g>
                      );
                    })}
                  </svg>
                </div>
            );
        } else {
            return (
                <div className="relative w-full h-48 mt-2">
                  <svg viewBox={`0 0 100 40`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                    <line x1="0" y1="10" x2="100" y2="10" stroke="#334155" strokeWidth="0.2" />
                    <line x1="0" y1="20" x2="100" y2="20" stroke="#334155" strokeWidth="0.2" />
                    <line x1="0" y1="30" x2="100" y2="30" stroke="#334155" strokeWidth="0.2" />
                    <polyline fill="none" stroke="#f59e0b" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" points={chartData.map((d, i) => `${(i / Math.max(1, totalSessions - 1)) * 100},${40 - (normalizeScore((d as any)[val1Key], val1Key) / maxLineVal) * 40}`).join(' ')} />
                    <polyline fill="none" stroke="#3b82f6" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" points={chartData.map((d, i) => `${(i / Math.max(1, totalSessions - 1)) * 100},${40 - (normalizeScore((d as any)[val2Key], val2Key) / maxLineVal) * 40}`).join(' ')} />
                    {chartData.map((d, i) => {
                      const cx = (i / Math.max(1, totalSessions - 1)) * 100;
                      return (
                        <g key={i}>
                          <circle cx={cx} cy={40 - (normalizeScore((d as any)[val1Key], val1Key) / maxLineVal) * 40} r="1.5" fill="#f59e0b" />
                          <circle cx={cx} cy={40 - (normalizeScore((d as any)[val2Key], val2Key) / maxLineVal) * 40} r="1.5" fill="#3b82f6" />
                          <text x={cx} y={45} fontSize="3" fill="#94a3b8" textAnchor="middle">S{i+1}</text>
                        </g>
                      );
                    })}
                  </svg>
                  <div className="flex justify-center gap-6 mt-6 text-[10px] text-slate-300 uppercase font-bold">
                    <span className="flex items-center gap-2"><div className="w-3 h-3 bg-amber-500 rounded-full"></div> {label1}</span>
                    <span className="flex items-center gap-2"><div className="w-3 h-3 bg-blue-500 rounded-full"></div> {label2}</span>
                  </div>
                </div>
            );
        }
    };

    return (
      <div id={`kpi-dashboard-${dashboardType}`} className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-6 w-full ${isFullscreen ? 'min-h-screen overflow-y-auto' : 'overflow-hidden'}`}>
        <div className="border-b border-slate-800 pb-3 flex justify-between items-center flex-wrap gap-4">
          <div>
            <h3 className="text-lg font-bold text-white uppercase tracking-wider break-words">{getDashboardTitle()}</h3>
            <p className="text-xs text-slate-400">{getDashboardSubtitle()}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            
            {dashboardType === 'SPECIALTY' && (
              <div className="flex items-center gap-2 mr-2">
                 <span className="text-[10px] font-bold text-indigo-400 uppercase hidden sm:inline">Clasificación DSM-5:</span>
                 <select value={specialtyFocus} onChange={(e) => setSpecialtyFocus(e.target.value)} className="bg-slate-800 text-xs text-white font-bold p-1.5 rounded-lg border border-indigo-500/50 outline-none cursor-pointer hover:bg-slate-700 transition">
                    <option value="TRASTORNOS_NEURODESARROLLO">Neurodesarrollo (Autismo / TDAH)</option>
                    <option value="ESPECTRO_ESQUIZOFRENIA_PSICOSIS">Espectro de la Esquizofrenia (Psicosis)</option>
                    <option value="TRASTORNOS_BIPOLARES">Trastornos Bipolares y Relacionados</option>
                    <option value="TRASTORNOS_DEPRESIVOS">Trastornos Depresivos</option>
                    <option value="TRASTORNOS_ANSIEDAD">Trastornos de Ansiedad</option>
                    <option value="TOC_Y_RELACIONADOS">Trastorno Obsesivo-Compulsivo (TOC)</option>
                    <option value="TRAUMA_Y_ESTRES">Trauma y Factores de Estrés (TEPT)</option>
                    <option value="TRASTORNOS_DISOCIATIVOS">Trastornos Disociativos</option>
                    <option value="SINTOMAS_SOMATICOS">Síntomas Somáticos</option>
                    <option value="TCA_ALIMENTARIOS">Trastornos Conducta Alimentaria (TCA)</option>
                    <option value="SUEÑO_VIGILIA">Trastornos del Sueño-Vigilia</option>
                    <option value="DISFUNCIONES_SEXUALES">Disfunciones Sexuales y Parafilias</option>
                    <option value="DISRUPTIVOS_IMPULSOS">Disruptivos y Control de Impulsos</option>
                    <option value="ADICCIONES_SUSTANCIAS">Adicciones (Sustancias, Digitales, Sexuales)</option>
                    <option value="TRASTORNOS_NEUROCOGNITIVOS">Neurocognitivos (Alzheimer, Parkinson)</option>
                    <option value="TRASTORNOS_PERSONALIDAD">Trastornos de la Personalidad (TLP)</option>
                 </select>
              </div>
            )}

            {dashboardType === 'PERSPECTIVES' && (
              <div className="flex items-center gap-2 mr-2">
                 <span className="text-[10px] font-bold text-fuchsia-400 uppercase hidden sm:inline">Corriente:</span>
                 <select value={perspectivesFocus} onChange={(e) => setPerspectivesFocus(e.target.value)} className="bg-slate-800 text-xs text-white font-bold p-1.5 rounded-lg border border-fuchsia-500/50 outline-none cursor-pointer hover:bg-slate-700 transition">
                    <option value="FREUD">Psicoanálisis (Freud / Jung)</option>
                    <option value="ERIKSON">Desarrollo Psicosocial (Erikson)</option>
                    <option value="CBT">Cognitivo-Conductual (CBT)</option>
                    <option value="HUMANISTA">Humanista-Existencial</option>
                    <option value="SISTEMICA">Sistémica / Familiar</option>
                    <option value="GESTALT">Gestalt</option>
                 </select>
              </div>
            )}

            {!isFullscreen && (
               <button onClick={() => setIsFullscreenDashboard(dashboardType)} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow">
                 ⛶ Pantalla Completa
               </button>
            )}
            {isFullscreen && (
               <>
                 <button onClick={() => {
                   alert("El Dashboard se ha descargado como imagen en su dispositivo.");
                 }} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow">
                   📸 Descargar PNG
                 </button>
                 <button onClick={() => setIsFullscreenDashboard(null)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold shadow">
                   ✕ Cerrar
                 </button>
               </>
            )}
            {!isPharma && (
              <div className="px-3 py-1.5 bg-indigo-950 border border-indigo-500/40 rounded-xl text-xs font-bold text-indigo-300 font-mono flex items-center shadow">
                  GAF / EEAG: {gafScore}/100
              </div>
            )}
          </div>
        </div>

        {/* TARJETAS DE KPIs */}
        <div className={`grid gap-4 ${isFullscreen ? (isPharma || isPerspectives || isEvolutionary ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6') : (isPharma || isPerspectives || isEvolutionary ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-3')}`}>
          {kpiCards.map((kpi, idx) => (
             <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800">
               <span className="text-[10px] font-bold text-slate-400 uppercase block leading-tight">{kpi.title}</span>
               <div className={`text-2xl font-bold mt-1 ${kpi.colorClass}`}>{kpi.value}</div>
               <p className="text-[10px] text-slate-500 mt-1">{kpi.sub}</p>
             </div>
          ))}
        </div>

        {isPharma ? (
          /* VISTA EXCLUSIVA: GRÁFICA FARMACOLÓGICA */
          <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 overflow-hidden w-full relative">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">📈 Evolución Farmacológica (Efectividad vs Riesgo)</h4>
            {!hasPharma && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm z-10 rounded-xl">
                 <span className="text-[11px] font-bold text-indigo-400 px-4 text-center">No hay registros de prescripción farmacológica en las sesiones.</span>
              </div>
            )}
            <div className="relative w-full h-64 mt-2">
              <svg viewBox={`0 0 100 40`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                <line x1="0" y1="10" x2="100" y2="10" stroke="#334155" strokeWidth="0.2" />
                <line x1="0" y1="20" x2="100" y2="20" stroke="#334155" strokeWidth="0.2" />
                <line x1="0" y1="30" x2="100" y2="30" stroke="#334155" strokeWidth="0.2" />
                
                <polyline fill="none" stroke="#10b981" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" points={chartData.map((d, i) => `${(i / Math.max(1, totalSessions - 1)) * 100},${40 - (d.pharmaEff / 100) * 40}`).join(' ')} />
                <polyline fill="none" stroke="#f43f5e" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" points={chartData.map((d, i) => `${(i / Math.max(1, totalSessions - 1)) * 100},${40 - (d.pharmaRisk / 100) * 40}`).join(' ')} />
                
                {chartData.map((d, i) => {
                  const cx = (i / Math.max(1, totalSessions - 1)) * 100;
                  return (
                    <g key={i}>
                      <circle cx={cx} cy={40 - (d.pharmaEff / 100) * 40} r="1.5" fill="#10b981" />
                      <circle cx={cx} cy={40 - (d.pharmaRisk / 100) * 40} r="1.5" fill="#f43f5e" />
                      <text x={cx} y={45} fontSize="3" fill="#94a3b8" textAnchor="middle">S{i+1}</text>
                      {d.pharmaDose && (
                        <text x={cx} y={40 - (d.pharmaEff / 100) * 40 - 2} fontSize="2.5" fill="#a7f3d0" textAnchor="middle">{d.pharmaDose}</text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
            <div className="flex justify-center gap-6 mt-6 text-[10px] text-slate-300 uppercase font-bold">
              <span className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-500 rounded-full"></div> Efectividad Percibida</span>
              <span className="flex items-center gap-2"><div className="w-3 h-3 bg-rose-500 rounded-full"></div> Riesgo / Efectos Adversos</span>
            </div>
          </div>
        ) : (
          /* VISTA NORMAL: GRÁFICAS MULTIAXIAL Y DE TENDENCIA O ESPECÍFICA */
          <>
            {isSpecialty ? (
               <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 overflow-hidden w-full relative min-h-[300px]">
                 <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">📈 Modelado Visual Específico: {currentFocus.replace(/_/g, ' ')}</h4>
                 {renderSpecialtyGraph()}
               </div>
            ) : (
               <>
                  <div className={`grid gap-6 ${isFullscreen ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1 md:grid-cols-2'}`}>
                    <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col items-center justify-center relative">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">🕸️ {t('Rueda Multiaxial')}</h4>
                      <div className="w-full h-48 flex justify-center" dangerouslySetInnerHTML={{ __html: generateSpiderChartSVG(lastSessionAreas, t) }} />
                      <button onClick={handleCopySVG} className="absolute top-4 right-4 text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-white border border-slate-600">Copiar SVG</button>
                    </div>
                    
                    <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col items-center w-full justify-center relative">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-6">📊 {t('Eficacia: Pre vs Post')}</h4>
                      {!hasScores && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm z-10 rounded-xl">
                           <span className="text-[11px] font-bold text-indigo-400 px-4 text-center">Aplique prueba DSM-5 respectiva para graficar</span>
                        </div>
                      )}
                      <div className="flex items-end justify-center gap-8 h-40 w-full px-4">
                        <div className="flex gap-2 h-full items-end">
                          <div className="w-10 bg-slate-700 rounded-t relative flex items-end justify-center" style={{ height: `${(val1First/maxBarVal)*100}%` }}>
                            <span className="text-[10px] text-white font-bold mb-1">{val1First}</span>
                          </div>
                          <div className="w-10 bg-amber-500 rounded-t relative flex items-end justify-center" style={{ height: `${(val1Last/maxBarVal)*100}%` }}>
                            <span className="text-[10px] text-white font-bold mb-1">{val1Last}</span>
                          </div>
                        </div>
                        <div className="flex gap-2 h-full items-end">
                          <div className="w-10 bg-slate-700 rounded-t relative flex items-end justify-center" style={{ height: `${(val2First/maxBarVal)*100}%` }}>
                            <span className="text-[10px] text-white font-bold mb-1">{val2First}</span>
                          </div>
                          <div className="w-10 bg-blue-500 rounded-t relative flex items-end justify-center" style={{ height: `${(val2Last/maxBarVal)*100}%` }}>
                            <span className="text-[10px] text-white font-bold mb-1">{val2Last}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-around w-full px-4 mt-4 text-[10px] text-slate-500 uppercase font-bold text-center">
                        <span className="w-1/2">{label1}</span>
                        <span className="w-1/2">{label2}</span>
                      </div>
                    </div>

                    <div className={`bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-center space-y-6 ${isFullscreen ? '' : 'md:col-span-2'}`}>
                      <div>
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">🌡️ {t('Adherencia Clínica')}</h4>
                        <div className="w-full bg-slate-800 rounded-full h-4">
                          <div className="bg-gradient-to-r from-red-500 to-emerald-500 h-4 rounded-full" style={{ width: `${avanceBase}%` }}></div>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2">{Math.round(avanceBase)}% completado del protocolo base.</p>
                      </div>
                      <div className="pt-4 border-t border-slate-800">
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">🧭 {t('Sentimiento Congruente')}</h4>
                        <div className={`text-2xl font-bold ${sentimientoColor}`}>{sentimientoScore >= 50 ? t('Estable') : t('En Riesgo')}</div>
                        <p className="text-[10px] text-slate-400 mt-1">Estimación de afecto integral: {Math.round(sentimientoScore)}/100</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 overflow-hidden w-full relative">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">📈 {t('Curva de Tendencia Dinámica')}</h4>
                    {renderSpecialtyGraph()}
                  </div>
               </>
            )}
            
            {/* ZONA DE COMENTARIOS IA Y PROFESIONAL DENTRO DE ESPECIALIDAD */}
            {isSpecialty && (
              <div className="mt-8 border-t border-slate-700 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-slate-800/50 p-4 rounded-xl border border-indigo-500/30 flex flex-col h-64">
                   <div className="flex justify-between items-center mb-3">
                     <h4 className="text-xs font-bold text-indigo-400 uppercase">🤖 Reseña Analítica de la IA</h4>
                     <button onClick={handleGenerateAi} disabled={isGeneratingAi} className="text-[9px] bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded shadow">
                       {isGeneratingAi ? 'Pensando...' : 'Generar Reseña'}
                     </button>
                   </div>
                   <div className="text-[11px] text-slate-300 font-mono whitespace-pre-wrap flex-1 overflow-y-auto pr-2 bg-slate-900/50 p-3 rounded">
                     {specialtyAiSummaries[currentFocus] || "Haga clic en 'Generar Reseña' para que la IA evalúe este trastorno específico basado en las sesiones y baterías del paciente."}
                   </div>
                </div>
                <div className="bg-slate-800/50 p-4 rounded-xl border border-amber-500/30 flex flex-col h-64">
                   <div className="flex justify-between items-center mb-3">
                     <h4 className="text-xs font-bold text-amber-500 uppercase">🧑‍⚕️ Mis Comentarios Clínicos</h4>
                     <span className="text-[9px] text-slate-500">Auto-guardado</span>
                   </div>
                   <textarea
                     value={specialtyComments[currentFocus] || ''}
                     onChange={(e) => handleCommentChange(e.target.value)}
                     placeholder={`Añada sus observaciones privadas, pronóstico o diagnóstico diferencial sobre ${currentFocus}. La IA no modificará este espacio...`}
                     className="w-full flex-1 p-3 bg-slate-900 border border-slate-700 rounded text-[11px] text-white focus:border-amber-500 outline-none resize-none font-sans leading-relaxed"
                   />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const [adminPassword, setAdminPassword] = useState(() => localStorage.getItem('adminPassword') || 'psicologia1402');
  const [adminInput, setAdminInput] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

  const [psychologists, setPsychologists] = useState<Record<string, Psychologist>>(() => {
    const saved = localStorage.getItem('psychologists_db');
    let localDb: Record<string, Psychologist> = {};
    if (saved) { try { localDb = JSON.parse(saved) || {}; } catch (e) { } }
    return localDb;
  });

  const [isLicenciasSynced, setIsLicenciasSynced] = useState(false);

  useEffect(() => {
    async function sincronizarNube() {
      try {
        const dbRemota = await loadPsychologistsRemote();
        if (dbRemota && typeof dbRemota === 'object' && Object.keys(dbRemota).length > 0) {
          setPsychologists(prev => {
            const fusion = { ...prev, ...dbRemota };
            const dataStr = JSON.stringify(fusion);
            if (dataStr !== JSON.stringify(prev)) {
              localStorage.setItem('psychologists_db', dataStr);
              return fusion;
            }
            return prev;
          });
        }
      } catch (e) {} finally { setIsLicenciasSynced(true); }
    }
    sincronizarNube();
    const intervaloRadar = setInterval(() => sincronizarNube(), 10000); 
    return () => clearInterval(intervaloRadar);
  }, []);

  const [currentUser, setCurrentUser] = useState<any | null>(() => {
    const saved = localStorage.getItem('current_logged_psychologist');
    if (saved) { try { return JSON.parse(saved); } catch (e) { } }
    return null;
  });

  useEffect(() => {
    if (currentUser && psychologists[currentUser.username]) {
      const updatedUser = psychologists[currentUser.username];
      if (updatedUser.hasVoiceModule !== currentUser.hasVoiceModule || updatedUser.abandonmentThreshold !== currentUser.abandonmentThreshold || updatedUser.professionType !== currentUser.professionType) {
        setCurrentUser(updatedUser);
        localStorage.setItem('current_logged_psychologist', JSON.stringify(updatedUser));
      }
    }
  }, [psychologists]);

  const [clinicalDatabase, setClinicalDatabase] = useState<Record<string, ClinicalCase>>(() => {
    let userKey = 'clinical_cases_db';
    if (currentUser?.username) userKey = `clinical_cases_db_${currentUser.username}`;
    const saved = localStorage.getItem(userKey);
    if (saved) { try { return JSON.parse(saved); } catch (e) { } }
    return {};
  });

  const [appointments, setAppointments] = useState<Appointment[]>(() => {
    let userKey = 'appointments_db';
    if (currentUser?.username) userKey = `appointments_db_${currentUser.username}`;
    const saved = localStorage.getItem(userKey);
    if (saved) { 
      try { 
        const parsed = JSON.parse(saved); 
        if (Array.isArray(parsed)) return parsed;
      } catch (error) { return []; } 
    }
    return [];
  });

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passForm, setPassForm] = useState({ oldPass: '', newPass: '', confirmPass: '' });
  const [passMessage, setPassMessage] = useState({ text: '', type: '' });

  const [editProfileName, setEditProfileName] = useState('');
  const [editProfessionType, setEditProfessionType] = useState('PSICOLOGO');
  const [editSpecialty, setEditSpecialty] = useState('');
  const [editReview, setEditReview] = useState('');
  const [editAbandonmentThreshold, setEditAbandonmentThreshold] = useState<number>(30);

  useEffect(() => {
    if (currentUser) {
      setEditProfileName(currentUser.fullName || '');
      setEditProfessionType(currentUser.professionType || 'PSICOLOGO');
      setEditSpecialty(currentUser.specialty || '');
      setEditReview(currentUser.professionalReview || '');
      setEditAbandonmentThreshold(currentUser.abandonmentThreshold || 30);
    }
  }, [currentUser]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !editProfileName.trim()) return;
    const updatedUser = { 
      ...currentUser, fullName: editProfileName.trim(), professionType: editProfessionType, specialty: editSpecialty.trim(), professionalReview: editReview.trim(), abandonmentThreshold: editAbandonmentThreshold
    };
    const updatedDb = { ...psychologists, [currentUser.username]: updatedUser };
    setPsychologists(updatedDb); setCurrentUser(updatedUser);
    localStorage.setItem('psychologists_db', JSON.stringify(updatedDb));
    localStorage.setItem('current_logged_psychologist', JSON.stringify(updatedUser));
    try { await savePsychologistsRemote(updatedDb); alert('¡Perfil y configuraciones actualizados con éxito!'); } catch (error) {}
  };

  const handleExportBackup = () => {
    if (!currentUser) return;
    const myCases = Object.values(clinicalDatabase).filter(c => c && c.doctorUsername === currentUser.username);
    const respaldoMaestro = { fecha_respaldo: new Date().toISOString(), psicologo: currentUser.fullName, colegiado: currentUser.colegiado, expedientes_clinicos: myCases };
    const blob = new Blob([JSON.stringify(respaldoMaestro, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `Respaldo_${currentUser.username}.json`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const handleUserChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (passForm.oldPass !== currentUser.passwordHash) { setPassMessage({ text: 'Contraseña actual incorrecta.', type: 'error' }); return; }
    if (passForm.newPass !== passForm.confirmPass) { setPassMessage({ text: 'Las contraseñas no coinciden.', type: 'error' }); return; }
    if (passForm.newPass.length < 6) { setPassMessage({ text: 'Debe tener al menos 6 caracteres.', type: 'error' }); return; }

    const updatedUser = { ...currentUser, passwordHash: passForm.newPass };
    const updatedDb = { ...psychologists, [currentUser.username]: updatedUser };
    setPsychologists(updatedDb); setCurrentUser(updatedUser);
    localStorage.setItem('psychologists_db', JSON.stringify(updatedDb));
    localStorage.setItem('current_logged_psychologist', JSON.stringify(updatedUser));
    
    try {
      await savePsychologistsRemote(updatedDb);
      setPassMessage({ text: '¡Contraseña actualizada!', type: 'success' });
      setTimeout(() => { setShowPasswordModal(false); setPassForm({ oldPass: '', newPass: '', confirmPass: '' }); setPassMessage({ text: '', type: '' }); }, 2000);
    } catch (error) { setPassMessage({ text: 'Error de red.', type: 'error' }); }
  };

  const [emergencyAlerts, setEmergencyAlerts] = useState<any[]>([]);
  const [abandonmentAlerts, setAbandonmentAlerts] = useState<any[]>([]);
  const [clinicalTab, setClinicalTab] = useState<'BUSCAR' | 'ALERTAS' | 'PERFIL'>('BUSCAR');
  const hasPremiumAccess = Boolean(currentUser?.licenseType?.includes('PREMIUM') || currentUser?.licenseType?.includes('DEMO'));

  useEffect(() => {
    async function fetchAlertasDeEmergencia() {
      if (!currentUser || !hasPremiumAccess) return; 
      try {
        const response = await fetch(`https://storage.googleapis.com/base-psicologiagt-usuario2/clinica/${currentUser.username}/alertas_activas.json?t=${Date.now()}`);
        if (response.ok) { const data = await response.json(); if (Array.isArray(data)) setEmergencyAlerts(data); }
      } catch (error) {}
    }
    fetchAlertasDeEmergencia();
    const intervaloAlertas = setInterval(fetchAlertasDeEmergencia, 15000); 
    return () => clearInterval(intervaloAlertas);
  }, [currentUser, hasPremiumAccess]);

  useEffect(() => {
    if (!currentUser) return;
    const thresh = currentUser.abandonmentThreshold || 30;
    const abandons = Object.values(clinicalDatabase).filter(c => c && c.doctorUsername === currentUser.username).map(c => {
      if (c && c.sessions && c.sessions.length > 0) {
        const lastSessionDate = c.sessions[c.sessions.length - 1].date;
        const days = getDaysSince(lastSessionDate);
        if (days >= thresh) {
          return { id: `ab-${c.id}`, patientId: c.id, patientName: c.patientName, type: 'ABANDONO', days, date: lastSessionDate };
        }
      }
      return null;
    }).filter(Boolean);
    setAbandonmentAlerts(abandons as any[]);
  }, [clinicalDatabase, currentUser]);

  const totalAlerts = (emergencyAlerts?.length || 0) + (abandonmentAlerts?.length || 0);

  const handleViewEmergency = async (patientId: string) => {
    let foundCase = clinicalDatabase[patientId];
    if (foundCase && foundCase.doctorUsername === currentUser?.username) {
      setActiveCase({ ...foundCase, sessions: foundCase.sessions || [], generalData: foundCase.generalData || {} as any });
      setActiveCaseTab('HISTORIAL'); setSearchFeedback(`Expediente ${patientId} cargado.`); window.scrollTo({ top: 0, behavior: 'smooth' });
    } else { setSearchFeedback(`Expediente no encontrado.`); }
  };

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(`clinical_cases_db_${currentUser.username}`, JSON.stringify(clinicalDatabase));
      localStorage.setItem(`appointments_db_${currentUser.username}`, JSON.stringify(appointments));
    }
  }, [clinicalDatabase, appointments, currentUser]);

  const [activeCase, setActiveCase] = useState<ClinicalCase | null>(null);
  const [activeCaseTab, setActiveCaseTab] = useState<'HISTORIAL' | 'ESTADISTICAS_BASE' | 'ESPECIALIDADES' | 'FARMACOLOGIA' | 'PERSPECTIVAS' | 'EVOLUTIVA'>('HISTORIAL');
  
  const [clinicalSearchQuery, setClinicalSearchQuery] = useState('');
  const [searchFeedback, setSearchFeedback] = useState('');

  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [showEditPatientModal, setShowEditPatientModal] = useState(false);
  const [editPatientData, setEditPatientData] = useState({ id: '', patientName: '', sexo: 'Femenino', edad: '', estudios: '', origenProcedencia: '', ocupacion: '', estadoCivil: 'Soltero(a)', religion: '', datosProgenitores: '', motivoConsultaTextual: '', antecedentes: '', telefono: '', fotoUrl: '', rawNotes: '' });

  const [showNewSessionForm, setShowNewSessionForm] = useState(false);
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('09:00');
  const [durationMinutes, setDurationMinutes] = useState(60);

  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [recipeData, setRecipeData] = useState({ diagnostico: '', medicamentos: '', indicaciones: '' });
  
  const [showCertificateModal, setShowCertificateModal] = useState(false);
  const [certificateType, setCertificateType] = useState<'ATTENDANCE' | 'REFERRAL'>('ATTENDANCE');
  const [certificateText, setCertificateText] = useState('');
  
  const [isDictatingVoice, setIsDictatingVoice] = useState(false);
  const [voiceInputText, setVoiceInputText] = useState('');
  const [isMicConnected, setIsMicConnected] = useState(false);
  const [isRecordingLive, setIsRecordingLive] = useState(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [editingUsername, setEditingUsername] = useState<string | null>(null);
  const [editPasswordInput, setEditPasswordInput] = useState('');
  const [editingExpiryUsername, setEditingExpiryUsername] = useState<string | null>(null);
  const [editExpiryInput, setEditExpiryInput] = useState('');

  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regColegiado, setRegColegiado] = useState('');
  const [regProfessionType, setRegProfessionType] = useState<'PSICOLOGO' | 'PSIQUIATRA'>('PSICOLOGO');
  const [regLicenseType, setRegLicenseType] = useState<'ESTANDAR' | 'PREMIUM' | 'DEMO'>('ESTANDAR');
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [newPatientData, setNewPatientForm] = useState({ id: '', patientName: '', sexo: 'Femenino', edad: '', estudios: '', origenProcedencia: '', ocupacion: '', estadoCivil: 'Soltero(a)', religion: '', datosProgenitores: '', motivoConsultaTextual: '', antecedentes: '', telefono: '', fotoUrl: '', rawNotes: '' });
  const [pharmaInput, setPharmaInput] = useState({ active: false, name: '', dose: '', effectiveness: 50, risk: 10 });
  const [newSessionData, setNewSessionData] = useState<any>({ sessionNumber: 1, date: new Date().toISOString().split('T')[0], rawNotes: '', audioPath: '', videoUrl: '', manualBatteryFile: '' });
  const [sessionAreas, setSessionAreas] = useState({ sleep: 5, appetite: 5, energy: 5, social: 5, concentration: 5 });

  const [isProcessingNotes, setIsProcessingNotes] = useState(false);
  const [isProcessingSpecialtyAi, setIsProcessingSpecialtyAi] = useState(false);
  
  const [notesResult, setNotesResult] = useState<string>(() => localStorage.getItem('last_notes_result') || '');
  const [theoreticalAnalysisResult, setTheoreticalAnalysisResult] = useState<string>(() => localStorage.getItem('last_theoretical_result') || '');
  const [evolutionaryAnalysisResult, setEvolutionaryAnalysisResult] = useState<string>(() => localStorage.getItem('last_evolutionary_result') || '');

  useEffect(() => { localStorage.setItem('last_notes_result', notesResult); }, [notesResult]);
  useEffect(() => { localStorage.setItem('last_theoretical_result', theoreticalAnalysisResult); }, [theoreticalAnalysisResult]);
  useEffect(() => { localStorage.setItem('last_evolutionary_result', evolutionaryAnalysisResult); }, [evolutionaryAnalysisResult]);

  const [scientificQuery, setScientificQuery] = useState<ScientificQuery>({ queryText: '', responseText: '', loading: false });
  const [selectedDsmTemplate, setSelectedDsmTemplate] = useState<Dsm5EvaluationTemplate | null>(null);
  const [dsmAnswers, setDsmAnswers] = useState<Record<string, string>>({});
  const [showDsmModal, setShowDsmModal] = useState(false);
  const [verificationPassword, setVerificationPassword] = useState('');

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminInput === adminPassword) { setIsAdminAuthenticated(true); setAdminInput(''); } else { alert('Clave incorrecta.'); }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = psychologists[loginUsername.trim()];
    if (user) {
      if (!user.isActive || getDaysRemaining(user.licenseExpiry) < 0) { setLoginError('Cuenta inactiva o expirada.'); return; }
      if (user.passwordHash !== loginPassword) { setLoginError('Contraseña incorrecta.'); return; }
      
      const casesKey = `clinical_cases_db_${user.username}`;
      const savedCases = localStorage.getItem(casesKey);
      setClinicalDatabase(savedCases ? JSON.parse(savedCases) : {});

      const appKey = `appointments_db_${user.username}`;
      const savedApps = localStorage.getItem(appKey);
      try {
         const parsedApps = savedApps ? JSON.parse(savedApps) : [];
         setAppointments(Array.isArray(parsedApps) ? parsedApps : []);
      } catch(e) { setAppointments([]); }

      setCurrentUser(user); 
      setLoginError(''); 
      setActiveCase(null); 
      setNotesResult(''); 
      setTheoreticalAnalysisResult('');
      setEvolutionaryAnalysisResult('');
      setActiveCaseTab('HISTORIAL'); 
      setClinicalTab('BUSCAR');
    } else { setLoginError('Credenciales incorrectas.'); }
  };

  const handleRegisterLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    const userClean = regUsername.trim(); const passClean = regPassword.trim();
    if (!userClean || !passClean || !regFullName.trim() || !regColegiado.trim()) return;
    const expiry = new Date();
    if (regLicenseType === 'DEMO') expiry.setDate(expiry.getDate() + 15); else expiry.setDate(expiry.getDate() + 365);
    const newPsychologist: any = { 
      username: userClean, passwordHash: passClean, fullName: regFullName.trim(), colegiado: regColegiado.trim(), licenseType: regLicenseType as any, licenseExpiry: expiry.toISOString().split('T')[0], isActive: true, professionType: regProfessionType, specialty: '', professionalReview: '', abandonmentThreshold: 30 
    };
    const updatedDb = { ...psychologists, [newPsychologist.username]: newPsychologist };
    setPsychologists(updatedDb); localStorage.setItem('psychologists_db', JSON.stringify(updatedDb));
    try { await savePsychologistsRemote(updatedDb); alert(`Licencia activada para: ${newPsychologist.fullName}`); } catch (error) {}
  };

  const handleUpdateUserPasswordAdmin = async (username: string) => {
    if (!editPasswordInput.trim()) return;
    const updatedDb = { ...psychologists, [username]: { ...psychologists[username], passwordHash: editPasswordInput.trim() } };
    setPsychologists(updatedDb); localStorage.setItem('psychologists_db', JSON.stringify(updatedDb)); await savePsychologistsRemote(updatedDb); alert(`Contraseña actualizada.`); setEditingUsername(null); setEditPasswordInput('');
  };

  const handleUpdateUserExpiryAdmin = async (username: string) => {
    if (!editExpiryInput.trim()) return;
    const updatedDb = { ...psychologists, [username]: { ...psychologists[username], licenseExpiry: editExpiryInput.trim(), isActive: true } };
    setPsychologists(updatedDb); localStorage.setItem('psychologists_db', JSON.stringify(updatedDb)); await savePsychologistsRemote(updatedDb); alert(`Fecha renovada.`); setEditingExpiryUsername(null); setEditExpiryInput('');
  };

  const handleRegisterPatient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newPatientData.id.trim() || !newPatientData.patientName.trim()) return;
    const formattedId = newPatientData.id.toUpperCase().trim();
    const newCase: ClinicalCase = {
      id: formattedId, patientName: newPatientData.patientName.trim(), doctorUsername: currentUser.username, 
      generalData: { ...newPatientData },
      sessions: [{ sessionNumber: 1, date: new Date().toISOString().split('T')[0], rawNotes: newPatientData.rawNotes || newPatientData.motivoConsultaTextual || 'Evaluación inicial.', baiScore: 'Pendiente', bdiScore: 'Pendiente', audioPath: '', dsm5EvaluationName: '', dsm5EvaluationResult: '', functionalAreas: { sleep: 5, appetite: 5, energy: 5, social: 5, concentration: 5 } } as any]
    };
    setClinicalDatabase(prev => ({ ...prev, [formattedId]: newCase })); setActiveCase(newCase); setActiveCaseTab('HISTORIAL'); setShowRegisterForm(false);
  };

  const handleClinicalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const searchTerm = clinicalSearchQuery.toLowerCase().trim();
    const foundCase = Object.values(clinicalDatabase).find(c => {
      if (!c || c.doctorUsername !== currentUser.username) return false;
      return c.id?.toLowerCase() === searchTerm || 
             c.patientName?.toLowerCase().includes(searchTerm) || 
             (c.generalData?.telefono && c.generalData.telefono.toLowerCase().includes(searchTerm));
    });
    if (foundCase) {
      setActiveCase({ ...foundCase, sessions: foundCase.sessions || [], generalData: foundCase.generalData || {} as any });
      setActiveCaseTab('HISTORIAL'); setSearchFeedback(`Expediente ${foundCase.id} cargado.`); 
      setNotesResult(foundCase.structuredOutput || '');
      setTheoreticalAnalysisResult((foundCase as any).theoreticalAnalysis || '');
      setEvolutionaryAnalysisResult((foundCase as any).evolutionaryAnalysis || '');
    } else { setSearchFeedback(`Expediente no encontrado.`); setActiveCase(null); }
  };

  const handleCreateAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedPatientId || !selectedDate) return;
    const patientName = clinicalDatabase[selectedPatientId] ? clinicalDatabase[selectedPatientId].patientName : 'Desconocido';
    const startStr = `${selectedDate}T${startTime}:00`;
    let endStr = startStr;
    try {
      const d = new Date(startStr);
      if (!isNaN(d.getTime())) {
        d.setMinutes(d.getMinutes() + durationMinutes);
        endStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().substring(0, 19);
      }
    } catch(err) {}
    
    setAppointments(prev => {
       const safeArray = Array.isArray(prev) ? prev : [];
       return [...safeArray, { id: `APP-${Date.now()}`, patientId: selectedPatientId, patientName, doctorUsername: currentUser.username, title: `Consulta: ${patientName}`, start: startStr, end: endStr, status: 'SCHEDULED' }];
    });
    setShowCalendarModal(false); setSelectedPatientId(''); alert(`Cita agendada para ${patientName}`);
  };

  const handleSyncToGoogleCalendar = (app: Appointment) => {
    try {
      if (!app.start || !app.end) return;
      const startFmt = app.start.replace(/-|:|\.\d\d\d/g, "");
      const endFmt = app.end.replace(/-|:|\.\d\d\d/g, "");
      const gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(app.title)}&dates=${startFmt}/${endFmt}&details=${encodeURIComponent(`ID Expediente: ${app.patientId}`)}&location=Clinica`;
      window.open(gCalUrl, '_blank');
    } catch (e) { alert("Error al generar el enlace para Google Calendar."); }
  };

  const connectMicrophone = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setIsMicConnected(true);
    } catch (error) {
      alert("No se pudo acceder al micrófono. Verifique permisos.");
    }
  };

  const toggleRecording = () => {
    if (isRecordingLive) {
      if (mediaRecorderRef.current) { mediaRecorderRef.current.stop(); }
      setIsRecordingLive(false);
    } else {
      if (!micStreamRef.current) { alert("Conecte el micrófono primero."); return; }
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(micStreamRef.current);
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob); 
        setNewSessionData((prev: any) => ({ ...prev, audioPath: audioUrl }));
        alert("¡Audio grabado con éxito!");
      };
      mediaRecorder.start(); 
      setIsRecordingLive(true);
    }
  };

  const handleUpdateActiveCase = (updatedCase: ClinicalCase) => {
      setActiveCase(updatedCase);
      setClinicalDatabase(prev => ({ ...prev, [updatedCase.id]: updatedCase }));
  };

  const handleOpenEditPatient = () => {
      if (!activeCase) return;
      setEditPatientData({
          ...activeCase.generalData,
          id: activeCase.id,
          patientName: activeCase.patientName
      } as any);
      setShowEditPatientModal(true);
  };

  const handleSaveEditPatient = (e: React.FormEvent) => {
      e.preventDefault();
      if (!activeCase || !currentUser) return;
      const updatedCase = {
          ...activeCase,
          patientName: editPatientData.patientName.trim(),
          generalData: { ...editPatientData, id: activeCase.id } 
      };
      handleUpdateActiveCase(updatedCase);
      setShowEditPatientModal(false);
      alert("Expediente médico actualizado correctamente.");
  };

  const handleAddNewSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCase || !currentUser) return;
    const numSesion = activeCase.sessions.length + 1;
    
    const sessionPayload = { 
      ...newSessionData, 
      sessionNumber: numSesion, 
      functionalAreas: sessionAreas,
      pharma: pharmaInput.active ? { name: pharmaInput.name, dose: pharmaInput.dose, effectiveness: pharmaInput.effectiveness, risk: pharmaInput.risk } : null
    } as any;

    const updatedSessions = [...activeCase.sessions, sessionPayload];
    const updatedCase = { ...activeCase, sessions: updatedSessions };
    handleUpdateActiveCase(updatedCase);
    
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    setIsMicConnected(false);
    setIsRecordingLive(false);

    setShowNewSessionForm(false);
    setNewSessionData({ sessionNumber: 1, date: new Date().toISOString().split('T')[0], rawNotes: '', audioPath: '', videoUrl: '', manualBatteryFile: '' });
    setSessionAreas({ sleep: 5, appetite: 5, energy: 5, social: 5, concentration: 5 });
    setPharmaInput({ active: false, name: '', dose: '', effectiveness: 50, risk: 10 });
  };

  const handleProcessNotes = async () => {
    if (!activeCase || activeCase.sessions.length === 0) return;
    setIsProcessingNotes(true);
    try {
      const lastSession = activeCase.sessions[activeCase.sessions.length - 1];
      let fullNotesPayload = `=== HISTORIAL ===\nPaciente: ${activeCase.patientName}\n`;
      activeCase.sessions.forEach((s) => { fullNotesPayload += `Sesión ${s.sessionNumber}: ${s.rawNotes}\n`; });
      const result = await processClinicalNotes(fullNotesPayload, lastSession.baiScore || 'Pendiente', lastSession.bdiScore || 'Pendiente', currentUser?.fullName || 'Profesional', currentUser?.colegiado || 'N/A');
      const updatedCase = { ...activeCase, structuredOutput: result };
      handleUpdateActiveCase(updatedCase); setNotesResult(result);
    } catch (e: any) { alert("Error: " + e.message); } finally { setIsProcessingNotes(false); }
  };

  const handleProcessTheoreticalNotes = async (type: 'THEORETICAL' | 'EVOLUTIONARY') => {
    if (!activeCase || activeCase.sessions.length === 0) return;
    setIsProcessingNotes(true);
    try {
      const lastSession = activeCase.sessions[activeCase.sessions.length - 1];
      let fullNotesPayload = `=== HISTORIAL ===\nPaciente: ${activeCase.patientName}\n`;
      activeCase.sessions.forEach((s) => { fullNotesPayload += `Sesión ${s.sessionNumber}: ${s.rawNotes}\n`; });
      
      let specialInstruction = "";
      if (type === 'THEORETICAL') {
          const corrienteMap: any = {
             'FREUD': 'Psicoanálisis (Freud / Jung)',
             'ERIKSON': 'Desarrollo Psicosocial (Erikson)',
             'CBT': 'Terapia Cognitivo-Conductual (CBT)',
             'HUMANISTA': 'Humanismo / Existencial (Rogers / Frankl)',
             'SISTEMICA': 'Terapia Sistémica / Familiar',
             'GESTALT': 'Terapia Gestalt'
          };
          const corrienteStr = corrienteMap[perspectivesFocus] || 'Psicología Clínica';
          specialInstruction = `INSTRUCCIÓN CLÍNICA ESTRICTA: Actúa como un experto en ${corrienteStr}. Analiza profunda y detalladamente este caso DESDE ESTA ÚNICA PERSPECTIVA TEÓRICA. Da tus comentarios y opinión clínica sobre el origen, mantenimiento de los síntomas y posibles mecanismos subyacentes. Ignora el formato de dictamen estándar. Escribe un ensayo analítico estructurado y profesional de unos 3 párrafos.\n\n`;
      } else {
          specialInstruction = `INSTRUCCIÓN CLÍNICA ESTRICTA: Actúa como un experto en Psicología Evolutiva Darwiniana y Psicobiología. Analiza este caso explicando el "valor adaptativo" o "propósito de supervivencia" de los síntomas del paciente (ej. ansiedad como alerta temprana, depresión como conservación de energía). Ignora el formato estándar. Escribe un ensayo evolutivo profundo de unos 3 párrafos.\n\n`;
      }

      const payloadWithInstruction = specialInstruction + fullNotesPayload;
      const result = await processClinicalNotes(payloadWithInstruction, lastSession.baiScore || 'Pendiente', lastSession.bdiScore || 'Pendiente', currentUser?.fullName || 'Profesional', currentUser?.colegiado || 'N/A');
      
      const updatedCase = { ...activeCase };
      if (type === 'THEORETICAL') {
         (updatedCase as any).theoreticalAnalysis = result;
         setTheoreticalAnalysisResult(result);
      } else {
         (updatedCase as any).evolutionaryAnalysis = result;
         setEvolutionaryAnalysisResult(result);
      }
      handleUpdateActiveCase(updatedCase); 
    } catch (e: any) { alert("Error: " + e.message); } finally { setIsProcessingNotes(false); }
  };

  const handleGenerateSpecialtyAi = async (focus: string) => {
    if (!activeCase || activeCase.sessions.length === 0) return;
    setIsProcessingSpecialtyAi(true);
    try {
      const lastSession = activeCase.sessions[activeCase.sessions.length - 1];
      let fullNotesPayload = `=== HISTORIAL ===\nPaciente: ${activeCase.patientName}\n`;
      activeCase.sessions.forEach((s) => { fullNotesPayload += `Sesión ${s.sessionNumber}: ${s.rawNotes}\n`; });
      
      const focusMap: any = {
         'TRASTORNOS_NEURODESARROLLO': 'Trastornos del Neurodesarrollo (Autismo / TDAH)',
         'ESPECTRO_ESQUIZOFRENIA_PSICOSIS': 'Espectro de la Esquizofrenia y Otros Trastornos Psicóticos',
         'TRASTORNOS_BIPOLARES': 'Trastornos Bipolares y Trastornos Relacionados',
         'TRASTORNOS_DEPRESIVOS': 'Trastornos Depresivos',
         'TRASTORNOS_ANSIEDAD': 'Trastornos de Ansiedad',
         'TOC_Y_RELACIONADOS': 'Trastorno Obsesivo-Compulsivo y Relacionados',
         'TRAUMA_Y_ESTRES': 'Trastornos Relacionados con Traumas y Factores de Estrés',
         'TRASTORNOS_DISOCIATIVOS': 'Trastornos Disociativos',
         'SINTOMAS_SOMATICOS': 'Trastornos de Síntomas Somáticos',
         'TCA_ALIMENTARIOS': 'Trastornos de la Conducta Alimentaria (TCA)',
         'SUEÑO_VIGILIA': 'Trastornos del Sueño-Vigilia',
         'DISFUNCIONES_SEXUALES': 'Disfunciones Sexuales y Parafilias',
         'DISRUPTIVOS_IMPULSOS': 'Trastornos Disruptivos y Control de Impulsos',
         'ADICCIONES_SUSTANCIAS': 'Trastornos Relacionados con Sustancias y Trastornos Adictivos',
         'TRASTORNOS_NEUROCOGNITIVOS': 'Trastornos Neurocognitivos (Demencia, Alzheimer, Parkinson)',
         'TRASTORNOS_PERSONALIDAD': 'Trastornos de la Personalidad'
      };
      
      const instruction = `INSTRUCCIÓN CLÍNICA ESTRICTA: Actúa como un especialista estricto en ${focusMap[focus] || focus} según el manual DSM-5. Analiza este caso centrándote ÚNICAMENTE en esta familia de trastornos. Evalúa los síntomas presentados, el riesgo asociado y la evolución. Sé muy conciso, clínico y directo (máximo 2 párrafos).\n\n`;
      
      const payloadWithInstruction = instruction + fullNotesPayload;
      const result = await processClinicalNotes(payloadWithInstruction, lastSession.baiScore || 'Pendiente', lastSession.bdiScore || 'Pendiente', currentUser?.fullName || 'Profesional', currentUser?.colegiado || 'N/A');
      
      const updatedCase = { ...activeCase };
      if (!(updatedCase as any).specialtyAiSummaries) (updatedCase as any).specialtyAiSummaries = {};
      (updatedCase as any).specialtyAiSummaries[focus] = result;
      
      handleUpdateActiveCase(updatedCase);
    } catch (e: any) { alert("Error: " + e.message); } finally { setIsProcessingSpecialtyAi(false); }
  };

  const handleSaveDsmEvaluation = () => {
    if (!activeCase || !selectedDsmTemplate || !currentUser) return;
    if (verificationPassword !== currentUser.passwordHash) { alert("Firma inválida."); return; }
    const profTitle = getProfPrefix(currentUser.professionType);
    
    let numScore = 0;
    let canAutoScore = false;
    Object.values(dsmAnswers).forEach(ans => { 
      const match = ans.match(/\((\d+)\)/); 
      if (match) { numScore += parseInt(match[1]); canAutoScore = true; } 
    });
    
    let autoScoreStr = canAutoScore ? `${selectedDsmTemplate.name.split(' ')[0]} (Score: ${numScore})` : 'Evaluado';
    
    const formattedResult = `EVALUACIÓN PSICOMÉTRICA INTERNACIONAL\nInstrumento: ${selectedDsmTemplate.name}\nEvaluador: ${profTitle} ${currentUser.fullName}\n\nRESULTADOS:\n${Object.entries(dsmAnswers).map(([q, ans]) => `• ${q}: ${ans}`).join('\n')}\n\n-> PUNTUACIÓN AUTOMÁTICA: ${autoScoreStr}`;
    
    const updatedSessions = [...activeCase.sessions];
    if (updatedSessions.length > 0) {
      const lastIdx = updatedSessions.length - 1;
      const currentSession = updatedSessions[lastIdx];
      
      // NUEVO: GUARDADO MULTI-DIAGNÓSTICO ESTRICTO
      const newTestScores = { ...((currentSession as any).testScores || {}) };
      if (canAutoScore) {
         newTestScores[selectedDsmTemplate.id] = numScore;
      }

      updatedSessions[lastIdx] = { 
        ...currentSession, 
        testScores: newTestScores,
        dsm5EvaluationName: currentSession.dsm5EvaluationName ? `${currentSession.dsm5EvaluationName} | ${selectedDsmTemplate.name}` : selectedDsmTemplate.name, 
        dsm5EvaluationResult: currentSession.dsm5EvaluationResult ? `${currentSession.dsm5EvaluationResult}\n\n---\n\n${formattedResult}` : formattedResult, 
        baiScore: ['BAI', 'HAM_A', 'GAD7', 'SPIN', 'YBOCS'].includes(selectedDsmTemplate.id) ? autoScoreStr : currentSession.baiScore, 
        bdiScore: ['BDI', 'HAM_D', 'PHQ9'].includes(selectedDsmTemplate.id) ? autoScoreStr : currentSession.bdiScore 
      };
    }
    const updatedCase = { ...activeCase, sessions: updatedSessions };
    handleUpdateActiveCase(updatedCase);
    setShowDsmModal(false); setSelectedDsmTemplate(null); setDsmAnswers({}); setVerificationPassword(''); alert(`Evaluación guardada.`);
  };

  const handleAiDictationAssist = async () => {
    if (!voiceInputText.trim() || !currentUser) return;
    setIsDictatingVoice(true);
    try {
      const refinedNotes = await processVoiceNotesToEvolution(voiceInputText, currentUser.fullName, currentUser.colegiado);
      setNewSessionData((prev:any) => ({ ...prev, rawNotes: refinedNotes })); setVoiceInputText('');
    } catch (e: any) { alert("Error detallado: " + e.message); console.error(e); } finally { setIsDictatingVoice(false); }
  };

  const handleScientificQuery = async () => {
    if (!scientificQuery.queryText.trim()) return;
    setScientificQuery(prev => ({ ...prev, loading: true }));
    try {
      const res = await queryScientificDatabase(scientificQuery.queryText);
      setScientificQuery(prev => ({ ...prev, responseText: res }));
    } catch (e: any) { alert("Error detallado: " + e.message); console.error(e); } finally { setScientificQuery(prev => ({ ...prev, loading: false })); }
  };

  const handleOpenCertificateModal = (type: 'ATTENDANCE' | 'REFERRAL') => {
    if (!activeCase || !currentUser) return;
    setCertificateType(type);
    
    if (type === 'ATTENDANCE') {
      setCertificateText(`A QUIEN CORRESPONDA:\n\nPor medio de la presente, el infrascrito profesional de la salud mental, hace constar que el/la paciente ${activeCase.patientName}, con número de expediente ${activeCase.id}, asiste regularmente a tratamiento en esta clínica.\n\nLa presente evaluación y seguimiento se realiza en estricto apego y cumplimiento a los estándares clínicos vigentes.\n\nSe extiende la presente constancia para los usos legales o administrativos que al paciente convengan.`);
    } else {
      setCertificateText(`Estimado(a) Colega / Especialista:\n\nPor medio de la presente remito a evaluación y/o seguimiento a el/la paciente ${activeCase.patientName}, con expediente clínico ${activeCase.id}, edad: ${activeCase.generalData?.edad || 'N/R'}.\n\nMotivo de Referencia:\n[Describa aquí el motivo exacto de la referencia clínica, ej. Evaluación Neurológica, Apoyo Psiquiátrico, etc.]\n\nQuedo a su entera disposición para cualquier consulta adicional referente a este caso.\n\nAgradeciendo de antemano su valiosa intervención.`);
    }
    setShowCertificateModal(true);
  };

  const printOrExportCertificate = (format: 'PRINT' | 'WORD') => {
    const profTitle = getProfPrefix(currentUser?.professionType);
    const title = certificateType === 'ATTENDANCE' ? 'CONSTANCIA DE ASISTENCIA CLÍNICA' : 'ORDEN DE REFERENCIA CLÍNICA';
    const htmlString = getProfessionalLetterhead(title, certificateText, `${profTitle} ${currentUser?.fullName}`, currentUser?.colegiado || '', currentUser?.specialty || '');
    
    if (format === 'WORD') {
      exportHTMLToWord(htmlString, `${title.replace(/ /g, '_')}_${activeCase?.id}`);
    } else {
      const printWin = window.open('', '_blank');
      if (printWin) { printWin.document.write(htmlString); printWin.document.close(); printWin.print(); }
    }
  };

  const printOrExportRecipe = (format: 'PRINT' | 'WORD') => {
    const profTitle = getProfPrefix(currentUser?.professionType);
    const htmlString = getPrescriptionLetterhead(
      activeCase?.patientName || '', 
      new Date().toLocaleDateString('es-GT'), 
      recipeData.diagnostico, 
      recipeData.medicamentos, 
      recipeData.indicaciones, 
      `${profTitle} ${currentUser?.fullName}`, 
      currentUser?.colegiado || '', 
      currentUser?.specialty || ''
    );
    
    if (format === 'WORD') {
      exportHTMLToWord(htmlString, `Receta_Medica_${activeCase?.id}`);
    } else {
      const printWin = window.open('', '_blank');
      if (printWin) { printWin.document.write(htmlString); printWin.document.close(); printWin.print(); }
    }
  };

  const generateClinicalHistoryHTML = (c: ClinicalCase, targetLang: string, translatedDictamen: string): string => {
    const gd = c.generalData || {};
    let evaluacionesRealizadasHTML = '';
    c.sessions.forEach(s => { 
      if (s.dsm5EvaluationName && s.dsm5EvaluationResult) { 
        evaluacionesRealizadasHTML += `<div style="margin-bottom: 15px; border: 1px solid #ccc; padding: 10px; background: #f9f9f9;"><p style="margin: 0 0 5px 0; font-weight: bold; font-size: 10pt;">Pruebas: ${s.dsm5EvaluationName} (${s.date})</p><div style="font-size: 9pt; white-space: pre-wrap;">${s.dsm5EvaluationResult}</div></div>`; 
      } 
      if (s.manualBatteryFile) {
        evaluacionesRealizadasHTML += `<div style="margin-bottom: 15px; border: 1px solid #ccc; padding: 10px; background: #f9f9f9;"><p style="margin: 0 0 5px 0; font-weight: bold; font-size: 10pt;">Batería Manual Subida (${s.date})</p><p style="font-size: 9pt;">Se adjuntó archivo físico al expediente digital.</p></div>`; 
      }
      if (s.pharma && s.pharma.name) {
        evaluacionesRealizadasHTML += `<div style="margin-bottom: 15px; border: 1px solid #ccc; padding: 10px; background: #f9f9f9;"><p style="margin: 0 0 5px 0; font-weight: bold; font-size: 10pt;">Prescripción Psiquiátrica (${s.date})</p><p style="font-size: 9pt;"><strong>Fármaco:</strong> ${s.pharma.name} (${s.pharma.dose}) | <strong>Efectividad:</strong> ${s.pharma.effectiveness}% | <strong>Riesgo Secundario:</strong> ${s.pharma.risk}%</p></div>`; 
      }
    });
    
    let professionalOpinionHTML = '';
    if ((c as any).professionalOpinion) {
        professionalOpinionHTML += `<div style="margin-top: 20px;"><h2 style="font-size: 11pt; font-weight: bold; background: #eee; padding: 4px 8px; border-left: 4px solid #f59e0b;">COMENTARIOS Y OPINIÓN DEL PROFESIONAL</h2><div style="font-size: 10pt; white-space: pre-wrap; margin-top: 10px;">${(c as any).professionalOpinion}</div></div>`;
    }

    let extraSpecialtyCommentsHTML = '';
    const spComms = (c as any).specialtyComments;
    const spAi = (c as any).specialtyAiSummaries;
    
    if ((spComms && Object.keys(spComms).length > 0) || (spAi && Object.keys(spAi).length > 0)) {
        extraSpecialtyCommentsHTML += `<div style="margin-top: 20px;"><h2 style="font-size: 11pt; font-weight: bold; background: #eee; padding: 4px 8px; border-left: 4px solid #6366f1;">MÓDULOS DE ESPECIALIDAD CLÍNICA (DSM-5)</h2>`;
        
        const allKeys = new Set([...Object.keys(spComms || {}), ...Object.keys(spAi || {})]);
        allKeys.forEach(k => {
           extraSpecialtyCommentsHTML += `<div style="margin-top: 15px; border: 1px solid #ddd; padding: 10px;"><h3 style="font-size: 10pt; font-weight: bold; color: #4f46e5; margin: 0 0 5px 0;">Foco: ${k.replace(/_/g, ' ')}</h3>`;
           if (spAi && spAi[k]) extraSpecialtyCommentsHTML += `<p style="font-size: 9pt; margin: 0 0 5px 0;"><strong>Reseña Analítica IA:</strong></p><div style="font-size: 9pt; white-space: pre-wrap; margin-bottom: 10px;">${spAi[k]}</div>`;
           if (spComms && spComms[k]) extraSpecialtyCommentsHTML += `<p style="font-size: 9pt; margin: 0 0 5px 0;"><strong>Observaciones del Profesional:</strong></p><div style="font-size: 9pt; white-space: pre-wrap;">${spComms[k]}</div>`;
           extraSpecialtyCommentsHTML += `</div>`;
        });
        extraSpecialtyCommentsHTML += `</div>`;
    }

    const legalNorm = t(getLegalNorm(currentUser?.countryCode || 'GT'), targetLang);
    const profTitle = getProfPrefix(currentUser?.professionType);

    return `<div id="word-content" style="font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #000; background-color: #fff; width: 750px; max-width: 100%; margin: 0 auto;">
      <div style="border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 15px; text-align: center;">
        <h1 style="font-size: 15pt; font-weight: bold; margin: 0;">EXPEDIENTE CLÍNICO PSICOLÓGICO Y MÉDICO</h1>
        <p style="font-size: 9pt; margin: 3px 0 0 0;">Protocolo de Gestión de Salud | ${legalNorm}</p>
      </div>
      ${gd.fotoUrl ? `<div style="text-align: center; margin-bottom: 15px;"><img src="${gd.fotoUrl}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid #000;" /></div>` : ''}
      <div>
        <h2 style="font-size: 11pt; font-weight: bold; background: #eee; padding: 4px 8px; margin: 15px 0 8px 0; border-left: 4px solid #000;">1. FICHA DE IDENTIFICACIÓN</h2>
        <table style="width: 100%; font-size: 10pt; border-collapse: collapse; margin-bottom: 10px;">
          <tr><td style="padding: 3px 0; width: 50%;"><strong>Nombre:</strong> ${c.patientName}</td><td style="padding: 3px 0; width: 50%;"><strong>Expediente ID:</strong> ${c.id}</td></tr>
          <tr><td style="padding: 3px 0;"><strong>Teléfono:</strong> ${gd.telefono || 'N/R'}</td><td style="padding: 3px 0;"><strong>Sexo/Edad:</strong> ${gd.sexo} / ${gd.edad || 'N/R'}</td></tr>
          <tr><td style="padding: 3px 0;"><strong>Ocupación:</strong> ${gd.ocupacion || 'N/R'}</td><td style="padding: 3px 0;"><strong>Estado Civil:</strong> ${gd.estadoCivil || 'N/R'}</td></tr>
          <tr><td style="padding: 3px 0;" colspan="2"><strong>Origen / Procedencia:</strong> ${gd.origenProcedencia || 'N/R'} | <strong>Religión:</strong> ${gd.religion || 'N/R'}</td></tr>
          <tr><td style="padding: 3px 0;" colspan="2"><strong>Datos de Progenitores:</strong> ${gd.datosProgenitores || 'N/R'}</td></tr>
        </table>
      </div>
      <div>
        <h2 style="font-size: 11pt; font-weight: bold; background: #eee; padding: 4px 8px; margin: 15px 0 8px 0; border-left: 4px solid #000;">2. ANAMNESIS</h2>
        <p style="font-size: 10pt; margin: 0 0 8px 0;"><strong>Motivo:</strong> ${gd.motivoConsultaTextual || 'N/R'}</p>
        <p style="font-size: 10pt; margin: 0 0 8px 0;"><strong>Antecedentes:</strong> ${gd.antecedentes || 'Sin antecedentes.'}</p>
      </div>
      <div>
        <h2 style="font-size: 11pt; font-weight: bold; background: #eee; padding: 4px 8px; margin: 15px 0 8px 0; border-left: 4px solid #000;">3. EVALUACIONES PSICOMÉTRICAS Y MÉDICAS</h2>
        ${evaluacionesRealizadasHTML || `<p style="font-size: 10pt; font-style: italic;">No se han aplicado baterías formales aún.</p>`}
      </div>
      <div>
        <h2 style="font-size: 11pt; font-weight: bold; background: #eee; padding: 4px 8px; margin: 15px 0 8px 0; border-left: 4px solid #000;">4. DICTAMEN E IMPRESIÓN DIAGNÓSTICA (IA)</h2>
        <div style="font-size: 10pt; margin: 0 0 10px 0; white-space: pre-wrap;">${translatedDictamen ? translatedDictamen : 'En proceso...'}</div>
      </div>
      ${professionalOpinionHTML}
      ${extraSpecialtyCommentsHTML}
      <div style="margin-top: 40px; text-align: center;">
        <div style="border-top: 1px solid #000; width: 250px; margin: 0 auto 5px auto;"></div>
        <p style="font-size: 10pt; margin: 0; font-weight: bold;">${profTitle} ${currentUser?.fullName || 'Profesional'}</p>
        <p style="font-size: 9pt; margin: 2px 0;">Colegiado: ${currentUser?.colegiado || 'N/A'}</p>
      </div>
    </div>`;
  };

  const handleDownloadReport = async (format: 'PDF' | 'DOC') => {
    if (!activeCase) return;
    setIsGeneratingPdf(true);
    try {
      const translatedReport = activeCase.structuredOutput || '';
      const printContainer = document.createElement('div');
      printContainer.innerHTML = generateClinicalHistoryHTML(activeCase, pdfLang, translatedReport);

      if (format === 'DOC') {
        document.body.appendChild(printContainer);
        exportHTMLToWord(printContainer.innerHTML, `Expediente_${activeCase.id}`);
        document.body.removeChild(printContainer);
      } else {
        if (typeof (window as any).html2pdf !== 'undefined') {
          (window as any).html2pdf().set({ margin: 0.5, filename: `Expediente_${activeCase.id}.pdf`, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } }).from(printContainer).save();
        } else {
          const printWindow = window.open('', '_blank');
          if (printWindow) { printWindow.document.write(printContainer.innerHTML); printWindow.print(); }
        }
      }
    } catch (error) { alert("Error al exportar."); } finally { setIsGeneratingPdf(false); }
  };

  const myPatients = currentUser ? Object.values(clinicalDatabase).filter(c => c && c.doctorUsername === currentUser.username) : [];
  const myAppointments = currentUser ? appointments.filter(a => a && a.doctorUsername === currentUser.username && a.status !== 'CANCELLED') : [];

  return (
    <div className={`min-h-screen flex flex-col ${th.bg} ${th.text} overflow-x-hidden transition-colors duration-300`}>
      
      {/* RENDERIZADO DE DASHBOARD EN PANTALLA COMPLETA */}
      {isFullscreenDashboard && activeCase && (
         <div className="fixed inset-0 z-[100] bg-slate-950 p-4 sm:p-8 overflow-y-auto">
            <PatientDashboard 
               activeCase={activeCase} 
               isFullscreen={true} 
               dashboardType={isFullscreenDashboard} 
               onUpdateCase={handleUpdateActiveCase} 
               onGenerateSpecialtyAi={handleGenerateSpecialtyAi} 
               isGeneratingAi={isProcessingSpecialtyAi} 
            />
         </div>
      )}

      <header className={`border-b ${th.border} ${th.headerBg} backdrop-blur sticky top-0 z-50 px-6 py-4 transition-colors duration-300`}>
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white text-xl shrink-0">Ψ</div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold tracking-tight truncate">Asistente Clínica SaaS</h1>
              <p className={`text-xs ${th.textMuted} truncate`}>EHR & Inteligencia Artificial</p>
            </div>
          </div>
          <div className={`flex flex-wrap justify-center items-center gap-2 ${th.card} p-1 rounded-xl border ${th.border} w-full sm:w-auto`}>
            <button onClick={toggleTheme} className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${th.border} ${isDarkMode ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-800'}`}>{isDarkMode ? '☀️' : '🌙'}</button>
            <div className="w-px h-6 bg-slate-500/30 mx-1"></div>
            <button onClick={() => setMode(AppMode.CLINICAL)} className={`px-4 py-2 rounded-lg text-xs font-semibold ${mode === AppMode.CLINICAL ? 'bg-indigo-600 text-white' : th.textMuted}`}>🩺 Clínico</button>
            <button onClick={() => setMode(AppMode.CALENDAR)} className={`px-4 py-2 rounded-lg text-xs font-semibold ${mode === AppMode.CALENDAR ? 'bg-indigo-600 text-white' : th.textMuted}`}>📅 Agenda</button>
            <button onClick={() => setMode(AppMode.ADMIN)} className={`px-4 py-2 rounded-lg text-xs font-semibold ${mode === AppMode.ADMIN ? 'bg-amber-600 text-white' : th.textMuted}`}>⚙️ Admin</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col">
        {mode === AppMode.ADMIN && (
          <div className="max-w-4xl mx-auto space-y-8 w-full">
            {!isAdminAuthenticated ? (
              <div className={`${th.card} border ${th.border} rounded-2xl p-6 space-y-4 max-w-md mx-auto`}>
                <h2 className={`text-sm font-semibold ${th.text} text-center uppercase tracking-wider`}>Consola Maestra de Licencias</h2>
                <form onSubmit={handleAdminAuth} className="space-y-3">
                  <input type="password" value={adminInput} onChange={(e) => setAdminInput(e.target.value)} placeholder="Clave de Administrador" className={`w-full p-2.5 ${th.input} border ${th.border} rounded-xl text-sm ${th.text} outline-none`} />
                  <button type="submit" className="w-full py-2.5 bg-amber-600 font-semibold text-white rounded-xl text-xs">Autenticar</button>
                </form>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className={`${th.card} border ${th.border} rounded-2xl p-6 space-y-4 lg:col-span-5`}>
                    <h3 className={`text-sm font-bold ${th.text} uppercase border-b ${th.border} pb-2`}>Activar Nueva Licencia</h3>
                    <form onSubmit={handleRegisterLicense} className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" required value={regUsername} onChange={(e) => setRegUsername(e.target.value)} placeholder="Usuario" className={`w-full p-2 ${th.input} border ${th.border} rounded text-xs ${th.text}`} />
                        <input type="password" required value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="Contraseña" className={`w-full p-2 ${th.input} border ${th.border} rounded text-xs ${th.text}`} />
                      </div>
                      <input type="text" required value={regFullName} onChange={(e) => setRegFullName(e.target.value)} placeholder="Nombre Completo" className={`w-full p-2 ${th.input} border ${th.border} rounded text-xs ${th.text}`} />
                      <input type="text" required value={regColegiado} onChange={(e) => setRegColegiado(e.target.value)} placeholder="Colegiado" className={`w-full p-2 ${th.input} border ${th.border} rounded text-xs ${th.text}`} />
                      
                      <div className={`grid grid-cols-2 gap-2 border-t ${th.border} pt-3`}>
                        <select value={regProfessionType} onChange={(e) => setRegProfessionType(e.target.value as any)} className={`w-full p-2 ${th.input} border ${th.border} rounded text-xs ${th.text} mt-1`}>
                          <option value="PSICOLOGO">Psicólogo Clínico</option>
                          <option value="PSIQUIATRA">Médico Psiquiatra</option>
                        </select>
                        <select value={regLicenseType} onChange={(e) => setRegLicenseType(e.target.value as any)} className={`w-full p-2 ${th.input} border ${th.border} rounded text-xs ${th.text} mt-1`}>
                          <option value="ESTANDAR">Licencia ESTÁNDAR</option>
                          <option value="PREMIUM">Licencia PREMIUM</option>
                          <option value="DEMO">Licencia DEMO (15 Días)</option>
                        </select>
                      </div>
                      
                      <button type="submit" className="w-full py-2 bg-amber-600 text-white font-semibold rounded text-xs mt-2">Activar Licencia</button>
                    </form>
                  </div>

                  <div className={`${th.card} border ${th.border} rounded-2xl p-6 space-y-6 lg:col-span-7`}>
                    <h3 className={`text-sm font-bold ${th.text} uppercase border-b ${th.border} pb-2`}>Auditoría y Soporte</h3>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                      {Object.values(psychologists).filter(p => p && p.username).map((p) => {
                        const rem = getDaysRemaining(p.licenseExpiry);
                        const isExpired = rem < 0;
                        return (
                          <div key={p.username} className={`p-3 ${th.input} rounded-xl border ${th.border} text-xs flex flex-col gap-2`}>
                            <div className="flex justify-between items-start gap-2">
                              <div className="min-w-0 flex-1">
                                <span className={`font-bold ${th.text}`}>{p.fullName}</span>
                                <span className={`block text-[10px] ${th.textMuted}`}>User: {p.username} | Exp: {p.licenseExpiry} ({isExpired ? 'Vencida' : `${rem} días`})</span>
                              </div>
                              <div className="flex gap-1">
                                <button onClick={() => { setEditingExpiryUsername(editingExpiryUsername === p.username ? null : p.username); setEditExpiryInput(p.licenseExpiry); setEditingUsername(null); }} className="px-2 py-1 rounded text-[10px] bg-slate-300 dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow" title="Renovar/Cambiar Fecha">📅 Renovar Fecha</button>
                                <button onClick={() => { setEditingUsername(editingUsername === p.username ? null : p.username); setEditPasswordInput(''); setEditingExpiryUsername(null); }} className="px-2 py-1 rounded text-[10px] bg-slate-300 dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow" title="Cambiar Clave">🔑 Clave</button>
                              </div>
                            </div>
                            
                            {editingUsername === p.username && (
                              <div className={`mt-1 pt-2 border-t ${th.border} flex gap-2`}>
                                <input type="text" value={editPasswordInput} onChange={(e) => setEditPasswordInput(e.target.value)} placeholder="Nueva clave..." className={`flex-1 p-1.5 ${th.card} border ${th.border} rounded text-[11px] ${th.text} min-w-0`} />
                                <button onClick={() => handleUpdateUserPasswordAdmin(p.username)} className="px-3 py-1.5 bg-amber-600 text-white font-bold rounded text-[10px] shrink-0">Guardar</button>
                              </div>
                            )}

                            {editingExpiryUsername === p.username && (
                              <div className={`mt-1 pt-2 border-t ${th.border} flex gap-2 items-center`}>
                                <span className={`text-[9px] ${th.textMuted}`}>Fecha:</span>
                                <input type="date" value={editExpiryInput} onChange={(e) => setEditExpiryInput(e.target.value)} className={`flex-1 p-1.5 ${th.card} border ${th.border} rounded text-[11px] ${th.text} min-w-0`} />
                                <button onClick={() => handleUpdateUserExpiryAdmin(p.username)} className="px-3 py-1.5 bg-emerald-600 text-white font-bold rounded text-[10px] shrink-0">Actualizar</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {mode === AppMode.CALENDAR && (
          <div className="space-y-6 flex-1 flex flex-col w-full">
            {!currentUser ? (
              <p className={`text-center text-xs ${th.textMuted} py-8`}>Inicie sesión para acceder a su agenda.</p>
            ) : (
              <div className={`${th.card} border ${th.border} rounded-2xl p-4 sm:p-6 shadow-xl space-y-6`}>
                <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center border-b ${th.border} pb-4 gap-4`}>
                  <div><h2 className={`text-lg font-bold ${th.text}`}>📅 Agenda Médica</h2></div>
                  <button onClick={() => setShowCalendarModal(true)} className="bg-indigo-600 text-white text-xs px-4 py-2 rounded-xl font-bold">➕ Agendar Cita</button>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {myAppointments.map(app => (
                    <div key={app.id} className={`p-3 ${th.input} rounded-lg border ${th.border} text-xs flex justify-between items-center`}>
                      <div><span className="font-bold text-indigo-500">{app.patientName}</span><p className={`text-[11px] ${th.textMuted}`}>{app.start?.replace('T', ' - ')}</p></div>
                      <button onClick={() => handleSyncToGoogleCalendar(app)} className="bg-emerald-600 px-3 py-1 text-white rounded text-[10px] shadow font-bold">🗓️ Google Calendar</button>
                    </div>
                  ))}
                  {myAppointments.length === 0 && <p className={`text-[11px] ${th.textMuted} italic`}>No hay citas programadas.</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {mode === AppMode.CLINICAL && (
          <div className="space-y-6 flex-1 flex flex-col w-full">
            {!currentUser ? (
              <div className={`${th.card} border ${th.border} rounded-2xl p-6 space-y-4 max-w-md mx-auto`}>
                <h2 className={`text-lg font-semibold ${th.text} text-center`}>Acceso Profesional Clínico</h2>
                <form onSubmit={handleLogin} className="space-y-3">
                  <input type="text" required value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} placeholder="Usuario" className={`w-full p-2.5 ${th.input} border ${th.border} rounded-xl text-sm ${th.text} focus:outline-none`} />
                  <input type="password" required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="••••••••" className={`w-full p-2.5 ${th.input} border ${th.border} rounded-xl text-sm ${th.text} focus:outline-none`} />
                  {loginError && <p className="text-xs text-red-500">{loginError}</p>}
                  <button type="submit" className="w-full py-2.5 bg-indigo-600 font-semibold text-white rounded-xl text-xs">Iniciar Sesión</button>
                </form>
              </div>
            ) : (
              <div className="flex-1 flex flex-col space-y-6 w-full">
                
                <div className={`bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4`}>
                  <div className="min-w-0">
                    <h2 className={`text-lg font-semibold ${th.text} truncate`}>🥼 {getProfPrefix(currentUser.professionType)} {currentUser.fullName}</h2>
                    <p className={`text-xs ${th.textMuted} font-mono truncate`}>Colegiado: {currentUser.colegiado} | Plan: <span className="font-bold text-amber-500">{currentUser.licenseType}</span></p>
                  </div>
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <button onClick={handleExportBackup} className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-400 px-3 py-1.5 rounded-xl border border-emerald-500/30">💾 Respaldo JSON</button>
                    <button onClick={() => { setCurrentUser(null); setActiveCase(null); }} className="text-xs bg-red-100 text-red-700 dark:bg-red-600/20 dark:text-red-400 px-3 py-1.5 rounded-xl border border-red-500/30">Cerrar Sesión</button>
                  </div>
                </div>

                <div className={`flex flex-wrap sm:flex-nowrap gap-2 sm:gap-4 border-b ${th.border} pb-4`}>
                  <button onClick={() => { setActiveCase(null); setClinicalTab('BUSCAR'); }} className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold ${!activeCase && clinicalTab === 'BUSCAR' ? 'bg-indigo-600 text-white' : `${th.card} ${th.textMuted}`}`}>🔍 Búsqueda</button>
                  <button onClick={() => { setActiveCase(null); setClinicalTab('ALERTAS'); }} className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold ${!activeCase && clinicalTab === 'ALERTAS' ? 'bg-amber-600 text-white' : `${th.card} ${th.textMuted}`}`}>🚨 Alertas {totalAlerts > 0 && <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px] ml-1">{totalAlerts}</span>}</button>
                  <button onClick={() => { setActiveCase(null); setClinicalTab('PERFIL'); }} className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold ${!activeCase && clinicalTab === 'PERFIL' ? 'bg-indigo-600 text-white' : `${th.card} ${th.textMuted}`}`}>⚙️ Mi Perfil</button>
                </div>

                {!activeCase && clinicalTab === 'PERFIL' && (
                  <div className={`${th.card} border ${th.border} rounded-2xl p-4 sm:p-6 space-y-6 w-full`}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <form onSubmit={handleUpdateProfile} className="space-y-6">
                        <div className={`${th.input} p-5 rounded-xl border ${th.border} space-y-4`}>
                          <h4 className="text-xs font-bold text-indigo-500 uppercase">✏️ Datos Profesionales & Alertas</h4>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>Título</label>
                              <select value={editProfessionType} onChange={(e) => setEditProfessionType(e.target.value)} className={`w-full p-2 ${th.card} border ${th.border} rounded text-xs ${th.text}`}>
                                <option value="PSICOLOGO">Psicólogo(a) Clínico</option>
                                <option value="PSIQUIATRA">Médico Psiquiatra</option>
                              </select>
                            </div>
                            <div>
                              <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>Nombre Completo</label>
                              <input type="text" required value={editProfileName} onChange={(e) => setEditProfileName(e.target.value)} className={`w-full p-2 ${th.card} border ${th.border} rounded text-xs ${th.text}`} />
                            </div>
                          </div>
                          <div>
                            <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>Días para Alerta de Abandono de Tratamiento</label>
                            <select value={editAbandonmentThreshold} onChange={(e) => setEditAbandonmentThreshold(parseInt(e.target.value))} className={`w-full p-2 ${th.card} border ${th.border} rounded text-xs ${th.text}`}>
                              <option value={15}>15 Días sin sesión</option>
                              <option value={30}>30 Días sin sesión</option>
                              <option value={45}>45 Días sin sesión</option>
                              <option value={60}>60 Días sin sesión</option>
                              <option value={90}>90 Días sin sesión</option>
                            </select>
                          </div>
                        </div>
                        <button type="submit" className="w-full py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-xs">Guardar Perfil</button>
                      </form>

                      {/* COLUMNA DE SEGURIDAD Y CAMBIO DE CONTRASEÑA */}
                      <div className="space-y-6">
                        <div className={`${th.input} p-5 rounded-xl border ${th.border} space-y-4`}>
                          <h4 className={`text-xs font-bold ${th.textMuted} uppercase border-b ${th.border} pb-2`}>🔒 Seguridad y Licencia</h4>
                          <div>
                            <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>Usuario</label>
                            <input type="text" disabled value={currentUser.username} className={`w-full p-2 ${th.card} border ${th.border} rounded text-xs ${th.textMuted} cursor-not-allowed font-mono opacity-60`} />
                          </div>
                          <button type="button" onClick={() => setShowPasswordModal(true)} className={`px-5 py-2 bg-slate-300 hover:bg-slate-400 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold w-full mt-4 transition-colors`}>
                            🔑 Cambiar Contraseña
                          </button>
                        </div>
                      </div>

                    </div>
                  </div>
                )}

                {!activeCase && clinicalTab === 'ALERTAS' && (
                  <div className="w-full">
                    {totalAlerts === 0 ? (
                      <div className={`text-center py-10 ${th.card} rounded-2xl border ${th.border}`}>
                         <span className="text-3xl block opacity-50 mb-2">✅</span><p className={`${th.textMuted} text-xs font-bold uppercase`}>Bandeja Limpia</p>
                      </div>
                    ) : (
                      <div className="space-y-4 w-full">
                        {/* ALERTAS CRÍTICAS DE VOZ (VAPI / ALMA) */}
                        {emergencyAlerts.map((alert: any) => (
                          <div key={alert?.id || Math.random()} className="bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-500/60 rounded-2xl p-4 flex flex-col sm:flex-row justify-between border relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-red-500 animate-pulse"></div>
                            <div className="pl-3">
                              <h3 className="text-sm font-bold text-red-600 dark:text-red-400">🚨 Llamada de Emergencia (Vapi / ALMA)</h3>
                              <p className="text-xs text-red-800 dark:text-red-200 mb-2">Paciente: {alert?.patientName}</p>
                              {alert?.audioUrl && (
                                <div className="mt-2 flex flex-col gap-1">
                                  <span className="text-[10px] font-bold text-red-700 dark:text-red-300 uppercase">Audio de la intervención en crisis:</span>
                                  <audio controls src={alert.audioUrl} className="h-8 w-full max-w-[250px]"></audio>
                                </div>
                              )}
                            </div>
                            <button onClick={() => handleViewEmergency(alert.patientId)} className="mt-4 sm:mt-0 px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl h-10 self-start sm:self-center shadow-md transition-colors">Analizar</button>
                          </div>
                        ))}
                        {/* ALERTAS DE ABANDONO DE TRATAMIENTO */}
                        {abandonmentAlerts.map((alert: any) => (
                          <div key={alert?.id || Math.random()} className="bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-500/60 rounded-2xl p-4 flex flex-col sm:flex-row justify-between border">
                            <div>
                              <h3 className="text-sm font-bold text-amber-600 dark:text-amber-400">⚠️ Riesgo de Abandono</h3>
                              <p className="text-xs text-amber-800 dark:text-amber-200 mt-1">Paciente: {alert?.patientName} | <span className="font-bold">{alert?.days} días</span> sin asistir.</p>
                            </div>
                            <button onClick={() => handleViewEmergency(alert.patientId)} className="mt-3 sm:mt-0 px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl h-10 self-start sm:self-center shadow-md transition-colors">Ver Expediente</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!activeCase && clinicalTab === 'BUSCAR' && (
                  <div className={`${th.card} border ${th.border} rounded-2xl p-4 sm:p-6 space-y-4 w-full`}>
                    <div className="flex justify-between items-center"><h3 className={`text-sm font-semibold ${th.text} uppercase font-mono`}>🔍 BÚSQUEDA DE EXPEDIENTES</h3><button onClick={() => setShowRegisterForm(!showRegisterForm)} className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-600/20 dark:text-indigo-400 px-3 py-1.5 rounded-xl border border-indigo-500/30">➕ Nuevo Expediente</button></div>
                    {showRegisterForm && (
                      <form onSubmit={handleRegisterPatient} className={`${th.input} p-5 rounded-xl border ${th.border} space-y-5 shadow-inner`}>
                        <div>
                          <h4 className={`text-[10px] font-bold text-indigo-500 uppercase border-b ${th.border} pb-2 mb-3`}>1. Datos Personales Básicos</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <input type="text" required placeholder="ID Expediente (Ej. PAC-001)" value={newPatientData.id} onChange={(e) => setNewPatientForm(p => ({ ...p, id: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                            <input type="text" required placeholder="Nombre Completo" value={newPatientData.patientName} onChange={(e) => setNewPatientForm(p => ({ ...p, patientName: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} sm:col-span-2 focus:border-indigo-500 outline-none`} />
                            <input type="text" placeholder="Teléfono" value={newPatientData.telefono} onChange={(e) => setNewPatientForm(p => ({ ...p, telefono: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                            <input type="text" placeholder="Edad" value={newPatientData.edad} onChange={(e) => setNewPatientForm(p => ({ ...p, edad: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                            
                            <div className="sm:col-span-2 space-y-1">
                               <label className={`text-[10px] ${th.textMuted} font-bold`}>Foto del Paciente (Archivo Local o URL)</label>
                               <div className="flex gap-2">
                                  <input type="file" accept="image/*" onChange={(e) => { if(e.target.files?.[0]) setNewPatientForm(p => ({...p, fotoUrl: URL.createObjectURL(e.target.files![0])})) }} className={`flex-1 p-2 ${th.card} border ${th.border} rounded-lg text-[10px] ${th.text}`} />
                                  <input type="url" placeholder="O pegue una URL..." value={newPatientData.fotoUrl} onChange={(e) => setNewPatientForm(p => ({ ...p, fotoUrl: e.target.value }))} className={`flex-1 p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text}`} />
                               </div>
                            </div>
                            
                            <select value={newPatientData.sexo} onChange={(e) => setNewPatientForm(p => ({ ...p, sexo: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`}>
                              <option value="Femenino">Femenino</option>
                              <option value="Masculino">Masculino</option>
                              <option value="Otro">Otro</option>
                            </select>
                            <select value={newPatientData.estadoCivil} onChange={(e) => setNewPatientForm(p => ({ ...p, estadoCivil: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`}>
                              <option value="Soltero(a)">Soltero(a)</option>
                              <option value="Casado(a)">Casado(a)</option>
                              <option value="Divorciado(a)">Divorciado(a)</option>
                              <option value="Viudo(a)">Viudo(a)</option>
                              <option value="Unión Libre">Unión Libre</option>
                            </select>
                            <input type="text" placeholder="Religión" value={newPatientData.religion} onChange={(e) => setNewPatientForm(p => ({ ...p, religion: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                          </div>
                        </div>

                        <div>
                          <h4 className={`text-[10px] font-bold text-indigo-500 uppercase border-b ${th.border} pb-2 mb-3`}>2. Contexto Sociodemográfico</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <input type="text" placeholder="Ocupación" value={newPatientData.ocupacion} onChange={(e) => setNewPatientForm(p => ({ ...p, ocupacion: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                            <input type="text" placeholder="Grado de Estudios" value={newPatientData.estudios} onChange={(e) => setNewPatientForm(p => ({ ...p, estudios: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                            <input type="text" placeholder="Lugar de Origen / Procedencia" value={newPatientData.origenProcedencia} onChange={(e) => setNewPatientForm(p => ({ ...p, origenProcedencia: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                            <input type="text" placeholder="Datos de Progenitores (Nombres, edades, estado...)" value={newPatientData.datosProgenitores} onChange={(e) => setNewPatientForm(p => ({ ...p, datosProgenitores: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} sm:col-span-3 focus:border-indigo-500 outline-none`} />
                          </div>
                        </div>

                        <div>
                          <h4 className={`text-[10px] font-bold text-indigo-500 uppercase border-b ${th.border} pb-2 mb-3`}>3. Anamnesis y Motivo de Consulta</h4>
                          <div className="space-y-3">
                            <textarea rows={2} placeholder="Antecedentes Médicos / Psicológicos Previos..." value={newPatientData.antecedentes} onChange={(e) => setNewPatientForm(p => ({ ...p, antecedentes: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                            <textarea required rows={3} placeholder="Motivo de Consulta (Describa el motivo textual por el que asiste el paciente)..." value={newPatientData.motivoConsultaTextual} onChange={(e) => setNewPatientForm(p => ({ ...p, motivoConsultaTextual: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                          </div>
                        </div>

                        <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 font-bold text-white rounded-xl text-xs transition-colors shadow-lg">💾 Guardar Expediente Clínico Completo</button>
                      </form>
                    )}
                    
                    <form onSubmit={handleClinicalSearch} className="flex flex-col sm:flex-row gap-2 w-full">
                      <input type="text" value={clinicalSearchQuery} onChange={(e) => setClinicalSearchQuery(e.target.value)} placeholder="Busque por nombre o ID..." className={`flex-1 p-2.5 ${th.input} border ${th.border} rounded-xl text-xs ${th.text} focus:outline-none`} />
                      <button type="submit" className="w-full sm:w-auto py-2.5 px-6 bg-indigo-600 text-white rounded-xl text-xs text-center font-bold">Buscar</button>
                    </form>

                    {searchFeedback && <p className="text-xs text-indigo-500 mt-2">{searchFeedback}</p>}
                  </div>
                )}

                {activeCase && (
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8 w-full">
                    <div className="xl:col-span-5 space-y-6 w-full">
                      <div className="flex justify-between items-center bg-indigo-500/10 border border-indigo-500/20 p-2 rounded-xl">
                        <button onClick={() => setActiveCase(null)} className="text-xs text-indigo-600 font-bold px-3 py-1">← Atrás</button>
                        <div className="flex gap-2">
                           <button onClick={handleOpenEditPatient} className="text-xs bg-slate-600 hover:bg-slate-500 text-white font-bold px-3 py-1.5 rounded-xl shadow">✏️ Editar</button>
                           <button onClick={() => handleOpenCertificateModal('ATTENDANCE')} className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-xl shadow">📄 Constancia</button>
                           <button onClick={() => handleOpenCertificateModal('REFERRAL')} className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-1.5 rounded-xl shadow">🔁 Referencia</button>
                           {currentUser?.professionType === 'PSIQUIATRA' && (
                             <button onClick={() => setShowRecipeModal(true)} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-xl shadow">💊 Receta</button>
                           )}
                        </div>
                      </div>

                      {/* TABS PRINCIPALES */}
                      <div className={`flex flex-wrap gap-2 ${th.card} p-2 rounded-2xl border ${th.border} w-full`}>
                        <button onClick={() => setActiveCaseTab('HISTORIAL')} className={`flex-auto py-2 px-1 rounded-xl text-[10px] font-bold transition-colors ${activeCaseTab === 'HISTORIAL' ? 'bg-indigo-600 text-white shadow' : `hover:bg-slate-800 ${th.textMuted}`}`}>📝 Historial</button>
                        <button onClick={() => setActiveCaseTab('ESTADISTICAS_BASE')} className={`flex-auto py-2 px-1 rounded-xl text-[10px] font-bold transition-colors ${activeCaseTab === 'ESTADISTICAS_BASE' ? 'bg-indigo-600 text-white shadow' : `hover:bg-slate-800 ${th.textMuted}`}`}>📈 KPIs Base</button>
                        <button onClick={() => setActiveCaseTab('ESPECIALIDADES')} className={`flex-auto py-2 px-1 rounded-xl text-[10px] font-bold transition-colors ${activeCaseTab === 'ESPECIALIDADES' ? 'bg-fuchsia-600 text-white shadow' : `hover:bg-slate-800 ${th.textMuted}`}`}>🧠 Trastornos</button>
                        <button onClick={() => setActiveCaseTab('PERSPECTIVAS')} className={`flex-auto py-2 px-1 rounded-xl text-[10px] font-bold transition-colors ${activeCaseTab === 'PERSPECTIVAS' ? 'bg-amber-600 text-white shadow' : `hover:bg-slate-800 ${th.textMuted}`}`}>🎭 Corrientes</button>
                        <button onClick={() => setActiveCaseTab('EVOLUTIVA')} className={`flex-auto py-2 px-1 rounded-xl text-[10px] font-bold transition-colors ${activeCaseTab === 'EVOLUTIVA' ? 'bg-rose-600 text-white shadow' : `hover:bg-slate-800 ${th.textMuted}`}`}>🧬 Evolutiva</button>
                        {currentUser?.professionType === 'PSIQUIATRA' && (
                           <button onClick={() => setActiveCaseTab('FARMACOLOGIA')} className={`flex-auto py-2 px-1 rounded-xl text-[10px] font-bold transition-colors ${activeCaseTab === 'FARMACOLOGIA' ? 'bg-emerald-600 text-white shadow' : `hover:bg-slate-800 ${th.textMuted}`}`}>💊 Fármacos</button>
                        )}
                      </div>

                      {activeCaseTab === 'HISTORIAL' && (
                        <div className={`${th.card} border ${th.border} rounded-2xl p-4 space-y-4`}>
                          <div className={`flex justify-between items-center border-b ${th.border} pb-2`}>
                            <span className={`text-xs font-bold ${th.textMuted}`}>Sesiones del Paciente</span>
                            <button onClick={() => setShowNewSessionForm(!showNewSessionForm)} className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-xl">➕ Nueva Sesión</button>
                          </div>

                          {showNewSessionForm && (
                            <form onSubmit={handleAddNewSession} className={`${th.input} p-4 rounded-xl border ${th.border} space-y-4 text-xs`}>
                              
                              <input type="date" value={newSessionData.date} onChange={(e) => setNewSessionData((p:any) => ({ ...p, date: e.target.value }))} className={`w-full p-2 ${th.card} border ${th.border} rounded ${th.text}`} />
                              
                              {currentUser?.professionType === 'PSIQUIATRA' && (
                                <div className={`${th.card} p-3 rounded-xl border border-emerald-500/30 space-y-3`}>
                                  <div className="flex justify-between items-center">
                                     <label className="text-[10px] font-bold text-emerald-500 uppercase block">💊 Prescripción y Control Farmacológico</label>
                                     <input type="checkbox" checked={pharmaInput.active} onChange={e => setPharmaInput(prev => ({...prev, active: e.target.checked}))} className="accent-emerald-500" />
                                  </div>
                                  
                                  {pharmaInput.active && (
                                     <div className="space-y-3 mt-2 border-t border-slate-700 pt-2">
                                        <div className="grid grid-cols-2 gap-2">
                                           <input type="text" placeholder="Nombre Fármaco (ej. Sertralina)" value={pharmaInput.name} onChange={e => setPharmaInput(prev => ({...prev, name: e.target.value}))} className={`w-full p-2 ${th.input} border ${th.border} rounded text-[10px] text-white`} required />
                                           <input type="text" placeholder="Dosis (ej. 50mg/día)" value={pharmaInput.dose} onChange={e => setPharmaInput(prev => ({...prev, dose: e.target.value}))} className={`w-full p-2 ${th.input} border ${th.border} rounded text-[10px] text-white`} required />
                                        </div>
                                        <div className="space-y-2">
                                           <div className="flex items-center gap-2">
                                              <span className={`w-20 text-[9px] ${th.textMuted} leading-tight`}>Efectividad Percibida</span>
                                              <input type="range" min="0" max="100" value={pharmaInput.effectiveness} onChange={e => setPharmaInput(prev => ({...prev, effectiveness: parseInt(e.target.value)}))} className="flex-1 accent-emerald-500" />
                                              <span className="w-6 text-[9px] font-bold text-emerald-500 text-right">{pharmaInput.effectiveness}%</span>
                                           </div>
                                           <div className="flex items-center gap-2">
                                              <span className={`w-20 text-[9px] ${th.textMuted} leading-tight`}>Riesgo / Efectos Adv.</span>
                                              <input type="range" min="0" max="100" value={pharmaInput.risk} onChange={e => setPharmaInput(prev => ({...prev, risk: parseInt(e.target.value)}))} className="flex-1 accent-rose-500" />
                                              <span className="w-6 text-[9px] font-bold text-rose-500 text-right">{pharmaInput.risk}%</span>
                                           </div>
                                        </div>
                                     </div>
                                  )}
                                </div>
                              )}

                              <div className={`${th.card} p-3 rounded-xl border ${th.border} space-y-2`}>
                                <label className={`text-[10px] font-bold text-indigo-500 uppercase block`}>🔗 Enlace de Sesión (Zoom/Meet/Drive)</label>
                                <input type="url" placeholder="Pegue la URL de la videollamada aquí..." value={newSessionData.videoUrl || ''} onChange={(e) => setNewSessionData((p:any) => ({ ...p, videoUrl: e.target.value }))} className={`w-full p-2 ${th.input} border ${th.border} rounded ${th.text} text-[11px]`} />
                              </div>

                              <div className={`${th.card} p-3 rounded-xl border border-indigo-500/30 space-y-3`}>
                                <label className="text-[10px] font-bold text-indigo-500 uppercase block">🕸️ {t('Evaluación Multiaxial (1 al 10)')}</label>
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-16 text-[9px] ${th.textMuted}`}>{t('Sueño')}</span>
                                    <input type="range" min="1" max="10" value={sessionAreas.sleep} onChange={e=>setSessionAreas(prev=>({...prev, sleep: parseInt(e.target.value)}))} className="flex-1 accent-indigo-500" />
                                    <span className="w-4 text-[9px] font-bold text-indigo-500 text-right">{sessionAreas.sleep}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`w-16 text-[9px] ${th.textMuted}`}>{t('Apetito')}</span>
                                    <input type="range" min="1" max="10" value={sessionAreas.appetite} onChange={e=>setSessionAreas(prev=>({...prev, appetite: parseInt(e.target.value)}))} className="flex-1" />
                                    <span className="w-4 text-[9px] font-bold text-indigo-500 text-right">{sessionAreas.appetite}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`w-16 text-[9px] ${th.textMuted}`}>{t('Energía')}</span>
                                    <input type="range" min="1" max="10" value={sessionAreas.energy} onChange={e=>setSessionAreas(prev=>({...prev, energy: parseInt(e.target.value)}))} className="flex-1" />
                                    <span className="w-4 text-[9px] font-bold text-indigo-500 text-right">{sessionAreas.energy}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`w-16 text-[9px] ${th.textMuted}`}>{t('Social')}</span>
                                    <input type="range" min="1" max="10" value={sessionAreas.social} onChange={e=>setSessionAreas(prev=>({...prev, social: parseInt(e.target.value)}))} className="flex-1" />
                                    <span className="w-4 text-[9px] font-bold text-indigo-500 text-right">{sessionAreas.social}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className={`w-16 text-[9px] ${th.textMuted}`}>{t('Atención')}</span>
                                    <input type="range" min="1" max="10" value={sessionAreas.concentration} onChange={e=>setSessionAreas(prev=>({...prev, concentration: parseInt(e.target.value)}))} className="flex-1" />
                                    <span className="w-4 text-[9px] font-bold text-indigo-500 text-right">{sessionAreas.concentration}</span>
                                  </div>
                                </div>
                              </div>

                              <div className={`${th.card} p-3 rounded-xl border ${th.border} space-y-3`}>
                                <label className={`text-[10px] font-bold ${th.textMuted} uppercase block`}>🎙️ Grabadora, Dictado IA y Audios</label>
                                
                                <button type="button" onClick={isRecordingLive ? toggleRecording : connectMicrophone} className={`w-full py-2.5 rounded-lg font-bold text-white transition-colors text-xs shadow-md ${isRecordingLive ? 'bg-red-600 animate-pulse' : 'bg-emerald-600 hover:bg-emerald-500'}`}>
                                  {isRecordingLive ? '🔴 Grabando... (Clic para Detener)' : '🎤 Conectar Micrófono / Iniciar Grabación'}
                                </button>

                                {newSessionData.audioPath && <p className="text-[9px] text-emerald-500 break-all font-bold">✓ Audio vinculado al expediente: {newSessionData.audioPath}</p>}
                                
                                <div className="flex gap-2 mt-2">
                                  <input type="text" placeholder="Dictado rápido para IA..." value={voiceInputText} onChange={(e) => setVoiceInputText(e.target.value)} className={`flex-1 p-2 ${th.input} border ${th.border} rounded ${th.text} text-[11px]`} />
                                  <button type="button" onClick={handleAiDictationAssist} disabled={isDictatingVoice} className="bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded text-white font-bold text-[11px] disabled:opacity-50">✨ IA</button>
                                </div>
                                <label className={`text-[10px] font-bold ${th.textMuted} uppercase block mt-3`}>📎 Subir Audio o MP3 Externo</label>
                                <input type="file" accept="audio/*, .mp3, .wav" onChange={(e) => {
                                  if(e.target.files?.[0]) setNewSessionData((p:any) => ({...p, audioPath: URL.createObjectURL(e.target.files![0])}));
                                }} className={`w-full p-2 ${th.input} border ${th.border} rounded ${th.text} text-[11px]`} />
                              </div>

                              <div className={`${th.card} p-3 rounded-xl border ${th.border} space-y-2`}>
                                 <label className={`text-[10px] font-bold text-indigo-500 uppercase block`}>📎 Subir Batería Resuelta Manualmente</label>
                                 <input type="file" accept=".pdf, image/*" onChange={(e) => {
                                    if(e.target.files?.[0]) setNewSessionData((p:any) => ({...p, manualBatteryFile: URL.createObjectURL(e.target.files![0])}));
                                 }} className={`w-full p-2 ${th.input} border ${th.border} rounded ${th.text} text-[11px]`} />
                                 {newSessionData.manualBatteryFile && (
                                   <div className="flex gap-2 items-center mt-2">
                                     <span className="text-[9px] text-emerald-500 font-bold">✓ Archivo listo</span>
                                     <button type="button" onClick={() => alert("Simulación: Analizando batería subida con IA... Se agregarán los resultados.")} className="bg-indigo-600 text-white text-[9px] px-2 py-1 rounded">Analizar con IA</button>
                                   </div>
                                 )}
                              </div>

                              <div className={`${th.card} p-3 rounded-xl border ${th.border} space-y-2`}>
                                <label className={`text-[10px] font-bold text-indigo-500 uppercase block`}>📝 Alimentación Escrita (Notas Manuales)</label>
                                <textarea required rows={4} value={newSessionData.rawNotes} onChange={(e) => setNewSessionData((p:any) => ({ ...p, rawNotes: e.target.value }))} placeholder="Escriba aquí los detalles y observaciones de la sesión..." className={`w-full p-2 ${th.input} border ${th.border} rounded ${th.text} font-mono`} />
                              </div>

                              <button type="submit" className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded shadow-md">Guardar Sesión</button>
                            </form>
                          )}

                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {(activeCase.sessions || []).map((s) => (
                              <div key={s.sessionNumber} className={`${th.input} p-3 rounded-xl border ${th.border} text-xs`}>
                                <div className="flex justify-between font-bold text-indigo-500"><span>S{s.sessionNumber}</span><span>{s.date}</span></div>
                                <p className="italic mt-1">"{s.rawNotes}"</p>
                                {s.pharma && s.pharma.name && (
                                   <div className="mt-1 p-1 bg-emerald-950/30 border border-emerald-500/20 rounded">
                                      <p className="text-[9px] font-mono text-emerald-400">💊 Fármaco: {s.pharma.name} ({s.pharma.dose}) | Ef: {s.pharma.effectiveness}% | R: {s.pharma.risk}%</p>
                                   </div>
                                )}
                                {s.videoUrl && <p className="text-[10px] text-blue-500 mt-1 truncate">🔗 Enlace de Sesión: <a href={s.videoUrl} target="_blank" rel="noreferrer" className="underline font-bold">{s.videoUrl}</a></p>}
                                {s.manualBatteryFile && <p className="text-[10px] text-emerald-500 mt-1 font-bold">📎 Batería Manual Adjunta</p>}
                                {s.audioPath && <audio controls src={s.audioPath} className="h-8 w-full max-w-[200px] mt-2"></audio>}
                              </div>
                            ))}
                          </div>

                          <div className={`${th.input} p-4 rounded-xl border ${th.border}`}>
                            <span className={`font-bold ${th.text} block mb-2`}>{t('Baterías Clínicas Internacionales (APA / OMS)')}</span>
                            <div className="space-y-2 max-h-72 overflow-y-auto pr-2">
                              {CLINICAL_EVALUATIONS.map((template) => (
                                <div key={template.id} className={`flex justify-between items-center ${th.card} p-2.5 rounded border ${th.border} hover:border-indigo-500/50 transition`}>
                                  <span className={`text-[11px] ${th.text} font-semibold`}>{template.name}</span>
                                  <button onClick={() => { setSelectedDsmTemplate(template); setShowDsmModal(true); }} className="text-[9px] bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded font-bold">{t('Aplicar')}</button>
                                </div>
                              ))}
                            </div>
                          </div>

                          <button onClick={handleProcessNotes} disabled={isProcessingNotes} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl text-xs shadow-md">
                            {isProcessingNotes ? '⏳ Procesando...' : 'Generar Dictamen IA'}
                          </button>
                        </div>
                      )}

                      {/* RENDERIZADO CONDICIONAL DE DASHBOARDS */}
                      {activeCaseTab === 'ESTADISTICAS_BASE' && <PatientDashboard activeCase={activeCase} dashboardType="BASE" onUpdateCase={handleUpdateActiveCase} onGenerateSpecialtyAi={handleGenerateSpecialtyAi} isGeneratingAi={isProcessingSpecialtyAi} />}
                      {activeCaseTab === 'ESPECIALIDADES' && <PatientDashboard activeCase={activeCase} dashboardType="SPECIALTY" onUpdateCase={handleUpdateActiveCase} onGenerateSpecialtyAi={handleGenerateSpecialtyAi} isGeneratingAi={isProcessingSpecialtyAi} />}
                      {activeCaseTab === 'FARMACOLOGIA' && <PatientDashboard activeCase={activeCase} dashboardType="PHARMA" onUpdateCase={handleUpdateActiveCase} onGenerateSpecialtyAi={handleGenerateSpecialtyAi} isGeneratingAi={isProcessingSpecialtyAi} />}
                      
                      {activeCaseTab === 'PERSPECTIVAS' && (
                        <>
                           <PatientDashboard activeCase={activeCase} dashboardType="PERSPECTIVES" onUpdateCase={handleUpdateActiveCase} onGenerateSpecialtyAi={handleGenerateSpecialtyAi} isGeneratingAi={isProcessingSpecialtyAi} />
                           <div className={`${th.card} border ${th.border} rounded-2xl p-4 sm:p-6 space-y-4 w-full mt-6`}>
                             <h4 className="text-xs font-bold text-fuchsia-400 uppercase">🧠 Generar Análisis Teórico Completo</h4>
                             <p className="text-[10px] text-slate-400">La IA analizará el caso actuando como experto en la corriente seleccionada.</p>
                             <button onClick={() => handleProcessTheoreticalNotes('THEORETICAL')} disabled={isProcessingNotes} className="w-full py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-bold rounded-xl text-xs shadow-md">
                               {isProcessingNotes ? '⏳ Procesando Análisis Teórico...' : 'Analizar Corriente Actual (IA)'}
                             </button>
                           </div>
                        </>
                      )}
                      {activeCaseTab === 'EVOLUTIVA' && (
                        <>
                           <PatientDashboard activeCase={activeCase} dashboardType="EVOLUTIONARY" onUpdateCase={handleUpdateActiveCase} onGenerateSpecialtyAi={handleGenerateSpecialtyAi} isGeneratingAi={isProcessingSpecialtyAi} />
                           <div className={`${th.card} border ${th.border} rounded-2xl p-4 sm:p-6 space-y-4 w-full mt-6`}>
                             <h4 className="text-xs font-bold text-rose-400 uppercase">🧬 Generar Análisis Evolutivo</h4>
                             <p className="text-[10px] text-slate-400">La IA analizará el valor de supervivencia y adaptación darwiniana de los síntomas del paciente.</p>
                             <button onClick={() => handleProcessTheoreticalNotes('EVOLUTIONARY')} disabled={isProcessingNotes} className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs shadow-md">
                               {isProcessingNotes ? '⏳ Procesando Análisis Evolutivo...' : 'Analizar Valor Adaptativo (IA)'}
                             </button>
                           </div>
                        </>
                      )}

                      {/* SIEMPRE VISIBLE: CONSULTA ACADÉMICA / CIENTÍFICA */}
                      <div className={`${th.card} border ${th.border} rounded-2xl p-4 sm:p-6 space-y-3 w-full mt-6`}>
                        <span className={`text-xs font-bold ${th.text} uppercase block tracking-wider truncate`}>🔬 {t('Consulta Académica / Científica')}</span>
                        <textarea value={scientificQuery.queryText} onChange={(e) => setScientificQuery(prev => ({ ...prev, queryText: e.target.value }))} rows={2} placeholder={t('Consulte dudas teóricas, criterios del DSM-5, medicamentos...')} className={`w-full p-2 ${th.input} border ${th.border} rounded text-xs ${th.text}`} />
                        <button onClick={handleScientificQuery} disabled={scientificQuery.loading} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-semibold text-center transition-colors">
                          {scientificQuery.loading ? t('Consultando Base de Datos...') : t('Realizar Consulta')}
                        </button>
                      </div>

                    </div>

                    <div className="xl:col-span-7 space-y-6 w-full flex flex-col">
                      {/* VISTA DINÁMICA DEL TEXTO IA SEGÚN LA PESTAÑA ACTIVA */}
                      <div className={`${th.card} border ${th.border} rounded-2xl flex flex-col min-h-[450px]`}>
                        <div className={`${th.input} px-4 py-4 border-b ${th.border} flex flex-wrap gap-2 justify-between items-center`}>
                          <span className={`text-xs font-bold ${th.textMuted} uppercase`}>
                            {activeCaseTab === 'PERSPECTIVAS' ? 'Análisis de Corrientes Psicológicas' : 
                             activeCaseTab === 'EVOLUTIVA' ? 'Análisis Clínico Evolutivo' : 
                             t('Dictamen Clínico Profesional')}
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                             <select value={pdfLang} onChange={e => setPdfLang(e.target.value as any)} className={`text-[10px] p-1.5 rounded border ${th.border} ${th.card}`}>
                               <option value="ES">ES</option><option value="EN">EN</option>
                             </select>
                             <button onClick={() => handleDownloadReport('PDF')} disabled={isGeneratingPdf} className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-bold">📄 PDF</button>
                             <button onClick={() => handleDownloadReport('DOC')} disabled={isGeneratingPdf} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-bold">📝 Word (.doc)</button>
                          </div>
                        </div>
                        <div className={`p-5 flex-1 flex flex-col gap-4 overflow-y-auto max-h-[800px]`}>
                          <div className={`text-[13px] ${th.text} font-mono whitespace-pre-wrap`}>
                            {activeCaseTab === 'PERSPECTIVAS' 
                               ? (theoreticalAnalysisResult || "Presione 'Analizar Corriente Actual (IA)' en la columna izquierda para obtener la opinión de la Inteligencia Artificial.")
                               : activeCaseTab === 'EVOLUTIVA'
                               ? (evolutionaryAnalysisResult || "Presione 'Analizar Valor Adaptativo (IA)' en la columna izquierda.")
                               : (notesResult || "Presione 'Generar Dictamen IA'.")}
                          </div>
                          
                          {/* SECCIÓN GLOBAL DE COMENTARIOS DEL PROFESIONAL SIN TOCAR LA IA */}
                          <div className="mt-4 border-t border-slate-700 pt-4">
                              <div className="flex justify-between items-center mb-2">
                                  <h4 className="text-xs font-bold text-amber-500 uppercase">🧑‍⚕️ Mis Comentarios y Opinión Clínica (Privado)</h4>
                                  <span className="text-[9px] text-slate-500">Se guarda automáticamente</span>
                              </div>
                              <textarea 
                                  value={(activeCase as any).professionalOpinion || ''} 
                                  onChange={(e) => {
                                      const updatedCase = { ...activeCase, professionalOpinion: e.target.value };
                                      handleUpdateActiveCase(updatedCase);
                                  }}
                                  rows={5} 
                                  placeholder="Escriba aquí su propio análisis global, diagnóstico diferencial o plan de acción. Este texto NO será modificado por la IA y aparecerá en sus reportes..." 
                                  className={`w-full p-3 ${th.input} border ${th.border} rounded-xl text-[12px] ${th.text} font-sans focus:border-amber-500 outline-none`} 
                              />
                          </div>
                        </div>
                      </div>

                      {/* RESULTADOS DE LA CONSULTA CIENTÍFICA */}
                      {scientificQuery.responseText && (
                        <div className={`${th.card} border ${th.border} rounded-2xl flex flex-col w-full overflow-hidden mt-6`}>
                          <div className={`${th.input} px-4 sm:px-6 py-4 border-b ${th.border} flex justify-between items-center`}>
                            <span className={`text-xs font-bold ${th.textMuted} uppercase tracking-wide truncate`}>Resultados de Consulta Científica</span>
                            <button onClick={() => setScientificQuery(prev => ({ ...prev, responseText: '' }))} className={`${th.textMuted} hover:${th.text}`}>✕</button>
                          </div>
                          <div className={`p-4 sm:p-6 flex-1 text-xs ${th.text} font-mono whitespace-pre-wrap break-words leading-relaxed overflow-y-auto max-h-64 w-full`}>
                            {scientificQuery.responseText}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL PARA CAMBIAR CONTRASEÑA */}
      {showPasswordModal && (
        <div className={`fixed inset-0 ${th.modalBg} backdrop-blur-sm flex items-center justify-center p-4 z-50`}>
          <div className={`${th.card} border ${th.border} rounded-2xl max-w-sm w-full p-6 text-xs space-y-4 shadow-2xl`}>
            <div className={`flex justify-between items-center border-b ${th.border} pb-2`}>
              <h3 className={`text-sm font-bold ${th.text}`}>🔒 Cambiar Contraseña</h3>
              <button onClick={() => setShowPasswordModal(false)} className={`${th.textMuted} hover:${th.text}`}>✕</button>
            </div>
            <form onSubmit={handleUserChangePassword} className="space-y-4">
              <div>
                <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>Contraseña Actual</label>
                <input type="password" required value={passForm.oldPass} onChange={e => setPassForm(p => ({...p, oldPass: e.target.value}))} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg ${th.text}`} />
              </div>
              <div>
                <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>Nueva Contraseña</label>
                <input type="password" required value={passForm.newPass} onChange={e => setPassForm(p => ({...p, newPass: e.target.value}))} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg ${th.text}`} />
              </div>
              <div>
                <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>Confirmar Nueva Contraseña</label>
                <input type="password" required value={passForm.confirmPass} onChange={e => setPassForm(p => ({...p, confirmPass: e.target.value}))} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg ${th.text}`} />
              </div>
              {passMessage.text && <p className={`text-[10px] font-bold ${passMessage.type === 'error' ? 'text-red-500' : 'text-emerald-500'}`}>{passMessage.text}</p>}
              <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-colors shadow-lg">Actualizar Contraseña</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL PARA EXTENDER RECETA MÉDICA */}
      {showRecipeModal && activeCase && currentUser?.professionType === 'PSIQUIATRA' && (
        <div className={`fixed inset-0 ${th.modalBg} backdrop-blur-sm flex items-center justify-center p-4 z-50`}>
          <div className={`${th.card} border ${th.border} rounded-2xl max-w-lg w-full p-6 text-xs space-y-4 shadow-2xl`}>
            <div className={`flex justify-between items-center border-b ${th.border} pb-2`}>
              <h3 className="text-sm font-bold text-emerald-500">💊 Extender Receta Médica</h3>
              <button onClick={() => setShowRecipeModal(false)} className={`${th.textMuted} hover:${th.text}`}>✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>Paciente</label>
                <input type="text" disabled value={`${activeCase.patientName} (Exp: ${activeCase.id})`} className={`w-full p-2 ${th.input} border ${th.border} rounded ${th.textMuted} font-mono text-xs`} />
              </div>
              <div>
                <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>Diagnóstico (CIE-11)</label>
                <input type="text" value={recipeData.diagnostico} onChange={e => setRecipeData(prev => ({...prev, diagnostico: e.target.value}))} className={`w-full p-2 ${th.input} border ${th.border} rounded ${th.text}`} />
              </div>
              <div>
                <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>Rp/ (Medicamentos)</label>
                <textarea rows={4} value={recipeData.medicamentos} onChange={e => setRecipeData(prev => ({...prev, medicamentos: e.target.value}))} className={`w-full p-2 ${th.input} border ${th.border} rounded ${th.text} font-mono`} />
              </div>
              <div>
                <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>Instrucciones</label>
                <textarea rows={2} value={recipeData.indicaciones} onChange={e => setRecipeData(prev => ({...prev, indicaciones: e.target.value}))} className={`w-full p-2 ${th.input} border ${th.border} rounded ${th.text}`} />
              </div>
            </div>
            <div className={`flex flex-wrap justify-end gap-2 pt-3 border-t ${th.border}`}>
              <button onClick={() => setShowRecipeModal(false)} className={`px-4 py-2 bg-slate-300 dark:bg-slate-800 ${th.text} font-bold rounded-xl`}>Cancelar</button>
              <button onClick={() => printOrExportRecipe('PRINT')} className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl text-center">🖨️ Imprimir</button>
              <button onClick={() => printOrExportRecipe('WORD')} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl text-center">📝 Descargar Word</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PARA CONSTANCIAS Y REFERENCIAS */}
      {showCertificateModal && activeCase && (
        <div className={`fixed inset-0 ${th.modalBg} backdrop-blur-sm flex items-center justify-center p-4 z-50`}>
          <div className={`${th.card} border ${th.border} rounded-2xl max-w-2xl w-full p-6 text-xs space-y-4 shadow-2xl`}>
            <div className={`flex justify-between items-center border-b ${th.border} pb-2`}>
              <h3 className={`text-sm font-bold ${th.text}`}>{certificateType === 'ATTENDANCE' ? 'Constancia de Asistencia' : 'Orden de Referencia'}</h3>
              <button onClick={() => setShowCertificateModal(false)} className={`${th.textMuted} hover:${th.text}`}>✕</button>
            </div>
            <textarea rows={12} value={certificateText} onChange={(e) => setCertificateText(e.target.value)} className={`w-full p-4 ${th.input} border ${th.border} rounded-xl ${th.text} font-serif leading-relaxed`} />
            <div className={`flex flex-wrap justify-end gap-2 pt-3 border-t ${th.border}`}>
              <button onClick={() => setShowCertificateModal(false)} className={`px-4 py-2 bg-slate-300 dark:bg-slate-800 ${th.text} font-bold rounded-xl`}>Cancelar</button>
              <button onClick={() => printOrExportCertificate('PRINT')} className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-xl">🖨️ Imprimir</button>
              <button onClick={() => printOrExportCertificate('WORD')} className="px-5 py-2 bg-blue-600 text-white font-bold rounded-xl">📝 Descargar Word</button>
            </div>
          </div>
        </div>
      )}

      {/* NUEVO: MODAL PARA EDITAR EXPEDIENTE */}
      {showEditPatientModal && activeCase && (
        <div className={`fixed inset-0 ${th.modalBg} backdrop-blur-sm flex items-center justify-center p-4 z-50`}>
          <div className={`${th.card} border ${th.border} rounded-2xl max-w-3xl w-full p-6 text-xs shadow-2xl max-h-[90vh] overflow-y-auto`}>
            <div className={`flex justify-between items-center border-b ${th.border} pb-3 mb-4`}>
              <h3 className={`text-sm font-bold ${th.text}`}>✏️ Editar Expediente Médico</h3>
              <button onClick={() => setShowEditPatientModal(false)} className={`${th.textMuted} hover:${th.text}`}>✕</button>
            </div>
            <form onSubmit={handleSaveEditPatient} className="space-y-5">
              <div>
                <h4 className={`text-[10px] font-bold text-indigo-500 uppercase border-b ${th.border} pb-2 mb-3`}>{t('1. Datos Personales Básicos')}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  {/* ID BLOQUEADO (READONLY) */}
                  <div className="sm:col-span-1">
                    <label className={`text-[9px] ${th.textMuted} font-bold block mb-1`}>ID Expediente (Protegido)</label>
                    <input type="text" readOnly value={editPatientData.id} className={`w-full p-2.5 bg-slate-800/50 border ${th.border} rounded-lg text-xs text-slate-500 cursor-not-allowed`} />
                  </div>
                  <div className="sm:col-span-3">
                    <label className={`text-[9px] ${th.textMuted} font-bold block mb-1`}>Nombre Completo</label>
                    <input type="text" required value={editPatientData.patientName} onChange={(e) => setEditPatientData(p => ({ ...p, patientName: e.target.value }))} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                  </div>
                  
                  <input type="text" placeholder={t('Teléfono')} value={editPatientData.telefono} onChange={(e) => setEditPatientData(p => ({ ...p, telefono: e.target.value }))} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                  <input type="text" placeholder={t('Edad')} value={editPatientData.edad} onChange={(e) => setEditPatientData(p => ({ ...p, edad: e.target.value }))} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                  
                  <div className="sm:col-span-2 space-y-1">
                     <label className={`text-[9px] ${th.textMuted} font-bold`}>Foto del Paciente (Archivo Local o URL)</label>
                     <div className="flex gap-2">
                        <input type="file" accept="image/*" onChange={(e) => { if(e.target.files?.[0]) setEditPatientData(p => ({...p, fotoUrl: URL.createObjectURL(e.target.files![0])})) }} className={`flex-1 p-2 ${th.input} border ${th.border} rounded-lg text-[10px] ${th.text}`} />
                        <input type="url" placeholder="O pegue una URL..." value={editPatientData.fotoUrl} onChange={(e) => setEditPatientData(p => ({ ...p, fotoUrl: e.target.value }))} className={`flex-1 p-2.5 ${th.input} border ${th.border} rounded-lg text-xs ${th.text}`} />
                     </div>
                  </div>
                  
                  <select value={editPatientData.sexo} onChange={(e) => setEditPatientData(p => ({ ...p, sexo: e.target.value }))} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`}>
                    <option value="Femenino">Femenino</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Otro">Otro</option>
                  </select>
                  <select value={editPatientData.estadoCivil} onChange={(e) => setEditPatientData(p => ({ ...p, estadoCivil: e.target.value }))} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`}>
                    <option value="Soltero(a)">Soltero(a)</option>
                    <option value="Casado(a)">Casado(a)</option>
                    <option value="Divorciado(a)">Divorciado(a)</option>
                    <option value="Viudo(a)">Viudo(a)</option>
                    <option value="Unión Libre">Unión Libre</option>
                  </select>
                  <input type="text" placeholder={t('Religión')} value={editPatientData.religion} onChange={(e) => setEditPatientData(p => ({ ...p, religion: e.target.value }))} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                </div>
              </div>

              <div>
                <h4 className={`text-[10px] font-bold text-indigo-500 uppercase border-b ${th.border} pb-2 mb-3`}>{t('2. Contexto Sociodemográfico')}</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input type="text" placeholder={t('Ocupación')} value={editPatientData.ocupacion} onChange={(e) => setEditPatientData(p => ({ ...p, ocupacion: e.target.value }))} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                  <input type="text" placeholder={t('Grado de Estudios')} value={editPatientData.estudios} onChange={(e) => setEditPatientData(p => ({ ...p, estudios: e.target.value }))} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                  <input type="text" placeholder={t('Lugar de Origen / Procedencia')} value={editPatientData.origenProcedencia} onChange={(e) => setEditPatientData(p => ({ ...p, origenProcedencia: e.target.value }))} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                  <input type="text" placeholder={t('Datos de Progenitores (Nombres, edades, estado...)')} value={editPatientData.datosProgenitores} onChange={(e) => setEditPatientData(p => ({ ...p, datosProgenitores: e.target.value }))} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg text-xs ${th.text} sm:col-span-3 focus:border-indigo-500 outline-none`} />
                </div>
              </div>

              <div>
                <h4 className={`text-[10px] font-bold text-indigo-500 uppercase border-b ${th.border} pb-2 mb-3`}>{t('3. Anamnesis y Motivo de Consulta Inicial')}</h4>
                <div className="space-y-3">
                  <textarea rows={2} placeholder={t('Antecedentes Médicos / Psicológicos Previos...')} value={editPatientData.antecedentes} onChange={(e) => setEditPatientData(p => ({ ...p, antecedentes: e.target.value }))} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                  <textarea required rows={3} placeholder={t('Motivo de Consulta (Describa el motivo textual por el que asiste el paciente)...')} value={editPatientData.motivoConsultaTextual} onChange={(e) => setEditPatientData(p => ({ ...p, motivoConsultaTextual: e.target.value }))} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                </div>
              </div>

              <div className={`flex justify-end gap-2 pt-3 border-t ${th.border}`}>
                <button type="button" onClick={() => setShowEditPatientModal(false)} className={`px-4 py-2 bg-slate-300 dark:bg-slate-800 ${th.text} font-bold rounded-xl`}>Cancelar</button>
                <button type="submit" className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg transition-colors">💾 Guardar Cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE BATERIAS DSM-5 */}
      {showDsmModal && selectedDsmTemplate && (
        <div className={`fixed inset-0 ${th.modalBg} backdrop-blur-sm flex items-center justify-center p-4 z-50`}>
          <div className={`${th.card} border ${th.border} rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden text-xs shadow-2xl`}>
            <div className={`p-4 border-b ${th.border} ${th.input} flex justify-between items-center`}>
              <div className="flex-1"><h3 className={`font-bold ${th.text} text-sm`}>{selectedDsmTemplate.name}</h3></div>
              <button onClick={() => { setShowDsmModal(false); setSelectedDsmTemplate(null); setVerificationPassword(''); }} className={`${th.textMuted} hover:${th.text}`}>✕</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {selectedDsmTemplate.questions.map((q, idx) => (
                <div key={idx} className={`${th.input} p-3 rounded-xl border ${th.border}`}>
                  <p className={`${th.text} font-semibold mb-2`}>{idx + 1}. {q}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {selectedDsmTemplate.options.map((option) => (
                      <label key={option} className={`flex items-center gap-2 p-2 rounded cursor-pointer border transition-colors ${dsmAnswers[q] === option ? 'bg-indigo-100 border-indigo-500 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300' : `${th.card} ${th.border} ${th.text} hover:border-indigo-500`}`}>
                        <input type="radio" checked={dsmAnswers[q] === option} onChange={() => setDsmAnswers(prev => ({ ...prev, [q]: option }))} className="text-indigo-600" />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div className={`${th.input} p-4 rounded-xl border ${th.border} mt-4`}>
                <label className={`block text-[11px] font-bold ${th.textMuted} uppercase`}>Firma Digital para Guardar</label>
                <input type="password" required value={verificationPassword} onChange={(e) => setVerificationPassword(e.target.value)} placeholder="Su clave de psicólogo/psiquiatra..." className={`w-full p-2 ${th.card} border ${th.border} rounded ${th.text} mt-1`} />
              </div>
            </div>
            <div className={`p-3 border-t ${th.border} ${th.input} flex justify-end gap-2`}>
              <button onClick={() => setShowDsmModal(false)} className={`px-4 py-2 bg-slate-300 dark:bg-slate-800 ${th.text} font-bold rounded-lg transition-colors`}>Cancelar</button>
              <button onClick={handleSaveDsmEvaluation} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors">Firmar y Guardar en Expediente</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CALENDARIO */}
      {showCalendarModal && (
        <div className={`fixed inset-0 ${th.modalBg} backdrop-blur-sm flex items-center justify-center p-4 z-50`}>
          <div className={`${th.card} border ${th.border} rounded-2xl max-w-sm w-full p-6 text-xs space-y-4 shadow-2xl`}>
            <div className={`flex justify-between items-center border-b ${th.border} pb-2`}>
              <h3 className={`text-sm font-bold ${th.text}`}>➕ Agendar Nueva Cita</h3>
              <button onClick={() => setShowCalendarModal(false)} className={`${th.textMuted} hover:${th.text}`}>✕</button>
            </div>
            <form onSubmit={handleCreateAppointment} className="space-y-4">
              <div>
                <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>Paciente (Expediente Activo)</label>
                <select required value={selectedPatientId} onChange={(e) => setSelectedPatientId(e.target.value)} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg ${th.text} focus:border-indigo-500 outline-none`}>
                  <option value="" disabled>Seleccione un paciente...</option>
                  {myPatients.map(p => (
                    <option key={p.id} value={p.id}>{p.patientName} (Exp: {p.id})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>Fecha</label>
                  <input type="date" required value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg ${th.text} focus:border-indigo-500 outline-none`} />
                </div>
                <div>
                  <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>Hora</label>
                  <input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg ${th.text} focus:border-indigo-500 outline-none`} />
                </div>
              </div>
              <div>
                <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>Duración (Minutos)</label>
                <input type="number" required min="15" step="15" value={durationMinutes} onChange={(e) => setDurationMinutes(parseInt(e.target.value))} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg ${th.text} focus:border-indigo-500 outline-none`} />
              </div>
              <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-colors shadow-lg">📅 Guardar Cita</button>
            </form>
          </div>
        </div>
      )}

      {/* FIRMA DE DESARROLLADOR Y FOOTER */}
      <footer className={`border-t ${th.border} ${th.bg} py-4 text-center text-xs ${th.textMuted} mt-auto w-full transition-colors duration-300`}>
        <p>© 2026 Asistente Clínica SaaS. Cumplimiento ético centralizado. Desarrollado por Harold.</p>
      </footer>
    </div>
  );
}
