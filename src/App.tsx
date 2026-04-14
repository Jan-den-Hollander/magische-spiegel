/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Magische Spiegel - Groq + Browser TTS Versie
 */
import { GuidaSection } from './GuidaInstructions';
import { useState, useRef, useEffect } from 'react';
import Groq from 'groq-sdk';
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

// Initialiseren van Groq client (wordt dynamisch aangemaakt met de key)
// Let op: De Groq SDK is async-friendly, maar we maken de client per call om keys te kunnen wisselen.

interface Message {
  role: 'user' | 'model';
  de: string;
  it: string;
  ph?: string;
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
  // Wijziging: Opslagnaam voor Groq key
  const [customKey, setCustomKey] = useState(localStorage.getItem('specchiomagico_groq_key') || '');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  // AudioContext is niet meer nodig voor de AI-audio, maar handig voor toekomstige effecten

  // Helper om de Groq client te maken met de juiste key
  const getGroqClient = () => {
    const key = customKey || process.env.NEXT_PUBLIC_GROQ_API_KEY || "";
    if (!key) {
      alert("Voer eerst een Groq API Key in!");
      setShowKeyModal(true);
      throw new Error("Geen API key gevonden");
    }
    return new Groq({ apiKey: key });
  };

  const saveCustomKey = (key: string) => {
    // Opslaan als Groq key
    localStorage.setItem('specchiomagico_groq_key', key);
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

  // --- VERANDERD: Simpele Browser TTS (Geen API kosten) ---
  const speakIt = async (text: string) => {
    if (!text) return;
    setIsSpeaking(true);
    setStatus('Lo specchio parla... · Der Spiegel spricht...');
    
    // Annuleer eventuele vorige spraak
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE'; // Duitse taal
    utterance.rate = 0.9; // Iets langzamer voor duidelijkheid
    utterance.pitch = 1.0;

    // Zoek een specifieke Duitse stem als die beschikbaar is (optioneel, verbetert kwaliteit)
    const voices = window.speechSynthesis.getVoices();
    const germanVoice = voices.find(v => v.lang.includes('de-DE') || v.lang.includes('de_DE'));
    if (germanVoice) {
      utterance.voice = germanVoice;
    }

    utterance.onend = () => { 
      setIsSpeaking(false); 
      setStatus('Premi 🎤 per rispondere'); 
    };
    
    utterance.onerror = (e) => {
      console.error("TTS Error:", e);
      setIsSpeaking(false);
      setStatus('Errore voce.');
    };

    window.speechSynthesis.speak(utterance);
  };

  const startRecording = () => {
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) { setStatus('Riconoscimento vocale non supportato.'); return; }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch(e) {} }
      
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'de-DE';
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      
      recognitionRef.current.onstart = () => { 
        setIsRecording(true); 
        setStatus('Ascolto... · Ich höre zu...'); 
      };
      
      recognitionRef.current.onresult = (event: any) => { 
        setIsRecording(false); 
        processHeard(event.results[0][0].transcript); 
      };
      
      recognitionRef.current.onerror = (event: any) => { 
        setIsRecording(false); 
        setStatus(`Errore microfono: ${event.error}`); 
      };
      
      recognitionRef.current.onend = () => { 
        setIsRecording(false); 
      };
      
      recognitionRef.current.start();
    } catch (err: any) { 
      setStatus('Impossibile avviare il microfono.'); 
      setIsRecording(false); 
    }
  };

  const stopRecording = () => { 
    recognitionRef.current?.stop(); 
    setIsRecording(false); 
  };

  const processHeard = async (heard: string) => {
    if (!heard.trim()) return;
    
    // Score berekening (optioneel, houdt de logica intact)
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

  // --- VERANDERD: Groq API Call (Alleen tekst) ---
  const generateAIResponse = async (history: Message[]) => {
    setIsThinking(true);
    setStatus('Lo specchio pensa... · Der Spiegel denkt nach...');
    
    // System prompt voor Groq (Llama 3)
    const systemPrompt = `Sei un simpatico partner di conversazione in tedesco — come uno specchio magico che parla.
    Livello: ${level}. Argomento attuale: ${topic}.
    REGOLE: 
    1. UNA frase breve in tedesco per turno (max 12 parole).
    2. Termina sempre con una domanda.
    3. RISPONDI SOLO con JSON valido: {"de":"frase in tedesco","it":"traduzione italiana","ph":"fonetica semplificata"}`;

    // Bouw de messages array voor Groq
    // Groq verwacht: { role: 'system'|'user'|'assistant', content: '...' }
    const groqMessages: any[] = [
      { role: 'system', content: systemPrompt }
    ];

    history.forEach(m => {
      if (m.role === 'user') {
        groqMessages.push({ role: 'user', content: m.de });
      } else {
        // Voor assistant, stuur de JSON string terug zodat de context behouden blijft
        groqMessages.push({ role: 'assistant', content: JSON.stringify({ de: m.de, it: m.it, ph: m.ph }) });
      }
    });

    // Als het eerste bericht is, voeg een trigger toe
    if (history.length === 0) {
      groqMessages.push({ role: 'user', content: 'Inizia la conversazione.' });
    }

    try {
      const groq = getGroqClient();
      
      // Gebruik een snel model zoals Llama 3.1 8b Instant
      const completion = await groq.chat.completions.create({
        model: "llama-3.1-8b-instant", 
        messages: groqMessages,
        temperature: 0.7,
        max_tokens: 100, // Houdt het kort
        response_format: { type: "json_object" }, // Forceer JSON output
      });

      const rawText = completion.choices?.[0]?.message?.content;
      if (!rawText) throw new Error("Geen antwoord ontvangen");

      const data = JSON.parse(rawText);
      
      const aiMsg: Message = { 
        role: 'model', 
        de: data.de || "Hallo!", 
        it: data.it || "Ciao!", 
        ph: data.ph || "" 
      };
      
      setMessages(prev => [...prev, aiMsg]);
      setIsThinking(false);
      
      // Roep de simpele Browser TTS aan
      speakIt(aiMsg.de);

    } catch (err: any) {
      console.error("Groq Error:", err);
      setIsThinking(false);
      setStatus('Ops, lo specchio è appannato. (Controlla la API Key)');
    }
  };

  const startNewConversation = () => { 
    setMessages([]); 
    setScore(0); 
    generateAIResponse([]); 
  };

  const downloadTranscript = () => {
    if (messages.length === 0) return;
    const transcript = messages.map(m => `[${m.role === 'user' ? 'TU' : 'SPECCHIO'}]\nDE: ${m.de}\nIT: ${m.it || '-'}\n`).join('\n---\n\n');
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `conversazione_groq.txt`;
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
            Il tuo partner tedesco (Powered by Groq)
          </p>
        </header>

        {/* Mirror */}
        <div className="relative mx-auto w-full max-w-[200px] aspect-[3/4] mb-5">
          <div className="absolute inset-0 bg-gradient-to-br from-[#7a5810] via-[#c9a84c] to-[#5a3e08] rounded-[50%_50%_46%_46%_/_28%_28%_72%_72%] p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.8)]">
            <div className="w-full h-full bg-[#111128] rounded-[47%_47%_44%_44%_/_26%_26%_74%_74%] overflow-hidden relative">
              <video
                ref={videoRef} autoPlay playsInline muted
                className={`w-full h-full object-cover scale-x-[-1] transition-opacity duration-1000 ${isCamOn ? 'o
