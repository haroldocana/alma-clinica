export enum AppMode {
  CLINICAL = 'CLINICAL',
  CALENDAR = 'CALENDAR',
  ADMIN = 'ADMIN'
}

export interface Psychologist {
  username: string;
  passwordHash: string;
  fullName: string;
  colegiado: string;
  licenseType: 'ESTANDAR' | 'PREMIUM' | 'DEMO' | 'DEMO_15' | 'ANUAL';
  licenseExpiry: string;
  isActive: boolean;
  professionType?: 'PSICOLOGO' | 'PSIQUIATRA';
  specialty?: string;
  professionalReview?: string;
  abandonmentThreshold?: number;
  countryCode?: string;
  
  // CONTROL DE BOLSA DE MENSAJES IA
  mensajesPlanMensual?: number;
  mensajesConsumidosMes?: number;
  mensajesBolsonExtra?: number;
}

export interface ExternalDocument {
  fileName: string;
  fileType: string;
  uploadedAt: string;
  extractedContentSummary: string;
}

export interface SessionRecord {
  sessionNumber: number;
  date: string;
  rawNotes: string;
  baiScore?: string;
  bdiScore?: string;
  traumaScale?: string;
  audioPath?: string;
  transcriptionPath?: string;
  dsm5EvaluationName?: string;
  dsm5EvaluationResult?: string;
  externalDocuments?: ExternalDocument[];
  functionalAreas?: {
    sleep: number;
    appetite: number;
    energy: number;
    social: number;
    concentration: number;
  };
  pharma?: {
    name: string;
    dose: string;
    effectiveness: number;
    risk: number;
  } | null;
  testScores?: Record<string, number>;
}

export interface ClinicalCase {
  id: string;
  patientName: string;
  doctorUsername: string;
  generalData?: {
    id?: string;
    patientName?: string;
    sexo?: string;
    edad?: string;
    estudios?: string;
    origenProcedencia?: string;
    ocupacion?: string;
    estadoCivil?: string;
    religion?: string;
    datosProgenitores?: string;
    motivoConsultaTextual?: string;
    antecedentes?: string;
    telefono?: string;
    fotoUrl?: string;
    rawNotes?: string;
  };
  sessions: SessionRecord[];
  structuredOutput?: string;
  professionalOpinion?: string;
  specialtyComments?: Record<string, string>;
  specialtyAiSummaries?: Record<string, string>;
  suicideRiskAnalysis?: string;
  securityPlan?: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  doctorUsername: string;
  title: string;
  start: string;
  end: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
}

export interface ScientificQuery {
  queryText: string;
  responseText: string;
  loading: boolean;
}

export interface Dsm5EvaluationTemplate {
  id: string;
  name: string;
  questions: string[];
  options?: string[];
}
