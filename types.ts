export enum AppMode {
  CLINICAL = 'CLINICAL',
  ADMIN = 'ADMIN'
}

export interface Psychologist {
  username: string;
  passwordHash: string;
  fullName: string;
  colegiado: string;
  licenseType: 'DEMO_15' | 'DEMO' | 'ANUAL';
  licenseExpiry: string;
  isActive: boolean;
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
  baiScore: string;
  bdiScore: string;
  traumaScale: string;
  audioPath: string;
  transcriptionPath: string;
  dsm5EvaluationName?: string;
  dsm5EvaluationResult?: string;
  externalDocuments?: ExternalDocument[];
}

export interface ClinicalCase {
  id: string;
  patientName: string;
  doctorUsername: string;
  sessions: SessionRecord[];
  structuredOutput?: string;
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
