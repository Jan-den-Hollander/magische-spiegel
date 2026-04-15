/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GuidaSection } from './GuidaInstructions';
import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  Mic, 
  MicOff, 
  Volume2, 
  Sparkles, 
  Camera, 
  CameraOff, 
  ChevronRight, 
  RotateCcw,
  Settings,
  MessageSquare,
  Trophy,
  Save,
  Key
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface Message {
  role: 'user' | 'model';
  de: string;
  it: string;
  score?: number;
  heard?: string;
}

export default function App() {
  const [isCamOn, setIsCamOn] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [level, setLevel] = useState('A2');
  const [topic, setTopic] = useState('vita quotidiana');
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState('Pronto · Bereit');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [customKey, setCustomKey] = useState(localStorage.getItem('specchiomagico_api_key') || '');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const getAI = () => {
    const key = customKey || process.env.GEMINI_API_KEY || "";
    return new GoogleGenAI({ apiKey: key });
  };

  const saveCustomKey = (key: string) => {
    localStorage.setItem('specchiomagico_api_key', key);
    setCustomKey(key);
    setShowKeyModal(false);
    setStatus('Chiave API salvata! · Gespeichert!');
  };

  const prevMessagesLength = useRef(0);
  useEffect(() => {
    if (messages.length > prevMessagesLength.current || isThinking) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessagesLength.current = messages.length;
  }, [messages.length, isThinking]);

  const toggleCam = async () => {
    if (isCamOn) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      setIsCamOn(false);
      setStatus('Specchio disattivato · Spiegel deaktiviert');
    } else {
      try {
        setStatus('Avvio fotocamera...');
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Il browser non supporta la fotocamera.");
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setTimeout(() => {
            videoRef.current?.play().catch(e => console.error("Play error:", e));
          }, 100);
        }
        streamRef.current = stream;
        setIsCamOn(true);
        setStatus('Specchio attivo! ✨');
      } catch (err: any) {
        console.error("Camera error:", err);
        setStatus('Accesso alla fotocamera negato.');
        setIsCamOn(false);
      }
    }
  };

  // ✅ FIX 1: Alleen de Duitse tekst meegeven, geen Engelse instructie.
  // ✅ FIX 2: speechConfig met een echte Duitse stem (Kore) toegevoegd.
  const speakIt = async (text: string) => {
    if (!text) return;
    setIsSpeaking(true);
    setStatus('Der Spiegel spricht...');
    try {
      const aiInstance = getAI();
      const response = await aiInstance.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" }
            }
          }
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) { bytes[i] = binaryString.charCodeAt(i); }
        const int16Data = new Int16Array(bytes.buffer);
        const float32Data = new Float32Array(int16Data.length);
        for (let i = 0; i < int16Data.length; i++) { float32Data[i] = int16Data[i] / 32768.0; }
        const audioBuffer = audioContextRef.current.createBuffer(1, float32Data.length, 24000);
        audioBuffer.getChannelData(0).set(float32Data);
        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => { setIsSpeaking(false); setStatus('Druk op 🎤 om te antwoorden · Drücke 🎤 zum Antworten'); };
        source.start();
      } else {
        throw new Error("No audio data received");
      }
    } catch (err) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'de-DE';
      utterance.rate = 0.85;
      utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
      setStatus('Browser stem gebruikt (fallback)');
    }
  };

  const startRecording = () => {
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) { setStatus('Spraakherkenning niet ondersteund.'); return; }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch(e) {} }
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'de-DE';
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.onstart = () => { setIsRecording(true); setStatus('Luisteren... · Ich höre zu...'); };
      recognitionRef.current.onresult = (event: any) => { setIsRecording(false); processHeard(event.results[0][0].transcript); };
      recognitionRef.current.onerror = () => { setIsRecording(false); setStatus('Microfoon fout.'); };
      recognitionRef.current.onend = () => { setIsRecording(false); };
      recognitionRef.current.start();
    } catch (err: any) { setStatus('Microfoon kan niet starten.'); setIsRecording(false); }
  };

  const stopRecording = () => { recognitionRef.current?.stop(); setIsRecording(false); };

  const processHeard = async (heard: string) => {
    if (!heard.trim()) return;
    const lastModelMsg = messages.filter(m => m.role === 'model').pop();
    let currentScore = 0;
    if (lastModelMsg) {
      const similarity = calculateSimilarity(lastModelMsg.de, heard);
      if (similarity > 0.7) currentScore = 2; else if (similarity > 0.4) currentScore = 1;
      setScore(prev => prev + currentScore);
    }
    const userMsg: Message = { role: 'user', de: heard, it: '', heard: heard, score: currentScore };
    setMessages(prev => [...prev, userMsg]);
    generateAIResponse([...messages, userMsg]);
  };

  const calculateSimilarity = (s1: string, s2: string) => {
    const a = s1.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
    const b = s2.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return 0.8;
    return 0.5;
  };

  // ✅ FIX 3: Systeemprompt in het Duits, geen 'ph' (fonetiek) meer in het JSON.
  const generateAIResponse = async (history: Message[]) => {
    setIsThinking(true);
    setStatus('Der Spiegel denkt nach...');
    const systemPrompt = `Du bist ein freundlicher Gesprächspartner auf Deutsch — wie ein Zauberspiegel.
Niveau: ${level}. Aktuelles Thema: ${topic}.
REGELN: Nur ein kurzer Satz auf Deutsch pro Antwort (max. 12 Wörter). Stelle immer eine Frage am Ende.
Antworte NUR mit gültigem JSON, ohne Erklärungen oder Markdown: {"de":"deutscher Satz","it":"traduzione italiana"}`;

    const contents = history.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.role === 'user' ? m.de : JSON.stringify({ de: m.de, it: m.it }) }]
    }));

    try {
      const aiInstance = getAI();
      const response = await aiInstance.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents.length > 0 ? contents : [{ role: 'user', parts: [{ text: 'Beginne das Gespräch.' }] }],
        config: { systemInstruction: systemPrompt, responseMimeType: "application/json" },
      });
      const data = JSON.parse(response.text || "{}");
      // ✅ FIX 4: Geen 'ph' meer in het Message object.
      const aiMsg: Message = { role: 'model', de: data.de || "Hallo!", it: data.it || "Ciao!" };
      setMessages(prev => [...prev, aiMsg]);
      setIsThinking(false);
      speakIt(aiMsg.de);
    } catch (err) {
      setIsThinking(false);
      setStatus('Oeps, de spiegel is beslagen.');
    }
  };

  const startNewConversation = () => { setMessages([]); setScore(0); generateAIResponse([]); };

  const downloadTranscript = () => {
    if (messages.length === 0) return;
    const transcript = messages.map(m => `[${m.role === 'user' ? 'JIJ' : 'SPIEGEL'}]\nDE: ${m.de}\nIT: ${m.it || '-'}\n`).join('\n---\n\n');
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `gesprek.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen w-full bg-[#080810] text-[#f5f0e8] font-sans selection:bg-[#c9a84c]/30 flex flex-col pb-8">
      <div className="flex flex-col max-w-md mx-auto w-full px-4 pt-4 relative z-10">

        {/* Header */}
        <header className="text-center pb-4">
          <motion.h1
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
            className="font-serif text-3xl font-light tracking-widest text-[#e8c97a] drop-shadow-[0_0_20px_rgba(201,168,76,0.3)]"
          >
            Specchio Magico
          </motion.h1>
          <a
            href="#guida"
            className="text-[0.55rem] tracking-[0.15em] uppercase opacity-40 hover:opacity-80 transition-opacity mt-1 block"
            style={{ color: 'inherit' }}
          >
            Come iniziare · Hoe te beginnen · How to start ↓
          </a>
          <p className="text-[0.6rem] tracking-[0.2em] uppercase text-[#c9a84c]/50 mt-1">
            Il tuo partner tedesco
          </p>
        </header>

        {/* Mirror */}
        <div className="relative mx-auto w-full max-w-[200px] aspect-[3/4] mb-5">
          <div className="absolute inset-0 bg-gradient-to-br from-[#7a5810] via-[#c9a84c] to-[#5a3e08] rounded-[50%_50%_46%_46%_/_28%_28%_72%_72%] p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.8)]">
            <div className="w-full h-full bg-[#111128] rounded-[47%_47%_44%_44%_/_26%_26%_74%_74%] overflow-hidden relative">
              <video
                ref={videoRef} autoPlay playsInline muted
                className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-1000 ${isCamOn ? 'opacity-100' : 'opacity-0'}`}
              />
              <AnimatePresence>
                {!isCamOn && (
                  <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center text-center p-4"
                  >
                    <Sparkles className="w-8 h-8 text-[#c9a84c] mb-2 animate-pulse" />
                    <small className="text-[#c9a84c]/60 text-[0.6rem] uppercase tracking-wider leading-relaxed">Specchio spento</small>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
          <button
            type="button" onClick={(e) => { e.preventDefault(); toggleCam(); }}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#080810] border border-[#c9a84c]/30 px-3 py-1.5 rounded-full text-[0.55rem] tracking-widest uppercase text-[#c9a84c]/80 flex flex-col items-center gap-0.5 z-20 w-[130px] text-center"
          >
            <div className="flex items-center gap-1.5">
              {isCamOn ? <CameraOff size={10} /> : <Camera size={10} />}
              <span>{isCamOn ? 'Spegni Specchio' : 'Accendi Specchio'}</span>
            </div>
            <span className="text-[0.45rem] opacity-60">{isCamOn ? 'Deaktivieren' : 'Aktivieren'}</span>
          </button>
        </div>

        {/* Settings */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div className="space-y-1">
            <label className="text-[0.55rem] uppercase tracking-widest text-[#c9a84c]/50 ml-1 flex items-center gap-1">
              <Settings size={8} /> Livello · Stufe
            </label>
            <select
              value={level} onChange={(e) => setLevel(e.target.value)}
              className="w-full bg-[#c9a84c]/5 border border-[#c9a84c]/20 rounded-lg px-2 py-2 text-[0.7rem] outline-none text-[#e8c97a]"
            >
              <option value="A1">A1 - Principiante</option>
              <option value="A2">A2 - Elementare</option>
              <option value="B1">B1 - Intermedio</option>
              <option value="B2">B2 - Avanzato</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[0.55rem] uppercase tracking-widest text-[#c9a84c]/50 ml-1 flex items-center gap-1">
              <MessageSquare size={8} /> Argomento · Thema
            </label>
            <select
              value={topic} onChange={(e) => setTopic(e.target.value)}
              className="w-full bg-[#c9a84c]/5 border border-[#c9a84c]/20 rounded-lg px-2 py-2 text-[0.7rem] outline-none text-[#e8c97a]"
            >
              <option value="vita quotidiana">Vita Quotidiana</option>
              <option value="ristorante">Ristorante</option>
              <option value="viaggi">Viaggi</option>
              <option value="famiglia">Famiglia</option>
              <option value="lavoro">Lavoro</option>
            </select>
          </div>
        </div>

        {/* Action Row */}
        <div className="flex items-center justify-center gap-6 mb-2">
          <div className="flex flex-col items-center gap-1">
            <button
              type="button" onClick={() => messages.length > 0 && speakIt(messages[messages.length-1].de)}
              className="w-10 h-10 rounded-full bg-[#c9a84c]/10 border border-[#c9a84c]/20 flex items-center justify-center text-[#c9a84c]"
            >
              <Volume2 size={16} />
            </button>
            <span className="text-[0.5rem] uppercase tracking-widest text-[#c9a84c]/60 text-center leading-tight">
              Riascolta<br/><span className="text-[#c9a84c]/40">Wiederholen</span>
            </span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <button
              type="button" onClick={isRecording ? stopRecording : startRecording}
              className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl ${
                isRecording ? 'bg-red-500/20 border-2 border-red-500 animate-pulse' : 'bg-gradient-to-br from-[#c9a84c] to-[#8b6010]'
              }`}
            >
              {isRecording ? <MicOff size={24} className="text-red-500" /> : <Mic size={24} className="text-[#080810]" />}
            </button>
            <span className={`text-[0.55rem] uppercase tracking-widest font-bold text-center leading-tight ${isRecording ? 'text-red-500' : 'text-[#c9a84c]'}`}>
              {isRecording ? <>Luisteren...<br/><span className="opacity-60">Zuhören</span></> : <>Rispondi<br/><span className="opacity-60">Antworten</span></>}
            </span>
          </div>

          <div className="flex flex-col items-center gap-1">
            <button
              type="button" onClick={() => generateAIResponse(messages)}
              className="w-10 h-10 rounded-full bg-[#c9a84c]/10 border border-[#c9a84c]/20 flex items-center justify-center text-[#c9a84c]"
            >
              <ChevronRight size={16} />
            </button>
            <span className="text-[0.5rem] uppercase tracking-widest text-[#c9a84c]/60 text-center leading-tight">
              Salta<br/><span className="text-[#c9a84c]/40">Überspringen</span>
            </span>
          </div>
        </div>

        <div className="text-center mb-3">
          <p className="text-[0.65rem] text-[#c9a84c]/60 min-h-[1em] italic font-medium">{status}</p>
        </div>

        {/* Chat */}
        <div className="w-full h-[35vh] min-h-[250px] bg-black/30 border border-[#c9a84c]/10 rounded-xl overflow-y-auto p-3 space-y-3 scrollbar-thin mb-4">
          {messages.map((msg, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[90%] px-3 py-2 rounded-xl text-[0.8rem] leading-relaxed ${msg.role === 'user' ? 'bg-white/5 border border-white/10 rounded-br-none italic text-white/80' : 'bg-gradient-to-br from-[#c9a84c]/10 to-[#c9a84c]/5 border border-[#c9a84c]/20 rounded-bl-none'}`}>
                {msg.role === 'model' ? (
                  <>
                    {/* ✅ FIX 5: Alleen de Duitse zin en Italiaanse vertaling tonen. Geen fonetiek meer. */}
                    <span className="font-serif italic text-base text-[#e8c97a] block mb-0.5">{msg.de}</span>
                    <span className="text-[0.65rem] text-white/40 block leading-tight">{msg.it}</span>
                  </>
                ) : (
                  <>
                    <span>{msg.de}</span>
                    {msg.score !== undefined && (
                      <div className={`mt-1.5 text-[0.55rem] font-bold uppercase px-1.5 py-0.5 rounded-sm inline-block ${msg.score === 2 ? 'bg-green-500/10 text-green-400' : msg.score === 1 ? 'bg-yellow-500/10 text-yellow-400' : 'bg-red-500/10 text-red-400'}`}>
                        {msg.score === 2 ? '✓ Ottimo!' : msg.score === 1 ? '~ Bijna!' : '↻ Probeer opnieuw'}
                      </div>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          ))}
          {isThinking && (
            <div className="flex gap-1.5 p-2 bg-[#c9a84c]/5 border border-[#c9a84c]/10 rounded-xl rounded-bl-none w-12">
              <div className="w-1 h-1 bg-[#c9a84c] rounded-full animate-bounce" />
              <div className="w-1 h-1 bg-[#c9a84c] rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="w-1 h-1 bg-[#c9a84c] rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Onderaan */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-[#c9a84c]/10 pb-3">
            <div className="flex items-center gap-1.5 text-[#c9a84c]/60 text-[0.6rem] uppercase tracking-widest">
              <Trophy size={12} /> Punteggio · Punkte
            </div>
            <div className="text-[#c9a84c] font-bold text-lg">⭐ {score}</div>
          </div>

          <button
            type="button" onClick={startNewConversation}
            className="w-full py-3 border border-[#c9a84c]/30 bg-[#c9a84c]/5 rounded-xl text-[0.7rem] tracking-[0.2em] uppercase text-[#c9a84c] hover:bg-[#c9a84c]/10 flex flex-col items-center justify-center gap-1"
          >
            <div className="flex items-center gap-2"><RotateCcw size={14} /> Nuova Conversazione</div>
            <span className="text-[0.55rem] opacity-60">Neues Gespräch</span>
          </button>

          <div className="flex gap-2">
            <button
              type="button" onClick={downloadTranscript}
              className="flex-1 py-2 border border-[#c9a84c]/10 rounded-lg text-[0.6rem] tracking-widest uppercase text-[#c9a84c]/60 hover:text-[#c9a84c] flex flex-col items-center gap-0.5"
            >
              <div className="flex items-center gap-1"><Save size={12} /> Salva</div>
              <span className="text-[0.45rem] opacity-60">Speichern</span>
            </button>
            <button
              type="button" onClick={() => setShowKeyModal(true)}
              className="px-4 py-2 border border-[#c9a84c]/10 rounded-lg text-[0.6rem] text-[#c9a84c]/60 hover:text-[#c9a84c] flex flex-col items-center gap-0.5"
            >
              <Key size={12} />
              <span className="text-[0.45rem] opacity-60 uppercase tracking-widest">API</span>
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showKeyModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-[#12122a] border border-[#c9a84c]/30 p-6 rounded-2xl w-full max-w-xs shadow-2xl">
              <h2 className="font-serif text-xl text-[#e8c97a] mb-2 text-center">API Key</h2>
              <input type="password" defaultValue={customKey} id="keyInput" className="w-full bg-black/40 border border-[#c9a84c]/20 rounded-lg px-4 py-2.5 text-sm mb-4 outline-none text-white" />
              <div className="flex gap-2">
                <button onClick={() => setShowKeyModal(false)} className="flex-1 py-2 text-xs text-[#c9a84c]/50 border border-transparent rounded-lg">Annulla</button>
                <button onClick={() => { saveCustomKey((document.getElementById('keyInput') as HTMLInputElement).value); }} className="flex-1 py-2 bg-gradient-to-r from-[#c9a84c] to-[#8b6010] rounded-lg text-[#080810] text-xs font-bold">Salva</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <GuidaSection accentColor="#c9a84c" />
      <div style={{
        textAlign: 'center',
        padding: '1.5rem 1rem 2rem',
        fontSize: '0.72rem',
        lineHeight: 1.8,
        color: 'white',
        opacity: 0.85,
      }}>
        🇮🇹 Questa app è gratuita. Se la usi spesso, ti consigliamo di creare la tua chiave API personale — è facile e gratuita su aistudio.google.com.<br /><br />
        🇳🇱 Deze app is gratis. Gebruik je hem regelmatig, maak dan je eigen API-sleutel aan — eenvoudig en gratis via aistudio.google.com.<br /><br />
        🇬🇧 This app is free to use. If you use it regularly, we recommend creating your own API key — quick and free at aistudio.google.com.
      </div>
    </div>
  );
}
