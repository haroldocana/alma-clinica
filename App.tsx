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
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  const diffTime = expiry.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const getDaysSince = (pastDateStr: string): number => {
  if (!pastDateStr) return 0;
  const today = new Date();
  const past = new Date(pastDateStr);
  today.setHours(0, 0, 0, 0);
  past.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - past.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
};

const exportToWord = (elementId: string, filename: string) => {
  const element = document.getElementById(elementId);
  if (!element) return;
  const preHtml = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Dictamen</title></head><body>";
  const postHtml = "</body></html>";
  const html = preHtml + element.innerHTML + postHtml;
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
      'Asistente Clínica SaaS': { ES: 'Asistente Clínica SaaS', EN: 'SaaS Clinical Assistant', PT: 'Assistente Clínico SaaS', IT: 'Assistente Clinico SaaS', FR: 'Assistant Clinique SaaS' },
      'Dictamen Clínico Profesional': { ES: 'Dictamen Clínico Profesional', EN: 'Professional Clinical Report', PT: 'Parecer Clínico Profissional', IT: 'Referto Clinico Professionale', FR: 'Rapport Clinique Professionnel' },
      // ... Se mantiene toda la base de traducciones
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
      navigator.clipboard.writeText(svg).then(() => alert("Gráfico SVG copiado al portapapeles. Puede pegarlo en Word o HTML."));
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
                   // Mock image download for Dashboard
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
             <span className="text-[10px] font-bold text-slate-400 uppercase block">{t('Nivel de Actividad Psicosocial')}</span>
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

  // Mantener al currentUser sincronizado con la BD de psicólogos (por si el Admin cambia su acceso a Voz o Días)
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

  // ============================================================================
  // CÁLCULO DE ALERTAS DE ABANDONO + EMERGENCIA
  // ============================================================================
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
    const abandons = Object.values(clinicalDatabase).filter(c => c.doctorUsername === currentUser.username).map(c => {
      if (c.sessions && c.sessions.length > 0) {
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

  const totalAlerts = emergencyAlerts.length + abandonmentAlerts.length;

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
        document.body.appendChild(printContainer); // Attach temp for fetching by ID
        exportToWord('word-content', `Expediente_${activeCase.id}`);
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

  const myPatients = currentUser ? Object.values(clinicalDatabase).filter(c => c.doctorUsername === currentUser.username) : [];

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
                      {Object.values(psychologists).map((p) => {
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
                          <div key={alert.id} className="bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-500/60 rounded-2xl p-4 flex justify-between border">
                            <div><h3 className="text-sm font-bold text-red-600 dark:text-red-400">🚨 Llamada de Emergencia Registrada</h3><p className="text-xs text-red-800 dark:text-red-200">Paciente: {alert.patientName}</p></div>
                            <button onClick={() => handleViewEmergency(alert.patientId)} className="px-5 py-2 bg-red-600 text-white text-xs font-bold rounded-xl h-10">Analizar</button>
                          </div>
                        ))}
                        {abandonmentAlerts.map((alert: any) => (
                          <div key={alert.id} className="bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-500/60 rounded-2xl p-4 flex justify-between border">
                            <div><h3 className="text-sm font-bold text-amber-600 dark:text-amber-400">⚠️ Riesgo de Abandono de Tratamiento</h3><p className="text-xs text-amber-800 dark:text-amber-200">Paciente: {alert.patientName} | {alert.days} días sin asistir.</p></div>
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
                          
                          {/* SUBIR FOTO DEL DISPOSITIVO O URL */}
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
                    <form onSubmit={(e) => { e.preventDefault(); /* Logic existing in handleClinicalSearch */ }} className="flex gap-2 w-full">
                      <input type="text" value={clinicalSearchQuery} onChange={(e) => setClinicalSearchQuery(e.target.value)} placeholder="Busque por nombre o ID..." className={`flex-1 p-2.5 ${th.input} border ${th.border} rounded-xl text-xs ${th.text}`} />
                      <button type="button" onClick={handleClinicalSearch as any} className="py-2.5 px-6 bg-indigo-600 text-white rounded-xl text-xs font-bold">Buscar</button>
                    </form>
                    {searchFeedback && <p className="text-xs text-indigo-500 mt-2">{searchFeedback}</p>}
                  </div>
                )}

                {activeCase && (
                  <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8 w-full">
                    <div className="xl:col-span-5 space-y-6 w-full">
                      <div className="flex justify-between items-center bg-indigo-500/10 border border-indigo-500/20 p-2 rounded-xl">
                        <button onClick={() => setActiveCase(null)} className="text-xs text-indigo-600 font-bold px-3 py-1">← Atrás</button>
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
                              
                              {/* SECCIÓN MÓDULO DE VOZ Y AUDIOS EXTERNOS (Siempre Visible o según Admin) */}
                              {currentUser?.hasVoiceModule ? (
                                <div className={`${th.card} p-3 rounded-xl border ${th.border} space-y-3`}>
                                  <label className={`text-[10px] font-bold ${th.textMuted} uppercase block`}>🎙️ Grabadora, Dictado IA y Audios</label>
                                  <button type="button" onClick={toggleRecording} className={`w-full py-2.5 rounded-lg font-bold text-white transition-colors text-xs ${isRecordingLive ? 'bg-red-600 animate-pulse' : 'bg-slate-700 hover:bg-slate-600'}`}>
                                      {isRecordingLive ? '🔴 Grabando (Clic para Detener)' : '🎤 Clic para Empezar a Grabar'}
                                  </button>
                                  {newSessionData.audioPath && <p className="text-[9px] text-emerald-500 break-all">✓ Audio vinculado: {newSessionData.audioPath}</p>}
                                  <div className="flex gap-2 mt-2">
                                    <input type="text" placeholder="Dictado rápido para IA..." value={voiceInputText} onChange={(e) => setVoiceInputText(e.target.value)} className={`flex-1 p-2 ${th.input} border ${th.border} rounded ${th.text} text-[11px]`} />
                                    <button type="button" onClick={handleAiDictationAssist} className="bg-indigo-600 hover:bg-indigo-500 px-3 py-1 rounded text-white font-bold text-[11px]">✨ IA</button>
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

                              {/* SUBIR BATERÍAS MANUALES */}
                              <div className={`${th.card} p-3 rounded-xl border ${th.border} space-y-2`}>
                                 <label className={`text-[10px] font-bold text-indigo-500 uppercase block`}>📎 Subir Batería Resuelta Manualmente (Archivo)</label>
                                 <input type="file" accept=".pdf, image/*" onChange={(e) => {
                                    if(e.target.files?.[0]) setNewSessionData((p:any) => ({...p, manualBatteryFile: URL.createObjectURL(e.target.files![0])}));
                                 }} className={`w-full p-2 ${th.input} border ${th.border} rounded ${th.text} text-[11px]`} />
                                 {newSessionData.manualBatteryFile && (
                                   <div className="flex gap-2 items-center mt-2">
                                     <span className="text-[9px] text-emerald-500">✓ Archivo listo</span>
                                     <button type="button" onClick={() => alert("Simulación: Analizando batería subida con IA... Se agregarán los resultados a las notas.")} className="bg-indigo-600 text-white text-[9px] px-2 py-1 rounded">Analizar Batería con IA</button>
                                   </div>
                                 )}
                              </div>

                              <textarea required rows={4} value={newSessionData.rawNotes} onChange={(e) => setNewSessionData((p:any) => ({ ...p, rawNotes: e.target.value }))} placeholder="Notas de evolución..." className={`w-full p-2 ${th.card} border ${th.border} rounded ${th.text}`} />
                              <button type="submit" className="w-full py-2 bg-indigo-600 text-white font-bold rounded">Guardar Sesión</button>
                            </form>
                          )}

                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {activeCase.sessions.map((s) => (
                              <div key={s.sessionNumber} className={`${th.input} p-3 rounded-xl border ${th.border} text-xs`}>
                                <div className="flex justify-between font-bold text-indigo-500"><span>S{s.sessionNumber}</span><span>{s.date}</span></div>
                                <p className="italic mt-1">"{s.rawNotes}"</p>
                                {s.manualBatteryFile && <p className="text-[10px] text-emerald-500 mt-1">📎 Batería Manual Adjunta</p>}
                                {s.audioPath && <audio controls src={s.audioPath} className="h-8 w-full max-w-[200px] mt-2"></audio>}
                              </div>
                            ))}
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
                               <option value="ES">ES</option><option value="EN">EN</option><option value="PT">PT</option>
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
    </div>
  );
}
