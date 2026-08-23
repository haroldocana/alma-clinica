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
// FUNCIÓN FALTANTE AÑADIDA PARA CALCULAR DÍAS RESTANTES DE LICENCIA
// ============================================================================
const getDaysRemaining = (expiryDateStr: string | undefined): number => {
  if (!expiryDateStr) return -1;
  const today = new Date();
  const expiry = new Date(expiryDateStr);
  
  // Normalizar las fechas para ignorar la hora y comparar solo días
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

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

// SVG ARREGLADO CON PÍXELES EXACTOS PARA QUE SE IMPRIMA EN EL PDF
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
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 110" width="250" height="230" style="font-family: sans-serif; display: block; margin: 0 auto;">
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
  const [lang, setLang] = useState<'ES'|'EN'|'PT'|'IT'|'FR'>('ES');
  const [pdfLang, setPdfLang] = useState<'ES'|'EN'|'PT'|'IT'|'FR'>('ES');
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
    const dict: Record<string, { ES: string, EN: string, PT: string, IT: string, FR: string }> = {
      // General UI
      'Asistente Clínica SaaS': { ES: 'Asistente Clínica SaaS', EN: 'SaaS Clinical Assistant', PT: 'Assistente Clínico SaaS', IT: 'Assistente Clinico SaaS', FR: 'Assistant Clinique SaaS' },
      'Sistema Clínico e Historiales (Multi-tenant)': { ES: 'Sistema Clínico e Historiales (Multi-tenant)', EN: 'Clinical System & Records (Multi-tenant)', PT: 'Sistema Clínico e Prontuários', IT: 'Sistema Clinico e Cartelle', FR: 'Système Clinique et Dossiers' },
      'Clínico': { ES: 'Clínico', EN: 'Clinical', PT: 'Clínico', IT: 'Clinico', FR: 'Clinique' },
      'Agenda': { ES: 'Agenda', EN: 'Schedule', PT: 'Agenda', IT: 'Agenda', FR: 'Agenda' },
      'Admin': { ES: 'Admin', EN: 'Admin', PT: 'Admin', IT: 'Admin', FR: 'Admin' },
      'Acceso Profesional Clínico': { ES: 'Acceso Profesional Clínico', EN: 'Clinical Professional Access', PT: 'Acesso Profissional Clínico', IT: 'Accesso Professionale Clinico', FR: 'Accès Professionnel Clinique' },
      'Iniciar Sesión': { ES: 'Iniciar Sesión', EN: 'Login', PT: 'Entrar', IT: 'Accedi', FR: 'Connexion' },
      'Usuario': { ES: 'Usuario', EN: 'Username', PT: 'Usuário', IT: 'Utente', FR: 'Utilisateur' },
      'Contraseña': { ES: 'Contraseña', EN: 'Password', PT: 'Senha', IT: 'Password', FR: 'Mot de passe' },
      'Consola Maestra de Licencias': { ES: 'Consola Maestra de Licencias', EN: 'Master License Console', PT: 'Console Mestre de Licenças', IT: 'Console Master Licenze', FR: 'Console Principale des Licences' },
      'Activar Nueva Licencia': { ES: 'Activar Nueva Licencia', EN: 'Activate New License', PT: 'Ativar Nova Licença', IT: 'Attiva Nuova Licenza', FR: 'Activer Nouvelle Licence' },
      'Auditoría y Soporte': { ES: 'Auditoría y Soporte', EN: 'Audit & Support', PT: 'Auditoria e Suporte', IT: 'Audit e Supporto', FR: 'Audit et Support' },
      'Búsqueda': { ES: 'Búsqueda', EN: 'Search', PT: 'Busca', IT: 'Ricerca', FR: 'Recherche' },
      'Alertas': { ES: 'Alertas', EN: 'Alerts', PT: 'Alertas', IT: 'Avvisi', FR: 'Alertes' },
      'Mi Perfil': { ES: 'Mi Perfil', EN: 'My Profile', PT: 'Meu Perfil', IT: 'Mio Profilo', FR: 'Mon Profil' },
      'Respaldo JSON': { ES: 'Respaldo JSON', EN: 'JSON Backup', PT: 'Backup JSON', IT: 'Backup JSON', FR: 'Sauvegarde JSON' },
      'Cerrar Sesión': { ES: 'Cerrar Sesión', EN: 'Logout', PT: 'Sair', IT: 'Esci', FR: 'Déconnexion' },
      'BÚSQUEDA DE EXPEDIENTES': { ES: 'BÚSQUEDA DE EXPEDIENTES', EN: 'RECORD SEARCH', PT: 'BUSCA DE PRONTUÁRIOS', IT: 'RICERCA CARTELLE', FR: 'RECHERCHE DE DOSSIERS' },
      'Nuevo Expediente': { ES: 'Nuevo Expediente', EN: 'New Record', PT: 'Novo Prontuário', IT: 'Nuova Cartella', FR: 'Nouveau Dossier' },
      'Ocultar Formulario': { ES: 'Ocultar Formulario', EN: 'Hide Form', PT: 'Ocultar Formulário', IT: 'Nascondi Modulo', FR: 'Masquer le Formulaire' },
      
      // Demográficos Variables (PDF y App)
      'Edad': { ES: 'Edad', EN: 'Age', PT: 'Idade', IT: 'Età', FR: 'Âge' },
      'Teléfono': { ES: 'Teléfono', EN: 'Phone', PT: 'Telefone', IT: 'Telefono', FR: 'Téléphone' },
      'Religión': { ES: 'Religión', EN: 'Religion', PT: 'Religião', IT: 'Religione', FR: 'Religion' },
      'Femenino': { ES: 'Femenino', EN: 'Female', PT: 'Feminino', IT: 'Femmina', FR: 'Féminin' },
      'Masculino': { ES: 'Masculino', EN: 'Male', PT: 'Masculino', IT: 'Maschio', FR: 'Masculin' },
      'Otro': { ES: 'Otro', EN: 'Other', PT: 'Outro', IT: 'Altro', FR: 'Autre' },
      'Soltero(a)': { ES: 'Soltero(a)', EN: 'Single', PT: 'Solteiro(a)', IT: 'Celibe/Nubile', FR: 'Célibataire' },
      'Casado(a)': { ES: 'Casado(a)', EN: 'Married', PT: 'Casado(a)', IT: 'Sposato(a)', FR: 'Marié(e)' },
      'Divorciado(a)': { ES: 'Divorciado(a)', EN: 'Divorced', PT: 'Divorciado(a)', IT: 'Divorziato(a)', FR: 'Divorcé(e)' },
      'Viudo(a)': { ES: 'Viudo(a)', EN: 'Widowed', PT: 'Viúvo(a)', IT: 'Vedovo(a)', FR: 'Veuf(ve)' },
      'Unión Libre': { ES: 'Unión Libre', EN: 'Domestic Partnership', PT: 'União Estável', IT: 'Convivenza', FR: 'Union Libre' },
      'Psicólogo(a) Clínico': { ES: 'Psicólogo(a) Clínico', EN: 'Clinical Psychologist', PT: 'Psicólogo(a) Clínico', IT: 'Psicologo(a) Clinico', FR: 'Psychologue Clinicien' },
      'Médico Psiquiatra': { ES: 'Médico Psiquiatra', EN: 'Psychiatrist', PT: 'Médico Psiquiatra', IT: 'Medico Psichiatra', FR: 'Médecin Psychiatre' },
      
      // Detalles del Formulario
      '1. Datos Personales Básicos': { ES: '1. Datos Personales Básicos', EN: '1. Basic Personal Data', PT: '1. Dados Pessoais Básicos', IT: '1. Dati Personali di Base', FR: '1. Données Personnelles de Base' },
      'ID Expediente (Ej. PAC-001)': { ES: 'ID Expediente (Ej. PAC-001)', EN: 'Record ID (E.g. PAC-001)', PT: 'ID do Prontuário', IT: 'ID Cartella', FR: 'ID Dossier' },
      '2. Contexto Sociodemográfico': { ES: '2. Contexto Sociodemográfico', EN: '2. Sociodemographic Context', PT: '2. Contexto Sociodemográfico', IT: '2. Contesto Sociodemografico', FR: '2. Contexte Sociodémographique' },
      'Ocupación': { ES: 'Ocupación', EN: 'Occupation', PT: 'Ocupação', IT: 'Occupazione', FR: 'Profession' },
      'Grado de Estudios': { ES: 'Grado de Estudios', EN: 'Education Level', PT: 'Grau de Escolaridade', IT: 'Livello di Istruzione', FR: 'Niveau d\'Éducation' },
      'Lugar de Origen / Procedencia': { ES: 'Lugar de Origen / Procedencia', EN: 'Place of Origin', PT: 'Local de Origem', IT: 'Luogo di Origine', FR: 'Lieu d\'Origine' },
      'Datos de Progenitores (Nombres, edades, estado...)': { ES: 'Datos de Progenitores (Nombres, edades, estado...)', EN: 'Parental Data (Names, ages, status...)', PT: 'Dados dos Pais', IT: 'Dati dei Genitori', FR: 'Données Parentales' },
      '3. Anamnesis y Motivo de Consulta': { ES: '3. Anamnesis y Motivo de Consulta', EN: '3. Anamnesis and Chief Complaint', PT: '3. Anamnese e Queixa Principal', IT: '3. Anamnesi e Motivo del Consulto', FR: '3. Anamnèse et Motif de Consultation' },
      'Antecedentes Médicos / Psicológicos Previos...': { ES: 'Antecedentes Médicos / Psicológicos Previos...', EN: 'Previous Medical / Psychological History...', PT: 'Antecedentes Médicos / Psicológicos...', IT: 'Precedenti Medici / Psicologici...', FR: 'Antécédents Médicaux / Psychologiques...' },
      'Motivo de Consulta (Describa el motivo textual por el que asiste el paciente)...': { ES: 'Motivo de Consulta (Describa el motivo textual por el que asiste el paciente)...', EN: 'Chief Complaint (Describe the exact reason the patient is attending)...', PT: 'Motivo da Consulta...', IT: 'Motivo del Consulto...', FR: 'Motif de Consultation...' },
      'Guardar Expediente Clínico Completo': { ES: 'Guardar Expediente Clínico Completo', EN: 'Save Complete Clinical Record', PT: 'Salvar Prontuário Clínico Completo', IT: 'Salva Cartella Clinica Completa', FR: 'Enregistrer le Dossier Clinique Complet' },
      'Busque por nombre o ID...': { ES: 'Busque por nombre o ID...', EN: 'Search by name or ID...', PT: 'Busque por nome ou ID...', IT: 'Cerca per nome o ID...', FR: 'Recherche par nom ou ID...' },
      'Buscar': { ES: 'Buscar', EN: 'Search', PT: 'Buscar', IT: 'Cerca', FR: 'Chercher' },
      
      // Operaciones Médicas
      'Constancia': { ES: 'Constancia', EN: 'Certificate', PT: 'Declaração', IT: 'Certificato', FR: 'Attestation' },
      'Referencia': { ES: 'Referencia', EN: 'Referral', PT: 'Encaminhamento', IT: 'Impegnativa', FR: 'Référence' },
      'Extender Receta': { ES: 'Extender Receta', EN: 'Prescription', PT: 'Receituário', IT: 'Ricetta', FR: 'Ordonnance' },
      'Historial': { ES: 'Historial', EN: 'History', PT: 'Histórico', IT: 'Cronologia', FR: 'Historique' },
      'KPIs Empresariales': { ES: 'KPIs Empresariales', EN: 'Business KPIs', PT: 'KPIs Empresariais', IT: 'KPI Aziendali', FR: 'KPIs d\'Entreprise' },
      'Sesiones': { ES: 'Sesiones', EN: 'Sessions', PT: 'Sessões', IT: 'Sessioni', FR: 'Sessions' },
      'Nueva': { ES: 'Nueva', EN: 'New', PT: 'Nova', IT: 'Nuova', FR: 'Nouvelle' },
      
      // Inteligencia Artificial y Consultas
      'Generar Dictamen IA': { ES: 'Generar Dictamen IA', EN: 'Generate AI Report', PT: 'Gerar Parecer IA', IT: 'Genera Referto IA', FR: 'Générer Rapport IA' },
      '⏳ Procesando con IA...': { ES: '⏳ Procesando con IA...', EN: '⏳ Processing with AI...', PT: '⏳ Processando com IA...', IT: '⏳ Elaborazione con IA...', FR: '⏳ Traitement avec IA...' },
      'Consulta Académica / Científica': { ES: 'Consulta Académica / Científica', EN: 'Academic / Scientific Query', PT: 'Consulta Acadêmica / Científica', IT: 'Consultazione Accademica / Scientifica', FR: 'Consultation Académique / Scientifique' },
      'Consulte dudas teóricas, criterios del DSM-5, medicamentos...': { ES: 'Consulte dudas teóricas, criterios del DSM-5, medicamentos...', EN: 'Consult theoretical doubts, DSM-5 criteria, medications...', PT: 'Consulte dúvidas teóricas...', IT: 'Consulta dubbi teorici, criteri DSM-5...', FR: 'Consultez des doutes théoriques, critères du DSM-5...' },
      'Consultando Base de Datos...': { ES: 'Consultando Base de Datos...', EN: 'Querying Database...', PT: 'Consultando Banco de Dados...', IT: 'Consultazione Database...', FR: 'Interrogation de la Base de Données...' },
      'Realizar Consulta': { ES: 'Realizar Consulta', EN: 'Run Query', PT: 'Realizar Consulta', IT: 'Esegui Query', FR: 'Exécuter la Requête' },
      'Dictamen Clínico Profesional': { ES: 'Dictamen Clínico Profesional', EN: 'Professional Clinical Report', PT: 'Parecer Clínico Profissional', IT: 'Referto Clinico Professionale', FR: 'Rapport Clinique Professionnel' },
      'Generar PDF': { ES: 'Generar PDF', EN: 'Generate PDF', PT: 'Gerar PDF', IT: 'Genera PDF', FR: 'Générer PDF' },
      
      // MÉTICAS DASHBOARD NUEVAS
      'Nivel de Actividad Psicosocial (GAF / EEAG)': { ES: 'Nivel de Actividad Psicosocial (GAF / EEAG)', EN: 'Global Assessment of Functioning (GAF)', PT: 'Avaliação Global do Funcionamento (GAF)', IT: 'Valutazione Globale del Funzionamento (GAF)', FR: 'Évaluation Globale du Fonctionnement (GAF)' },
      'GAF / EEAG': { ES: 'GAF / EEAG', EN: 'GAF Score', PT: 'Escore GAF', IT: 'Punteggio GAF', FR: 'Score GAF' },
      'Estabilidad Neurovegetativa': { ES: 'Estabilidad Neurovegetativa', EN: 'Neurovegetative Stability', PT: 'Estabilidade Neurovegetativa', IT: 'Stabilità Neurovegetativa', FR: 'Stabilité Neurovégétative' },
      'Respuesta Terapéutica (% Reducción)': { ES: 'Respuesta Terapéutica (% Reducción)', EN: 'Therapeutic Response (% Reduction)', PT: 'Resposta Terapêutica (% Redução)', IT: 'Risposta Terapeutica (% Riduzione)', FR: 'Réponse Thérapeutique (% Réduction)' },
      'Riesgo Clínico Integrado': { ES: 'Riesgo Clínico Integrado', EN: 'Integrated Clinical Risk', PT: 'Risco Clínico Integrado', IT: 'Rischio Clinico Integrato', FR: 'Risque Clinique Intégré' },
      'Funcionalidad Adaptativa': { ES: 'Funcionalidad Adaptativa', EN: 'Adaptive Functioning', PT: 'Funcionalidade Adaptativa', IT: 'Funzionalità Adattiva', FR: 'Fonctionnalité Adaptative' },

      // PDF Etiquetas y Layout
      'EXPEDIENTE CLÍNICO PSICOLÓGICO Y MÉDICO': { ES: 'EXPEDIENTE CLÍNICO PSICOLÓGICO Y MÉDICO', EN: 'PSYCHOLOGICAL AND MEDICAL CLINICAL RECORD', PT: 'PRONTUÁRIO CLÍNICO PSICOLÓGICO E MÉDICO', IT: 'CARTELLA CLINICA PSICOLOGICA E MEDICA', FR: 'DOSSIER CLINIQUE PSYCHOLOGIQUE ET MÉDICAL' },
      'Protocolo de Gestión de Salud': { ES: 'Protocolo de Gestión de Salud', EN: 'Health Management Protocol', PT: 'Protocolo de Gestão de Saúde', IT: 'Protocollo di Gestione Sanitaria', FR: 'Protocole de Gestion de la Santé' },
      '1. FICHA DE IDENTIFICACIÓN': { ES: '1. FICHA DE IDENTIFICACIÓN', EN: '1. IDENTIFICATION DATA', PT: '1. FICHA DE IDENTIFICAÇÃO', IT: '1. DATI DI IDENTIFICAZIONE', FR: '1. FICHE D\'IDENTIFICATION' },
      'Nombre:': { ES: 'Nombre:', EN: 'Name:', PT: 'Nome:', IT: 'Nome:', FR: 'Nom:' },
      'Expediente ID:': { ES: 'Expediente ID:', EN: 'Record ID:', PT: 'ID do Prontuário:', IT: 'ID Cartella:', FR: 'ID Dossier:' },
      'Teléfono:': { ES: 'Teléfono:', EN: 'Phone:', PT: 'Telefone:', IT: 'Telefono:', FR: 'Téléphone:' },
      'Sexo:': { ES: 'Sexo:', EN: 'Sex:', PT: 'Sexo:', IT: 'Sesso:', FR: 'Sexe:' },
      'Edad:': { ES: 'Edad:', EN: 'Age:', PT: 'Idade:', IT: 'Età:', FR: 'Âge:' },
      'Ocupación:': { ES: 'Ocupación:', EN: 'Occupation:', PT: 'Ocupação:', IT: 'Occupazione:', FR: 'Profession:' },
      'Estado Civil:': { ES: 'Estado Civil:', EN: 'Marital Status:', PT: 'Estado Civil:', IT: 'Stato Civile:', FR: 'État Civil:' },
      'Origen / Procedencia:': { ES: 'Origen / Procedencia:', EN: 'Origin:', PT: 'Origem:', IT: 'Origine:', FR: 'Origine:' },
      'Religión:': { ES: 'Religión:', EN: 'Religion:', PT: 'Religião:', IT: 'Religione:', FR: 'Religion:' },
      'Datos de Progenitores:': { ES: 'Datos de Progenitores:', EN: 'Parental Data:', PT: 'Dados dos Genitores:', IT: 'Dati dei Genitori:', FR: 'Données Parentales:' },
      'Motivo Textual:': { ES: 'Motivo Textual:', EN: 'Textual Reason:', PT: 'Motivo Textual:', IT: 'Motivo Testuale:', FR: 'Raison Textuelle:' },
      'Antecedentes Clínicos:': { ES: 'Antecedentes Clínicos:', EN: 'Clinical History:', PT: 'Antecedentes Clínicos:', IT: 'Precedenti Clinici:', FR: 'Antécédents Cliniques:' },
      'Sin antecedentes.': { ES: 'Sin antecedentes.', EN: 'No previous history.', PT: 'Sem antecedentes.', IT: 'Nessun precedente.', FR: 'Aucun antécédent.' },
      '3. BATERÍAS Y EVALUACIONES PSICOMÉTRICAS REALIZADAS': { ES: '3. BATERÍAS Y EVALUACIONES PSICOMÉTRICAS REALIZADAS', EN: '3. PSYCHOMETRIC EVALUATIONS PERFORMED', PT: '3. AVALIAÇÕES PSICOMÉTRICAS REALIZADAS', IT: '3. VALUTAZIONI PSICOMETRICHE ESEGUITE', FR: '3. ÉVALUATIONS PSYCHOMÉTRIQUES RÉALISÉES' },
      'No se han aplicado baterías psicométricas formales aún.': { ES: 'No se han aplicado baterías psicométricas formales aún.', EN: 'No formal psychometric batteries applied yet.', PT: 'Nenhuma bateria psicométrica formal aplicada ainda.', IT: 'Nessuna batteria psicometrica formale applicata ancora.', FR: 'Aucune batterie psychométrique formelle appliquée pour le moment.' },
      '4. DICTAMEN E IMPRESIÓN DIAGNÓSTICA (IA)': { ES: '4. DICTAMEN E IMPRESIÓN DIAGNÓSTICA (IA)', EN: '4. DIAGNOSTIC IMPRESSION AND REPORT (AI)', PT: '4. PARECER E IMPRESSÃO DIAGNÓSTICA (IA)', IT: '4. REFERTO E IMPRESSIONE DIAGNOSTICA (IA)', FR: '4. RAPPORT ET IMPRESSION DIAGNOSTIQUE (IA)' },
      'En proceso de evaluación clínica acumulada.': { ES: 'En proceso de evaluación clínica acumulada.', EN: 'In the process of cumulative clinical evaluation.', PT: 'Em processo de avaliação clínica acumulada.', IT: 'In corso di valutazione clinica accumulata.', FR: 'En cours d\'évaluation clinique cumulée.' },
      '5. BUSINESS INTELLIGENCE CLÍNICO (KPIs)': { ES: '5. BUSINESS INTELLIGENCE CLÍNICO (KPIs)', EN: '5. CLINICAL BUSINESS INTELLIGENCE (KPIs)', PT: '5. BUSINESS INTELLIGENCE CLÍNICO (KPIs)', IT: '5. CLINICAL BUSINESS INTELLIGENCE (KPIs)', FR: '5. BUSINESS INTELLIGENCE CLINIQUE (KPIs)' },
      'Termómetro de Adherencia (Avance)': { ES: 'Termómetro de Adherencia (Avance)', EN: 'Adherence Thermometer (Progress)', PT: 'Termômetro de Adesão (Avanço)', IT: 'Termometro di Aderenza (Progresso)', FR: 'Thermomètre d\'Adhérence (Progrès)' },
      'Hacia el protocolo base de alta clínica (12 sesiones).': { ES: 'Hacia el protocolo base de alta clínica (12 sesiones).', EN: 'Towards the clinical discharge base protocol (12 sessions).', PT: 'Rumo ao protocolo base de alta clínica (12 sessões).', IT: 'Verso il protocollo base di dimissione clinica (12 sessioni).', FR: 'Vers le protocole de base de sortie clinique (12 sessions).' },
      'Eficacia (Sesión 1 vs Actual)': { ES: 'Eficacia (Sesión 1 vs Actual)', EN: 'Efficacy (Session 1 vs Current)', PT: 'Eficácia (Sessão 1 vs Atual)', IT: 'Efficacia (Sessione 1 vs Attuale)', FR: 'Efficacité (Session 1 vs Actuelle)' },
      'Ansiedad': { ES: 'Ansiedad', EN: 'Anxiety', PT: 'Ansiedade', IT: 'Ansia', FR: 'Anxiété' },
      'Depresión': { ES: 'Depresión', EN: 'Depression', PT: 'Depressão', IT: 'Depressione', FR: 'Dépression' },
      'Rueda Multiaxial de Vida (Última Evaluación)': { ES: 'Rueda Multiaxial de Vida (Última Evaluación)', EN: 'Multiaxial Wheel of Life (Last Evaluation)', PT: 'Roda Multiaxial de Vida (Última Avaliação)', IT: 'Ruota Multiassiale della Vita (Ultima Valutazione)', FR: 'Roue Multiaxiale de Vie (Dernière Évaluation)' },
      'Sentimiento Congruente': { ES: 'Sentimiento Congruente', EN: 'Congruent Sentiment', PT: 'Sentimento Congruente', IT: 'Sentimento Congruente', FR: 'Sentiment Congruent' },
      'Estable': { ES: 'Estable', EN: 'Stable', PT: 'Estável', IT: 'Stabile', FR: 'Stable' },
      'En Riesgo': { ES: 'En Riesgo', EN: 'At Risk', PT: 'Em Risco', IT: 'A Rischio', FR: 'À Risque' },
      'Especialidad:': { ES: 'Especialidad:', EN: 'Specialty:', PT: 'Especialidade:', IT: 'Specialità:', FR: 'Spécialité:' },
      'Colegiado Activo:': { ES: 'Colegiado Activo:', EN: 'Active License:', PT: 'Registro Ativo:', IT: 'Licenza Attiva:', FR: 'Licence Active:' },
      'Prueba:': { ES: 'Prueba:', EN: 'Test:', PT: 'Teste:', IT: 'Test:', FR: 'Test:' },
      'Actual:': { ES: 'Actual:', EN: 'Current:', PT: 'Atual:', IT: 'Attuale:', FR: 'Actuel:' },
      'N/A': { ES: 'N/A', EN: 'N/A', PT: 'N/A', IT: 'N/A', FR: 'N/A' },
      'N/R': { ES: 'N/R', EN: 'N/R', PT: 'N/R', IT: 'N/R', FR: 'N/R' },
      
      // Gráfica
      'Sueño': { ES: 'Sueño', EN: 'Sleep', PT: 'Sono', IT: 'Sonno', FR: 'Sommeil' },
      'Apetito': { ES: 'Apetito', EN: 'Appetite', PT: 'Apetite', IT: 'Appetito', FR: 'Appétit' },
      'Energía': { ES: 'Energía', EN: 'Energy', PT: 'Energia', IT: 'Energia', FR: 'Énergie' },
      'Social': { ES: 'Social', EN: 'Social', PT: 'Social', IT: 'Sociale', FR: 'Social' },
      'Atención': { ES: 'Atención', EN: 'Attention', PT: 'Atenção', IT: 'Attenzione', FR: 'Attention' },
      
      // Normas Legales
      'HIPAA Compliance & Privacy Rule': { ES: 'HIPAA Compliance & Privacy Rule', EN: 'HIPAA Compliance & Privacy Rule', PT: 'Conformidade HIPAA e Regra de Privacidade', IT: 'Conformità HIPAA e Regola sulla Privacy', FR: 'Conformité HIPAA et Règle de Confidentialité' },
      'Cumplimiento RGPD (Europa) / Ley de Autonomía del Paciente': { ES: 'Cumplimiento RGPD (Europa) / Ley de Autonomía del Paciente', EN: 'GDPR Compliance (Europe) / Patient Autonomy Law', PT: 'Conformidade RGPD (Europa) / Lei de Autonomia do Paciente', IT: 'Conformità GDPR (Europa) / Legge sull\'Autonomia del Paziente', FR: 'Conformité RGPD (Europe) / Loi sur l\'Autonomie du Patient' },
      'NOM-004-SSA3-2012 (Norma Oficial Mexicana del Expediente Clínico)': { ES: 'NOM-004-SSA3-2012 (Norma Oficial Mexicana del Expediente Clínico)', EN: 'NOM-004-SSA3-2012 (Official Mexican Standard for Clinical Records)', PT: 'NOM-004-SSA3-2012 (Norma Oficial Mexicana do Prontuário Clínico)', IT: 'NOM-004-SSA3-2012 (Standard Ufficiale Messicano per Cartelle Cliniche)', FR: 'NOM-004-SSA3-2012 (Norme Officielle Mexicaine pour les Dossiers Cliniques)' },
      'Resolución 1995 de 1999 y Resolución 839 de 2017 (Historia Clínica)': { ES: 'Resolución 1995 de 1999 y Resolución 839 de 2017 (Historia Clínica)', EN: 'Resolution 1995 of 1999 and 839 of 2017 (Clinical History)', PT: 'Resolução 1995 de 1999 e 839 de 2017 (História Clínica)', IT: 'Risoluzione 1995 del 1999 e 839 del 2017 (Storia Clinica)', FR: 'Résolution 1995 de 1999 et 839 de 2017 (Dossier Médical)' },
      'Ley N° 20.584 (Derechos y Deberes del Paciente)': { ES: 'Ley N° 20.584 (Derechos y Deberes del Paciente)', EN: 'Law N° 20.584 (Patient Rights and Duties)', PT: 'Lei N° 20.584 (Direitos e Deveres do Paciente)', IT: 'Legge N° 20.584 (Diritti e Doveri del Paziente)', FR: 'Loi N° 20.584 (Droits et Devoirs du Patient)' },
      'NTS N° 139-MINSA/2018/DGAIN (Gestión de la Historia Clínica)': { ES: 'NTS N° 139-MINSA/2018/DGAIN (Gestión de la Historia Clínica)', EN: 'NTS N° 139-MINSA/2018/DGAIN (Clinical History Management)', PT: 'NTS N° 139-MINSA/2018/DGAIN (Gestão da História Clínica)', IT: 'NTS N° 139-MINSA/2018/DGAIN (Gestione della Storia Clinica)', FR: 'NTS N° 139-MINSA/2018/DGAIN (Gestion du Dossier Médical)' },
      'Ley 26.529 (Derechos del Paciente, Historia Clínica y Consentimiento Informado)': { ES: 'Ley 26.529 (Derechos del Paciente, Historia Clínica y Consentimiento Informado)', EN: 'Law 26.529 (Patient Rights, Clinical History & Informed Consent)', PT: 'Lei 26.529 (Direitos do Paciente, História Clínica e Consentimento Informado)', IT: 'Legge 26.529 (Diritti del Paziente, Storia Clinica e Consenso Informato)', FR: 'Loi 26.529 (Droits du Patient, Dossier Médical et Consentement Éclairé)' },
      'Código de Salud (Decreto 90-97) / Normativa MSPAS': { ES: 'Código de Salud (Decreto 90-97) / Normativa MSPAS', EN: 'Health Code (Decree 90-97) / MSPAS Regulations', PT: 'Código de Saúde (Decreto 90-97) / Normativas MSPAS', IT: 'Codice della Salute (Decreto 90-97) / Normative MSPAS', FR: 'Code de la Santé (Décret 90-97) / Réglementations MSPAS' },
      'Cumplimiento de Confidencialidad y Ética Profesional Internacional': { ES: 'Cumplimiento de Confidencialidad y Ética Profesional Internacional', EN: 'Compliance with Confidentiality and International Professional Ethics', PT: 'Cumprimento de Confidencialidade e Ética Profissional Internacional', IT: 'Conformità alla Riservatezza ed Etica Professionale Internazionale', FR: 'Conformité à la Confidentialité et à l\'Éthique Professionnelle Internationale' },
      'A QUIEN INTERESE:': { ES: 'A QUIEN INTERESE:', EN: 'TO WHOM IT MAY CONCERN:', PT: 'A QUEM POSSA INTERESSAR:', IT: 'A CHI DI COMPETENZA:', FR: 'À QUI DE DROIT:' },
      'Por medio de la presente se hace constar que el/la paciente': { ES: 'Por medio de la presente se hace constar que el/la paciente', EN: 'This is to certify that the patient', PT: 'Por meio desta certifica-se que o/a paciente', IT: 'Si certifica con la presente che il/la paziente', FR: 'Par la présente, il est certifié que le/la patient(e)' },
      'expediente': { ES: 'expediente', EN: 'record', PT: 'prontuário', IT: 'cartella', FR: 'dossier' },
      'ha asistido a su proceso clínico.': { ES: 'ha asistido a su proceso clínico.', EN: 'has attended their clinical process.', PT: 'compareceu ao seu processo clínico.', IT: 'ha partecipato al suo processo clinico.', FR: 'a assisté à son processus clinique.' },
      'Atentamente,': { ES: 'Atentamente,', EN: 'Sincerely,', PT: 'Atenciosamente,', IT: 'Cordiali saluti,', FR: 'Cordialement,' },
      'EVALUACIÓN PSICOMÉTRICA INTERNACIONAL': { ES: 'EVALUACIÓN PSICOMÉTRICA INTERNACIONAL', EN: 'INTERNATIONAL PSYCHOMETRIC EVALUATION', PT: 'AVALIAÇÃO PSICOMÉTRICA INTERNACIONAL', IT: 'VALUTAZIONE PSICOMETRICA INTERNAZIONALE', FR: 'ÉVALUATION PSYCHOMÉTRIQUE INTERNATIONALE' },
      'Instrumento:': { ES: 'Instrumento:', EN: 'Instrument:', PT: 'Instrumento:', IT: 'Strumento:', FR: 'Instrument:' },
      'Evaluador:': { ES: 'Evaluador:', EN: 'Evaluator:', PT: 'Avaliador:', IT: 'Valutatore:', FR: 'Évaluateur:' },
      'RESULTADOS Y PUNTUAJES:': { ES: 'RESULTADOS Y PUNTUAJES:', EN: 'RESULTS AND SCORES:', PT: 'RESULTADOS E PONTUAÇÕES:', IT: 'RISULTATI E PUNTEGGI:', FR: 'RÉSULTATS ET SCORES:' },
      'PUNTUACIÓN AUTOMÁTICA:': { ES: 'PUNTUACIÓN AUTOMÁTICA:', EN: 'AUTOMATIC SCORE:', PT: 'PONTUAÇÃO AUTOMÁTICA:', IT: 'PUNTEGGIO AUTOMATICO:', FR: 'SCORE AUTOMATIQUE:' },
      'Desarrollado por Harold.': { ES: 'Desarrollado por Harold.', EN: 'Developed by Harold.', PT: 'Desenvolvido por Harold.', IT: 'Sviluppato da Harold.', FR: 'Développé par Harold.' }
    };
    return dict[key]?.[activeLang] || key;
  };

  const getLegalNorm = (countryCode: string) => {
    switch(countryCode) {
      case 'US': return 'HIPAA Compliance & Privacy Rule';
      case 'ES': case 'FR': case 'DE': case 'IT': case 'GB': return 'Cumplimiento RGPD (Europa) / Ley de Autonomía del Paciente';
      case 'MX': return 'NOM-004-SSA3-2012 (Norma Oficial Mexicana del Expediente Clínico)';
      case 'CO': return 'Resolución 1995 de 1999 y Resolución 839 de 2017 (Historia Clínica)';
      case 'CL': return 'Ley N° 20.584 (Derechos y Deberes del Paciente)';
      case 'PE': return 'NTS N° 139-MINSA/2018/DGAIN (Gestión de la Historia Clínica)';
      case 'AR': return 'Ley 26.529 (Derechos del Paciente, Historia Clínica y Consentimiento Informado)';
      case 'GT': return 'Código de Salud (Decreto 90-97) / Normativa MSPAS';
      default: return 'Cumplimiento de Confidencialidad y Ética Profesional Internacional';
    }
  };

  const PatientDashboard = ({ activeCase }: { activeCase: ClinicalCase }) => {
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
    
    // CÁLCULOS CLÍNICOS AVANZADOS
    const metaSesiones = 12;
    const avanceBase = Math.min(100, (totalSessions / metaSesiones) * 100);
    
    const promedioFuncional = (lastSessionAreas.sleep + lastSessionAreas.appetite + lastSessionAreas.energy + lastSessionAreas.social + lastSessionAreas.concentration) / 5;
    const gafScore = Math.min(100, Math.round(promedioFuncional * 10));
    
    const neurovegetativoScore = Math.round(((lastSessionAreas.sleep + lastSessionAreas.appetite + lastSessionAreas.energy) / 30) * 100);
    const adaptativaScore = Math.round(((lastSessionAreas.social + lastSessionAreas.concentration) / 20) * 100);

    const severidadInicial = firstSession.bai + firstSession.bdi;
    const severidadActual = lastSession.bai + lastSession.bdi;
    let reduccionSintomatica = 0;
    if (severidadInicial > 0) {
      reduccionSintomatica = Math.max(0, Math.round(((severidadInicial - severidadActual) / severidadInicial) * 100));
    }

    const stressPromedio = (lastSession.bai + lastSession.bdi) / 2;
    const sentimientoScore = totalSessions > 0 ? Math.max(0, 100 - (stressPromedio / 30) * 100) : 50; 

    let sentimientoColor = 'text-red-400';
    if (sentimientoScore >= 80) sentimientoColor = 'text-emerald-400';
    else if (sentimientoScore >= 50) sentimientoColor = 'text-blue-400';
    else if (sentimientoScore >= 25) sentimientoColor = 'text-amber-400';

    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 space-y-6 w-full overflow-hidden">
        <div className="border-b border-slate-800 pb-3 flex justify-between items-center flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider break-words">📊 {t('Business Intelligence Clínico')}</h3>
            <p className="text-[11px] text-slate-400">{t('Medición de adherencia, evolución de síntomas y áreas funcionales.')}</p>
          </div>
          <div className="px-3 py-1 bg-indigo-950 border border-indigo-500/40 rounded-xl text-[10px] font-bold text-indigo-300 font-mono">
              GAF / EEAG: {gafScore}/100
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
             <span className="text-[9px] font-bold text-slate-400 uppercase block">{t('Nivel de Actividad Psicosocial (GAF / EEAG)')}</span>
             <div className="text-lg font-bold text-indigo-400 mt-1">{gafScore} / 100</div>
             <p className="text-[9px] text-slate-500 mt-0.5">{gafScore >= 71 ? 'Síntomas leves / Buen funcionamiento' : gafScore >= 51 ? 'Dificultades moderadas' : 'Alteración grave'}</p>
          </div>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
             <span className="text-[9px] font-bold text-slate-400 uppercase block">{t('Estabilidad Neurovegetativa')}</span>
             <div className="text-lg font-bold text-emerald-400 mt-1">{neurovegetativoScore}%</div>
             <p className="text-[9px] text-slate-500 mt-0.5">Eje Sueño - Apetito - Energía</p>
          </div>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
             <span className="text-[9px] font-bold text-slate-400 uppercase block">{t('Respuesta Terapéutica (% Reducción)')}</span>
             <div className="text-lg font-bold text-amber-400 mt-1">{reduccionSintomatica}%</div>
             <p className="text-[9px] text-slate-500 mt-0.5">Alivio sintomático desde Sesión 1</p>
          </div>
          <div className="bg-slate-950 p-3 rounded-xl border border-slate-800">
             <span className="text-[9px] font-bold text-slate-400 uppercase block">{t('Funcionalidad Adaptativa')}</span>
             <div className="text-lg font-bold text-blue-400 mt-1">{adaptativaScore}%</div>
             <p className="text-[9px] text-slate-500 mt-0.5">Desempeño Social & Atención</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col items-center">
            <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-2">🕸️ {t('Rueda Multiaxial')}</h4>
            <div className="w-40 h-40" dangerouslySetInnerHTML={{ __html: generateSpiderChartSVG(lastSessionAreas, t) }} />
          </div>
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col items-center w-full">
            <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-4">📊 {t('Eficacia: Pre vs Post')}</h4>
            <div className="flex items-end justify-center gap-6 h-32 w-full px-4">
              <div className="flex gap-1 h-full items-end">
                <div className="w-8 bg-slate-700 rounded-t relative flex items-end justify-center" style={{ height: `${(firstSession.bai/63)*100}%` }}>
                  <span className="text-[9px] text-white font-bold mb-1">{firstSession.bai}</span>
                </div>
                <div className="w-8 bg-amber-500 rounded-t relative flex items-end justify-center" style={{ height: `${(lastSession.bai/63)*100}%` }}>
                  <span className="text-[9px] text-white font-bold mb-1">{lastSession.bai}</span>
                </div>
              </div>
              <div className="flex gap-1 h-full items-end">
                <div className="w-8 bg-slate-700 rounded-t relative flex items-end justify-center" style={{ height: `${(firstSession.bdi/63)*100}%` }}>
                  <span className="text-[9px] text-white font-bold mb-1">{firstSession.bdi}</span>
                </div>
                <div className="w-8 bg-blue-500 rounded-t relative flex items-end justify-center" style={{ height: `${(lastSession.bdi/63)*100}%` }}>
                  <span className="text-[9px] text-white font-bold mb-1">{lastSession.bdi}</span>
                </div>
              </div>
            </div>
            <div className="flex justify-between w-full px-8 mt-2 text-[8px] text-slate-500 uppercase font-bold">
              <span>{t('Ansiedad')}</span>
              <span>{t('Depresión')}</span>
            </div>
          </div>
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">
            <div>
              <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">🌡️ {t('Adherencia Clínica')}</h4>
              <div className="w-full bg-slate-800 rounded-full h-3">
                <div className="bg-gradient-to-r from-red-500 to-emerald-500 h-3 rounded-full" style={{ width: `${avanceBase}%` }}></div>
              </div>
              <p className="text-[9px] text-slate-400 mt-1">{Math.round(avanceBase)}% {t('completado.')}</p>
            </div>
            <div className="pt-2 border-t border-slate-800">
              <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-1">🧭 {t('Sentimiento Congruente')}</h4>
              <div className={`text-xl font-bold ${sentimientoColor}`}>{sentimientoScore >= 50 ? t('Estable') : t('En Riesgo')}</div>
              <p className="text-[9px] text-slate-400">Score IA: {Math.round(sentimientoScore)}/100</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-hidden w-full">
          <h4 className="text-[10px] font-bold text-slate-300 uppercase tracking-wider mb-4">📈 {t('Curva de Tendencia (Síntomas)')}</h4>
          {totalSessions < 2 ? (
            <p className="text-[10px] text-slate-500 italic text-center py-6">{t('Requiere 2+ sesiones para curva.')}</p>
          ) : (
            <div className="relative w-full h-40">
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
            const prevStr = JSON.stringify(prev);
            if (dataStr !== prevStr) {
              localStorage.setItem('psychologists_db', dataStr);
              sessionStorage.setItem('last_saved_licencias', dataStr);
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

  useEffect(() => {
    if (isLicenciasSynced && Object.keys(psychologists).length > 0) {
      const dataStr = JSON.stringify(psychologists);
      const lastSavedLic = sessionStorage.getItem('last_saved_licencias');
      if (lastSavedLic !== dataStr) {
        localStorage.setItem('psychologists_db', dataStr);
        savePsychologistsRemote(psychologists);
        sessionStorage.setItem('last_saved_licencias', dataStr);
      }
    }
  }, [psychologists, isLicenciasSynced]);

  const [clinicalDatabase, setClinicalDatabase] = useState<Record<string, ClinicalCase>>(() => {
    const savedUser = localStorage.getItem('current_logged_psychologist');
    let userKey = 'clinical_cases_db';
    if (savedUser) { try { const u = JSON.parse(savedUser); if (u?.username) userKey = `clinical_cases_db_${u.username}`; } catch (e) {} }
    const saved = localStorage.getItem(userKey);
    if (saved) { try { return JSON.parse(saved); } catch (e) { } }
    return {};
  });

  const [currentUser, setCurrentUser] = useState<any | null>(() => {
    const saved = localStorage.getItem('current_logged_psychologist');
    if (saved) { try { return JSON.parse(saved); } catch (e) { } }
    return null;
  });

  const getProfPrefix = (profType?: string) => profType === 'PSIQUIATRA' ? t('Médico Psiquiatra') : t('Psicólogo(a) Clínico');

  // ============================================================================
  // TRY/CATCH DE SEGURIDAD AÑADIDO AQUI PARA APPOINTMENTS
  // ============================================================================
  const [appointments, setAppointments] = useState<Appointment[]>(() => {
    const savedUser = localStorage.getItem('current_logged_psychologist');
    let userKey = 'appointments_db';
    if (savedUser) { 
      try { 
        const u = JSON.parse(savedUser); 
        if (u?.username) userKey = `appointments_db_${u.username}`; 
      } catch (e) {} 
    }
    const saved = localStorage.getItem(userKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (error) {
        return [];
      }
    }
    return [];
  });

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passForm, setPassForm] = useState({ oldPass: '', newPass: '', confirmPass: '' });
  const [passMessage, setPassMessage] = useState({ text: '', type: '' });

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

  const [editProfileName, setEditProfileName] = useState('');
  const [editProfessionType, setEditProfessionType] = useState('PSICOLOGO');
  const [editSpecialty, setEditSpecialty] = useState('');
  const [editReview, setEditReview] = useState('');

  const [showRecipeModal, setShowRecipeModal] = useState(false);
  const [recipeData, setRecipeData] = useState({ diagnostico: '', medicamentos: '', indicaciones: '' });
  const [sessionAreas, setSessionAreas] = useState({ sleep: 5, appetite: 5, energy: 5, social: 5, concentration: 5 });

  useEffect(() => {
    if (currentUser) {
      setEditProfileName(currentUser.fullName || '');
      setEditProfessionType(currentUser.professionType || 'PSICOLOGO');
      setEditSpecialty(currentUser.specialty || '');
      setEditReview(currentUser.professionalReview || '');
    }
  }, [currentUser]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !editProfileName.trim()) return;
    const updatedUser = { 
      ...currentUser, fullName: editProfileName.trim(), professionType: editProfessionType, specialty: editSpecialty.trim(), professionalReview: editReview.trim()
    };
    const updatedDb = { ...psychologists, [currentUser.username]: updatedUser };
    setPsychologists(updatedDb); setCurrentUser(updatedUser);
    localStorage.setItem('psychologists_db', JSON.stringify(updatedDb));
    localStorage.setItem('current_logged_psychologist', JSON.stringify(updatedUser));
    try { await savePsychologistsRemote(updatedDb); alert('¡Perfil actualizado con éxito!'); } catch (error) {}
  };

  const [emergencyAlerts, setEmergencyAlerts] = useState<any[]>([]);
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

  const handleViewEmergency = async (patientId: string) => {
    let foundCase = clinicalDatabase[patientId];
    if (!foundCase && currentUser) {
      const remoteCases = await loadClinicalCasesRemote(currentUser.username);
      if (remoteCases && remoteCases[patientId]) { foundCase = remoteCases[patientId]; setClinicalDatabase(prev => ({ ...prev, [patientId]: foundCase })); }
    }
    if (foundCase && foundCase.doctorUsername === currentUser?.username) {
      setActiveCase({ ...foundCase, sessions: foundCase.sessions || [], generalData: foundCase.generalData || {} as any });
      setActiveCaseTab('HISTORIAL'); setSearchFeedback(`Expediente ${patientId} cargado.`); window.scrollTo({ top: 0, behavior: 'smooth' });
    } else { setSearchFeedback(`Acceso denegado o no encontrado.`); }
  };

  useEffect(() => {
    if (currentUser) localStorage.setItem(`appointments_db_${currentUser.username}`, JSON.stringify(appointments));
  }, [appointments, currentUser]);

  useEffect(() => {
    async function sincronizarExpedientesRemotos() {
      if (currentUser) {
        const keyLocal = `clinical_cases_db_${currentUser.username}`;
        let baseLocal: Record<string, ClinicalCase> = {};
        const savedLocal = localStorage.getItem(keyLocal);
        if (savedLocal) { try { baseLocal = JSON.parse(savedLocal); } catch (e) { } }
        const expedientesRemotos = await loadClinicalCasesRemote(currentUser.username);
        let baseRemota = expedientesRemotos && typeof expedientesRemotos === 'object' ? expedientesRemotos : {};
        setClinicalDatabase(prev => {
          const dbFusionada = { ...prev, ...baseLocal, ...baseRemota };
          localStorage.setItem(keyLocal, JSON.stringify(dbFusionada));
          return dbFusionada;
        });
      }
    }
    sincronizarExpedientesRemotos();
  }, [currentUser]);

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

  useEffect(() => { localStorage.setItem('adminPassword', adminPassword); }, [adminPassword]);

  useEffect(() => {
    if (currentUser) localStorage.setItem('current_logged_psychologist', JSON.stringify(currentUser));
    else localStorage.removeItem('current_logged_psychologist');
  }, [currentUser]);

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

  const [showCertificateModal, setShowCertificateModal] = useState(false);
  const [certificateType, setCertificateType] = useState<'ATTENDANCE' | 'REFERRAL'>('ATTENDANCE');
  const [certificateText, setCertificateText] = useState('');
  const [isDictatingVoice, setIsDictatingVoice] = useState(false);
  const [voiceInputText, setVoiceInputText] = useState('');

  const [isRecordingLive, setIsRecordingLive] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regColegiado, setRegColegiado] = useState('');
  const [regLicenseType, setRegLicenseType] = useState<'ESTANDAR' | 'PREMIUM' | 'DEMO'>('ESTANDAR');
  const [regCountry, setRegCountry] = useState('GT'); 
  const [regVoice, setRegVoice] = useState(false); 

  const [editingUsername, setEditingUsername] = useState<string | null>(null);
  const [editPasswordInput, setEditPasswordInput] = useState('');
  const [editingExpiryUsername, setEditingExpiryUsername] = useState<string | null>(null);
  const [editExpiryInput, setEditExpiryInput] = useState('');

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [verificationPassword, setVerificationPassword] = useState('');
  const [verificationError, setVerificationError] = useState('');

  const [newPatientData, setNewPatientForm] = useState({ id: '', patientName: '', sexo: 'Femenino', edad: '', estudios: '', origenProcedencia: '', ocupacion: '', estadoCivil: 'Soltero(a)', religion: '', datosProgenitores: '', motivoConsultaTextual: '', antecedentes: '', perfilSocial: '', personalidad: '', historiaFamiliar: '', telefono: '', fotoUrl: '', rawNotes: '', baiScore: 'Pendiente', bdiScore: 'Pendiente', traumaScale: 'Pendiente' });
  const [newSessionData, setNewSessionData] = useState<SessionRecord>({ sessionNumber: 1, date: new Date().toISOString().split('T')[0], rawNotes: '', baiScore: 'Pendiente', bdiScore: 'Pendiente', traumaScale: 'Pendiente', audioPath: '', transcriptionPath: '', dsm5EvaluationName: '', dsm5EvaluationResult: '', externalDocuments: [], videoUrl: '' });

  const [isProcessingNotes, setIsProcessingNotes] = useState(false);
  const [notesResult, setNotesResult] = useState<string>(() => localStorage.getItem('last_notes_result') || '');

  useEffect(() => { localStorage.setItem('last_notes_result', notesResult); }, [notesResult]);

  const [scientificQuery, setScientificQuery] = useState<ScientificQuery>({ queryText: '', responseText: '', loading: false });
  const [selectedDsmTemplate, setSelectedDsmTemplate] = useState<Dsm5EvaluationTemplate | null>(null);
  const [dsmAnswers, setDsmAnswers] = useState<Record<string, string>>({});
  const [showDsmModal, setShowDsmModal] = useState(false);

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
      username: userClean, 
      passwordHash: passClean, 
      fullName: regFullName.trim(), 
      colegiado: regColegiado.trim(), 
      licenseType: regLicenseType as any, 
      licenseExpiry: expiry.toISOString().split('T')[0], 
      isActive: true, 
      professionType: 'PSICOLOGO', 
      specialty: '', 
      professionalReview: '', 
      countryCode: regCountry, 
      hasVoiceModule: regVoice 
    };
    const updatedDb = { ...psychologists, [newPsychologist.username]: newPsychologist };
    setPsychologists(updatedDb); localStorage.setItem('psychologists_db', JSON.stringify(updatedDb));
    try { await savePsychologistsRemote(updatedDb); alert(`Licencia activada para: ${newPsychologist.fullName}`); setRegUsername(''); setRegPassword(''); setRegFullName(''); setRegColegiado(''); setRegVoice(false); } catch (error) { alert("Error al sincronizar."); }
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

  const handleToggleUserActive = async (username: string) => {
    const updatedDb = { ...psychologists, [username]: { ...psychologists[username], isActive: !psychologists[username].isActive } };
    setPsychologists(updatedDb); localStorage.setItem('psychologists_db', JSON.stringify(updatedDb)); await savePsychologistsRemote(updatedDb);
  };

  const handleToggleVoiceModule = async (username: string) => {
    const updatedDb = { ...psychologists, [username]: { ...psychologists[username], hasVoiceModule: !psychologists[username].hasVoiceModule } };
    setPsychologists(updatedDb); localStorage.setItem('psychologists_db', JSON.stringify(updatedDb)); await savePsychologistsRemote(updatedDb);
  };

  const handleClinicalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    const searchTerm = clinicalSearchQuery.toLowerCase().trim();
    const foundCase = Object.values(clinicalDatabase).find(c => {
      if (!c || c.doctorUsername !== currentUser.username) return false;
      return c.id?.toLowerCase() === searchTerm || c.patientName?.toLowerCase().includes(searchTerm) || (c.generalData?.telefono && c.generalData.telefono.toLowerCase().includes(searchTerm));
    });
    if (foundCase) {
      setActiveCase({ ...foundCase, sessions: foundCase.sessions || [], generalData: foundCase.generalData || {} as any });
      setActiveCaseTab('HISTORIAL'); setSearchFeedback(`Expediente ${foundCase.id} cargado.`); setNotesResult(foundCase.structuredOutput || '');
    } else { setSearchFeedback(`No encontrado.`); setActiveCase(null); }
  };

  const handleRegisterPatient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newPatientData.id.trim() || !newPatientData.patientName.trim()) return;
    const formattedId = newPatientData.id.toUpperCase().trim();
    const newCase: ClinicalCase = {
      id: formattedId, patientName: newPatientData.patientName.trim(), doctorUsername: currentUser.username, 
      generalData: { ...newPatientData },
      sessions: [{ sessionNumber: 1, date: new Date().toISOString().split('T')[0], rawNotes: newPatientData.rawNotes || newPatientData.motivoConsultaTextual || 'Evaluación inicial.', baiScore: 'Pendiente', bdiScore: 'Pendiente', traumaScale: 'Pendiente', audioPath: '', transcriptionPath: '', externalDocuments: [], functionalAreas: { sleep: 5, appetite: 5, energy: 5, social: 5, concentration: 5 } } as any]
    };
    setClinicalDatabase(prev => ({ ...prev, [formattedId]: newCase })); setActiveCase(newCase); setActiveCaseTab('HISTORIAL'); setShowRegisterForm(false);
  };

  const handleCreateAppointment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedPatientId || !selectedDate) return;
    const patientName = clinicalDatabase[selectedPatientId] ? clinicalDatabase[selectedPatientId].patientName : 'Desconocido';
    const startIso = `${selectedDate}T${startTime}:00`;
    const endIso = new Date(new Date(startIso).getTime() + durationMinutes * 60000).toISOString().substring(0, 19);
    setAppointments(prev => [...prev, { id: `APP-${Date.now()}`, patientId: selectedPatientId, patientName, doctorUsername: currentUser.username, title: `Consulta: ${patientName}`, start: startIso, end: endIso, status: 'SCHEDULED' }]);
    setShowCalendarModal(false); setSelectedPatientId(''); alert(`Cita agendada para ${patientName}`);
  };

  const handleSyncToGoogleCalendar = (app: Appointment) => {
    try {
      const gCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(app.title)}&dates=${app.start.replace(/-|:|\.\d\d\d/g, "")}/${app.end.replace(/-|:|\.\d\d\d/g, "")}&details=${encodeURIComponent(`ID Expediente: ${app.patientId}`)}&location=Clinica`;
      window.open(gCalUrl, '_blank');
    } catch (e) { alert("Error al conectar."); }
  };

  const toggleRecording = async () => {
    if (isRecordingLive) {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      setIsRecordingLive(false);
    } else {
      try {
        audioChunksRef.current = [];
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          const audioUrl = URL.createObjectURL(audioBlob); 
          setNewSessionData(prev => ({ ...prev, audioPath: audioUrl }));
          alert("¡Audio grabado con éxito!");
        };

        mediaRecorder.start();
        setIsRecordingLive(true);
      } catch (error) {
        console.error("Error al acceder al micrófono:", error);
        alert("Permiso de micrófono denegado. Por favor, habilítelo en su navegador.");
      }
    }
  };

  const handleAiDictationAssist = async () => {
    if (!voiceInputText.trim() || !currentUser) return;
    setIsDictatingVoice(true);
    try {
      const refinedNotes = await processVoiceNotesToEvolution(voiceInputText, currentUser.fullName, currentUser.colegiado);
      setNewSessionData(prev => ({ ...prev, rawNotes: refinedNotes })); setVoiceInputText('');
    } catch (e: any) { alert("Error detallado: " + e.message); console.error(e); } finally { setIsDictatingVoice(false); }
  };

  const handleOpenCertificateModal = (type: 'ATTENDANCE' | 'REFERRAL') => {
    if (!activeCase || !currentUser) return;
    setCertificateType(type);
    const todayStr = new Date().toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' });
    const profTitle = getProfPrefix(currentUser.professionType);
    setCertificateText(`${t('A QUIEN INTERESE:')}\n\n${t('Por medio de la presente se hace constar que el/la paciente')} ${activeCase.patientName}, ${t('expediente')} ${activeCase.id}, ${t('ha asistido a su proceso clínico.')}\n\n${t('Guatemala,')} ${todayStr}.\n\n${t('Atentamente,')}\n${profTitle} ${currentUser.fullName}\n${t('Colegiado')}: ${currentUser.colegiado}`);
    setShowCertificateModal(true);
  };

  const handleAddNewSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCase || !currentUser) return;
    const numSesion = activeCase.sessions.length + 1;
    const updatedSessions = [...activeCase.sessions, { 
      ...newSessionData, sessionNumber: numSesion, 
      functionalAreas: sessionAreas 
    } as any];
    const updatedCase = { ...activeCase, sessions: updatedSessions };
    setActiveCase(updatedCase); setClinicalDatabase(prev => ({ ...prev, [activeCase.id]: updatedCase }));
    setShowNewSessionForm(false);
    setNewSessionData({ sessionNumber: 1, date: new Date().toISOString().split('T')[0], rawNotes: '', baiScore: 'Pendiente', bdiScore: 'Pendiente', traumaScale: 'Pendiente', audioPath: '', transcriptionPath: '', dsm5EvaluationName: '', dsm5EvaluationResult: '', externalDocuments: [], videoUrl: '' });
    setSessionAreas({ sleep: 5, appetite: 5, energy: 5, social: 5, concentration: 5 });
  };

  const handleProcessNotes = async () => {
    if (!activeCase || activeCase.sessions.length === 0) return;
    setIsProcessingNotes(true);
    try {
      const gd = activeCase.generalData || {}; const lastSession = activeCase.sessions[activeCase.sessions.length - 1];
      let fullNotesPayload = `=== HISTORIAL ===\nPaciente: ${activeCase.patientName}\n`;
      activeCase.sessions.forEach((s) => { fullNotesPayload += `Sesión ${s.sessionNumber}: ${s.rawNotes}\n`; });
      const result = await processClinicalNotes(fullNotesPayload, lastSession.baiScore || 'Pendiente', lastSession.bdiScore || 'Pendiente', currentUser?.fullName || 'Profesional', currentUser?.colegiado || 'N/A');
      const updatedCase = { ...activeCase, structuredOutput: result };
      setActiveCase(updatedCase); setClinicalDatabase(prev => ({ ...prev, [activeCase.id]: updatedCase })); setNotesResult(result);
    } catch (e: any) { alert("Error detallado: " + e.message); console.error(e); } finally { setIsProcessingNotes(false); }
  };

  const handleScientificQuery = async () => {
    if (!scientificQuery.queryText.trim()) return;
    setScientificQuery(prev => ({ ...prev, loading: true }));
    try {
      const res = await queryScientificDatabase(scientificQuery.queryText);
      setScientificQuery(prev => ({ ...prev, responseText: res }));
    } catch (e: any) { alert("Error detallado: " + e.message); console.error(e); } finally { setScientificQuery(prev => ({ ...prev, loading: false })); }
  };

  const handleSaveDsmEvaluation = () => {
    if (!activeCase || !selectedDsmTemplate || !currentUser) return;
    if (verificationPassword !== currentUser.passwordHash) { setVerificationError("Firma inválida."); return; }
    const profTitle = getProfPrefix(currentUser.professionType);
    
    let autoScoreStr = 'Evaluado';
    if (['PHQ9', 'GAD7', 'HAM_A', 'HAM_D', 'YBOCS', 'ISI', 'SPIN'].includes(selectedDsmTemplate.id)) {
       let numScore = 0;
       Object.values(dsmAnswers).forEach(ans => {
         const match = ans.match(/\((\d+)\)/);
         if (match) numScore += parseInt(match[1]);
       });
       autoScoreStr = `${selectedDsmTemplate.name.split(' ')[0]} (Score: ${numScore})`;
    }

    const formattedResult = `${t('EVALUACIÓN PSICOMÉTRICA INTERNACIONAL')}\n${t('Instrumento:')} ${selectedDsmTemplate.name}\n${t('Evaluador:')} ${profTitle} ${currentUser.fullName}\n\n${t('RESULTADOS Y PUNTUAJES:')}\n${Object.entries(dsmAnswers).map(([q, ans]) => `• ${q}: ${ans}`).join('\n')}\n\n-> ${t('PUNTUACIÓN AUTOMÁTICA:')} ${autoScoreStr}`;
    
    const updatedSessions = [...activeCase.sessions];
    if (updatedSessions.length > 0) {
      const lastIdx = updatedSessions.length - 1;
      updatedSessions[lastIdx] = { 
        ...updatedSessions[lastIdx], 
        dsm5EvaluationName: selectedDsmTemplate.name, 
        dsm5EvaluationResult: formattedResult, 
        baiScore: selectedDsmTemplate.id.includes('GAD') || selectedDsmTemplate.id.includes('BAI') || selectedDsmTemplate.id.includes('HAM_A') ? autoScoreStr : updatedSessions[lastIdx].baiScore, 
        bdiScore: selectedDsmTemplate.id.includes('PHQ') || selectedDsmTemplate.id.includes('BDI') || selectedDsmTemplate.id.includes('HAM_D') ? autoScoreStr : updatedSessions[lastIdx].bdiScore 
      };
    }
    const updatedCase = { ...activeCase, sessions: updatedSessions };
    setActiveCase(updatedCase); setClinicalDatabase(prev => ({ ...prev, [activeCase.id]: updatedCase }));
    setShowDsmModal(false); setSelectedDsmTemplate(null); setDsmAnswers({}); setVerificationPassword('');
    alert(`Evaluación psicométrica guardada en el expediente.`);
  };

  // ============================================================================
  // GENERADOR HTML PARA PDF CON LOS NUEVOS KPIs INTEGRADOS
  // ============================================================================
  const generateClinicalHistoryHTML = (c: ClinicalCase, targetLang: string, translatedDictamen: string): string => {
    const gd = c.generalData || {};
    let evaluacionesRealizadasHTML = '';
    c.sessions.forEach(s => { 
      if (s.dsm5EvaluationName && s.dsm5EvaluationResult) { 
        evaluacionesRealizadasHTML += `<div style="page-break-inside: avoid; margin-bottom: 15px; border: 1px solid #ccc; padding: 10px; background: #f9f9f9;"><p style="margin: 0 0 5px 0; font-weight: bold; font-size: 10pt;">${t('Prueba:', targetLang)} ${s.dsm5EvaluationName} (${s.date})</p><div style="font-size: 9pt; white-space: pre-wrap;">${s.dsm5EvaluationResult}</div></div>`; 
      } 
    });
    
    const totalSessions = c.sessions.length;
    const firstBai = extractNumericScore(c.sessions[0]?.baiScore);
    const firstBdi = extractNumericScore(c.sessions[0]?.bdiScore);
    const lastBai = extractNumericScore(c.sessions[totalSessions - 1]?.baiScore);
    const lastBdi = extractNumericScore(c.sessions[totalSessions - 1]?.bdiScore);
    const lastAreas = (c.sessions[totalSessions - 1] as any)?.functionalAreas || { sleep: 5, appetite: 5, energy: 5, social: 5, concentration: 5 };
    
    // CÁLCULOS EXACTOS REPLICADOS PARA EL PDF
    const avanceBase = Math.min(100, Math.round((totalSessions / 12) * 100));
    const promedioFuncional = (lastAreas.sleep + lastAreas.appetite + lastAreas.energy + lastAreas.social + lastAreas.concentration) / 5;
    const gafScore = Math.min(100, Math.round(promedioFuncional * 10));
    const neurovegetativoScore = Math.round(((lastAreas.sleep + lastAreas.appetite + lastAreas.energy) / 30) * 100);
    const adaptativaScore = Math.round(((lastAreas.social + lastAreas.concentration) / 20) * 100);
    
    const severidadInicial = firstBai + firstBdi;
    const severidadActual = lastBai + lastBdi;
    let reduccionSintomatica = 0;
    if (severidadInicial > 0) reduccionSintomatica = Math.max(0, Math.round(((severidadInicial - severidadActual) / severidadInicial) * 100));

    const legalNorm = t(getLegalNorm(currentUser?.countryCode || 'GT'), targetLang);
    const profTitle = getProfPrefix(currentUser?.professionType);

    const kpiHTML = `
      <div style="page-break-inside: avoid; margin-top: 20px;">
        <h2 style="font-size: 11pt; font-weight: bold; background: #eee; padding: 4px 8px; margin: 15px 0 8px 0; border-left: 4px solid #000;">${t('5. BUSINESS INTELLIGENCE CLÍNICO (KPIs)', targetLang)}</h2>
        
        <!-- NUEVA TABLA DE KPIs AVANZADOS EN EL PDF -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; page-break-inside: avoid; font-size: 9pt;">
          <tr>
            <td style="width: 25%; padding: 8px; border: 1px solid #ccc; text-align: center;">
              <div style="font-weight: bold; color: #555;">${t('GAF / EEAG', targetLang)}</div>
              <div style="font-size: 14pt; font-weight: bold; color: #3b82f6;">${gafScore}/100</div>
            </td>
            <td style="width: 25%; padding: 8px; border: 1px solid #ccc; text-align: center;">
              <div style="font-weight: bold; color: #555;">${t('Estabilidad Neurovegetativa', targetLang)}</div>
              <div style="font-size: 14pt; font-weight: bold; color: #10b981;">${neurovegetativoScore}%</div>
            </td>
            <td style="width: 25%; padding: 8px; border: 1px solid #ccc; text-align: center;">
              <div style="font-weight: bold; color: #555;">${t('Respuesta Terapéutica (% Reducción)', targetLang)}</div>
              <div style="font-size: 14pt; font-weight: bold; color: #f59e0b;">${reduccionSintomatica}%</div>
            </td>
             <td style="width: 25%; padding: 8px; border: 1px solid #ccc; text-align: center;">
              <div style="font-weight: bold; color: #555;">${t('Funcionalidad Adaptativa', targetLang)}</div>
              <div style="font-size: 14pt; font-weight: bold; color: #3b82f6;">${adaptativaScore}%</div>
            </td>
          </tr>
        </table>

        <!-- TABLA ORIGINAL DE AVANCE Y EFICACIA -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; page-break-inside: avoid;">
          <tr>
            <td style="width: 50%; padding: 10px; border: 1px solid #ccc; vertical-align: top;">
              <div style="font-weight: bold; font-size: 10pt; margin-bottom: 5px;">${t('Termómetro de Adherencia (Avance)', targetLang)}</div>
              <div style="font-size: 18pt; font-weight: bold; color: #333;">${avanceBase}%</div>
              <div style="font-size: 8pt; color: #666;">${t('Hacia el protocolo base de alta clínica (12 sesiones).', targetLang)}</div>
            </td>
            <td style="width: 50%; padding: 10px; border: 1px solid #ccc; vertical-align: top;">
              <div style="font-weight: bold; font-size: 10pt; margin-bottom: 5px;">${t('Eficacia (Sesión 1 vs Actual)', targetLang)}</div>
              <div style="font-size: 10pt; color: #333;">${t('Ansiedad', targetLang)} (S1): <b>${firstBai}</b> → ${t('Actual:', targetLang)} <b>${lastBai}</b></div>
              <div style="font-size: 10pt; color: #333;">${t('Depresión', targetLang)} (S1): <b>${firstBdi}</b> → ${t('Actual:', targetLang)} <b>${lastBdi}</b></div>
            </td>
          </tr>
        </table>

        <div style="text-align: center; margin: 20px 0; page-break-inside: avoid;">
          <div style="font-weight: bold; font-size: 10pt; margin-bottom: 10px;">${t('Rueda Multiaxial de Vida (Última Evaluación)', targetLang)}</div>
          <div style="margin: 0 auto; text-align: center;">
            ${generateSpiderChartSVG(lastAreas, t, targetLang)}
          </div>
        </div>
      </div>
    `;

    return `<div style="font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #000; background-color: #fff; width: 750px; max-width: 100%; margin: 0 auto;">
      <div style="border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 15px; text-align: center; page-break-inside: avoid;">
        <h1 style="font-size: 15pt; font-weight: bold; margin: 0; text-transform: uppercase;">${t('EXPEDIENTE CLÍNICO PSICOLÓGICO Y MÉDICO', targetLang)}</h1>
        <p style="font-size: 9pt; margin: 3px 0 0 0; color: #333;">${t('Protocolo de Gestión de Salud', targetLang)} | ${legalNorm}</p>
      </div>
      ${gd.fotoUrl ? `<div style="text-align: center; margin-bottom: 15px; page-break-inside: avoid;"><img src="${gd.fotoUrl}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid #000;" /></div>` : ''}
      <div style="page-break-inside: avoid;">
        <h2 style="font-size: 11pt; font-weight: bold; background: #eee; padding: 4px 8px; margin: 15px 0 8px 0; border-left: 4px solid #000;">${t('1. FICHA DE IDENTIFICACIÓN', targetLang)}</h2>
        <table style="width: 100%; font-size: 10pt; border-collapse: collapse; margin-bottom: 10px;">
          <tr><td style="padding: 3px 0; width: 50%;"><strong>${t('Nombre:', targetLang)}</strong> ${c.patientName}</td><td style="padding: 3px 0; width: 50%;"><strong>${t('Expediente ID:', targetLang)}</strong> ${c.id}</td></tr>
          <tr><td style="padding: 3px 0;"><strong>${t('Teléfono:', targetLang)}</strong> ${gd.telefono || t('N/R', targetLang)}</td><td style="padding: 3px 0;"><strong>${t('Sexo:', targetLang)}</strong> ${gd.sexo ? t(gd.sexo, targetLang) : t('N/R', targetLang)} | <strong>${t('Edad:', targetLang)}</strong> ${gd.edad || t('N/R', targetLang)}</td></tr>
          <tr><td style="padding: 3px 0;"><strong>${t('Ocupación:', targetLang)}</strong> ${gd.ocupacion || t('N/R', targetLang)}</td><td style="padding: 3px 0;"><strong>${t('Estado Civil:', targetLang)}</strong> ${gd.estadoCivil ? t(gd.estadoCivil, targetLang) : t('N/R', targetLang)}</td></tr>
          <tr><td style="padding: 3px 0;" colspan="2"><strong>${t('Origen / Procedencia:', targetLang)}</strong> ${gd.origenProcedencia || t('N/R', targetLang)} | <strong>${t('Religión:', targetLang)}</strong> ${gd.religion || t('N/R', targetLang)}</td></tr>
          <tr><td style="padding: 3px 0;" colspan="2"><strong>${t('Datos de Progenitores:', targetLang)}</strong> ${gd.datosProgenitores || t('N/R', targetLang)}</td></tr>
        </table>
      </div>
      <div>
        <h2 style="font-size: 11pt; font-weight: bold; background: #eee; padding: 4px 8px; margin: 15px 0 8px 0; border-left: 4px solid #000; page-break-inside: avoid;">${t('3. Anamnesis y Motivo de Consulta', targetLang)}</h2>
        <p style="font-size: 10pt; text-align: justify; margin: 0 0 8px 0;"><strong>${t('Motivo Textual:', targetLang)}</strong> "${gd.motivoConsultaTextual || t('N/R', targetLang)}"</p>
        <p style="font-size: 10pt; text-align: justify; margin: 0 0 8px 0;"><strong>${t('Antecedentes Clínicos:', targetLang)}</strong> ${gd.antecedentes || t('Sin antecedentes.', targetLang)}</p>
      </div>
      <div>
        <h2 style="font-size: 11pt; font-weight: bold; background: #eee; padding: 4px 8px; margin: 15px 0 8px 0; border-left: 4px solid #000; page-break-inside: avoid;">${t('3. BATERÍAS Y EVALUACIONES PSICOMÉTRICAS REALIZADAS', targetLang)}</h2>
        ${evaluacionesRealizadasHTML || `<p style="font-size: 10pt; font-style: italic;">${t('No se han aplicado baterías psicométricas formales aún.', targetLang)}</p>`}
      </div>
      <div>
        <h2 style="font-size: 11pt; font-weight: bold; background: #eee; padding: 4px 8px; margin: 15px 0 8px 0; border-left: 4px solid #000; page-break-inside: avoid;">${t('4. DICTAMEN E IMPRESIÓN DIAGNÓSTICA (IA)', targetLang)}</h2>
        <div style="font-size: 10pt; text-align: justify; margin: 0 0 10px 0;">${translatedDictamen ? translatedDictamen.replace(/\n/g, '<br/>') : t('En proceso de evaluación clínica acumulada.', targetLang)}</div>
      </div>
      ${kpiHTML}
      <div style="margin-top: 40px; text-align: center; page-break-inside: avoid;">
        <div style="border-top: 1px solid #000; width: 250px; margin: 0 auto 5px auto;"></div>
        <p style="font-size: 10pt; margin: 0; font-weight: bold;">${profTitle} ${currentUser?.fullName || 'Profesional'}</p>
        <p style="font-size: 9pt; margin: 2px 0;">${t('Especialidad:', targetLang)} ${currentUser?.specialty || t('N/A', targetLang)}</p>
        <p style="font-size: 9pt; margin: 2px 0;">${t('Colegiado Activo:', targetLang)} ${currentUser?.colegiado || t('N/A', targetLang)}</p>
      </div>
    </div>`;
  };

  const handleDownloadPDF = async () => {
    if (!activeCase) return;
    setIsGeneratingPdf(true);
    
    try {
      let reportText = activeCase.structuredOutput || '';
      let translatedReport = reportText;

      if (pdfLang !== 'ES' && reportText) {
         const langNames = { EN: 'Inglés (English)', PT: 'Portugués (Português)', IT: 'Italiano (Italian)', FR: 'Francés (Français)' };
         const prompt = `Actúa como un traductor médico profesional. Traduce el siguiente dictamen clínico al ${langNames[pdfLang as keyof typeof langNames]}. Mantén el formato, viñetas y tono clínico profesional exactamente igual. Solo devuelve la traducción:\n\n${reportText}`;
         translatedReport = await queryScientificDatabase(prompt);
      }

      const printContainer = document.createElement('div');
      printContainer.innerHTML = generateClinicalHistoryHTML(activeCase, pdfLang, translatedReport);
      
      if (typeof (window as any).html2pdf !== 'undefined') {
        const opt = { 
          margin: 0.5,
          filename: `Expediente_Oficial_${activeCase.id}.pdf`, 
          image: { type: 'jpeg', quality: 0.98 }, 
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', letterRendering: true }, 
          jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] }
        };
        (window as any).html2pdf().set(opt).from(printContainer).save();
      } else {
        const printWindow = window.open('', '_blank');
        if (printWindow) { printWindow.document.write(`<html><head><title>PDF</title></head><body>${printContainer.innerHTML}</body></html>`); printWindow.document.close(); printWindow.print(); }
      }
    } catch (error) {
      alert("Error al generar o traducir el PDF.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleExportBackup = () => {
    if (!currentUser) return;
    const myCases = Object.values(clinicalDatabase).filter(c => c.doctorUsername === currentUser.username);
    const respaldoMaestro = { fecha_respaldo: new Date().toISOString(), psicologo: currentUser.fullName, colegiado: currentUser.colegiado, expedientes_clinicos: myCases };
    const blob = new Blob([JSON.stringify(respaldoMaestro, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `Respaldo_${currentUser.username}.json`; document.body.appendChild(link); link.click(); document.body.removeChild(link);
  };

  const myPatients = currentUser ? Object.values(clinicalDatabase).filter(c => c.doctorUsername === currentUser.username) : [];
  const myAppointments = currentUser ? appointments.filter(a => a.doctorUsername === currentUser.username && a.status !== 'CANCELLED') : [];

  return (
    <div className={`min-h-screen flex flex-col ${th.bg} ${th.text} overflow-x-hidden transition-colors duration-300`}>
      <header className={`border-b ${th.border} ${th.headerBg} backdrop-blur sticky top-0 z-50 px-6 py-4 transition-colors duration-300`}>
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white text-xl shrink-0">Ψ</div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold tracking-tight truncate">{t('Asistente Clínica SaaS')}</h1>
              <p className={`text-xs ${th.textMuted} truncate`}>{t('Sistema Clínico e Historiales (Multi-tenant)')}</p>
            </div>
          </div>
          <div className={`flex flex-wrap justify-center items-center gap-2 ${th.card} p-1 rounded-xl border ${th.border} w-full sm:w-auto`}>
            <select 
              value={lang} 
              onChange={(e) => setLang(e.target.value as any)} 
              className="bg-indigo-600 text-white text-xs font-bold px-3 py-2 rounded-lg outline-none cursor-pointer shadow hover:bg-indigo-500"
            >
              <option value="ES">🌐 ES (Español)</option>
              <option value="EN">🌐 EN (English)</option>
              <option value="PT">🌐 PT (Português)</option>
              <option value="IT">🌐 IT (Italiano)</option>
              <option value="FR">🌐 FR (Français)</option>
            </select>
            <button onClick={toggleTheme} className={`px-3 py-2 rounded-lg text-xs font-bold transition-all border ${th.border} ${isDarkMode ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-800'}`}>
              {isDarkMode ? '☀️' : '🌙'}
            </button>
            <div className="w-px h-6 bg-slate-500/30 mx-1"></div>
            <button onClick={() => setMode(AppMode.CLINICAL)} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none ${mode === AppMode.CLINICAL ? 'bg-indigo-600 text-white shadow' : `${th.textMuted} hover:${th.text}`}`}>🩺 {t('Clínico')}</button>
            <button onClick={() => setMode(AppMode.CALENDAR)} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all flex-1 sm:flex-none ${mode === AppMode.CALENDAR ? 'bg-indigo-600 text-white shadow' : `${th.textMuted} hover:${th.text}`}`}>📅 {t('Agenda')}</button>
            <button onClick={() => setMode(AppMode.ADMIN)} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all w-full sm:w-auto ${mode === AppMode.ADMIN ? 'bg-amber-600 text-white shadow' : `${th.textMuted} hover:${th.text}`}`}>⚙️ {t('Admin')}</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col">
        {mode === AppMode.ADMIN && (
          <div className="max-w-4xl mx-auto space-y-8 w-full">
            {!isAdminAuthenticated ? (
              <div className={`${th.card} border ${th.border} rounded-2xl p-6 space-y-4 shadow-xl max-w-md mx-auto`}>
                <h2 className={`text-sm font-semibold ${th.text} text-center uppercase tracking-wider`}>{t('Consola Maestra de Licencias')}</h2>
                <form onSubmit={handleAdminAuth} className="space-y-3">
                  <input type="password" value={adminInput} onChange={(e) => setAdminInput(e.target.value)} placeholder={t('Clave de Administrador')} className={`w-full p-2.5 ${th.input} border ${th.border} rounded-xl text-sm ${th.text} focus:outline-none`} />
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
                        <div>
                          <label className={`text-[9px] font-bold ${th.textMuted} uppercase`}>{t('País / Región')}</label>
                          <select value={regCountry} onChange={(e) => setRegCountry(e.target.value)} className={`w-full p-2 ${th.input} border ${th.border} rounded text-xs ${th.text} mt-1`}>
                            <option value="US">Estados Unidos (USD)</option>
                            <option value="ES">España (EUR)</option>
                            <option value="GB">Reino Unido (GBP)</option>
                            <option value="FR">Francia (EUR)</option>
                            <option value="DE">Alemania (EUR)</option>
                            <option value="IT">Italia (EUR)</option>
                            <option value="GT">Guatemala (GTQ)</option>
                            <option value="MX">México (USD)</option>
                            <option value="CO">Colombia (USD)</option>
                            <option value="CL">Chile (USD)</option>
                            <option value="PE">Perú (USD)</option>
                            <option value="SV">El Salvador (USD)</option>
                            <option value="AR">Argentina (USD)</option>
                            <option value="BR">Brasil (USD)</option>
                            <option value="CR">Costa Rica (USD)</option>
                            <option value="HN">Honduras (USD)</option>
                            <option value="NI">Nicaragua (USD)</option>
                            <option value="PA">Panamá (USD)</option>
                            <option value="DO">República Dominicana (USD)</option>
                            <option value="EC">Ecuador (USD)</option>
                            <option value="UY">Uruguay (USD)</option>
                            <option value="BO">Bolivia (USD)</option>
                            <option value="PY">Paraguay (USD)</option>
                            <option value="VE">Venezuela (USD)</option>
                            <option value="PR">Puerto Rico (USD)</option>
                            <option value="CU">Cuba (USD)</option>
                          </select>
                        </div>
                        <div>
                          <label className={`text-[9px] font-bold ${th.textMuted} uppercase`}>{t('Plan de Licencia')}</label>
                          <select value={regLicenseType} onChange={(e) => setRegLicenseType(e.target.value as any)} className={`w-full p-2 ${th.input} border ${th.border} rounded text-xs ${th.text} mt-1`}>
                            <option value="ESTANDAR">{t('Licencia ESTÁNDAR')}</option>
                            <option value="PREMIUM">{t('Licencia PREMIUM')}</option>
                            <option value="DEMO">{t('Licencia DEMO (15 Días)')}</option>
                          </select>
                        </div>
                      </div>
                      
                      <div className="p-3 bg-indigo-900/10 border border-indigo-500/30 rounded mt-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={regVoice} onChange={(e) => setRegVoice(e.target.checked)} className="accent-indigo-500 w-4 h-4" />
                          <span className="text-xs text-indigo-500 font-bold">{t('Activar Módulo de Voz (Vapi / IA)')}</span>
                        </label>
                        <p className={`text-[9px] ${th.textMuted} mt-1`}>{t('Actívelo solo si el doctor pagó el Setup o el Bolsón de Minutos.')}</p>
                      </div>

                      <button type="submit" className="w-full py-2 bg-amber-600 text-white font-semibold rounded text-xs">{t('Activar Licencia')}</button>
                    </form>
                  </div>

                  <div className={`${th.card} border ${th.border} rounded-2xl p-6 space-y-6 lg:col-span-7`}>
                    <div className="space-y-3">
                      <h3 className={`text-sm font-bold ${th.text} uppercase border-b ${th.border} pb-2`}>{t('Auditoría y Soporte')}</h3>
                      <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                        {Object.values(psychologists).filter(p => p && p.username).map((p) => {
                          const remaining = getDaysRemaining(p.licenseExpiry);
                          const isExpired = remaining < 0;
                          return (
                            <div key={p.username} className={`p-3 ${th.input} rounded-xl border ${th.border} text-xs flex flex-col gap-2`}>
                              <div className="flex justify-between items-start gap-2">
                                <div className="min-w-0 flex-1">
                                  <span className={`font-bold ${th.text} block truncate flex items-center gap-1`}>
                                    {getProfPrefix(p.professionType)} {p.fullName} 
                                    <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 rounded text-[9px] ml-2 text-slate-800 dark:text-white">{t('País')}: {p.countryCode || 'GT'}</span>
                                  </span>
                                  <span className={`text-[10px] ${th.textMuted} block font-mono mt-0.5`}>User: {p.username} | {t('Plan')}: {p.licenseType}</span>
                                  <span className={`text-[10px] font-bold block mt-1 ${isExpired ? 'text-red-500' : 'text-emerald-500'}`}>
                                    {t('Vence')}: {p.licenseExpiry} ({isExpired ? t('Vencida') : `${remaining} ${t('días restantes')}`})
                                  </span>
                                </div>
                                <div className="flex flex-col gap-1 shrink-0 items-end">
                                  <div className="flex gap-1 justify-end">
                                    <button onClick={() => { setEditingExpiryUsername(editingExpiryUsername === p.username ? null : p.username); setEditExpiryInput(p.licenseExpiry); setEditingUsername(null); }} className="px-2 py-1 rounded text-[10px] bg-slate-300 dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow" title="Renovar/Cambiar Fecha">📅</button>
                                    <button onClick={() => { setEditingUsername(editingUsername === p.username ? null : p.username); setEditPasswordInput(''); setEditingExpiryUsername(null); }} className="px-2 py-1 rounded text-[10px] bg-slate-300 dark:bg-slate-800 text-slate-800 dark:text-slate-200 shadow" title="Cambiar Clave">🔑</button>
                                  </div>
                                  <div className="flex gap-1 mt-1 w-full">
                                    <button onClick={() => handleToggleUserActive(p.username)} className={`px-2 py-1 rounded text-[9px] font-bold uppercase flex-1 text-center ${p.isActive ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-600/20 dark:text-emerald-400' : 'bg-red-100 text-red-600 dark:bg-red-600/20 dark:text-red-400'}`}>{p.isActive ? t('Activo') : t('Inactivo')}</button>
                                    <button onClick={() => handleToggleVoiceModule(p.username)} className={`px-2 py-1 rounded text-[9px] font-bold uppercase flex-1 text-center transition-colors ${p.hasVoiceModule ? 'bg-indigo-600 text-white' : 'bg-slate-300 text-slate-600 dark:bg-slate-700 dark:text-slate-400'}`} title="Activar/Desactivar Micrófono e IA de Voz">🎙️ Voz {p.hasVoiceModule ? 'ON' : 'OFF'}</button>
                                  </div>
                                </div>
                              </div>
                              
                              {editingUsername === p.username && (
                                <div className={`mt-1 pt-2 border-t ${th.border} flex gap-2`}>
                                  <input type="text" value={editPasswordInput} onChange={(e) => setEditPasswordInput(e.target.value)} placeholder={t('Nueva clave...')} className={`flex-1 p-1.5 ${th.card} border ${th.border} rounded text-[11px] ${th.text} min-w-0`} />
                                  <button onClick={() => handleUpdateUserPasswordAdmin(p.username)} className="px-3 py-1.5 bg-amber-600 text-white font-bold rounded text-[10px] shrink-0">{t('Guardar')}</button>
                                </div>
                              )}

                              {editingExpiryUsername === p.username && (
                                <div className={`mt-1 pt-2 border-t ${th.border} flex gap-2 items-center`}>
                                  <span className={`text-[9px] ${th.textMuted}`}>{t('Fecha')}:</span>
                                  <input type="date" value={editExpiryInput} onChange={(e) => setEditExpiryInput(e.target.value)} className={`flex-1 p-1.5 ${th.card} border ${th.border} rounded text-[11px] ${th.text} min-w-0`} />
                                  <button onClick={() => handleUpdateUserExpiryAdmin(p.username)} className="px-3 py-1.5 bg-emerald-600 text-white font-bold rounded text-[10px] shrink-0">{t('Renovar')}</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {mode === AppMode.CALENDAR && (
          <div className="space-y-6">
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
                      <button onClick={() => handleSyncToGoogleCalendar(app)} className="bg-emerald-600 px-2 py-1 text-white rounded text-[10px]">Google Calendar</button>
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
              <div className={`${th.card} border ${th.border} rounded-2xl p-6 space-y-4 shadow-xl max-w-md mx-auto`}>
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
                
                {/* HEADER DEL DOCTOR */}
                <div className={`bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 sm:p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4`}>
                  <div className="min-w-0">
                    <h2 className={`text-lg font-semibold ${th.text} truncate`}>🥼 {getProfPrefix(currentUser.professionType)} {currentUser.fullName}</h2>
                    <p className={`text-xs ${th.textMuted} font-mono truncate`}>{t('Colegiado')}: {currentUser.colegiado} | {t('Plan')}: <span className="font-bold text-amber-500">{currentUser.licenseType}</span></p>
                  </div>
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <button onClick={handleExportBackup} className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-400 px-3 py-1.5 rounded-xl border border-emerald-500/30">💾 {t('Respaldo JSON')}</button>
                    <button onClick={() => { setCurrentUser(null); setActiveCase(null); setNotesResult(''); }} className="text-xs bg-red-100 text-red-700 dark:bg-red-600/20 dark:text-red-400 px-3 py-1.5 rounded-xl border border-red-500/30">{t('Cerrar Sesión')}</button>
                  </div>
                </div>

                <div className={`flex flex-wrap sm:flex-nowrap gap-2 sm:gap-4 border-b ${th.border} pb-4`}>
                  <button onClick={() => { setActiveCase(null); setClinicalTab('BUSCAR'); }} className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all text-center whitespace-nowrap ${!activeCase && clinicalTab === 'BUSCAR' ? 'bg-indigo-600 text-white' : `${th.card} ${th.textMuted}`}`}>🔍 {t('Búsqueda')}</button>
                  <button onClick={() => { setActiveCase(null); setClinicalTab('ALERTAS'); }} className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all text-center flex items-center justify-center gap-2 whitespace-nowrap ${!activeCase && clinicalTab === 'ALERTAS' ? 'bg-amber-600 text-white' : `${th.card} ${th.textMuted}`}`}>🚨 {t('Alertas')} {hasPremiumAccess && emergencyAlerts.length > 0 && <span className="bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px]">{emergencyAlerts.length}</span>}</button>
                  <button onClick={() => { setActiveCase(null); setClinicalTab('PERFIL'); }} className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold transition-all text-center whitespace-nowrap ${!activeCase && clinicalTab === 'PERFIL' ? 'bg-indigo-600 text-white' : `${th.card} ${th.textMuted}`}`}>⚙️ {t('Mi Perfil')}</button>
                </div>

                {!activeCase && clinicalTab === 'PERFIL' && (
                  <div className={`${th.card} border ${th.border} rounded-2xl p-4 sm:p-6 space-y-6 w-full`}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <form onSubmit={handleUpdateProfile} className="space-y-6">
                          <div className={`${th.input} p-5 rounded-xl border ${th.border} space-y-4`}>
                            <h4 className="text-xs font-bold text-indigo-500 uppercase">✏️ {t('Datos Profesionales')}</h4>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>{t('Título')}</label>
                                <select value={editProfessionType} onChange={(e) => setEditProfessionType(e.target.value)} className={`w-full p-2 ${th.card} border ${th.border} rounded text-xs ${th.text}`}>
                                  <option value="PSICOLOGO">{t('Psicólogo(a) Clínico')}</option>
                                  <option value="PSIQUIATRA">{t('Médico Psiquiatra')}</option>
                                </select>
                              </div>
                              <div>
                                <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>{t('Nombre Completo')}</label>
                                <input type="text" required value={editProfileName} onChange={(e) => setEditProfileName(e.target.value)} className={`w-full p-2 ${th.card} border ${th.border} rounded text-xs ${th.text}`} />
                              </div>
                            </div>
                            <div>
                              <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>{t('Especialidad Clínica')}</label>
                              <input type="text" value={editSpecialty} onChange={(e) => setEditSpecialty(e.target.value)} placeholder={t('Ej: Adicciones, TLP, TCC...')} className={`w-full p-2 ${th.card} border ${th.border} rounded text-xs ${th.text}`} />
                            </div>
                            <div>
                              <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>{t('Firma para PDF')}</label>
                              <textarea rows={2} value={editReview} onChange={(e) => setEditReview(e.target.value)} placeholder={t('Enfoque terapéutico...')} className={`w-full p-2 ${th.card} border ${th.border} rounded text-xs ${th.text}`} />
                            </div>
                          </div>
                          <button type="submit" className="w-full py-2.5 bg-indigo-600 text-white font-bold rounded-xl text-xs">{t('Guardar Perfil')}</button>
                        </form>
                      </div>
                      <div className="space-y-6">
                        <div className={`${th.input} p-5 rounded-xl border ${th.border} space-y-4`}>
                          <h4 className={`text-xs font-bold ${th.textMuted} uppercase border-b ${th.border} pb-2`}>🔒 {t('Licencia')}</h4>
                          <div><label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>{t('Usuario')}</label><input type="text" disabled value={currentUser.username} className={`w-full p-2 ${th.card} border ${th.border} rounded text-xs ${th.textMuted} cursor-not-allowed font-mono opacity-60`} /></div>
                          <button onClick={() => setShowPasswordModal(true)} className={`px-5 py-2 bg-slate-300 text-slate-800 dark:bg-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold w-full mt-4`}>{t('Cambiar Contraseña')}</button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {!activeCase && clinicalTab === 'ALERTAS' && (
                  <div className="w-full">
                    {emergencyAlerts.length === 0 ? (
                      <div className={`text-center py-10 ${th.card} rounded-2xl border ${th.border}`}>
                         <span className="text-3xl block opacity-50 mb-2">✅</span><p className={`${th.textMuted} text-xs font-bold uppercase`}>{t('Bandeja Limpia')}</p>
                      </div>
                    ) : (
                      <div className="space-y-4 w-full">
                        {emergencyAlerts.map(alert => (
                          <div key={alert.id} className="bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-500/60 rounded-2xl p-4 flex flex-col md:flex-row justify-between border relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-red-500 animate-pulse"></div>
                            <div className="pl-3">
                              <h3 className="text-sm font-bold text-red-600 dark:text-red-400">🚨 {t('Llamada de Emergencia Registrada')}</h3>
                              <p className="text-xs text-red-800 dark:text-red-200">{t('Paciente:')} {alert.patientName}</p>
                              {alert.audioUrl && (
                                <div className="mt-2 flex flex-col gap-1">
                                  <span className="text-[10px] text-slate-600 dark:text-slate-300">{t('Audio de la llamada de crisis:')}</span>
                                  <audio controls src={alert.audioUrl} className="h-8 w-64"></audio>
                                </div>
                              )}
                            </div>
                            <button onClick={() => handleViewEmergency(alert.patientId)} className="mt-2 md:mt-0 px-5 py-2 bg-red-600 text-white text-xs font-bold rounded-xl h-10 self-center">{t('Analizar Expediente')}</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!activeCase && clinicalTab === 'BUSCAR' && (
                  <div className={`${th.card} border ${th.border} rounded-2xl p-4 sm:p-6 space-y-4 w-full`}>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <h3 className={`text-sm font-semibold ${th.text} uppercase font-mono`}>🔍 {t('BÚSQUEDA DE EXPEDIENTES')}</h3>
                      <button onClick={() => setShowRegisterForm(!showRegisterForm)} className="text-xs bg-indigo-100 text-indigo-700 dark:bg-indigo-600/20 dark:text-indigo-400 px-3 py-1.5 rounded-xl border border-indigo-500/30 w-full sm:w-auto text-center">
                        {showRegisterForm ? t('Ocultar Formulario') : `➕ ${t('Nuevo Expediente')}`}
                      </button>
                    </div>

                    {showRegisterForm && (
                      <form onSubmit={handleRegisterPatient} className={`${th.input} p-5 rounded-xl border ${th.border} space-y-5 shadow-inner`}>
                        <div>
                          <h4 className={`text-[10px] font-bold text-indigo-500 uppercase border-b ${th.border} pb-2 mb-3`}>{t('1. Datos Personales Básicos')}</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                            <input type="text" required placeholder={t('ID Expediente (Ej. PAC-001)')} value={newPatientData.id} onChange={(e) => setNewPatientForm(prev => ({ ...prev, id: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                            <input type="text" required placeholder={t('Nombre Completo')} value={newPatientData.patientName} onChange={(e) => setNewPatientForm(prev => ({ ...prev, patientName: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} sm:col-span-2 focus:border-indigo-500 outline-none`} />
                            <input type="text" placeholder={t('Teléfono')} value={newPatientData.telefono} onChange={(e) => setNewPatientForm(prev => ({ ...prev, telefono: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                            <input type="text" placeholder={t('Edad')} value={newPatientData.edad} onChange={(e) => setNewPatientForm(prev => ({ ...prev, edad: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                            
                            <input type="url" placeholder="URL de Foto del Paciente (Opcional)" value={newPatientData.fotoUrl} onChange={(e) => setNewPatientForm(prev => ({ ...prev, fotoUrl: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} sm:col-span-2 focus:border-indigo-500 outline-none`} />
                            
                            <select value={newPatientData.sexo} onChange={(e) => setNewPatientForm(prev => ({ ...prev, sexo: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`}>
                              <option value="Femenino">{t('Femenino')}</option>
                              <option value="Masculino">{t('Masculino')}</option>
                              <option value="Otro">{t('Otro')}</option>
                            </select>
                            <select value={newPatientData.estadoCivil} onChange={(e) => setNewPatientForm(prev => ({ ...prev, estadoCivil: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`}>
                              <option value="Soltero(a)">{t('Soltero(a)')}</option>
                              <option value="Casado(a)">{t('Casado(a)')}</option>
                              <option value="Divorciado(a)">{t('Divorciado(a)')}</option>
                              <option value="Viudo(a)">{t('Viudo(a)')}</option>
                              <option value="Unión Libre">{t('Unión Libre')}</option>
                            </select>
                            <input type="text" placeholder={t('Religión')} value={newPatientData.religion} onChange={(e) => setNewPatientForm(prev => ({ ...prev, religion: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                          </div>
                        </div>
                        <div>
                          <h4 className={`text-[10px] font-bold text-indigo-500 uppercase border-b ${th.border} pb-2 mb-3`}>{t('2. Contexto Sociodemográfico')}</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <input type="text" placeholder={t('Ocupación')} value={newPatientData.ocupacion} onChange={(e) => setNewPatientForm(prev => ({ ...prev, ocupacion: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                            <input type="text" placeholder={t('Grado de Estudios')} value={newPatientData.estudios} onChange={(e) => setNewPatientForm(prev => ({ ...prev, estudios: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                            <input type="text" placeholder={t('Lugar de Origen / Procedencia')} value={newPatientData.origenProcedencia} onChange={(e) => setNewPatientForm(prev => ({ ...prev, origenProcedencia: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                            <input type="text" placeholder={t('Datos de Progenitores (Nombres, edades, estado...)')} value={newPatientData.datosProgenitores} onChange={(e) => setNewPatientForm(prev => ({ ...prev, datosProgenitores: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} sm:col-span-3 focus:border-indigo-500 outline-none`} />
                          </div>
                        </div>
                        <div>
                          <h4 className={`text-[10px] font-bold text-indigo-500 uppercase border-b ${th.border} pb-2 mb-3`}>{t('3. Anamnesis y Motivo de Consulta')}</h4>
                          <div className="space-y-3">
                            <textarea rows={2} placeholder={t('Antecedentes Médicos / Psicológicos Previos...')} value={newPatientData.antecedentes} onChange={(e) => setNewPatientForm(prev => ({ ...prev, antecedentes: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                            <textarea required rows={3} placeholder={t('Motivo de Consulta (Describa el motivo textual por el que asiste el paciente)...')} value={newPatientData.motivoConsultaTextual} onChange={(e) => setNewPatientForm(prev => ({ ...prev, motivoConsultaTextual: e.target.value }))} className={`w-full p-2.5 ${th.card} border ${th.border} rounded-lg text-xs ${th.text} focus:border-indigo-500 outline-none`} />
                          </div>
                        </div>
                        <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 font-bold text-white rounded-xl text-xs transition-colors shadow-lg">💾 {t('Guardar Expediente Clínico Completo')}</button>
                      </form>
                    )}

                    <form onSubmit={handleClinicalSearch} className="flex flex-col sm:flex-row gap-2 w-full">
                      <input type="text" value={clinicalSearchQuery} onChange={(e) => setClinicalSearchQuery(e.target.value)} placeholder={t('Busque por nombre o ID...')} className={`flex-1 w-full p-2.5 ${th.input} border ${th.border} rounded-xl text-xs ${th.text} focus:outline-none`} />
                      <button type="submit" className="w-full sm:w-auto py-2.5 px-6 bg-indigo-600 text-white rounded-xl text-xs text-center">{t('Buscar')}</button>
                    </form>
                    {searchFeedback && <div className={`p-3 ${th.input} rounded-xl text-xs border ${th.border} text-indigo-500 font-mono`}>{searchFeedback}</div>}
                  </div>
                )}

                {activeCase && (
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8 w-full">
                    
                    <div className="xl:col-span-5 space-y-6 w-full">
                      <div className="flex justify-between items-center bg-indigo-500/10 border border-indigo-500/20 p-2 rounded-xl flex-wrap gap-2">
                        <button onClick={() => setActiveCase(null)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 font-bold px-3 py-1">← {t('Búsqueda')}</button>
                        <div className="flex flex-wrap gap-2">
                          <button onClick={() => handleOpenCertificateModal('ATTENDANCE')} className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-xl shadow">📄 {t('Constancia')}</button>
                          <button onClick={() => handleOpenCertificateModal('REFERRAL')} className="text-xs bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-1.5 rounded-xl shadow">🔁 {t('Referencia')}</button>
                          {currentUser?.professionType === 'PSIQUIATRA' && (
                            <button onClick={() => setShowRecipeModal(true)} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3 py-1.5 rounded-xl shadow">💊 {t('Extender Receta')}</button>
                          )}
                        </div>
                      </div>

                      <div className={`flex flex-col sm:flex-row gap-2 ${th.card} p-2 rounded-2xl border ${th.border} w-full`}>
                        <button onClick={() => setActiveCaseTab('HISTORIAL')} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all w-full text-center ${activeCaseTab === 'HISTORIAL' ? 'bg-indigo-600 text-white' : `${th.textMuted} hover:${th.input}`}`}>📝 {t('Historial')}</button>
                        <button onClick={() => setActiveCaseTab('ESTADISTICAS')} className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all w-full text-center ${activeCaseTab === 'ESTADISTICAS' ? 'bg-indigo-600 text-white' : `${th.textMuted} hover:${th.input}`}`}>📈 {t('KPIs Empresariales')}</button>
                      </div>

                      {activeCaseTab === 'HISTORIAL' && (
                        <div className={`${th.card} border ${th.border} rounded-2xl p-4 space-y-4 w-full`}>
                          <div className={`flex items-center gap-4 ${th.input} p-4 rounded-xl border ${th.border}`}>
                            <div className="overflow-hidden flex-1"><h4 className={`text-sm font-bold ${th.text}`}>{activeCase.patientName}</h4><p className="text-[11px] text-indigo-500 font-mono">Exp: {activeCase.id}</p></div>
                          </div>

                          <div className={`border-b ${th.border} pb-2 flex justify-between items-center`}>
                            <span className={`text-xs font-bold ${th.textMuted}`}>{t('Sesiones')}</span>
                            <button onClick={() => setShowNewSessionForm(!showNewSessionForm)} className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-xl">➕ {t('Nueva')}</button>
                          </div>

                          {showNewSessionForm && (
                            <form onSubmit={handleAddNewSession} className={`${th.input} p-4 rounded-xl border ${th.border} space-y-4 text-xs`}>
                              
                              <input type="date" value={newSessionData.date} onChange={(e) => setNewSessionData(prev => ({ ...prev, date: e.target.value }))} className={`w-full p-2 ${th.card} border ${th.border} rounded ${th.text}`} />
                              <input type="url" placeholder={t('Pegue enlace de grabación (Zoom, Meet, Drive)...')} value={newSessionData.videoUrl || ''} onChange={(e) => setNewSessionData(prev => ({ ...prev, videoUrl: e.target.value }))} className={`w-full p-2 ${th.card} border ${th.border} rounded text-indigo-500 placeholder-slate-400`} />
                              
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

                              {currentUser?.hasVoiceModule ? (
                                <div className={`${th.card} p-3 rounded-xl border ${th.border} space-y-3`}>
                                  <label className={`text-[10px] font-bold ${th.textMuted} uppercase block`}>🎙️ {t('Grabadora, Dictado IA y Audios Adjuntos')}</label>
                                  <div className="flex gap-2">
                                    <button type="button"
                                        onClick={toggleRecording}
                                        className={`flex-1 py-2.5 rounded-lg font-bold text-white transition-colors text-xs ${isRecordingLive ? 'bg-red-600 animate-pulse' : 'bg-slate-700 hover:bg-slate-600'}`}
                                    >
                                        {isRecordingLive ? t('🔴 Grabando (Clic para Detener y Guardar)') : t('🎤 Clic para Empezar a Grabar')}
                                    </button>
                                  </div>
                                  {newSessionData.audioPath && <p className="text-[9px] text-emerald-500 break-all">✓ {t('Audio vinculado:')} {newSessionData.audioPath}</p>}
                                  <div className="flex gap-2">
                                    <input type="text" placeholder={t('Dictado rápido para limpiar con IA...')} value={voiceInputText} onChange={(e) => setVoiceInputText(e.target.value)} className={`flex-1 p-2 ${th.input} border ${th.border} rounded ${th.text} text-[11px]`} />
                                    <button type="button" onClick={handleAiDictationAssist} disabled={isDictatingVoice} className="bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded text-white font-bold text-[11px] transition disabled:opacity-50">
                                      {isDictatingVoice ? '⏳' : t('✨ Usar IA')}
                                    </button>
                                  </div>
                                  <label className={`text-[10px] font-bold ${th.textMuted} uppercase block mt-3`}>📎 {t('Subir Audio Externo (MP3/WAV)')}</label>
                                  <input type="file" accept="audio/*" onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if(file) {
                                      const url = URL.createObjectURL(file);
                                      setNewSessionData(prev => ({...prev, audioPath: url}));
                                    }
                                  }} className={`w-full p-2 ${th.input} border ${th.border} rounded ${th.text} text-[11px]`} />
                                </div>
                              ) : (
                                <div className={`${th.card} p-3 rounded-xl border border-red-500/30 text-center`}>
                                  <p className="text-[10px] text-red-500 font-bold uppercase">🎙️ {t('Módulo de Voz Inactivo')}</p>
                                  <p className={`text-[9px] ${th.textMuted} mt-1`}>{t('Contacte a soporte para adquirir el Add-on de IA de Voz y Grabación.')}</p>
                                </div>
                              )}

                              <textarea required rows={4} value={newSessionData.rawNotes} onChange={(e) => setNewSessionData(prev => ({ ...prev, rawNotes: e.target.value }))} placeholder={t('Notas de evolución formales (puede escribir manual o usar la IA arriba)...')} className={`w-full p-2 ${th.card} border ${th.border} rounded ${th.text} font-mono`} />
                              <button type="submit" className="w-full py-2 bg-indigo-600 text-white font-bold rounded">{t('Guardar Sesión en Expediente')}</button>
                            </form>
                          )}

                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {activeCase.sessions.map((s) => (
                              <div key={s.sessionNumber} className={`${th.input} p-3 rounded-xl border ${th.border} text-xs`}>
                                <div className="flex justify-between font-mono text-indigo-500 font-bold"><span>N° {s.sessionNumber}</span><span>{s.date}</span></div>
                                <p className={`${th.text} italic mt-1 opacity-80`}>"{s.rawNotes}"</p>
                                {s.audioPath && (
                                  <div className="mt-2 flex flex-col gap-1">
                                    <span className={`text-[10px] ${th.textMuted}`}>{t('Audio de Sesión:')}</span>
                                    <audio controls src={s.audioPath} className="h-8 w-full max-w-[200px]"></audio>
                                  </div>
                                )}
                                {s.videoUrl && <p className="text-[10px] text-blue-500 mt-1 truncate">🔗 {t('Enlace:')} <a href={s.videoUrl} target="_blank" rel="noreferrer" className="underline">{s.videoUrl}</a></p>}
                                {s.dsm5EvaluationName && <div className="text-[10px] text-emerald-500 font-semibold truncate mt-1">✓ {s.dsm5EvaluationName}</div>}
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

                          <button onClick={handleProcessNotes} disabled={isProcessingNotes} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition shadow-lg">
                            {isProcessingNotes ? t('⏳ Procesando con IA...') : t('Generar Dictamen IA')}
                          </button>
                        </div>
                      )}

                      {activeCaseTab === 'ESTADISTICAS' && <PatientDashboard activeCase={activeCase} />}

                      <div className={`${th.card} border ${th.border} rounded-2xl p-4 sm:p-6 space-y-3 w-full`}>
                        <span className={`text-xs font-bold ${th.text} uppercase block tracking-wider truncate`}>🔬 {t('Consulta Académica / Científica')}</span>
                        <textarea value={scientificQuery.queryText} onChange={(e) => setScientificQuery(prev => ({ ...prev, queryText: e.target.value }))} rows={2} placeholder={t('Consulte dudas teóricas, criterios del DSM-5, medicamentos...')} className={`w-full p-2 ${th.input} border ${th.border} rounded text-xs ${th.text}`} />
                        <button onClick={handleScientificQuery} disabled={scientificQuery.loading} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-semibold text-center transition-colors">
                          {scientificQuery.loading ? t('Consultando Base de Datos...') : t('Realizar Consulta')}
                        </button>
                      </div>
                    </div>

                    <div className="xl:col-span-7 space-y-6 w-full">
                      <div className={`${th.card} border ${th.border} rounded-2xl flex flex-col min-h-[450px]`}>
                        <div className={`${th.input} px-4 py-4 border-b ${th.border} flex flex-wrap gap-2 justify-between items-center`}>
                          <span className={`text-xs font-bold ${th.textMuted} uppercase tracking-widest`}>{t('Dictamen Clínico Profesional')}</span>
                          
                          <div className="flex flex-wrap items-center gap-2">
                             <select value={pdfLang} onChange={e => setPdfLang(e.target.value as any)} className={`text-[10px] font-bold p-1.5 rounded border ${th.border} ${th.card} ${th.text} outline-none cursor-pointer`}>
                               <option value="ES">PDF: Español</option>
                               <option value="EN">PDF: English</option>
                               <option value="PT">PDF: Português</option>
                               <option value="IT">PDF: Italiano</option>
                               <option value="FR">PDF: Français</option>
                             </select>
                             <button onClick={handleDownloadPDF} disabled={isGeneratingPdf} className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-1.5 rounded-lg font-bold shadow-md transition disabled:opacity-50">
                               {isGeneratingPdf ? '⏳...' : `📄 ${t('Generar PDF')}`}
                             </button>
                          </div>

                        </div>
                        <div className={`p-5 flex-1 text-[13px] ${th.text} font-mono whitespace-pre-wrap overflow-y-auto leading-relaxed max-h-[800px]`}>
                          {notesResult || t('Presione \'Generar Dictamen IA\' para procesar el expediente actual.')}
                        </div>
                      </div>

                      {scientificQuery.responseText && (
                        <div className={`${th.card} border ${th.border} rounded-2xl flex flex-col w-full overflow-hidden`}>
                          <div className={`${th.input} px-4 sm:px-6 py-4 border-b ${th.border} flex justify-between items-center`}>
                            <span className={`text-xs font-bold ${th.textMuted} uppercase tracking-wide truncate`}>{t('Resultados de Consulta Científica')}</span>
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

      {/* MODALES REUTILIZABLES CON TEMA */}
      {showRecipeModal && activeCase && currentUser?.professionType === 'PSIQUIATRA' && (
        <div className={`fixed inset-0 ${th.modalBg} backdrop-blur-sm flex items-center justify-center p-4 z-50`}>
          <div className={`${th.card} border ${th.border} rounded-2xl max-w-lg w-full p-6 text-xs space-y-4 shadow-2xl`}>
            <div className={`flex justify-between items-center border-b ${th.border} pb-2`}>
              <h3 className="text-sm font-bold text-emerald-500">💊 {t('Extender Receta Médica')}</h3>
              <button onClick={() => setShowRecipeModal(false)} className={`${th.textMuted} hover:${th.text}`}>✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>{t('Paciente')}</label>
                <input type="text" disabled value={`${activeCase.patientName} (Exp: ${activeCase.id})`} className={`w-full p-2 ${th.input} border ${th.border} rounded ${th.textMuted} font-mono text-xs`} />
              </div>
              <div>
                <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>{t('Diagnóstico (CIE-11)')}</label>
                <input type="text" value={recipeData.diagnostico} onChange={e => setRecipeData(prev => ({...prev, diagnostico: e.target.value}))} className={`w-full p-2 ${th.input} border ${th.border} rounded ${th.text}`} />
              </div>
              <div>
                <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>{t('Rp/ (Medicamentos)')}</label>
                <textarea rows={4} value={recipeData.medicamentos} onChange={e => setRecipeData(prev => ({...prev, medicamentos: e.target.value}))} className={`w-full p-2 ${th.input} border ${th.border} rounded ${th.text} font-mono`} />
              </div>
              <div>
                <label className={`block text-[10px] font-bold ${th.textMuted} uppercase mb-1`}>{t('Instrucciones')}</label>
                <textarea rows={2} value={recipeData.indicaciones} onChange={e => setRecipeData(prev => ({...prev, indicaciones: e.target.value}))} className={`w-full p-2 ${th.input} border ${th.border} rounded ${th.text}`} />
              </div>
            </div>
            <div className={`flex flex-col sm:flex-row justify-end gap-2 pt-3 border-t ${th.border}`}>
              <button onClick={() => setShowRecipeModal(false)} className={`px-4 py-2 bg-slate-300 dark:bg-slate-800 ${th.text} font-bold rounded-xl`}>{t('Cancelar')}</button>
              <a href={`mailto:?subject=Receta Médica - Dr.(a) ${currentUser.fullName}&body=${encodeURIComponent(`RECETA MÉDICA OFICIAL\n\nPaciente: ${activeCase.patientName}\nFecha: ${new Date().toLocaleDateString()}\nDiagnóstico: ${recipeData.diagnostico}\n\nRp/\n${recipeData.medicamentos}\n\nInstrucciones:\n${recipeData.indicaciones}\n\nAtentamente,\nDr.(a) ${currentUser.fullName}\nColegiado: ${currentUser.colegiado}`)}`} className="px-4 py-2 bg-blue-600 text-white font-bold rounded-xl text-center">📧 {t('Correo')}</a>
              <a href={`https://wa.me/${activeCase.generalData?.telefono?.replace(/\D/g, '') || ''}?text=${encodeURIComponent(`*RECETA MÉDICA OFICIAL*\n*Dr.(a)* ${currentUser.fullName}\n*Colegiado:* ${currentUser.colegiado}\n\n*Paciente:* ${activeCase.patientName}\n*Fecha:* ${new Date().toLocaleDateString()}\n\n*Diagnóstico:* ${recipeData.diagnostico}\n\n*Rp/*\n${recipeData.medicamentos}\n\n*Instrucciones:* \n${recipeData.indicaciones}`)}`} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl text-center">💬 WhatsApp</a>
            </div>
          </div>
        </div>
      )}

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
                {verificationError && <p className="text-red-500 text-[10px] mt-1">{verificationError}</p>}
              </div>
            </div>
            <div className={`p-3 border-t ${th.border} ${th.input} flex justify-end gap-2`}>
              <button onClick={() => setShowDsmModal(false)} className={`px-4 py-2 bg-slate-300 dark:bg-slate-800 ${th.text} font-bold rounded-lg transition-colors`}>{t('Cancelar')}</button>
              <button onClick={handleSaveDsmEvaluation} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors">{t('Firmar y Guardar en Expediente')}</button>
            </div>
          </div>
        </div>
      )}

      {showCertificateModal && activeCase && (
        <div className={`fixed inset-0 ${th.modalBg} backdrop-blur-sm flex items-center justify-center p-4 z-50`}>
          <div className={`${th.card} border ${th.border} rounded-2xl max-w-2xl w-full p-6 text-xs space-y-4 shadow-2xl`}>
            <div className={`flex justify-between items-center border-b ${th.border} pb-2`}>
              <h3 className={`text-sm font-bold ${th.text}`}>{certificateType === 'ATTENDANCE' ? t('Constancia de Asistencia') : t('Orden de Referencia')}</h3>
              <button onClick={() => setShowCertificateModal(false)} className={`${th.textMuted} hover:${th.text}`}>✕</button>
            </div>
            <textarea rows={10} value={certificateText} onChange={(e) => setCertificateText(e.target.value)} className={`w-full p-3 ${th.input} border ${th.border} rounded-xl ${th.text}`} />
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowCertificateModal(false)} className={`px-4 py-2 bg-slate-300 dark:bg-slate-800 ${th.text} font-bold rounded-xl`}>{t('Cancelar')}</button>
              <button onClick={() => {
                const printWin = window.open('', '_blank');
                if (printWin) {
                  printWin.document.write(`<html><body><pre style="font-family:Arial,sans-serif;font-size:12pt;white-space:pre-wrap;">${certificateText}</pre></body></html>`);
                  printWin.document.close(); printWin.print();
                }
              }} className="px-5 py-2 bg-emerald-600 text-white font-bold rounded-xl">🖨️ {t('Imprimir')}</button>
            </div>
          </div>
        </div>
      )}

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

      {/* FIRMA DE DESARROLLADOR */}
      <footer className={`border-t ${th.border} ${th.bg} py-4 text-center text-xs ${th.textMuted} mt-auto w-full transition-colors duration-300`}>
        <p>© 2026 Asistente Clínica SaaS. Cumplimiento ético centralizado. {t('Desarrollado por Harold.')}</p>
      </footer>
    </div>
  );
}
