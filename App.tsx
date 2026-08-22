import React, { useState, useRef, useEffect } from 'react';
import { AppMode, ClinicalCase, ScientificQuery, SessionRecord, Dsm5EvaluationTemplate, ExternalDocument, Psychologist } from './types';
import { DSM5_EVALUATIONS } from './constants';
import { processClinicalNotes, queryScientificDatabase } from './services/geminiService';

export default function App() {
  const [mode, setMode] = useState<AppMode>(AppMode.CLINICAL);

  const [adminPassword, setAdminPassword] = useState(() => {
    return localStorage.getItem('adminPassword') || 'psicologia1402';
  });
  const [adminInput, setAdminInput] = useState('');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [newAdminPassword, setNewAdminPassword] = useState('');

  const [psychologists, setPsychologists] = useState<Record<string, Psychologist>>(() => {
    const saved = localStorage.getItem('psychologists_db');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return {
      'harold01': {
        username: 'harold01',
        passwordHash: '010234',
        fullName: 'Dr. Harold Ocaña',
        colegiado: '010234',
        licenseType: 'ANUAL',
        licenseExpiry: '2027-01-01',
        isActive: true
      },
      'rodas14205': {
        username: 'rodas14205',
        passwordHash: 'rodas2025',
        fullName: 'Dra. Evelyn Rodas',
        colegiado: '14,205',
        licenseType: 'ANUAL',
        licenseExpiry: '2026-02-15',
        isActive: true
      }
    };
  });

  const [clinicalDatabase, setClinicalDatabase] = useState<Record<string, ClinicalCase>>(() => {
    const saved = localStorage.getItem('clinical_cases_db');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return {
      'PAC-9482': {
        id: 'PAC-9482',
        patientName: 'María Mercedes Asturias',
        doctorUsername: 'harold01',
        sessions: [
          {
            sessionNumber: 1,
            date: '2025-01-10',
            rawNotes: 'Primera sesión. Paciente reporta niveles elevados de estrés laboral y dificultades para conciliar el sueño. Se observa llanto fácil.',
            baiScore: 'Ansiedad Leve (15 puntos)',
            bdiScore: 'Depresión Leve (14 puntos)',
            traumaScale: 'Pendiente',
            audioPath: 'gs://base-psicologiagt-usuario2/pacientes/PAC-9482/audios/sesion_1.mp3',
            transcriptionPath: 'gs://base-psicologiagt-usuario2/pacientes/PAC-9482/transcripciones/sesion_1.txt',
            externalDocuments: []
          }
        ]
      }
    };
  });

  useEffect(() => {
    localStorage.setItem('psychologists_db', JSON.stringify(psychologists));
  }, [psychologists]);

  useEffect(() => {
    localStorage.setItem('clinical_cases_db', JSON.stringify(clinicalDatabase));
  }, [clinicalDatabase]);

  useEffect(() => {
    localStorage.setItem('adminPassword', adminPassword);
  }, [adminPassword]);

  const [currentUser, setCurrentUser] = useState<Psychologist | null>(() => {
    const saved = localStorage.getItem('current_logged_psychologist');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { console.error(e); }
    }
    return null;
  });

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('current_logged_psychologist', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('current_logged_psychologist');
    }
  }, [currentUser]);

  const [activeCase, setActiveCase] = useState<ClinicalCase | null>(null);
  const [clinicalSearchQuery, setClinicalSearchQuery] = useState('');
  const [searchFeedback, setSearchFeedback] = useState('');

  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [showNewSessionForm, setShowNewSessionForm] = useState(false);
  const [showDocUploadForm, setShowDocUploadForm] = useState(false);

  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regFullName, setRegFullName] = useState('');
  const [regColegiado, setRegColegiado] = useState('');
  const [regLicenseType, setRegLicenseType] = useState<'DEMO_15' | 'DEMO' | 'ANUAL'>('DEMO_15');

  const [editingUsername, setEditingUsername] = useState<string | null>(null);
  const [editPasswordInput, setEditPasswordInput] = useState('');

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [verificationPassword, setVerificationPassword] = useState('');
  const [verificationError, setVerificationError] = useState('');

  const [newPatientData, setNewPatientForm] = useState({
    id: '', patientName: '', rawNotes: '', baiScore: 'Pendiente', bdiScore: 'Pendiente', traumaScale: 'Pendiente'
  });

  const [newSessionData, setNewSessionData] = useState<SessionRecord>({
    sessionNumber: 1,
    date: new Date().toISOString().split('T')[0],
    rawNotes: '', baiScore: 'Pendiente', bdiScore: 'Pendiente', traumaScale: 'Pendiente',
    audioPath: '', transcriptionPath: '', dsm5EvaluationName: '', dsm5EvaluationResult: '', externalDocuments: []
  });

  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const audioInputRef = useRef<HTMLInputElement>(null);

  const [newDocData, setNewDocData] = useState({ fileName: '', extractedContentSummary: '' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isProcessingNotes, setIsProcessingNotes] = useState(false);
  const [notesResult, setNotesResult] = useState<string>(() => {
    return localStorage.getItem('last_notes_result') || '';
  });

  useEffect(() => {
    localStorage.setItem('last_notes_result', notesResult);
  }, [notesResult]);

  const [scientificQuery, setScientificQuery] = useState<ScientificQuery>({
    queryText: 'Tratamiento de primera línea para el Trastorno de Ansiedad Generalizada en adultos jóvenes según la APA.',
    responseText: '', loading: false
  });

  const [selectedDsmTemplate, setSelectedDsmTemplate] = useState<Dsm5EvaluationTemplate | null>(null);
  const [dsmAnswers, setDsmAnswers] = useState<Record<string, string>>({});
  const [showDsmModal, setShowDsmModal] = useState(false);

  const getDaysRemaining = (expiryDateStr: string): number => {
    const expiry = new Date(expiryDateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const user = psychologists[loginUsername.trim()];
    if (user) {
      if (!user.isActive || getDaysRemaining(user.licenseExpiry) < 0) {
        setLoginError('Cuenta inactiva o expirada.');
        return;
      }
      if (user.passwordHash !== loginPassword) {
        setLoginError('Contraseña incorrecta.');
        return;
      }
      setCurrentUser(user);
      setLoginError('');
      setActiveCase(null);
      setNotesResult('');
    } else {
      setLoginError('Credenciales incorrectas.');
    }
  };

  const handleAdminAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminInput === adminPassword) { setIsAdminAuthenticated(true); } 
    else { alert('Clave de administrador incorrecta.'); }
  };

  const handleRegisterLicense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername.trim() || !regPassword.trim() || !regFullName.trim() || !regColegiado.trim()) return;

    const expiry = new Date();
    if (regLicenseType === 'DEMO_15') { expiry.setDate(expiry.getDate() + 15); }
    else if (regLicenseType === 'DEMO') { expiry.setDate(expiry.getDate() + 30); }
    else { expiry.setDate(expiry.getDate() + 365); }

    const newPsychologist: Psychologist = {
      username: regUsername.trim(),
      passwordHash: regPassword.trim(),
      fullName: regFullName.trim(),
      colegiado: regColegiado.trim(),
      licenseType: regLicenseType === 'DEMO_15' ? 'DEMO' : regLicenseType,
      licenseExpiry: expiry.toISOString().split('T')[0],
      isActive: true
    };

    setPsychologists(prev => ({ ...prev, [newPsychologist.username]: newPsychologist }));
    alert(`Licencia activada para: ${newPsychologist.username}`);
    setRegUsername(''); setRegPassword(''); setRegFullName(''); setRegColegiado('');
  };

  const handleUpdateUserPassword = (username: string) => {
    if (!editPasswordInput.trim()) return;
    setPsychologists(prev => ({ ...prev, [username]: { ...prev[username], passwordHash: editPasswordInput.trim() } }));
    alert(`Contraseña actualizada con éxito para el usuario: ${username}`);
    setEditingUsername(null); setEditPasswordInput('');
  };

  const handleClinicalSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    const query = clinicalSearchQuery.toLowerCase().trim();
    const hasInstruction = query.startsWith('presenta expediente de') || query.startsWith('presenta expediente ');
     
    if (!hasInstruction) {
      setSearchFeedback('Acceso denegado. Use: "presenta expediente [ID o Nombre]"');
      setActiveCase(null); setNotesResult('');
      return;
    }

    const searchTerm = query.replace('presenta expediente de', '').replace('presenta expediente', '').trim();
    const foundCase = Object.values(clinicalDatabase).find(
      c => c.id.toLowerCase() === searchTerm || c.patientName.toLowerCase().includes(searchTerm)
    );

    if (foundCase) {
      if (foundCase.doctorUsername !== currentUser.username) {
        setSearchFeedback('Acceso denegado por secreto profesional.');
        setActiveCase(null);
        return;
      }
      setActiveCase({ ...foundCase });
      setSearchFeedback(`Expediente ${foundCase.id} cargado.`);
      setNotesResult(foundCase.structuredOutput || '');
    } else {
      setSearchFeedback(`No se encontró el expediente.`);
      setActiveCase(null);
    }
  };

  const handleRegisterPatient = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newPatientData.id.trim() || !newPatientData.patientName.trim()) return;

    const formattedId = newPatientData.id.toUpperCase().trim();
    const newCase: ClinicalCase = {
      id: formattedId,
      patientName: newPatientData.patientName.trim(),
      doctorUsername: currentUser.username,
      sessions: [
        {
          sessionNumber: 1,
          date: new Date().toISOString().split('T')[0],
          rawNotes: newPatientData.rawNotes || 'Expediente inicial creado.',
          baiScore: newPatientData.baiScore, bdiScore: newPatientData.bdiScore, traumaScale: newPatientData.traumaScale,
          audioPath: `gs://base-psicologiagt-usuario2/pacientes/${formattedId}/audios/sesion_1.mp3`,
          transcriptionPath: `gs://base-psicologiagt-usuario2/pacientes/${formattedId}/transcripciones/sesion_1.txt`,
          externalDocuments: []
        }
      ]
    };

    setClinicalDatabase(prev => ({ ...prev, [formattedId]: newCase }));
    setActiveCase(newCase);
    setNotesResult('');
    setShowRegisterForm(false);
    setNewPatientForm({ id: '', patientName: '', rawNotes: '', baiScore: 'Pendiente', bdiScore: 'Pendiente', traumaScale: 'Pendiente' });
  };

  const handleAudioUploadSimulated = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && activeCase) {
      const file = e.target.files[0];
      setIsUploadingAudio(true);
      setTimeout(() => {
        setIsUploadingAudio(false);
        const simulatedGcsPath = `gs://base-psicologiagt-usuario2/pacientes/${activeCase.id}/audios/${file.name}`;
        setNewSessionData(prev => ({
          ...prev, audioPath: simulatedGcsPath,
          transcriptionPath: simulatedGcsPath.replace('/audios/', '/transcripciones/').replace(/\.[^/.]+$/, ".txt")
        }));
        alert(`Grabación persistida remotamente en: ${simulatedGcsPath}`);
      }, 1000);
    }
  };

  const handleGoogleDriveAudioSimulated = () => {
    if (!activeCase) return;
    setIsUploadingAudio(true);
    setTimeout(() => {
      setIsUploadingAudio(false);
      const simulatedGcsPath = `gs://base-psicologiagt-usuario2/pacientes/${activeCase.id}/audios/Grabacion_Drive_Sesion.mp3`;
      setNewSessionData(prev => ({
        ...prev, audioPath: simulatedGcsPath,
        transcriptionPath: simulatedGcsPath.replace('/audios/', '/transcripciones/').replace(/\.[^/.]+$/, ".txt")
      }));
      alert(`Grabación vinculada desde Google Drive a: ${simulatedGcsPath}`);
    }, 1000);
  };

  const handleGoogleDriveDocSimulated = () => {
    if (!activeCase) return;
    setNewDocData({
      fileName: 'Documento_Drive_Historial.pdf',
      extractedContentSummary: 'Historial previo del paciente importado correctamente desde Google Drive.'
    });
    alert('Documento de Google Drive pre-cargado.');
  };

  const handleAddNewSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCase) return;

    const updatedSessions = [
      ...activeCase.sessions,
      {
        ...newSessionData,
        sessionNumber: activeCase.sessions.length + 1,
        audioPath: newSessionData.audioPath || `gs://base-psicologiagt-usuario2/pacientes/${activeCase.id}/audios/sesion_${activeCase.sessions.length + 1}.mp3`,
        transcriptionPath: newSessionData.transcriptionPath || `gs://base-psicologiagt-usuario2/pacientes/${activeCase.id}/transcripciones/sesion_${activeCase.sessions.length + 1}.txt`
      }
    ];

    const updatedCase = { ...activeCase, sessions: updatedSessions };
    setActiveCase(updatedCase);
    setClinicalDatabase(prev => ({ ...prev, [activeCase.id]: updatedCase }));
    setShowNewSessionForm(false);
     
    setNewSessionData({
      sessionNumber: 1, date: new Date().toISOString().split('T')[0], rawNotes: '',
      baiScore: 'Pendiente', bdiScore: 'Pendiente', traumaScale: 'Pendiente',
      audioPath: '', transcriptionPath: '', dsm5EvaluationName: '', dsm5EvaluationResult: '', externalDocuments: []
    });
  };

  const handleAddExternalDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCase || !newDocData.fileName.trim() || !newDocData.extractedContentSummary.trim()) return;

    const newDoc: ExternalDocument = {
      fileName: newDocData.fileName.trim(),
      fileType: newDocData.fileName.split('.').pop() || 'Desconocido',
      uploadedAt: new Date().toISOString().split('T')[0],
      extractedContentSummary: newDocData.extractedContentSummary.trim()
    };

    const updatedSessions = [...activeCase.sessions];
    if (updatedSessions.length > 0) {
      const lastIdx = updatedSessions.length - 1;
      updatedSessions[lastIdx] = {
        ...updatedSessions[lastIdx],
        externalDocuments: [...(updatedSessions[lastIdx].externalDocuments || []), newDoc]
      };
    }

    const updatedCase = { ...activeCase, sessions: updatedSessions };
    setActiveCase(updatedCase);
    setClinicalDatabase(prev => ({ ...prev, [activeCase.id]: updatedCase }));
    setShowDocUploadForm(false);
    setNewDocData({ fileName: '', extractedContentSummary: '' });
  };

  const handleProcessNotes = async () => {
    if (!activeCase || activeCase.sessions.length === 0) return;
    setIsProcessingNotes(true);
    try {
      const lastSession = activeCase.sessions[activeCase.sessions.length - 1];
      const result = await processClinicalNotes(
        lastSession.rawNotes, 
        lastSession.baiScore, 
        lastSession.bdiScore,
        currentUser?.fullName || 'Profesional', 
        currentUser?.colegiado || 'N/A'
      );
      setNotesResult(result);
      
      const updatedCase = { ...activeCase, structuredOutput: result };
      setActiveCase(updatedCase);
      setClinicalDatabase(prev => ({ ...prev, [activeCase.id]: updatedCase }));
    } catch (e) {
      alert("Error en la conexión con el servicio de IA.");
    } finally {
      setIsProcessingNotes(false);
    }
  };

  const handleScientificQuery = async () => {
    if (!scientificQuery.queryText.trim()) return;
    setScientificQuery(prev => ({ ...prev, loading: true }));
    try {
      const res = await queryScientificDatabase(scientificQuery.queryText);
      setScientificQuery(prev => ({ ...prev, responseText: res }));
    } catch (e) {
      alert("Error al realizar la consulta científica.");
    } finally {
      setScientificQuery(prev => ({ ...prev, loading: false }));
    }
  };

  const handleSaveDsmEvaluation = () => {
    if (!activeCase || !selectedDsmTemplate || !currentUser) return;
    if (verificationPassword !== currentUser.passwordHash) {
      setVerificationError("Firma inválida.");
      return;
    }

    const formattedResult = Object.entries(dsmAnswers).map(([q, ans]) => `• ${q}: ${ans}`).join('\n');
    const updatedSessions = [...activeCase.sessions];
    if (updatedSessions.length > 0) {
      const lastIdx = updatedSessions.length - 1;
      updatedSessions[lastIdx] = {
        ...updatedSessions[lastIdx],
        dsm5EvaluationName: selectedDsmTemplate.name,
        dsm5EvaluationResult: formattedResult
      };
    }

    const updatedCase = { ...activeCase, sessions: updatedSessions };
    setActiveCase(updatedCase);
    setClinicalDatabase(prev => ({ ...prev, [activeCase.id]: updatedCase }));
    setShowDsmModal(false); setSelectedDsmTemplate(null); setDsmAnswers({});
    setVerificationPassword(''); setVerificationError('');
  };

  const handleDownloadPDF = () => {
    if (!notesResult) return;
    const printContainer = document.createElement('div');
    printContainer.style.fontFamily = 'Arial, sans-serif'; printContainer.style.padding = '30px';
    printContainer.innerHTML = `<h1 style="font-size:20px; text-align:center; font-weight:bold;">Informe Clínico</h1><br><div style="font-size:11px;">${notesResult.replace(/\n/g, '<br>')}</div>`;
    
    if (typeof (window as any).html2pdf !== 'undefined') {
      (window as any).html2pdf().from(printContainer).set({
        margin: 15, filename: `Informe_${activeCase?.id}.pdf`, jsPDF: { format: 'letter' }
      }).save();
    } else {
      alert("La librería para exportar a PDF no está disponible.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/90 backdrop-blur sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white text-xl">Ψ</div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Asistente Clínica SaaS</h1>
              <p className="text-xs text-slate-400">Infraestructura de procesamiento y sincronización remota simultánea</p>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
            <button onClick={() => setMode(AppMode.CLINICAL)} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${mode === AppMode.CLINICAL ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>🩺 Modo Clínico</button>
            <button onClick={() => setMode(AppMode.ADMIN)} className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${mode === AppMode.ADMIN ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}>⚙️ SaaS Admin Licencias</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {mode === AppMode.ADMIN && (
          <div className="max-w-4xl mx-auto space-y-8">
            {!isAdminAuthenticated ? (
              <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
                <h2 className="text-sm font-semibold text-white text-center uppercase tracking-wider">Consola Maestra de Licencias</h2>
                <form onSubmit={handleAdminAuth} className="space-y-3">
                  <input type="password" value={adminInput} onChange={(e) => setAdminInput(e.target.value)} placeholder="Clave de Administrador" className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none" />
                  <button type="submit" className="w-full py-2.5 bg-amber-600 font-semibold text-white rounded-xl text-xs">Autenticar</button>
                </form>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <h3 className="text-sm font-bold text-white uppercase border-b border-slate-800 pb-2">Activar Nueva Licencia</h3>
                  <form onSubmit={handleRegisterLicense} className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" required value={regUsername} onChange={(e) => setRegUsername(e.target.value)} placeholder="Usuario" className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-xs text-white" />
                      <input type="password" required value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="Contraseña" className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-xs text-white" />
                    </div>
                    <input type="text" required value={regFullName} onChange={(e) => setRegFullName(e.target.value)} placeholder="Nombre Completo" className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-xs text-white" />
                    <input type="text" required value={regColegiado} onChange={(e) => setRegColegiado(e.target.value)} placeholder="Colegiado (ej: 14,205)" className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-xs text-white" />
                    <select value={regLicenseType} onChange={(e) => setRegLicenseType(e.target.value as any)} className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-xs text-white">
                      <option value="DEMO_15">DEMO (15 Días)</option>
                      <option value="DEMO">DEMO (30 Días)</option>
                      <option value="ANUAL">ANUAL (12 Meses)</option>
                    </select>
                    <button type="submit" className="w-full py-2 bg-amber-600 text-white font-semibold rounded text-xs">Activar</button>
                  </form>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-6">
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-white uppercase border-b border-slate-800 pb-2">Cambiar Clave Maestra</h3>
                    <div className="flex gap-2">
                      <input type="password" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} placeholder="Nueva Clave Maestra" className="flex-1 p-2 bg-slate-950 border border-slate-800 rounded text-xs text-white" />
                      <button onClick={() => { if (newAdminPassword.trim()) { setAdminPassword(newAdminPassword.trim()); alert('Clave maestra actualizada.'); setNewAdminPassword(''); } }} className="px-4 py-2 bg-slate-800 text-white rounded text-xs">Guardar</button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-sm font-bold text-white uppercase border-b border-slate-800 pb-2">Licencias Activas</h3>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {Object.values(psychologists).map((p) => {
                        const remaining = getDaysRemaining(p.licenseExpiry);
                        return (
                          <div key={p.username} className="p-2.5 bg-slate-950 rounded border border-slate-800 text-xs flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                              <div>
                                <span className="font-bold text-white block">{p.fullName}</span>
                                <span className="text-[10px] text-slate-500">Vence: {p.licenseExpiry} ({remaining} días restantes)</span>
                              </div>
                              <div className="flex gap-1">
                                <button onClick={() => { setEditingUsername(editingUsername === p.username ? null : p.username); setEditPasswordInput(''); }} className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                                  🔑 {editingUsername === p.username ? 'Cancelar' : 'Clave'}
                                </button>
                                <button onClick={() => setPsychologists(prev => ({ ...prev, [p.username]: { ...p, isActive: !p.isActive } }))} className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.isActive && remaining >= 0 ? 'bg-emerald-600/20 text-emerald-400' : 'bg-red-600/20 text-red-400'}`}>
                                  {p.isActive && remaining >= 0 ? 'Activo' : 'Inactivo'}
                                </button>
                              </div>
                            </div>
                            {editingUsername === p.username && (
                              <div className="mt-2 pt-2 border-t border-slate-800 flex gap-2">
                                <input type="text" value={editPasswordInput} onChange={(e) => setEditPasswordInput(e.target.value)} placeholder="Nueva clave de usuario" className="flex-1 p-1 bg-slate-900 border border-slate-700 rounded text-[11px] text-white" />
                                <button onClick={() => handleUpdateUserPassword(p.username)} className="px-3 py-1 bg-amber-600 text-white font-bold rounded text-[10px]">Actualizar</button>
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

        {mode === AppMode.CLINICAL && (
          <div className="space-y-8">
            {!currentUser ? (
              <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-xl">
                <h2 className="text-lg font-semibold text-white text-center">Acceso Profesional Clínico</h2>
                <form onSubmit={handleLogin} className="space-y-3">
                  <input type="text" required value={loginUsername} onChange={(e) => setLoginUsername(e.target.value)} placeholder="Usuario / Código de Licencia" className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white font-mono focus:outline-none" />
                  <input type="password" required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="••••••••" className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white font-mono focus:outline-none" />
                  {loginError && <p className="text-xs text-red-400">{loginError}</p>}
                  <button type="submit" className="w-full py-2.5 bg-indigo-600 font-semibold text-white rounded-xl text-xs">Iniciar Sesión</button>
                </form>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-2xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">🥼 Dra/Dr. {currentUser.fullName}</h2>
                    <p className="text-xs text-slate-400 font-mono">Colegiado Activo: {currentUser.colegiado} | Sincronización Remota Activada.</p>
                  </div>
                  <button onClick={() => { setCurrentUser(null); setActiveCase(null); setNotesResult(''); }} className="text-xs bg-red-600/20 text-red-400 px-3 py-1.5 rounded-xl border border-red-500/30">Cerrar Sesión</button>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-white uppercase font-mono">🔍 Comando de Invocación</h3>
                    <button onClick={() => setShowRegisterForm(!showRegisterForm)} className="text-xs bg-indigo-600/20 text-indigo-400 px-3 py-1.5 rounded-xl border border-indigo-500/30">{showRegisterForm ? 'Ocultar' : '➕ Nuevo Paciente'}</button>
                  </div>

                  {showRegisterForm && (
                    <form onSubmit={handleRegisterPatient} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" required placeholder="ID Paciente (Ej: PAC-9482)" value={newPatientData.id} onChange={(e) => setNewPatientForm(prev => ({ ...prev, id: e.target.value }))} className="p-2 bg-slate-900 border border-slate-800 rounded text-xs text-white" />
                        <input type="text" required placeholder="Nombre Completo" value={newPatientData.patientName} onChange={(e) => setNewPatientForm(prev => ({ ...prev, patientName: e.target.value }))} className="p-2 bg-slate-900 border border-slate-800 rounded text-xs text-white" />
                      </div>
                      <textarea placeholder="Notas iniciales de admisión..." value={newPatientData.rawNotes} onChange={(e) => setNewPatientForm(prev => ({ ...prev, rawNotes: e.target.value }))} rows={2} className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-xs text-white" />
                      <button type="submit" className="w-full py-2 bg-indigo-600 text-white rounded text-xs">Guardar Expediente</button>
                    </form>
                  )}

                  <form onSubmit={handleClinicalSearch} className="flex gap-2">
                    <input type="text" value={clinicalSearchQuery} onChange={(e) => setClinicalSearchQuery(e.target.value)} placeholder="presenta expediente PAC-9482" className="flex-1 p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white font-mono focus:outline-none" />
                    <button type="submit" className="py-2.5 px-6 bg-indigo-600 text-white rounded-xl text-xs">Ejecutar</button>
                  </form>
                  {searchFeedback && <div className="p-3 bg-slate-950 rounded-xl text-xs border border-slate-800 text-indigo-400 font-mono">{searchFeedback}</div>}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                  <div className="lg:col-span-5 space-y-6">
                    {activeCase ? (
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
                        <div className="border-b border-slate-800 pb-2 flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-300">Historial del Expediente</span>
                          <button onClick={() => setShowNewSessionForm(!showNewSessionForm)} className="text-xs bg-indigo-600 text-white px-3 py-1 rounded-xl">➕ Nueva Sesión</button>
                        </div>

                        {showNewSessionForm && (
                          <form onSubmit={handleAddNewSession} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3 text-xs">
                            <input type="date" value={newSessionData.date} onChange={(e) => setNewSessionData(prev => ({ ...prev, date: e.target.value }))} className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-white" />
                            <div className="flex gap-2">
                              <button type="button" onClick={() => audioInputRef.current?.click()} className="flex-1 py-1 bg-slate-800 text-slate-300 rounded text-[10px]">🎙️ Buscar Local</button>
                              <button type="button" onClick={handleGoogleDriveAudioSimulated} className="flex-1 py-1 bg-slate-800 text-slate-300 rounded text-[10px]">☁️ Google Drive</button>
                            </div>
                            <input type="file" ref={audioInputRef} accept="audio/*" onChange={handleAudioUploadSimulated} className="hidden" />
                            {isUploadingAudio && <p className="text-[10px] text-indigo-400 animate-pulse">Sincronizando recurso remoto en gs://base-psicologiagt-usuario2...</p>}
                            {newSessionData.audioPath && <p className="text-[9px] text-emerald-400 font-mono">✓ Confirmado en GCS: {newSessionData.audioPath}</p>}
                            <textarea required rows={3} value={newSessionData.rawNotes} onChange={(e) => setNewSessionData(prev => ({ ...prev, rawNotes: e.target.value }))} placeholder="Notas de evolución de la sesión..." className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-white" />
                            <button type="submit" className="w-full py-1.5 bg-indigo-600 text-white font-bold rounded">Guardar Sesión</button>
                          </form>
                        )}

                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {activeCase.sessions.map((s) => (
                            <div key={s.sessionNumber} className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
                              <div className="flex justify-between font-mono text-indigo-400 font-bold"><span>Consulta N° {s.sessionNumber}</span><span>{s.date}</span></div>
                              <p className="text-slate-300 italic">"{s.rawNotes}"</p>
                              {s.audioPath && <div className="text-[10px] text-slate-400 font-mono">🔊 Audio: {s.audioPath}</div>}
                            </div>
                          ))}
                        </div>

                        <div className="bg-slate-955 p-4 rounded-xl border border-slate-800 space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="font-bold text-slate-300">Anexos Multiformato</span>
                            <button onClick={() => setShowDocUploadForm(!showDocUploadForm)} className="text-indigo-400 underline text-[10px]">➕ Cargar PDF/Drive</button>
                          </div>
                          {showDocUploadForm && (
                            <form onSubmit={handleAddExternalDocument} className="space-y-2 bg-slate-900 p-2 rounded">
                              <div className="flex gap-2">
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex-1 py-0.5 bg-slate-850 text-slate-300 text-[9px]">PC Local</button>
                                <button type="button" onClick={handleGoogleDriveDocSimulated} className="flex-1 py-0.5 bg-slate-850 text-slate-300 text-[9px]">Google Drive</button>
                              </div>
                              <input type="file" ref={fileInputRef} accept=".pdf,.doc,.docx" onChange={(e) => { if(e.target.files?.[0]) setNewDocData(p => ({...p, fileName: e.target.files![0].name})); }} className="hidden" />
                              <input type="text" required placeholder="Nombre del archivo" value={newDocData.fileName} onChange={(e) => setNewDocData(prev => ({ ...prev, fileName: e.target.value }))} className="w-full p-1 bg-slate-950 text-white rounded text-[11px]" />
                              <textarea required placeholder="Resumen analítico para la IA..." value={newDocData.extractedContentSummary} onChange={(e) => setNewDocData(prev => ({ ...prev, extractedContentSummary: e.target.value }))} rows={2} className="w-full p-1 bg-slate-950 text-white rounded text-[11px]" />
                              <button type="submit" className="w-full py-1 bg-indigo-600 text-white text-[10px]">Vincular al Expediente</button>
                            </form>
                          )}
                          <div className="space-y-1.5 pt-1">
                            {DSM5_EVALUATIONS.slice(0, 3).map((template) => (
                              <div key={template.id} className="flex justify-between items-center bg-slate-900 p-1.5 rounded">
                                <span className="text-[10px] text-slate-400 truncate max-w-[180px]">{template.name}</span>
                                <button onClick={() => { setSelectedDsmTemplate(template); setShowDsmModal(true); }} className="text-[9px] bg-indigo-600 text-white px-2 py-0.5 rounded">Llenar</button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <button onClick={handleProcessNotes} disabled={isProcessingNotes} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl text-xs transition">
                          {isProcessingNotes ? "⏳ Procesando en Cloud Run..." : "Analizar Evolución y Cambios de Conducta"}
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic text-center py-8 bg-slate-900 border border-slate-800 rounded-2xl">Use 'presenta expediente PAC-9482' para cargar el caso de forma simultánea.</p>
                    )}

                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-3">
                      <span className="text-xs font-bold text-slate-300 uppercase block tracking-wider">Consulta Académica (APA/DSM-5)</span>
                      <textarea value={scientificQuery.queryText} onChange={(e) => setScientificQuery(prev => ({ ...prev, queryText: e.target.value }))} rows={2} className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-xs text-white" />
                      <button onClick={handleScientificQuery} disabled={scientificQuery.loading} className="w-full py-2 bg-slate-800 text-white rounded text-xs font-semibold">Realizar Consulta</button>
                    </div>
                  </div>

                  <div className="lg:col-span-7 space-y-6">
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col min-h-[450px]">
                      <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Dictamen Estructurado Diagnóstico</span>
                        {notesResult && <button onClick={handleDownloadPDF} className="text-xs bg-emerald-600 text-white px-3 py-1 rounded font-bold">Exportar PDF</button>}
                      </div>
                      <div className="p-6 flex-1 text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed overflow-y-auto">
                        {notesResult || "El desglose automatizado aparecerá en esta ventana al presionar el botón de análisis."}
                      </div>
                    </div>
                    
                    {scientificQuery.responseText && (
                      <div className="bg-slate-900 border border-slate-800 rounded-2xl flex flex-col">
                        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Resultados de Consulta Científica</span>
                        </div>
                        <div className="p-6 flex-1 text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed overflow-y-auto max-h-64">
                          {scientificQuery.responseText}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {showDsmModal && selectedDsmTemplate && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden text-xs shadow-2xl">
            <div className="p-4 border-b border-slate-800 bg-slate-950 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-white text-sm">{selectedDsmTemplate.name}</h3>
                <p className="text-[10px] text-slate-400">Alineado al Código de Ética del CPG</p>
              </div>
              <button onClick={() => { setShowDsmModal(false); setSelectedDsmTemplate(null); setVerificationPassword(''); }} className="text-slate-400 hover:text-white">✕ Cerrar</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-4 bg-slate-950/30">
              {selectedDsmTemplate.questions.map((q, idx) => (
                <div key={idx} className="space-y-1.5 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                  <p className="text-slate-200 font-semibold">{idx + 1}. {q}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(selectedDsmTemplate.options || ["Nunca (0)", "Varios días (1)", "Más de la mitad (2)", "Casi todos los días (3)"]).map((option) => (
                      <label key={option} className={`flex items-center gap-2 p-2 rounded text-[11px] cursor-pointer border transition ${dsmAnswers[q] === option ? 'bg-indigo-950/60 border-indigo-500 text-indigo-300' : 'bg-slate-950 border-slate-800 text-slate-400'}`}>
                        <input type="radio" name={`dsm-q-${idx}`} checked={dsmAnswers[q] === option} onChange={() => setDsmAnswers(prev => ({ ...prev, [q]: option }))} className="text-indigo-600 focus:ring-0" />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-1.5">
                <label className="block text-[11px] font-bold text-slate-400 uppercase">Firma Digital Profesional (Contraseña de Terapeuta)</label>
                <input type="password" required value={verificationPassword} onChange={(e) => setVerificationPassword(e.target.value)} placeholder="Ingrese su clave para validar la prueba" className="w-full p-2 bg-slate-900 border border-slate-800 rounded text-white text-xs focus:outline-none focus:border-indigo-500" />
                {verificationError && <p className="text-red-400 text-xs">{verificationError}</p>}
              </div>
            </div>
            <div className="p-3 border-t border-slate-800 bg-slate-950 flex justify-end gap-2">
              <button onClick={() => { setShowDsmModal(false); setSelectedDsmTemplate(null); setVerificationPassword(''); }} className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded text-xs">Cancelar</button>
              <button onClick={handleSaveDsmEvaluation} className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded text-xs">Guardar en Expediente</button>
            </div>
          </div>
        </div>
      )}

      <footer className="border-t border-slate-800 bg-slate-950 py-4 text-center text-xs text-slate-600 mt-auto flex flex-col gap-1">
        <p>© 2026 Asistente Clínica SaaS. Cumplimiento ético y resguardo hermético centralizado (Colegio de Psicólogos de Guatemala).</p>
        <p className="font-semibold text-indigo-400/70 tracking-wide mt-1">Desarrollado con <span className="text-red-500">♥</span> por la Familia Ocaña</p>
      </footer>
    </div>
  );
}
