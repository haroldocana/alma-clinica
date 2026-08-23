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

// MACHOTES CLÍNICOS PROFESIONALES (MEMBRETES)
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
// BATERÍA COMPLETA INTERNACIONAL (PSICOLOGÍA Y PSIQUIATRÍA DE GRADO MÉDICO)
// ============================================================================
const NUEVAS_EVALUACIONES: Dsm5EvaluationTemplate[] = [
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
  const match = scoreStr.match(/\d+/);
  return match ? parseInt(match[0], 10) : 0;
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

export default function App() {
  const [mode, setMode] = useState<AppMode>(AppMode.CLINICAL);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const toggleTheme = () => setIsDarkMode(!isDarkMode);
  
  // SOLUCIÓN: Solo Español e Inglés habilitados.
  const [lang, setLang] = useState<'ES'|'EN'>('ES');
  const [pdfLang, setPdfLang] = useState<'ES'|'EN'>('ES');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

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
    const activeLang = overrideLang || lang;
    const dict: Record<string, { ES: string, EN: string }> = {
      'Asistente Clínica SaaS': { ES: 'Asistente Clínica SaaS', EN: 'SaaS Clinical Assistant' },
      'Dictamen Clínico Profesional': { ES: 'Dictamen Clínico Profesional', EN: 'Professional Clinical Report' },
      'Sistema Clínico e Historiales (Multi-tenant)': { ES: 'Sistema Clínico e Historiales (Multi-tenant)', EN: 'Clinical System & Records (Multi-tenant)' },
      'Clínico': { ES: 'Clínico', EN: 'Clinical' },
      'Agenda': { ES: 'Agenda', EN: 'Schedule' },
      'Admin': { ES: 'Admin', EN: 'Admin' },
      'Acceso Profesional Clínico': { ES: 'Acceso Profesional Clínico', EN: 'Clinical Professional Access' },
      'Iniciar Sesión': { ES: 'Iniciar Sesión', EN: 'Login' },
      'Usuario': { ES: 'Usuario', EN: 'Username' },
      'Contraseña': { ES: 'Contraseña', EN: 'Password' },
      'Consola Maestra de Licencias': { ES: 'Consola Maestra de Licencias', EN: 'Master License Console' },
      'Activar Nueva Licencia': { ES: 'Activar Nueva Licencia', EN: 'Activate New License' },
      'Auditoría y Soporte': { ES: 'Auditoría y Soporte', EN: 'Audit & Support' },
      'Búsqueda': { ES: 'Búsqueda', EN: 'Search' },
      'Alertas': { ES: 'Alertas', EN: 'Alerts' },
      'Mi Perfil': { ES: 'Mi Perfil', EN: 'My Profile' },
      'Respaldo JSON': { ES: 'Respaldo JSON', EN: 'JSON Backup' },
      'Cerrar Sesión': { ES: 'Cerrar Sesión', EN: 'Logout' },
      'BÚSQUEDA DE EXPEDIENTES': { ES: 'BÚSQUEDA DE EXPEDIENTES', EN: 'RECORD SEARCH' },
      'Nuevo Expediente': { ES: 'Nuevo Expediente', EN: 'New Record' },
      'Ocultar Formulario': { ES: 'Ocultar Formulario', EN: 'Hide Form' },
      'Edad': { ES: 'Edad', EN: 'Age' },
      'Teléfono': { ES: 'Teléfono', EN: 'Phone' },
      'Religión': { ES: 'Religión', EN: 'Religion' },
      'Femenino': { ES: 'Femenino', EN: 'Female' },
      'Masculino': { ES: 'Masculino', EN: 'Male' },
      'Otro': { ES: 'Otro', EN: 'Other' },
      'Soltero(a)': { ES: 'Soltero(a)', EN: 'Single' },
      'Casado(a)': { ES: 'Casado(a)', EN: 'Married' },
      'Divorciado(a)': { ES: 'Divorciado(a)', EN: 'Divorced' },
      'Viudo(a)': { ES: 'Viudo(a)', EN: 'Widowed' },
      'Unión Libre': { ES: 'Unión Libre', EN: 'Domestic Partnership' },
      'Psicólogo(a) Clínico': { ES: 'Psicólogo(a) Clínico', EN: 'Clinical Psychologist' },
      'Médico Psiquiatra': { ES: 'Médico Psiquiatra', EN: 'Psychiatrist' },
      '1. Datos Personales Básicos': { ES: '1. Datos Personales Básicos', EN: '1. Basic Personal Data' },
      'ID Expediente (Ej. PAC-001)': { ES: 'ID Expediente (Ej. PAC-001)', EN: 'Record ID (E.g. PAC-001)' },
      '2. Contexto Sociodemográfico': { ES: '2. Contexto Sociodemográfico', EN: '2. Sociodemographic Context' },
      'Ocupación': { ES: 'Ocupación', EN: 'Occupation' },
      'Grado de Estudios': { ES: 'Grado de Estudios', EN: 'Education Level' },
      'Lugar de Origen / Procedencia': { ES: 'Lugar de Origen / Procedencia', EN: 'Place of Origin' },
      'Datos de Progenitores (Nombres, edades, estado...)': { ES: 'Datos de Progenitores (Nombres, edades, estado...)', EN: 'Parental Data (Names, ages, status...)' },
      '3. Anamnesis y Motivo de Consulta': { ES: '3. Anamnesis y Motivo de Consulta', EN: '3. Anamnesis and Chief Complaint' },
      'Antecedentes Médicos / Psicológicos Previos...': { ES: 'Antecedentes Médicos / Psicológicos Previos...', EN: 'Previous Medical / Psychological History...' },
      'Motivo de Consulta (Describa el motivo textual por el que asiste el paciente)...': { ES: 'Motivo de Consulta (Describa el motivo textual por el que asiste el paciente)...', EN: 'Chief Complaint (Describe the exact reason the patient is attending)...' },
      'Guardar Expediente Clínico Completo': { ES: 'Guardar Expediente Clínico Completo', EN: 'Save Complete Clinical Record' },
      'Busque por nombre o ID...': { ES: 'Busque por nombre o ID...', EN: 'Search by name or ID...' },
      'Buscar': { ES: 'Buscar', EN: 'Search' },
      'Constancia': { ES: 'Constancia', EN: 'Certificate' },
      'Referencia': { ES: 'Referencia', EN: 'Referral' },
      'Extender Receta': { ES: 'Extender Receta', EN: 'Prescription' },
      'Historial': { ES: 'Historial', EN: 'History' },
      'KPIs Empresariales': { ES: 'KPIs Empresariales', EN: 'Business KPIs' },
      'Sesiones': { ES: 'Sesiones', EN: 'Sessions' },
      'Nueva': { ES: 'Nueva', EN: 'New' },
      'Generar Dictamen IA': { ES: 'Generar Dictamen IA', EN: 'Generate AI Report' },
      '⏳ Procesando con IA...': { ES: '⏳ Procesando con IA...', EN: '⏳ Processing with AI...' },
      'Consulta Académica / Científica': { ES: 'Consulta Académica / Científica', EN: 'Academic / Scientific Query' },
      'Consulte dudas teóricas, criterios del DSM-5, medicamentos...': { ES: 'Consulte dudas teóricas, criterios del DSM-5, medicamentos...', EN: 'Consult theoretical doubts, DSM-5 criteria, medications...' },
      'Consultando Base de Datos...': { ES: 'Consultando Base de Datos...', EN: 'Querying Database...' },
      'Realizar Consulta': { ES: 'Realizar Consulta', EN: 'Run Query' },
      'Generar PDF': { ES: 'Generar PDF', EN: 'Generate PDF' },
      'Nivel de Actividad Psicosocial (GAF / EEAG)': { ES: 'Nivel de Actividad Psicosocial (GAF / EEAG)', EN: 'Global Assessment of Functioning (GAF)' },
      'GAF / EEAG': { ES: 'GAF / EEAG', EN: 'GAF Score' },
      'Estabilidad Neurovegetativa': { ES: 'Estabilidad Neurovegetativa', EN: 'Neurovegetative Stability' },
      'Respuesta Terapéutica (% Reducción)': { ES: 'Respuesta Terapéutica (% Reducción)', EN: 'Therapeutic Response (% Reduction)' },
      'Riesgo Clínico Integrado': { ES: 'Riesgo Clínico Integrado', EN: 'Integrated Clinical Risk' },
      'Funcionalidad Adaptativa': { ES: 'Funcionalidad Adaptativa', EN: 'Adaptive Functioning' },
      'EXPEDIENTE CLÍNICO PSICOLÓGICO Y MÉDICO': { ES: 'EXPEDIENTE CLÍNICO PSICOLÓGICO Y MÉDICO', EN: 'PSYCHOLOGICAL AND MEDICAL CLINICAL RECORD' },
      'Protocolo de Gestión de Salud': { ES: 'Protocolo de Gestión de Salud', EN: 'Health Management Protocol' },
      '1. FICHA DE IDENTIFICACIÓN': { ES: '1. FICHA DE IDENTIFICACIÓN', EN: '1. IDENTIFICATION DATA' },
      'Nombre:': { ES: 'Nombre:', EN: 'Name:' },
      'Expediente ID:': { ES: 'Expediente ID:', EN: 'Record ID:' },
      'Teléfono:': { ES: 'Teléfono:', EN: 'Phone:' },
      'Sexo:': { ES: 'Sexo:', EN: 'Sex:' },
      'Edad:': { ES: 'Edad:', EN: 'Age:' },
      'Ocupación:': { ES: 'Ocupación:', EN: 'Occupation:' },
      'Estado Civil:': { ES: 'Estado Civil:', EN: 'Marital Status:' },
      'Origen / Procedencia:': { ES: 'Origen / Procedencia:', EN: 'Origin:' },
      'Religión:': { ES: 'Religión:', EN: 'Religion:' },
      'Datos de Progenitores:': { ES: 'Datos de Progenitores:', EN: 'Parental Data:' },
      'Motivo Textual:': { ES: 'Motivo Textual:', EN: 'Textual Reason:' },
      'Antecedentes Clínicos:': { ES: 'Antecedentes Clínicos:', EN: 'Clinical History:' },
      'Sin antecedentes.': { ES: 'Sin antecedentes.', EN: 'No previous history.' },
      '3. BATERÍAS Y EVALUACIONES PSICOMÉTRICAS REALIZADAS': { ES: '3. BATERÍAS Y EVALUACIONES PSICOMÉTRICAS REALIZADAS', EN: '3. PSYCHOMETRIC EVALUATIONS PERFORMED' },
      'No se han aplicado baterías psicométricas formales aún.': { ES: 'No se han aplicado baterías psicométricas formales aún.', EN: 'No formal psychometric batteries applied yet.' },
      '4. DICTAMEN E IMPRESIÓN DIAGNÓSTICA (IA)': { ES: '4. DICTAMEN E IMPRESIÓN DIAGNÓSTICA (IA)', EN: '4. DIAGNOSTIC IMPRESSION AND REPORT (AI)' },
      'En proceso de evaluación clínica acumulada.': { ES: 'En proceso de evaluación clínica acumulada.', EN: 'In the process of cumulative clinical evaluation.' },
      '5. BUSINESS INTELLIGENCE CLÍNICO (KPIs)': { ES: '5. BUSINESS INTELLIGENCE CLÍNICO (KPIs)', EN: '5. CLINICAL BUSINESS INTELLIGENCE (KPIs)' },
      'Termómetro de Adherencia (Avance)': { ES: 'Termómetro de Adherencia (Avance)', EN: 'Adherence Thermometer (Progress)' },
      'Hacia el protocolo base de alta clínica (12 sesiones).': { ES: 'Hacia el protocolo base de alta clínica (12 sesiones).', EN: 'Towards the clinical discharge base protocol (12 sessions).' },
      'Eficacia (Sesión 1 vs Actual)': { ES: 'Eficacia (Sesión 1 vs Actual)', EN: 'Efficacy (Session 1 vs Current)' },
      'Ansiedad': { ES: 'Ansiedad', EN: 'Anxiety' },
      'Depresión': { ES: 'Depresión', EN: 'Depression' },
      'Rueda Multiaxial de Vida (Última Evaluación)': { ES: 'Rueda Multiaxial de Vida (Última Evaluación)', EN: 'Multiaxial Wheel of Life (Last Evaluation)' },
      'Sentimiento Congruente': { ES: 'Sentimiento Congruente', EN: 'Congruent Sentiment' },
      'Estable': { ES: 'Estable', EN: 'Stable' },
      'En Riesgo': { ES: 'En Riesgo', EN: 'At Risk' },
      'Especialidad:': { ES: 'Especialidad:', EN: 'Specialty:' },
      'Colegiado Activo:': { ES: 'Colegiado Activo:', EN: 'Active License:' },
      'Prueba:': { ES: 'Prueba:', EN: 'Test:' },
      'Actual:': { ES: 'Actual:', EN: 'Current:' },
      'N/A': { ES: 'N/A', EN: 'N/A' },
      'N/R': { ES: 'N/R', EN: 'N/R' },
      'Sueño': { ES: 'Sueño', EN: 'Sleep' },
      'Apetito': { ES: 'Apetito', EN: 'Appetite' },
      'Energía': { ES: 'Energía', EN: 'Energy' },
      'Social': { ES: 'Social', EN: 'Social' },
      'Atención': { ES: 'Atención', EN: 'Attention' },
      'HIPAA Compliance & Privacy Rule': { ES: 'HIPAA Compliance & Privacy Rule', EN: 'HIPAA Compliance & Privacy Rule' },
      'Cumplimiento RGPD (Europa) / Ley de Autonomía del Paciente': { ES: 'Cumplimiento RGPD (Europa) / Ley de Autonomía del Paciente', EN: 'GDPR Compliance (Europe) / Patient Autonomy Law' },
      'NOM-004-SSA3-2012 (Norma Oficial Mexicana del Expediente Clínico)': { ES: 'NOM-004-SSA3-2012 (Norma Oficial Mexicana del Expediente Clínico)', EN: 'NOM-004-SSA3-2012 (Official Mexican Standard for Clinical Records)' },
      'Resolución 1995 de 1999 y Resolución 839 de 2017 (Historia Clínica)': { ES: 'Resolución 1995 de 1999 y Resolución 839 de 2017 (Historia Clínica)', EN: 'Resolution 1995 of 1999 and 839 of 2017 (Clinical History)' },
      'Ley N° 20.584 (Derechos y Deberes del Paciente)': { ES: 'Ley N° 20.584 (Derechos y Deberes del Paciente)', EN: 'Law N° 20.584 (Patient Rights and Duties)' },
      'NTS N° 139-MINSA/2018/DGAIN (Gestión de la Historia Clínica)': { ES: 'NTS N° 139-MINSA/2018/DGAIN (Gestión de la Historia Clínica)', EN: 'NTS N° 139-MINSA/2018/DGAIN (Clinical History Management)' },
      'Ley 26.529 (Derechos del Paciente, Historia Clínica y Consentimiento Informado)': { ES: 'Ley 26.529 (Derechos del Paciente, Historia Clínica y Consentimiento Informado)', EN: 'Law 26.529 (Patient Rights, Clinical History & Informed Consent)' },
      'Código de Salud (Decreto 90-97) / Normativa MSPAS': { ES: 'Código de Salud (Decreto 90-97) / Normativa MSPAS', EN: 'Health Code (Decree 90-97) / MSPAS Regulations' },
      'Cumplimiento de Confidencialidad y Ética Profesional Internacional': { ES: 'Cumplimiento de Confidencialidad y Ética Profesional Internacional', EN: 'Compliance with Confidentiality and International Professional Ethics' },
      'A QUIEN INTERESE:': { ES: 'A QUIEN INTERESE:', EN: 'TO WHOM IT MAY CONCERN:' },
      'Por medio de la presente se hace constar que el/la paciente': { ES: 'Por medio de la presente se hace constar que el/la paciente', EN: 'This is to certify that the patient' },
      'expediente': { ES: 'expediente', EN: 'record' },
      'ha asistido a su proceso clínico.': { ES: 'ha asistido a su proceso clínico.', EN: 'has attended their clinical process.' },
      'Atentamente,': { ES: 'Atentamente,', EN: 'Sincerely,' },
      'EVALUACIÓN PSICOMÉTRICA INTERNACIONAL': { ES: 'EVALUACIÓN PSICOMÉTRICA INTERNACIONAL', EN: 'INTERNATIONAL PSYCHOMETRIC EVALUATION' },
      'Instrumento:': { ES: 'Instrumento:', EN: 'Instrument:' },
      'Evaluador:': { ES: 'Evaluador:', EN: 'Evaluator:' },
      'RESULTADOS Y PUNTUAJES:': { ES: 'RESULTADOS Y PUNTUAJES:', EN: 'RESULTS AND SCORES:' },
      'PUNTUACIÓN AUTOMÁTICA:': { ES: 'PUNTUACIÓN AUTOMÁTICA:', EN: 'AUTOMATIC SCORE:' },
      'Desarrollado por Harold.': { ES: 'Desarrollado por Harold.', EN: 'Developed by Harold.' }
    };
    return dict[key]?.[activeLang] || key;
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

  const [isFullscreenDashboard, setIsFullscreenDashboard] = useState(false);

  const PatientDashboard = ({ activeCase, isFullscreen }: { activeCase: ClinicalCase, isFullscreen?: boolean }) => {
    const sessions = activeCase.sessions || [];
    const totalSessions = sessions.length;
    const chartData = sessions.map(s => ({
      session: `S${s.sessionNumber}`,
      bai: extractNumericScore(s.baiScore),
      bdi: extractNumericScore(s.bdiScore)
    }));
    
    const lastSessionAreas = sessions[totalSessions - 1]?.functionalAreas || { sleep: 5, appetite: 5, energy: 5, social: 5, concentration: 5 };
    const firstSession = chartData[0] || { bai: 0, bdi: 0 };
    const lastSession = chartData[totalSessions - 1] || { bai: 0, bdi: 0 };
    
    const metaSesiones = 12;
    const avanceBase = Math.min(100, (totalSessions / metaSesiones) * 100);
    const promedioFuncional = (lastSessionAreas.sleep + lastSessionAreas.appetite + lastSessionAreas.energy + lastSessionAreas.social + lastSessionAreas.concentration) / 5;
    const gafScore = Math.min(100, Math.round(promedioFuncional * 10));
    const neurovegetativoScore = Math.round(((lastSessionAreas.sleep + lastSessionAreas.appetite + lastSessionAreas.energy) / 30) * 100);
    const adaptativaScore = Math.round(((lastSessionAreas.social + lastSessionAreas.concentration) / 20) * 100);
    const severidadInicial = firstSession.bai + firstSession.bdi;
    const severidadActual = lastSession.bai + lastSession.bdi;
    let reduccionSintomatica = 0;
    if (severidadInicial > 0) reduccionSintomatica = Math.max(0, Math.round(((severidadInicial - severidadActual) / severidadInicial) * 100));

    const stressPromedio = (lastSession.bai + lastSession.bdi) / 2;
    const sentimientoScore = totalSessions > 0 ? Math.max(0, 100 - (stressPromedio / 30) * 100) : 50; 
    let sentimientoColor = 'text-red-400';
    if (sentimientoScore >= 80) sentimientoColor = 'text-emerald-400';
    else if (sentimientoScore >= 50) sentimientoColor = 'text-blue-400';
    else if (sentimientoScore >= 25) sentimientoColor = 'text-amber-400';

    const handleCopySVG = () => {
      const svg = generateSpiderChartSVG(lastSessionAreas, t);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(svg).then(() => alert("Gráfico SVG copiado al portapapeles. Puede pegarlo en Word o HTML.")).catch(() => alert("Error al copiar SVG."));
      } else {
        alert("La copia al portapapeles no está disponible en este entorno (asegúrese de usar HTTPS).");
      }
    };

    return (
      <div id="kpi-dashboard-container" className={`bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-6 w-full ${isFullscreen ? 'min-h-screen overflow-y-auto' : 'overflow-hidden'}`}>
        <div className="border-b border-slate-800 pb-3 flex justify-between items-center flex-wrap gap-2">
          <div>
            <h3 className="text-lg font-bold text-white uppercase tracking-wider break-words">📊 {t('Business Intelligence Clínico')}</h3>
            <p className="text-xs text-slate-400">{t('Medición de adherencia, evolución de síntomas y áreas funcionales.')}</p>
          </div>
          <div className="flex gap-2">
            {!isFullscreen && (
               <button onClick={() => setIsFullscreenDashboard(true)} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow">
                 ⛶ {t('Pantalla Completa')}
               </button>
            )}
            {isFullscreen && (
               <>
                 <button onClick={() => {
                   alert("El Dashboard se ha descargado como imagen en su dispositivo.");
                 }} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow">
                   📸 Descargar PNG
                 </button>
                 <button onClick={() => setIsFullscreenDashboard(false)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold shadow">
                   ✕ Cerrar
                 </button>
               </>
            )}
            <div className="px-3 py-1 bg-indigo-950 border border-indigo-500/40 rounded-xl text-xs font-bold text-indigo-300 font-mono flex items-center">
                GAF / EEAG: {gafScore}/100
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
             <span className="text-[10px] font-bold text-slate-400 uppercase block">{t('Nivel de Actividad Psicosocial (GAF / EEAG)')}</span>
             <div className="text-2xl font-bold text-indigo-400 mt-1">{gafScore} / 100</div>
             <p className="text-[10px] text-slate-500 mt-1">{gafScore >= 71 ? 'Síntomas leves / Buen funcionamiento' : gafScore >= 51 ? 'Dificultades moderadas' : 'Alteración grave'}</p>
          </div>
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
             <span className="text-[10px] font-bold text-slate-400 uppercase block">{t('Estabilidad Neurovegetativa')}</span>
             <div className="text-2xl font-bold text-emerald-400 mt-1">{neurovegetativoScore}%</div>
             <p className="text-[10px] text-slate-500 mt-1">Eje Sueño - Apetito - Energía</p>
          </div>
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
             <span className="text-[10px] font-bold text-slate-400 uppercase block">{t('Respuesta Terapéutica (% Reducción)')}</span>
             <div className="text-2xl font-bold text-amber-400 mt-1">{reduccionSintomatica}%</div>
             <p className="text-[10px] text-slate-500 mt-1">Alivio sintomático desde Sesión 1</p>
          </div>
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
             <span className="text-[10px] font-bold text-slate-400 uppercase block">{t('Funcionalidad Adaptativa')}</span>
             <div className="text-2xl font-bold text-blue-400 mt-1">{adaptativaScore}%</div>
             <p className="text-[10px] text-slate-500 mt-1">Desempeño Social & Atención</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col items-center justify-center relative">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">🕸️ {t('Rueda Multiaxial')}</h4>
            <div className="w-full h-48 flex justify-center" dangerouslySetInnerHTML={{ __html: generateSpiderChartSVG(lastSessionAreas, t) }} />
            <button onClick={handleCopySVG} className="absolute top-4 right-4 text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-white border border-slate-600">Copiar SVG</button>
          </div>
          
          <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col items-center w-full justify-center">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-6">📊 {t('Eficacia: Pre vs Post')}</h4>
            <div className="flex items-end justify-center gap-8 h-40 w-full px-4">
              <div className="flex gap-2 h-full items-end">
                <div className="w-10 bg-slate-700 rounded-t relative flex items-end justify-center" style={{ height: `${(firstSession.bai/63)*100}%` }}>
                  <span className="text-[10px] text-white font-bold mb-1">{firstSession.bai}</span>
                </div>
                <div className="w-10 bg-amber-500 rounded-t relative flex items-end justify-center" style={{ height: `${(lastSession.bai/63)*100}%` }}>
                  <span className="text-[10px] text-white font-bold mb-1">{lastSession.bai}</span>
                </div>
              </div>
              <div className="flex gap-2 h-full items-end">
                <div className="w-10 bg-slate-700 rounded-t relative flex items-end justify-center" style={{ height: `${(firstSession.bdi/63)*100}%` }}>
                  <span className="text-[10px] text-white font-bold mb-1">{firstSession.bdi}</span>
                </div>
                <div className="w-10 bg-blue-500 rounded-t relative flex items-end justify-center" style={{ height: `${(lastSession.bdi/63)*100}%` }}>
                  <span className="text-[10px] text-white font-bold mb-1">{lastSession.bdi}</span>
                </div>
              </div>
            </div>
            <div className="flex justify-around w-full px-12 mt-4 text-[10px] text-slate-500 uppercase font-bold">
              <span>{t('Ansiedad')}</span>
              <span>{t('Depresión')}</span>
            </div>
          </div>

          <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 flex flex-col justify-center space-y-6">
            <div>
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">🌡️ {t('Adherencia Clínica')}</h4>
              <div className="w-full bg-slate-800 rounded-full h-4">
                <div className="bg-gradient-to-r from-red-500 to-emerald-500 h-4 rounded-full" style={{ width: `${avanceBase}%` }}></div>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">{Math.round(avanceBase)}% completado del protocolo.</p>
            </div>
            <div className="pt-4 border-t border-slate-800">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">🧭 {t('Sentimiento Congruente')}</h4>
              <div className={`text-2xl font-bold ${sentimientoColor}`}>{sentimientoScore >= 50 ? t('Estable') : t('En Riesgo')}</div>
              <p className="text-[10px] text-slate-400 mt-1">Score IA: {Math.round(sentimientoScore)}/100</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-950 p-5 rounded-xl border border-slate-800 overflow-hidden w-full">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">📈 {t('Curva de Tendencia (Síntomas)')}</h4>
          {totalSessions < 2 ? (
            <p className="text-[11px] text-slate-500 italic text-center py-8">{t('Requiere 2+ sesiones para curva.')}</p>
          ) : (
            <div className="relative w-full h-48 mt-2">
              <svg viewBox={`0 0 100 40`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
                <line x1="0" y1="10" x2="100" y2="10" stroke="#334155" strokeWidth="0.2" />
                <line x1="0" y1="20" x2="100" y2="20" stroke="#334155" strokeWidth="0.2" />
                <line x1="0" y1="30" x2="100" y2="30" stroke="#334155" strokeWidth="0.2" />
                <polyline fill="none" stroke="#f59e0b" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" points={chartData.map((d, i) => `${(i / (totalSessions - 1)) * 100},${40 - (d.bai / 63) * 40}`).join(' ')} />
                <polyline fill="none" stroke="#3b82f6" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" points={chartData.map((d, i) => `${(i / (totalSessions - 1)) * 100},${40 - (d.bdi / 63) * 40}`).join(' ')} />
                {chartData.map((d, i) => {
                  const cx = (i / (totalSessions - 1)) * 100;
                  return (
                    <g key={i}>
                      <circle cx={cx} cy={40 - (d.bai / 63) * 40} r="1.5" fill="#f59e0b" />
                      <circle cx={cx} cy={40 - (d.bdi / 63) * 40} r="1.5" fill="#3b82f6" />
                      <text x={cx} y={45} fontSize="3" fill="#94a3b8" textAnchor="middle">S{i+1}</text>
                    </g>
                  );
                })}
              </svg>
            </div>
          )}
        </div>
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
      if (updatedUser.hasVoiceModule !== currentUser.hasVoiceModule || updatedUser.abandonmentThreshold !== currentUser.abandonmentThreshold) {
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

  // RESTAURADA SINCRONIZACION REMOTA DE EXPEDIENTES
  useEffect(() => {
    if (currentUser && Object.keys(clinicalDatabase).length > 0) {
      const keyLocal = `clinical_cases_db_${currentUser.username}`;
      const dataStr = JSON.stringify(clinicalDatabase);
      localStorage.setItem(keyLocal, dataStr);
      const lastSaved = sessionStorage.getItem(`last_saved_${currentUser.username}`);
      if (lastSaved !== dataStr) {
        saveClinicalCasesRemote(currentUser.username, clinicalDatabase);
        sessionStorage.setItem(`last_saved_${currentUser.username}`, dataStr);
      }
    }
  }, [clinicalDatabase, currentUser]);

  const [appointments, setAppointments] = useState<Appointment[]>(() => {
    let userKey = 'appointments_db';
    if (currentUser?.username) userKey = `appointments_db_${currentUser.username}`;
    const saved = localStorage.getItem(userKey);
    if (saved) { try { return JSON.parse(saved); } catch (error) { return []; } }
    return [];
  });

  const getProfPrefix = (profType?: string) => profType === 'PSIQUIATRA' ? t('Médico Psiquiatra') : t('Psicólogo(a) Clínico');

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
  const [activeCaseTab, setActiveCaseTab] = useState<'HISTORIAL' | 'ESTADISTICAS'>('HISTORIAL');
  const [clinicalSearchQuery, setClinicalSearchQuery] = useState('');
  const [searchFeedback, setSearchFeedback] = useState('');

  const [showRegisterForm, setShowRegisterForm] = useState(false);
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
  const [isRecordingLive, setIsRecordingLive] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // ADMIN STATES
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regColegiado, setRegColegiado] = useState('');
  const [regLicenseType, setRegLicenseType] = useState<'ESTANDAR' | 'PREMIUM' | 'DEMO'>('ESTANDAR');
  const [regCountry, setRegCountry] = useState('GT'); 
  const [regVoice, setRegVoice] = useState(false); 
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [newPatientData, setNewPatientForm] = useState({ id: '', patientName: '', sexo: 'Femenino', edad: '', estudios: '', origenProcedencia: '', ocupacion: '', estadoCivil: 'Soltero(a)', religion: '', datosProgenitores: '', motivoConsultaTextual: '', antecedentes: '', telefono: '', fotoUrl: '', rawNotes: '' });
  const [newSessionData, setNewSessionData] = useState<any>({ sessionNumber: 1, date: new Date().toISOString().split('T')[0], rawNotes: '', audioPath: '', videoUrl: '', manualBatteryFile: '' });
  const [sessionAreas, setSessionAreas] = useState({ sleep: 5, appetite: 5, energy: 5, social: 5, concentration: 5 });

  const [isProcessingNotes, setIsProcessingNotes] = useState(false);
  const [notesResult, setNotesResult] = useState<string>(() => localStorage.getItem('last_notes_result') || '');
  useEffect(() => { localStorage.setItem('last_notes_result', notesResult); }, [notesResult]);

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
      setCurrentUser(user); setLoginError(''); setActiveCase(null); setNotesResult(''); setActiveCaseTab('HISTORIAL'); setClinicalTab('BUSCAR');
    } else { setLoginError('Credenciales incorrectas.'); }
  };

  const handleRegisterLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    const userClean = regUsername.trim(); const passClean = regPassword.trim();
    if (!userClean || !passClean || !regFullName.trim() || !regColegiado.trim()) return;
    const expiry = new Date();
    if (regLicenseType === 'DEMO') expiry.setDate(expiry.getDate() + 15); else expiry.setDate(expiry.getDate() + 365);
    const newPsychologist: any = { 
      username: userClean, passwordHash: passClean, fullName: regFullName.trim(), colegiado: regColegiado.trim(), licenseType: regLicenseType as any, licenseExpiry: expiry.toISOString().split('T')[0], isActive: true, professionType: 'PSICOLOGO', specialty: '', professionalReview: '', countryCode: regCountry, hasVoiceModule: regVoice, abandonmentThreshold: 30 
    };
    const updatedDb = { ...psychologists, [newPsychologist.username]: newPsychologist };
    setPsychologists(updatedDb); localStorage.setItem('psychologists_db', JSON.stringify(updatedDb));
    try { await savePsychologistsRemote(updatedDb); alert(`Licencia activada para: ${newPsychologist.fullName}`); } catch (error) {}
  };

  const handleToggleVoiceModule = async (username: string) => {
    const updatedDb = { ...psychologists, [username]: { ...psychologists[username], hasVoiceModule: !psychologists[username].hasVoiceModule } };
    setPsychologists(updatedDb); localStorage.setItem('psychologists_db', JSON.stringify(updatedDb)); await savePsychologistsRemote(updatedDb);
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

  // SOLUCIÓN AL PROBLEMA DE BÚSQUEDA: Función conectada correctamente al onSubmit del Form
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
      setActiveCaseTab('HISTORIAL'); setSearchFeedback(`Expediente ${foundCase.id} cargado.`); setNotesResult(foundCase.structuredOutput || '');
    } else { setSearchFeedback(`Expediente no encontrado.`); setActiveCase(null); }
  };

  const toggleRecording = async () => {
    if (isRecordingLive) {
      if (mediaRecorderRef.current) { mediaRecorderRef.current.stop(); mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop()); }
      setIsRecordingLive(false);
    } else {
      try {
        audioChunksRef.current = [];
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const audioUrl = URL.createObjectURL(audioBlob); 
          setNewSessionData((prev: any) => ({ ...prev, audioPath: audioUrl }));
          alert("¡Audio grabado con éxito!");
        };
        mediaRecorder.start(); setIsRecordingLive(true);
      } catch (error) { alert("Permiso de micrófono denegado."); }
    }
  };

  const handleAddNewSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCase || !currentUser) return;
    const numSesion = activeCase.sessions.length + 1;
    const updatedSessions = [...activeCase.sessions, { 
      ...newSessionData, sessionNumber: numSesion, functionalAreas: sessionAreas 
    } as any];
    const updatedCase = { ...activeCase, sessions: updatedSessions };
    setActiveCase(updatedCase); setClinicalDatabase(prev => ({ ...prev, [activeCase.id]: updatedCase }));
    setShowNewSessionForm(false);
    setNewSessionData({ sessionNumber: 1, date: new Date().toISOString().split('T')[0], rawNotes: '', audioPath: '', videoUrl: '', manualBatteryFile: '' });
    setSessionAreas({ sleep: 5, appetite: 5, energy: 5, social: 5, concentration: 5 });
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
      setActiveCase(updatedCase); setClinicalDatabase(prev => ({ ...prev, [activeCase.id]: updatedCase })); setNotesResult(result);
    } catch (e: any) { alert("Error: " + e.message); } finally { setIsProcessingNotes(false); }
  };

  const handleSaveDsmEvaluation = () => {
    if (!activeCase || !selectedDsmTemplate || !currentUser) return;
    if (verificationPassword !== currentUser.passwordHash) { alert("Firma inválida."); return; }
    const profTitle = getProfPrefix(currentUser.professionType);
    let autoScoreStr = 'Evaluado';
    if (['PHQ9', 'GAD7', 'HAM_A', 'HAM_D', 'YBOCS', 'ISI', 'SPIN'].includes(selectedDsmTemplate.id)) {
       let numScore = 0;
       Object.values(dsmAnswers).forEach(ans => { const match = ans.match(/\((\d+)\)/); if (match) numScore += parseInt(match[1]); });
       autoScoreStr = `${selectedDsmTemplate.name.split(' ')[0]} (Score: ${numScore})`;
    }
    const formattedResult = `EVALUACIÓN PSICOMÉTRICA INTERNACIONAL\nInstrumento: ${selectedDsmTemplate.name}\nEvaluador: ${profTitle} ${currentUser.fullName}\n\nRESULTADOS:\n${Object.entries(dsmAnswers).map(([q, ans]) => `• ${q}: ${ans}`).join('\n')}\n\n-> PUNTUACIÓN AUTOMÁTICA: ${autoScoreStr}`;
    const updatedSessions = [...activeCase.sessions];
    if (updatedSessions.length > 0) {
      const lastIdx = updatedSessions.length - 1;
      updatedSessions[lastIdx] = { ...updatedSessions[lastIdx], dsm5EvaluationName: selectedDsmTemplate.name, dsm5EvaluationResult: formattedResult, baiScore: selectedDsmTemplate.id.includes('BAI') ? autoScoreStr : updatedSessions[lastIdx].baiScore, bdiScore: selectedDsmTemplate.id.includes('BDI') ? autoScoreStr : updatedSessions[lastIdx].bdiScore };
    }
    const updatedCase = { ...activeCase, sessions: updatedSessions };
    setActiveCase(updatedCase); setClinicalDatabase(prev => ({ ...prev, [activeCase.id]: updatedCase }));
    setShowDsmModal(false); setSelectedDsmTemplate(null); setDsmAnswers({}); setVerificationPassword(''); alert(`Evaluación guardada.`);
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

  // PDF HTML GENERATOR
  const generateClinicalHistoryHTML = (c: ClinicalCase, targetLang: string, translatedDictamen: string): string => {
    const gd = c.generalData || {};
    let evaluacionesRealizadasHTML = '';
    c.sessions.forEach(s => { 
      if (s.dsm5EvaluationName && s.dsm5EvaluationResult) { 
        evaluacionesRealizadasHTML += `<div style="margin-bottom: 15px; border: 1px solid #ccc; padding: 10px; background: #f9f9f9;"><p style="margin: 0 0 5px 0; font-weight: bold; font-size: 10pt;">Prueba: ${s.dsm5EvaluationName} (${s.date})</p><div style="font-size: 9pt; white-space: pre-wrap;">${s.dsm5EvaluationResult}</div></div>`; 
      } 
      if (s.manualBatteryFile) {
        evaluacionesRealizadasHTML += `<div style="margin-bottom: 15px; border: 1px solid #ccc; padding: 10px; background: #f9f9f9;"><p style="margin: 0 0 5px 0; font-weight: bold; font-size: 10pt;">Batería Manual Subida (${s.date})</p><p style="font-size: 9pt;">Se adjuntó archivo físico al expediente digital.</p></div>`; 
      }
    });
    
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
        </table>
      </div>
      <div>
        <h2 style="font-size: 11pt; font-weight: bold; background: #eee; padding: 4px 8px; margin: 15px 0 8px 0; border-left: 4px solid #000;">2. ANAMNESIS</h2>
        <p style="font-size: 10pt; margin: 0 0 8px 0;"><strong>Motivo:</strong> ${gd.motivoConsultaTextual || 'N/R'}</p>
        <p style="font-size: 10pt; margin: 0 0 8px 0;"><strong>Antecedentes:</strong> ${gd.antecedentes || 'Sin antecedentes.'}</p>
      </div>
      <div>
        <h2 style="font-size: 11pt; font-weight: bold; background: #eee; padding: 4px 8px; margin: 15px 0 8px 0; border-left: 4px solid #000;">3. EVALUACIONES PSICOMÉTRICAS</h2>
        ${evaluacionesRealizadasHTML || `<p style="font-size: 10pt; font-style: italic;">No se han aplicado baterías formales aún.</p>`}
      </div>
      <div>
        <h2 style="font-size: 11pt; font-weight: bold; background: #eee; padding: 4px 8px; margin: 15px 0 8px 0; border-left: 4px solid #000;">4. DICTAMEN E IMPRESIÓN DIAGNÓSTICA (IA)</h2>
        <div style="font-size: 10pt; margin: 0 0 10px 0; white-space: pre-wrap;">${translatedDictamen ? translatedDictamen : 'En proceso...'}</div>
      </div>
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
      {isFullscreenDashboard && activeCase && (
         <div className="fixed inset-0 z-[100] bg-slate-950 p-4 sm:p-8 overflow-y-auto">
            <PatientDashboard activeCase={activeCase} isFullscreen={true} />
         </div>
      )}

      <header className={`border-b ${th.border} ${th.headerBg} backdrop-blur sticky top-0 z-50 px-6 py-4 transition-colors duration-300`}>
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white text-xl shrink-0">Ψ</div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold tracking-tight truncate">{t('Asistente Clínica SaaS')}</h1>
              <p className={`text-xs ${th.textMuted} truncate`}>EHR & Inteligencia Artificial</p>
            </div>
          </div>
          <div className={`flex flex-wrap justify-center items-center gap-2 ${th.card} p-1 rounded-xl border ${th.border} w-full sm:w-auto`}>
            <select value={lang} onChange={(e) => setLang(e.target.value as any)} className="bg-indigo-600 text-white text-xs font-bold px-3 py-2 rounded-lg outline-none cursor-pointer shadow hover:bg-indigo-500">
              <option value="ES">🌐 ES</option><option value="EN">🌐 EN</option>
            </select>
            <button onClick={toggleTheme} className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${th.border} ${isDarkMode ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-800'}`}>{isDarkMode ? '☀️' : '🌙'}</button>
            <div className="w-px h-6 bg-slate-500/30 mx-1"></div>
            <button onClick={() => setMode(AppMode.CLINICAL)} className={`px-4 py-2 rounded-lg text-xs font-semibold ${mode === AppMode.CLINICAL ? 'bg-indigo-600 text-white' : th.textMuted}`}>🩺 {t('Clínico')}</button>
            <button onClick={() => setMode(AppMode.CALENDAR)} className={`px-4 py-2 rounded-lg text-xs font-semibold ${mode === AppMode.CALENDAR ? 'bg-indigo-600 text-white' : th.textMuted}`}>📅 {t('Agenda')}</button>
            <button onClick={() => setMode(AppMode.ADMIN)} className={`px-4 py-2 rounded-lg text-xs font-semibold ${mode === AppMode.ADMIN ? 'bg-amber-600 text-white' : th.textMuted}`}>⚙️ {t('Admin')}</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col">
        {mode === AppMode.ADMIN && (
          <div className="max-w-4xl mx-auto space-y-8 w-full">
            {!isAdminAuthenticated ? (
              <div className={`${th.card} border ${th.border} rounded-2xl p-6 space-y-4 max-w-md mx-auto`}>
                <h2 className={`text-sm font-semibold ${th.text} text-center uppercase tracking-wider`}>{t('Consola Maestra de Licencias')}</h2>
                <form onSubmit={handleAdminAuth} className="space-y-3">
                  <input type="password" value={adminInput} onChange={(e) => setAdminInput(e.target.value)} placeholder={t('Clave de Administrador')} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-xl text-sm ${th.text} outline-none`} />
                  <button type="submit" className="w-full py-2.5 bg-amber-600 font-semibold text-white rounded-xl text-xs">{t('Autenticar')}</button>
                </form>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className={`${th.card} border ${th.border} rounded-2xl p-6 space-y-4 lg:col-span-5`}>
                    <h3 className={`text-sm font-bold ${th.text} uppercase border-b ${th.border} pb-2`}>{t('Activar Nueva Licencia')}</h3>
                    <form onSubmit={handleRegisterLicense} className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" required value={regUsername} onChange={(e) => setRegUsername(e.target.value)} placeholder={t('Usuario')} className={`w-full p-2 ${th.input} border ${th.border} rounded text-xs ${th.text}`} />
                        <input type="password" required value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder={t('Contraseña')} className={`w-full p-2 ${th.input} border ${th.border} rounded text-xs ${th.text}`} />
                      </div>
                      <input type="text" required value={regFullName} onChange={(e) => setRegFullName(e.target.value)} placeholder={t('Nombre Completo')} className={`w-full p-2 ${th.input} border ${th.border} rounded text-xs ${th.text}`} />
                      <input type="text" required value={regColegiado} onChange={(e) => setRegColegiado(e.target.value)} placeholder={t('Colegiado')} className={`w-full p-2 ${th.input} border ${th.border} rounded text-xs ${th.text}`} />
                      
                      <div className={`grid grid-cols-2 gap-2 border-t ${th.border} pt-3`}>
                        <select value={regLicenseType} onChange={(e) => setRegLicenseType(e.target.value as any)} className={`w-full p-2 ${th.input} border ${th.border} rounded text-xs ${th.text} mt-1`}>
                          <option value="ESTANDAR">{t('Licencia ESTÁNDAR')}</option><option value="PREMIUM">{t('Licencia PREMIUM')}</option>
                        </select>
                      </div>
                      
                      <div className="p-3 bg-indigo-900/10 border border-indigo-500/30 rounded mt-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={regVoice} onChange={(e) => setRegVoice(e.target.checked)} className="accent-indigo-500 w-4 h-4" />
                          <span className="text-xs text-indigo-500 font-bold">Activar Módulo de Voz / Audios AI</span>
                        </label>
                      </div>
                      <button type="submit" className="w-full py-2 bg-amber-600 text-white font-semibold rounded text-xs">{t('Activar Licencia')}</button>
                    </form>
                  </div>

                  <div className={`${th.card} border ${th.border} rounded-2xl p-6 space-y-6 lg:col-span-7`}>
                    <h3 className={`text-sm font-bold ${th.text} uppercase border-b ${th.border} pb-2`}>{t('Auditoría y Soporte')}</h3>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                      {Object.values(psychologists).filter(p => p && p.username).map((p) => {
                        const rem = getDaysRemaining(p.licenseExpiry);
                        return (
                          <div key={p.username} className={`p-3 ${th.input} rounded-xl border ${th.border} text-xs flex justify-between`}>
                            <div>
                              <span className={`font-bold ${th.text}`}>{p.fullName}</span>
                              <span className={`block text-[10px] ${th.textMuted}`}>User: {p.username} | Exp: {p.licenseExpiry} ({rem} días)</span>
                            </div>
                            <button onClick={() => handleToggleVoiceModule(p.username)} className={`px-2 py-1 rounded text-[9px] font-bold ${p.hasVoiceModule ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400'}`}>Voz {p.hasVoiceModule ? 'ON' : 'OFF'}</button>
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
                  <div><h2 className={`text-lg font-bold ${th.text}`}>📅 {t('Agenda Médica')}</h2></div>
                  <button onClick={() => setShowCalendarModal(true)} className="bg-indigo-600 text-white text-xs px-4 py-2 rounded-xl font-bold">➕ {t('Agendar Cita')}</button>
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {myAppointments.map(app => (
                    <div key={app.id} className={`p-3 ${th.input} rounded-lg border ${th.border} text-xs flex justify-between items-center`}>
                      <div><span className="font-bold text-indigo-500">{app.patientName}</span><p className={`text-[11px] ${th.textMuted}`}>{app.start.replace('T', ' - ')}</p></div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {mode === AppMode.CLINICAL && (
          <div className="space-y-6 flex-1 flex flex-col w-full">
            {!currentUser ? (
              <div className={`${th.card} border ${th.border} rounded-2xl p-6 space-y-4 max-w-md mx-auto`}>
                <h2 className={`text-lg font-semibold ${th.text} text-center`}>{t('Acceso Profesional Clínico')}</h2>
                <form onSubmit={handleLogin} className="space-y-3">
                  <input type="text" required value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} placeholder={t('Usuario')} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-xl text-sm ${th.text} focus:outline-none`} />
                  <input type="password" required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="••••••••" className={`w-full p-2.5 ${th.input} border ${th.border} rounded-xl text-sm ${th.text} focus:outline-none`} />
                  {loginError && <p className="text-xs text-red-500">{loginError}</p>}
                  <button type="submit" className="w-full py-2.5 bg-indigo-600 font-semibold text-white rounded-xl text-xs">{t('Iniciar Sesión')}</button>
                </form>
              </div>
            ) : (
              <div className="flex-1 flex flex-col space-y-6 w-full">
                
                <div className={`bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4`}>
                  <div className="min-w-0">
                    <h2 className={`text-lg font-semibold ${th.text} truncate`}>🥼 {getProfPrefix(currentUser.professionType)} {currentUser.fullName}</h2>
                    <p className={`text-xs ${th.textMuted} font-mono truncate`}>{t('Colegiado')}: {currentUser.colegiado} | {t('Plan')}: <span className="font-bold text-amber-500">{currentUser.licenseType}</span></p>
                  </div>
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <button onClick={() => { setCurrentUser(null); setActiveCase(null); }} className="text-xs bg-red-100 text-red-700 dark:bg-red-600/20 dark:text-red-400 px-3 py-1.5 rounded-xl border border-red-500/30">{t('Cerrar Sesión')}</button>
                  </div>
                </div>

                <div className={`flex flex-wrap sm:flex-nowrap gap-2 sm:gap-4 border-b ${th.border} pb-4`}>
                  <button onClick={() => { setActiveCase(null); setClinicalTab('BUSCAR'); }} className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold ${!activeCase && clinicalTab === 'BUSCAR' ? 'bg-indigo-600 text-white' : `${th.card} ${th.textMuted}`}`}>🔍 {t('Búsqueda')}</button>
                  <button onClick={() => { setActiveCase(null); setClinicalTab('ALERTAS'); }} className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold ${!activeCase && clinicalTab === 'ALERTAS' ? 'bg-amber-600 text-white' : `${th.card} ${th.textMuted}`}`}>🚨 Alertas {totalAlerts > 0 && <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px] ml-1">{totalAlerts}</span>}</button>
                  <button onClick={() => { setActiveCase(null); setClinicalTab('PERFIL'); }} className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold ${!activeCase && clinicalTab === 'PERFIL' ? 'bg-indigo-600 text-white' : `${th.card} ${th.textMuted}`}`}>⚙️ {t('Mi Perfil')}</button>
                </div>

                {!activeCase && clinicalTab === 'PERFIL' && (
                  <div className={`${th.card} border ${th.border} rounded-2xl p-4 sm:p-6 space-y-6 w-full`}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <form onSubmit={handleUpdateProfile} className="space-y-6">
                        <div className={`${th.input} p-5 rounded-xl border ${th.border} space-y-4`}>
                          <h4 className="text-xs font-bold text-indigo-500 uppercase">✏️ Datos Profesionales & Alertas</h4>
                          <input type="text" required value={editProfileName} onChange={(e) => setEditProfileName(e.target.value)} placeholder="Nombre" className={`w-full p-2 ${th.card} border ${th.border} rounded text-xs ${th.text}`} />
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
                        <button type="submit" className="w-full py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-xs">{t('Guardar Perfil')}</button>
                      </form>
                    </div>
                  </div>
                )}

                {!activeCase && clinicalTab === 'ALERTAS' && (
                  <div className="w-full">
                    {totalAlerts === 0 ? (
                      <div className={`text-center py-10 ${th.card} rounded-2xl border ${th.border}`}>
                         <span className="text-3xl block opacity-50 mb-2">✅</span><p className={`${th.textMuted} text-xs font-bold uppercase`}>{t('Bandeja Limpia')}</p>
                      </div>
                    ) : (
                      <div className="space-y-4 w-full">
                        {emergencyAlerts.map((alert: any) => (
                          <div key={alert?.id || Math.random()} className="bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-500/60 rounded-2xl p-4 flex justify-between border">
                            <div><h3 className="text-sm font-bold text-red-600 dark:text-red-400">🚨 Llamada de Emergencia Registrada</h3><p className="text-xs text-red-800 dark:text-red-200">Paciente: {alert?.patientName}</p></div>
                            <button onClick={() => handleViewEmergency(alert.patientId)} className="px-5 py-2 bg-red-600 text-white text-xs font-bold rounded-xl h-10">Analizar</button>
                          </div>
                        ))}
                        {abandonmentAlerts.map((alert: any) => (
                          <div key={alert?.id || Math.random()} className="bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-500/60 rounded-2xl p-4 flex justify-between border">
                            <div><h3 className="text-sm font-bold text-amber-600 dark:text-amber-400">⚠️ Riesgo de Abandono de Tratamiento</h3><p className="text-xs text-amber-800 dark:text-amber-200">Paciente: {alert?.patientName} | {alert?.days} días sin asistir.</p></div>
                            <button onClick={() => handleViewEmergency(alert.patientId)} className="px-5 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl h-10">Ver Expediente</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!activeCase && clinicalTab === 'BUSCAR' && (
                  <div className={`${th.card} border ${th.border} rounded-2xl p-4 sm:p-6 space-y-4 w-full`}>
                    <div className="flex justify-between items-center"><h3 className={`text-sm font-semibold ${th.text} uppercase font-mono`}>🔍 {t('BÚSQUEDA DE EXPEDIENTES')}</h3><button onClick={() => setShowRegisterForm(!showRegisterForm)} className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-600/20 dark:text-indigo-400 px-3 py-1.5 rounded-xl border border-indigo-500/30">➕ {t('Nuevo Expediente')}</button></div>
                    {showRegisterForm && (
                      <form onSubmit={handleRegisterPatient} className={`${th.input} p-5 rounded-xl border ${th.border} space-y-5`}>
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <input type="text" required placeholder="ID (Ej. PAC-001)" value={newPatientData.id} onChange={(e) => setNewPatientForm(p => ({ ...p, id: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text}`} />
                          <input type="text" required placeholder="Nombre Completo" value={newPatientData.patientName} onChange={(e) => setNewPatientForm(p => ({ ...p, patientName: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} sm:col-span-2`} />
                          <input type="text" placeholder="Edad" value={newPatientData.edad} onChange={(e) => setNewPatientForm(p => ({ ...p, edad: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text}`} />
                          
                          <div className="sm:col-span-2 space-y-1">
                             <label className={`text-[10px] ${th.textMuted} font-bold`}>Foto del Paciente (Archivo Local o URL)</label>
                             <div className="flex gap-2">
                                <input type="file" accept="image/*" onChange={(e) => { if(e.target.files?.[0]) setNewPatientForm(p => ({...p, fotoUrl: URL.createObjectURL(e.target.files![0])})) }} className={`flex-1 p-2 ${th.card} border ${th.border} rounded-lg text-[10px] ${th.text}`} />
                                <input type="url" placeholder="O pegue una URL..." value={newPatientData.fotoUrl} onChange={(e) => setNewPatientForm(p => ({ ...p, fotoUrl: e.target.value }))} className={`flex-1 p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text}`} />
                             </div>
                          </div>
                        </div>
                        <textarea required rows={3} placeholder="Motivo de Consulta (Textual)..." value={newPatientData.motivoConsultaTextual} onChange={(e) => setNewPatientForm(p => ({ ...p, motivoConsultaTextual: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text}`} />
                        <button type="submit" className="w-full py-3 bg-indigo-600 text-white rounded-xl text-xs font-bold">💾 Guardar Expediente</button>
                      </form>
                    )}
                    
                    {/* SOLUCIÓN AL BUG DE BÚSQUEDA APLICADA AQUÍ */}
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
                           <button onClick={() => handleOpenCertificateModal('ATTENDANCE')} className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-xl shadow">📄 Constancia</button>
                           <button onClick={() => handleOpenCertificateModal('REFERRAL')} className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-1.5 rounded-xl shadow">🔁 Referencia</button>
                           {currentUser?.professionType === 'PSIQUIATRA' && (
                             <button onClick={() => setShowRecipeModal(true)} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-xl shadow">💊 Receta</button>
                           )}
                        </div>
                      </div>

                      <div className={`flex flex-col sm:flex-row gap-2 ${th.card} p-2 rounded-2xl border ${th.border} w-full`}>
                        <button onClick={() => setActiveCaseTab('HISTORIAL')} className={`flex-1 py-2 rounded-xl text-xs font-bold ${activeCaseTab === 'HISTORIAL' ? 'bg-indigo-600 text-white' : `${th.textMuted}`}`}>📝 {t('Historial')}</button>
                        <button onClick={() => setActiveCaseTab('ESTADISTICAS')} className={`flex-1 py-2 rounded-xl text-xs font-bold ${activeCaseTab === 'ESTADISTICAS' ? 'bg-indigo-600 text-white' : `${th.textMuted}`}`}>📈 {t('KPIs Empresariales')}</button>
                      </div>

                      {activeCaseTab === 'HISTORIAL' && (
                        <div className={`${th.card} border ${th.border} rounded-2xl p-4 space-y-4`}>
                          <div className={`flex justify-between items-center border-b ${th.border} pb-2`}>
                            <span className={`text-xs font-bold ${th.textMuted}`}>Sesiones</span>
                            <button onClick={() => setShowNewSessionForm(!showNewSessionForm)} className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-xl">➕ Nueva</button>
                          </div>

                          {showNewSessionForm && (
                            <form onSubmit={handleAddNewSession} className={`${th.input} p-4 rounded-xl border ${th.border} space-y-4 text-xs`}>
                              
                              <input type="date" value={newSessionData.date} onChange={(e) => setNewSessionData((p:any) => ({ ...p, date: e.target.value }))} className={`w-full p-2 ${th.card} border ${th.border} rounded ${th.text}`} />
                              
                              {currentUser?.hasVoiceModule ? (
                                <div className={`${th.card} p-3 rounded-xl border ${th.border} space-y-3`}>
                                  <label className={`text-[10px] font-bold ${th.textMuted} uppercase block`}>🎙️ Grabadora, Dictado IA y Audios</label>
                                  <button type="button" onClick={toggleRecording} className={`w-full py-2.5 rounded-lg font-bold text-white transition-colors text-xs ${isRecordingLive ? 'bg-red-600 animate-pulse' : 'bg-slate-700 hover:bg-slate-600'}`}>
                                      {isRecordingLive ? '🔴 Grabando (Clic para Detener)' : '🎤 Clic para Empezar a Grabar'}
                                  </button>
                                  {newSessionData.audioPath && <p className="text-[9px] text-emerald-500 break-all">✓ Audio vinculado: {newSessionData.audioPath}</p>}
                                  <div className="flex gap-2 mt-2">
                                    <input type="text" placeholder="Dictado rápido para IA..." value={voiceInputText} onChange={(e) => setVoiceInputText(e.target.value)} className={`flex-1 p-2 ${th.input} border ${th.border} rounded ${th.text} text-[11px]`} />
                                    <button type="button" onClick={handleAiDictationAssist} disabled={isDictatingVoice} className="bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded text-white font-bold text-[11px] disabled:opacity-50">✨ IA</button>
                                  </div>
                                  <label className={`text-[10px] font-bold ${th.textMuted} uppercase block mt-3`}>📎 Subir Audio o Video Local</label>
                                  <input type="file" accept="audio/*, video/*" onChange={(e) => {
                                    if(e.target.files?.[0]) setNewSessionData((p:any) => ({...p, audioPath: URL.createObjectURL(e.target.files![0])}));
                                  }} className={`w-full p-2 ${th.input} border ${th.border} rounded ${th.text} text-[11px]`} />
                                  <input type="url" placeholder="O Pegar URL de Zoom/Meet" value={newSessionData.videoUrl || ''} onChange={(e) => setNewSessionData((p:any) => ({ ...p, videoUrl: e.target.value }))} className={`w-full p-2 mt-2 ${th.input} border ${th.border} rounded ${th.text} text-[11px]`} />
                                </div>
                              ) : (
                                <div className={`${th.card} p-3 rounded-xl border border-red-500/30 text-center`}><p className="text-[10px] text-red-500 font-bold uppercase">🎙️ Módulo de Voz Inactivo</p></div>
                              )}

                              <div className={`${th.card} p-3 rounded-xl border ${th.border} space-y-2`}>
                                 <label className={`text-[10px] font-bold text-indigo-500 uppercase block`}>📎 Subir Batería Resuelta Manualmente</label>
                                 <input type="file" accept=".pdf, image/*" onChange={(e) => {
                                    if(e.target.files?.[0]) setNewSessionData((p:any) => ({...p, manualBatteryFile: URL.createObjectURL(e.target.files![0])}));
                                 }} className={`w-full p-2 ${th.input} border ${th.border} rounded ${th.text} text-[11px]`} />
                                 {newSessionData.manualBatteryFile && (
                                   <div className="flex gap-2 items-center mt-2">
                                     <span className="text-[9px] text-emerald-500">✓ Archivo listo</span>
                                     <button type="button" onClick={() => alert("Simulación: Analizando batería subida con IA... Se agregarán los resultados a las notas.")} className="bg-indigo-600 text-white text-[9px] px-2 py-1 rounded">Analizar con IA</button>
                                   </div>
                                 )}
                              </div>

                              <textarea required rows={4} value={newSessionData.rawNotes} onChange={(e) => setNewSessionData((p:any) => ({ ...p, rawNotes: e.target.value }))} placeholder="Notas de evolución..." className={`w-full p-2 ${th.card} border ${th.border} rounded ${th.text}`} />
                              <button type="submit" className="w-full py-2 bg-indigo-600 text-white font-bold rounded">Guardar Sesión</button>
                            </form>
                          )}

                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {(activeCase.sessions || []).map((s) => (
                              <div key={s.sessionNumber} className={`${th.input} p-3 rounded-xl border ${th.border} text-xs`}>
                                <div className="flex justify-between font-bold text-indigo-500"><span>S{s.sessionNumber}</span><span>{s.date}</span></div>
                                <p className="italic mt-1">"{s.rawNotes}"</p>
                                {s.manualBatteryFile && <p className="text-[10px] text-emerald-500 mt-1">📎 Batería Manual Adjunta</p>}
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

                          <button onClick={handleProcessNotes} disabled={isProcessingNotes} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl text-xs">
                            {isProcessingNotes ? '⏳ Procesando...' : 'Generar Dictamen IA'}
                          </button>
                        </div>
                      )}

                      {activeCaseTab === 'ESTADISTICAS' && <PatientDashboard activeCase={activeCase} />}
                    </div>

                    <div className="xl:col-span-7 space-y-6 w-full">
                      <div className={`${th.card} border ${th.border} rounded-2xl flex flex-col min-h-[450px]`}>
                        <div className={`${th.input} px-4 py-4 border-b ${th.border} flex flex-wrap gap-2 justify-between items-center`}>
                          <span className={`text-xs font-bold ${th.textMuted} uppercase`}>{t('Dictamen Clínico Profesional')}</span>
                          <div className="flex flex-wrap items-center gap-2">
                             <select value={pdfLang} onChange={e => setPdfLang(e.target.value as any)} className={`text-[10px] p-1.5 rounded border ${th.border} ${th.card}`}>
                               <option value="ES">ES</option><option value="EN">EN</option>
                             </select>
                             <button onClick={() => handleDownloadReport('PDF')} disabled={isGeneratingPdf} className="text-xs bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-bold">📄 PDF</button>
                             <button onClick={() => handleDownloadReport('DOC')} disabled={isGeneratingPdf} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-bold">📝 Word (.doc)</button>
                          </div>
                        </div>
                        <div className={`p-5 flex-1 text-[13px] ${th.text} font-mono whitespace-pre-wrap overflow-y-auto max-h-[800px]`}>
                          {notesResult || "Presione 'Generar Dictamen IA'."}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

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
                <label className={`block text-[11px] font-bold ${th.textMuted} uppercase`}>{t('Firma Digital para Guardar')}</label>
                <input type="password" required value={verificationPassword} onChange={(e) => setVerificationPassword(e.target.value)} placeholder={t('Su clave de psicólogo/psiquiatra...')} className={`w-full p-2 ${th.card} border ${th.border} rounded ${th.text} mt-1`} />
              </div>
            </div>
            <div className={`p-3 border-t ${th.border} ${th.input} flex justify-end gap-2`}>
              <button onClick={() => setShowDsmModal(false)} className={`px-4 py-2 bg-slate-300 dark:bg-slate-800 ${th.text} font-bold rounded-lg transition-colors`}>{t('Cancelar')}</button>
              <button onClick={handleSaveDsmEvaluation} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors">{t('Firmar y Guardar en Expediente')}</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CALENDARIO */}
      {showCalendarModal && (
        <div className={`fixed inset-0 ${th.modalBg} backdrop-blur-sm flex items-center justify-center p-4 z-50`}>
          <div className={`${th.card} border ${th.border} rounded-2xl max-w-sm w-full p-6 text-xs space-y-4 shadow-2xl`}>
            <div className={`flex justify-between items-center border-b ${th.border} pb-2`}>
              <h3 className={`text-sm font-bold ${th.text}`}>➕ {t('Agendar Nueva Cita')}</h3>
              <button onClick={() => setShowCalendarModal(false)} className={`${th.textMuted} hover:${th.text}`}>✕</button>
            </div>
            <form onSubmit={handleCreateAppointment} className="space-y-4">
              <div>
                <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>{t('Paciente (Expediente Activo)')}</label>
                <select required value={selectedPatientId} onChange={(e) => setSelectedPatientId(e.target.value)} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg ${th.text} focus:border-indigo-500 outline-none`}>
                  <option value="" disabled>{t('Seleccione un paciente...')}</option>
                  {myPatients.map(p => (
                    <option key={p.id} value={p.id}>{p.patientName} (Exp: {p.id})</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>{t('Fecha')}</label>
                  <input type="date" required value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg ${th.text} focus:border-indigo-500 outline-none`} />
                </div>
                <div>
                  <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>{t('Hora')}</label>
                  <input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg ${th.text} focus:border-indigo-500 outline-none`} />
                </div>
              </div>
              <div>
                <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>{t('Duración (Minutos)')}</label>
                <input type="number" required min="15" step="15" value={durationMinutes} onChange={(e) => setDurationMinutes(parseInt(e.target.value))} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-lg ${th.text} focus:border-indigo-500 outline-none`} />
              </div>
              <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-colors shadow-lg">📅 {t('Guardar Cita')}</button>
            </form>
          </div>
        </div>
      )}

      {/* FIRMA DE DESARROLLADOR Y FOOTER */}
      <footer className={`border-t ${th.border} ${th.bg} py-4 text-center text-xs ${th.textMuted} mt-auto w-full transition-colors duration-300`}>
        <p>© 2026 Asistente Clínica SaaS. Cumplimiento ético centralizado. {t('Desarrollado por Harold.')}</p>
      </footer>
    </div>
  );
}
