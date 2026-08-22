import { ClinicalCase, Psychologist } from './types';

// ============================================================================
// 1. CONFIGURACIÓN DE CONEXIÓN A LA IA
// ============================================================================
// Obtenemos la llave secreta de forma segura desde Netlify
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY; 

// ACTUALIZADO AL MODELO MÁS RECIENTE: GEMINI 3.1 PRO PREVIEW
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${GEMINI_API_KEY}`;
const CLOUD_FUNCTION_URL = 'https://us-central1-clinicainteligentegt.cloudfunctions.net/actualizarlicencias'; 
const BUCKET_URL = 'https://storage.googleapis.com/base-psicologiagt-usuario2';

// ============================================================================
// 2. MOTOR DIRECTO A GEMINI
// ============================================================================
async function callGeminiDirectly(prompt: string) {
  try {
    const response = await fetch(GEMINI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });
    
    const data = await response.json();

    if (!response.ok || data.error) {
      console.error("Error desde Gemini:", data);
      throw new Error(data.error?.message || "La IA rechazó la petición. Verifica tu API Key o el nombre del modelo.");
    }

    if (data.candidates && data.candidates[0].content.parts[0].text) {
      return data.candidates[0].content.parts[0].text;
    } else {
      console.warn("Formato inesperado:", data);
      return "El dictamen se generó pero la IA devolvió un formato distinto.";
    }
  } catch (error) {
    console.error("Error de conexión con la IA:", error);
    throw error;
  }
}

// ============================================================================
// 3. FUNCIONES DE IA (CON CONOCIMIENTO DSM-5 Y ÉTICA)
// ============================================================================
export const processClinicalNotes = async (notes: string, bai: string, bdi: string, doctorName: string, colegiado: string) => {
  const prompt = `
    Eres un sistema experto en auditoría y análisis clínico psicológico de nivel avanzado. Tu objetivo es procesar el expediente completo de un paciente para emitir un Dictamen Estructurado Diagnóstico y de Evolución Conductual.

    **DATOS DEL PROFESIONAL A CARGO:**
    - ${doctorName} (Colegiado: ${colegiado})

    **HISTORIAL COMPLETO DE SESIONES Y NOTAS:**
    ${notes}

    **ÚLTIMOS PUNTAJES PSICOMÉTRICOS:**
    - Score de Ansiedad (BAI/GAD-7): ${bai}
    - Score de Depresión (BDI/PHQ-9): ${bdi}

    **INSTRUCCIONES ESTRICTAS:**
    Analiza la totalidad de la información proporcionada. Estructura tu informe final utilizando ESTRICTAMENTE las siguientes secciones en Markdown:

    ## 1. ANÁLISIS DE EVOLUCIÓN CRONOLÓGICA Y CAMBIOS DE CONDUCTA
    - Mapea la trayectoria del paciente desde la sesión 1 hasta la actual.
    - Identifica fluctuaciones, retrocesos o hitos de mejoría en la conducta, afecto y cognición.

    ## 2. CORRELACIÓN DE BATERÍAS APLICADAS
    - Compara los cambios en los puntajes psicométricos reportados y relaciónalos lógicamente con el relato clínico.

    ## 3. CONCLUSIÓN Y DICTAMEN CLÍNICO (CIERRE OBLIGATORIO)
    Concluye con una resolución explícita respondiendo a:
    - **¿Refleja un Trastorno?** Si cumple los criterios, especifica el nombre exacto del Trastorno según el DSM-5-TR y su código de diagnóstico (CIE-10/11) correspondiente.
    - **¿Se sospecha de una Afección Médica Subyacente?** Si los síntomas sugieren una causa orgánica, detalla qué condición podría ser para referir a Neurología, Psiquiatría o Medicina Interna.
    
    ## 4. SUGERENCIAS TERAPÉUTICAS Y PROTOCOLO
    - Plantea intervenciones inmediatas y diagnósticos diferenciales si la evidencia no es concluyente.

    Mantén un tono estrictamente profesional, confidencial y alineado al código ético.
  `;
  return callGeminiDirectly(prompt);
};

export const processVoiceNotesToEvolution = async (voiceText: string, doctorName: string, colegiado: string) => {
  const prompt = `Actúa como asistente médico transcriptor. Convierte este dictado de voz desordenado en una nota de evolución clínica formal, estructurada y profesional lista para ser insertada en un expediente.\n\nDictado crudo: "${voiceText}"`;
  return callGeminiDirectly(prompt);
};

export const queryScientificDatabase = async (query: string) => {
  const prompt = `Actúa como una IA experta en psiquiatría y psicología clínica en Guatemala. 
  Responde a la siguiente consulta técnica basándote de forma ESTRICTA y prioritaria en los criterios oficiales del manual DSM-5-TR, protocolos internacionales de la APA y el Código de Ética Psicológica. 
  Si la respuesta requiere descarte médico o evaluación física humana, indícalo claramente.
  
  Consulta del profesional: "${query}"`;
  return callGeminiDirectly(prompt);
};

// ============================================================================
// 4. FUNCIONES DE BASE DE DATOS Y ALMACENAMIENTO (Intactas)
// ============================================================================
export const savePsychologistsRemote = async (data: Record<string, Psychologist>) => {
  try {
    await fetch(CLOUD_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (e) {
    console.error("Error guardando licencias", e);
  }
};

export const loadPsychologistsRemote = async () => {
  try {
    const response = await fetch(`${BUCKET_URL}/config/licencias.json?t=${Date.now()}`);
    if (!response.ok) return {};
    return await response.json();
  } catch (e) {
    return {};
  }
};

export const saveClinicalCasesRemote = async (username: string, data: Record<string, ClinicalCase>) => {
  try {
    await fetch(CLOUD_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: `clinica/${username}/expedientes.json`,
        data: data
      })
    });
  } catch (e) {
    console.error("Error guardando expedientes", e);
  }
};

export const loadClinicalCasesRemote = async (username: string) => {
  try {
    const response = await fetch(`${BUCKET_URL}/clinica/${username}/expedientes.json?t=${Date.now()}`);
    if (!response.ok) return {};
    return await response.json();
  } catch (e) {
    return {};
  }
};

export const dismissEmergencyAlert = async (username: string, alertId: string) => {
  try {
    const response = await fetch(`${BUCKET_URL}/clinica/${username}/alertas_activas.json?t=${Date.now()}`);
    if (!response.ok) return;
    
    let alerts = await response.json();
    alerts = alerts.filter((a: any) => a.id !== alertId);
    
    await fetch(CLOUD_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: `clinica/${username}/alertas_activas.json`,
        data: alerts
      })
    });
  } catch (e) {
    console.error("Error quitando la alerta", e);
  }
};
