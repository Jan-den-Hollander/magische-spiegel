/**
 * Magische Spiegel — Verjaardagsspiegel voor Kinderen
 * Efteling / Anton Piek stijl  ·  v4
 * Wijzigingen v4:
 *  - Vriendelijkere foutmelding: "De spiegel kan nu niet antwoorden. Het is druk op de server. Probeer het later opnieuw!"
 *  - Foutmelding wordt automatisch voorgelezen
 *  - Opnieuw-knop verschijnt bij fout zodat kind weet wat te doen
 */
import { useState, useRef, useEffect } from 'react';
import { Key } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ── API sleutel: Vercel env variabele heeft voorrang ──────────────────────
const ENV_KEY = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ANTHROPIC_KEY) || '';

// ── Retry helper ──────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function fetchWithRetry(fn, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await Promise.race([
        fn(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
      ]);
    } catch (err) {
      const isLast = attempt === maxAttempts;
      const isRetryable = err?.message?.includes('timeout') ||
                          err?.message?.includes('503') ||
                          err?.message?.includes('overloaded') ||
                          err?.message?.includes('network');
      if (isLast || !isRetryable) throw err;
      await sleep(attempt * 1500);
    }
  }
}

// ── Browser TTS met stemkeuze en failsafe ────────────────────────────────
const getVoices = () => new Promise(resolve => {
  const v = window.speechSynthesis.getVoices();
  if (v.length) { resolve(v); return; }
  window.speechSynthesis.onvoiceschanged = () => resolve(window.speechSynthesis.getVoices());
  setTimeout(() => resolve(window.speechSynthesis.getVoices()), 1500);
});

async function speakWithFallback(text, langCode = 'nl', onEnd = () => {}) {
  if (!text) { onEnd(); return; }
  window.speechSynthesis.cancel();
  const voices = await getVoices();
  const pick = voices.find(v => v.lang.startsWith(langCode) && /female|woman|vrouw/i.test(v.name))
    || voices.find(v => v.lang.startsWith(langCode))
    || voices.find(v => v.lang.startsWith('nl'))
    || voices[0];
  const utt = new SpeechSynthesisUtterance(text);
  if (pick) utt.voice = pick;
  utt.lang = { nl:'nl-NL', en:'en-GB', fr:'fr-FR', de:'de-DE' }[langCode] || 'nl-NL';
  utt.rate = 0.88; utt.pitch = 1.1;
  utt.onend = onEnd; utt.onerror = onEnd;
  window.speechSynthesis.speak(utt);
  // Failsafe: sommige browsers vuren onend nooit
  setTimeout(() => { try { window.speechSynthesis.cancel(); } catch {} }, text.length * 70 + 3000);
}

// ── Constanten ────────────────────────────────────────────────────────────
const STEP = { NAME: 'name', DATE: 'date', DONE: 'done' };
const LANG_LABELS = { nl: '🇳🇱 NL', en: '🇬🇧 EN', fr: '🇫🇷 FR', de: '🇩🇪 DE' };
const LANG_CODE   = { nl: 'nl', en: 'en', fr: 'fr', de: 'de' };

const SPOKEN_Q = {
  name: 'Ik ben de Magische Spiegel. Vertel mij eens, hoe heet jij?',
  date: (name) => `Fijn om je te ontmoeten, ${name}! Wanneer ben jij geboren? Zeg of typ je verjaardag.`,
};

// ── Prompt ────────────────────────────────────────────────────────────────
const buildPrompt = (name, day, month, daysUntil) => {
  const maand = ['januari','februari','maart','april','mei','juni',
    'juli','augustus','september','oktober','november','december'][month - 1];
  let timing = '';
  if (daysUntil === 0)               timing = 'VANDAAG is de verjaardag!';
  else if (daysUntil > 0 && daysUntil <= 7)  timing = `Over ${daysUntil} dag${daysUntil===1?'':'en'} is de verjaardag.`;
  else if (daysUntil < 0 && daysUntil >= -7) timing = `De verjaardag was ${Math.abs(daysUntil)} dag${Math.abs(daysUntil)===1?'':'en'} geleden.`;

  return `Je bent de Magische Spiegel uit een betoverd sprookjesbos. Spreek warm, vrolijk en kindvriendelijk.

Kind: ${name} | Verjaardag: ${day} ${maand} | ${timing}

Geef een persoonlijke verjaardagsboodschap (max 3 zinnen) én precies 2 of 3 echte historische feitjes van ${day} ${maand} die kinderen leuk vinden (artiesten, dieren, speelgoed, pretparken, tekenfilms, uitvindingen).

Antwoord ALLEEN als JSON zonder markdown:
{"nl":"...","en":"...","fr":"...","de":"...","facts":[{"year":1984,"nl":"...","en":"...","fr":"...","de":"..."}]}`;
};

// ── Ornate spiegellijst SVG ───────────────────────────────────────────────
function OrnateFrame({ W = 270, H = 330 }) {
  const cx = W / 2, cy = H / 2;
  const rx = cx - 10, ry = cy - 10;

  const rozetPos = [
    [cx, cy - ry], [cx, cy + ry],
    [cx - rx * 0.86, cy - ry * 0.5], [cx + rx * 0.86, cy - ry * 0.5],
    [cx - rx * 0.86, cy + ry * 0.5], [cx + rx * 0.86, cy + ry * 0.5],
  ];

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}
      style={{ position:'absolute', inset:0, pointerEvents:'none', zIndex:2 }}>
      <defs>
        <linearGradient id="gG1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#fff0a0"/>
          <stop offset="25%"  stopColor="#d4a017"/>
          <stop offset="55%"  stopColor="#b8860b"/>
          <stop offset="80%"  stopColor="#f0c040"/>
          <stop offset="100%" stopColor="#8B6914"/>
        </linearGradient>
        <linearGradient id="gG2" x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%"   stopColor="#ffe566"/>
          <stop offset="50%"  stopColor="#c49a0c"/>
          <stop offset="100%" stopColor="#f5e642"/>
        </linearGradient>
        <filter id="gGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2.5" result="b"/>
          <feComposite in="SourceGraphic" in2="b" operator="over"/>
        </filter>
        <filter id="softG">
          <feGaussianBlur stdDeviation="3" result="b"/>
          <feComposite in="SourceGraphic" in2="b" operator="over"/>
        </filter>
      </defs>

      {/* Drie ringen — dubbele-lijn effect */}
      <ellipse cx={cx} cy={cy} rx={rx}    ry={ry}    fill="none" stroke="url(#gG1)" strokeWidth="7"/>
      <ellipse cx={cx} cy={cy} rx={rx-9}  ry={ry-9}  fill="none" stroke="url(#gG2)" strokeWidth="2" opacity="0.72"/>
      <ellipse cx={cx} cy={cy} rx={rx-15} ry={ry-15} fill="none" stroke="#f5e642"   strokeWidth="0.8" opacity="0.32"/>

      {/* 🪞 in gouden cirkel bovenin */}
      <circle cx={cx} cy={15} r={20} fill="url(#gG1)" filter="url(#gGlow)"/>
      <circle cx={cx} cy={15} r={16} fill="#180e04" opacity="0.75"/>
      <text x={cx} y={21} textAnchor="middle" fontSize="17" filter="url(#softG)">🪞</text>
      {/* verbindingslijn cirkel → ellips */}
      <line x1={cx} y1={35} x2={cx} y2={cy-ry} stroke="url(#gG1)" strokeWidth="3"/>
      <circle cx={cx} cy={35} r={4} fill="url(#gG1)"/>

      {/* Bladranken links */}
      {[0.32, 0.5, 0.68].map((frac, i) => {
        const y = cy - ry + 2 * ry * frac;
        const xL = cx - rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)) - 2;
        return (
          <g key={`l${i}`}>
            <path d={`M${xL} ${y} Q${xL-14} ${y-9} ${xL-11} ${y-21}`}
              fill="none" stroke="url(#gG1)" strokeWidth="2.4" opacity="0.68"/>
            <circle cx={xL-11} cy={y-21} r={3} fill="#f0c040" opacity="0.68"/>
          </g>
        );
      })}
      {/* Bladranken rechts */}
      {[0.32, 0.5, 0.68].map((frac, i) => {
        const y = cy - ry + 2 * ry * frac;
        const xR = cx + rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2)) + 2;
        return (
          <g key={`r${i}`}>
            <path d={`M${xR} ${y} Q${xR+14} ${y-9} ${xR+11} ${y-21}`}
              fill="none" stroke="url(#gG1)" strokeWidth="2.4" opacity="0.68"/>
            <circle cx={xR+11} cy={y-21} r={3} fill="#f0c040" opacity="0.68"/>
          </g>
        );
      })}

      {/* Onderkant boog */}
      <path d={`M${cx-42} ${H-13} Q${cx} ${H-3} ${cx+42} ${H-13}`}
        fill="none" stroke="url(#gG1)" strokeWidth="3"/>
      <circle cx={cx} cy={H-5} r={5} fill="url(#gG1)"/>
      {[-22,22].map((dx,i) => <circle key={i} cx={cx+dx} cy={H-11} r={3} fill="#d4a017" opacity="0.68"/>)}

      {/* Rozetten */}
      {rozetPos.map(([x, y], i) => (
        <g key={i} transform={`translate(${x},${y})`} filter="url(#softG)">
          {[0,45,90,135].map((a,j) => (
            <line key={j} x1={0} y1={0}
              x2={Math.cos(a*Math.PI/180)*10} y2={Math.sin(a*Math.PI/180)*10}
              stroke="#d4a017" strokeWidth="1.5" opacity="0.58"/>
          ))}
          <circle r={6} fill="url(#gG1)"/>
          <circle r={3} fill="#fff8c0" opacity="0.82"/>
        </g>
      ))}
    </svg>
  );
}

// ── Vuurvliegjes ──────────────────────────────────────────────────────────
const FIREFLIES = Array.from({ length: 16 }, (_, i) => ({
  id: i, x: Math.random()*100, y: Math.random()*100,
  delay: Math.random()*4, dur: 3 + Math.random()*3,
  dx: (Math.random()-0.5)*60, dy: (Math.random()-0.5)*40,
}));

// ── Magische deeltjes (in spiegel na resultaat) ───────────────────────────
const PARTICLES = Array.from({ length: 10 }, (_, i) => ({
  id: i, x: 10+Math.random()*80, y: 10+Math.random()*80,
  size: 4+Math.random()*7, delay: Math.random()*3, dur: 2+Math.random()*2,
  color: ['#f5e642','#fff8c0','#ffb347','#ff9de2','#a8edea'][i%5],
}));

// ── Setup overlay (in de spiegel) ─────────────────────────────────────────
function SetupOverlay({ step, name, setName, birthInput, setBirthInput,
  onListen, isListening, listenTarget, onConfirm }) {

  const isName = step === STEP.NAME;

  return (
    <motion.div key={step}
      initial={{ opacity:0, scale:0.92 }} animate={{ opacity:1, scale:1 }}
      exit={{ opacity:0, scale:0.92 }}
      style={{
        position:'absolute', inset:0,
        display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        padding:'16px 18px',
        background:'rgba(14,7,28,0.94)',
        borderRadius:'50% 50% 47% 47%',
        zIndex:10, gap:10,
      }}
    >
      <div style={{ fontSize:26 }}>{isName ? '👋' : '🎂'}</div>

      <p style={{
        color:'#f5e642', fontSize:12, textAlign:'center', margin:0,
        lineHeight:1.55, fontFamily:"'IM Fell English', serif",
        textShadow:'0 0 10px rgba(245,230,66,0.48)',
      }}>
        {isName
          ? 'Ik ben de Magische Spiegel. Hoe heet jij?'
          : `Wanneer ben jij geboren, ${name}?`}
      </p>

      <input
        value={isName ? name : birthInput}
        onChange={e => isName ? setName(e.target.value) : setBirthInput(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onConfirm()}
        placeholder={isName ? 'Typ je naam...' : '15-04 of 15-04-2015'}
        inputMode={isName ? 'text' : 'numeric'}
        autoFocus
        style={{
          background:'rgba(245,230,66,0.07)',
          border:'1px solid rgba(245,230,66,0.38)',
          borderRadius:12, padding:'8px 12px',
          color:'#f5e642', fontSize:15, textAlign:'center',
          outline:'none', fontFamily:"'IM Fell English', serif",
          width:'85%',
        }}
      />

      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        {/* Microfoon */}
        <button
          onClick={() => onListen(step)}
          style={{
            width:40, height:40, borderRadius:'50%',
            background: isListening && listenTarget===step
              ? 'rgba(200,50,50,0.85)' : 'rgba(245,230,66,0.11)',
            border:'1.5px solid rgba(245,230,66,0.42)',
            cursor:'pointer', fontSize:17,
            display:'flex', alignItems:'center', justifyContent:'center',
            transition:'all 0.2s',
          }}
          title="Spreek je antwoord in"
        >
          {isListening && listenTarget===step ? '🔴' : '🎤'}
        </button>

        {/* Submit / Verder */}
        <button
          onClick={onConfirm}
          style={{
            padding:'9px 20px', borderRadius:22,
            background:'linear-gradient(135deg,#d4a017,#f5e642)',
            border:'none', color:'#180c00',
            fontWeight:700, fontSize:13, cursor:'pointer',
            fontFamily:"'IM Fell English', serif",
            boxShadow:'0 2px 14px rgba(212,160,23,0.52)',
            letterSpacing:'0.04em',
          }}
        >
          {isName ? 'Verder ✨' : 'Toon mijn boodschap 🪄'}
        </button>
      </div>

      {!isName && (
        <p style={{ fontSize:9, color:'rgba(245,230,66,0.32)', margin:0, textAlign:'center' }}>
          Bijv: 15-04 of 15-04-2015
        </p>
      )}
    </motion.div>
  );
}

// ── Tekstballon ───────────────────────────────────────────────────────────
function SpeechBubble({ message, lang, setLang, onSpeak }) {
  if (!message) return null;
  const text = message[lang] || message.nl || '';
  const facts = message.facts || [];

  return (
    <motion.div
      initial={{ opacity:0, y:18, scale:0.95 }}
      animate={{ opacity:1, y:0, scale:1 }}
      exit={{ opacity:0, y:-8 }}
      style={{
        width:'100%',
        background:'linear-gradient(160deg,rgba(36,20,6,0.98),rgba(20,11,3,0.99))',
        border:'2px solid rgba(212,160,23,0.52)',
        borderRadius:18, padding:'13px 16px',
        boxShadow:'0 8px 28px rgba(0,0,0,0.65),0 0 18px rgba(212,160,23,0.07)',
        position:'relative',
      }}
    >
      {/* Pijltje */}
      <div style={{ position:'absolute', top:-12, left:'50%', transform:'translateX(-50%)',
        width:0, height:0, borderLeft:'9px solid transparent',
        borderRight:'9px solid transparent', borderBottom:'12px solid rgba(212,160,23,0.52)' }}/>
      <div style={{ position:'absolute', top:-9, left:'50%', transform:'translateX(-50%)',
        width:0, height:0, borderLeft:'7px solid transparent',
        borderRight:'7px solid transparent', borderBottom:'10px solid rgba(36,20,6,0.98)' }}/>

      {/* Taalwisselaars + 🔊 */}
      <div style={{ display:'flex', gap:4, marginBottom:10, flexWrap:'wrap', alignItems:'center' }}>
        {Object.entries(LANG_LABELS).map(([l,lbl]) => (
          <button key={l} onClick={() => setLang(l)} style={{
            padding:'2px 8px', borderRadius:12, fontSize:10, cursor:'pointer',
            transition:'all 0.2s',
            background: lang===l ? 'rgba(212,160,23,0.26)' : 'transparent',
            border:`1px solid ${lang===l ? 'rgba(212,160,23,0.78)' : 'rgba(212,160,23,0.18)'}`,
            color: lang===l ? '#f5e642' : 'rgba(245,230,66,0.36)',
          }}>{lbl}</button>
        ))}
        <button onClick={onSpeak} style={{
          marginLeft:'auto', background:'none', border:'none',
          cursor:'pointer', fontSize:16, opacity:0.54,
        }}>🔊</button>
      </div>

      {/* Boodschap */}
      <p style={{
        margin:'0 0 10px', color:'#f5e642', lineHeight:1.7, fontSize:14,
        fontFamily:"'IM Fell English', serif",
        textShadow:'0 0 8px rgba(245,230,66,0.22)',
      }}>✨ {text}</p>

      {/* Feitjes */}
      {facts.length > 0 && (
        <div style={{ borderTop:'1px solid rgba(212,160,23,0.16)', paddingTop:8,
          display:'flex', flexDirection:'column', gap:5 }}>
          <p style={{ margin:0, fontSize:9, color:'rgba(212,160,23,0.46)',
            letterSpacing:'0.14em', textTransform:'uppercase' }}>
            ✦ Op jouw verjaardag in het verleden ✦
          </p>
          {facts.map((f,i) => (
            <div key={i} style={{
              background:'rgba(245,230,66,0.04)',
              border:'1px solid rgba(212,160,23,0.12)',
              borderRadius:9, padding:'5px 10px',
            }}>
              <span style={{ color:'#d4a017', fontSize:10, fontWeight:700 }}>{f.year} · </span>
              <span style={{ color:'rgba(245,230,66,0.7)', fontSize:11, fontStyle:'italic' }}>
                {f[lang] || f.nl}
              </span>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ── Hoofd component ───────────────────────────────────────────────────────
export default function MagischeSpiegel() {
  const [step, setStep]               = useState(STEP.NAME);
  const [name, setName]               = useState('');
  const [birthInput, setBirthInput]   = useState('');
  const [message, setMessage]         = useState(null);
  const [lang, setLang]               = useState('nl');
  const [status, setStatus]           = useState('');
  const [isListening, setIsListening] = useState(false);
  const [listenTarget, setListenTarget] = useState(null);
  const [isThinking, setIsThinking]   = useState(false);
  const [isSpeaking, setIsSpeaking]   = useState(false);
  const [daysInfo, setDaysInfo]       = useState(null);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [hasError, setHasError]       = useState(false);
  const [apiKey, setApiKey] = useState(() => {
    if (ENV_KEY) return ENV_KEY;
    try { return localStorage.getItem('magic_mirror_key') || ''; } catch { return ''; }
  });

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recRef = useRef(null);
  // Bewaar parsed datum voor hergebruik bij opnieuw proberen
  const parsedDateRef = useRef(null);

  // Camera
  useEffect(() => {
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user' }, audio:false });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch { /* geen camera */ }
    })();
    return () => streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  // Spreek de vraag voor bij elke stap
  useEffect(() => {
    let cancelled = false;
    const delay = setTimeout(() => {
      if (cancelled) return;
      if (step === STEP.NAME) {
        setIsSpeaking(true);
        speakWithFallback(SPOKEN_Q.name, 'nl', () => { if (!cancelled) setIsSpeaking(false); });
      } else if (step === STEP.DATE && name) {
        setIsSpeaking(true);
        speakWithFallback(SPOKEN_Q.date(name), 'nl', () => { if (!cancelled) setIsSpeaking(false); });
      }
    }, step === STEP.NAME ? 900 : 400);
    return () => { cancelled = true; clearTimeout(delay); };
  }, [step]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const parseBirthDate = (input) => {
    const clean = input.trim().replace(/[\/\.]/g, '-');
    const parts = clean.split('-').map(p => parseInt(p, 10));
    if (parts.length >= 2 && parts[0]>=1 && parts[0]<=31 && parts[1]>=1 && parts[1]<=12)
      return { day:parts[0], month:parts[1] };
    return null;
  };

  const computeDaysUntil = (day, month) => {
    const now = new Date(), y = now.getFullYear();
    let bd = new Date(y, month-1, day);
    const diff = Math.round((bd - now) / 86400000);
    if (diff > 180)  { bd = new Date(y-1, month-1, day); return Math.round((bd-now)/86400000); }
    if (diff < -180) { bd = new Date(y+1, month-1, day); return Math.round((bd-now)/86400000); }
    return diff;
  };

  // ── Stap 1: naam ─────────────────────────────────────────────────────────
  const confirmName = () => {
    if (!name.trim()) { setStatus('Vertel mij eerst hoe je heet! 🌟'); return; }
    setStatus('');
    setStep(STEP.DATE);
  };

  // ── Stap 2: datum → API ──────────────────────────────────────────────────
  const confirmDate = () => {
    const parsed = parseBirthDate(birthInput);
    if (!parsed) { setStatus('Ik begrijp de datum niet. Bijv. 15-04 ✨'); return; }
    const days = computeDaysUntil(parsed.day, parsed.month);
    parsedDateRef.current = { ...parsed, days };
    setDaysInfo(days);
    setStatus('');
    setHasError(false);
    setStep(STEP.DONE);
    fetchMessage(name, parsed.day, parsed.month, days);
  };

  // ── Opnieuw proberen ─────────────────────────────────────────────────────
  const handleRetry = () => {
    if (!parsedDateRef.current) return;
    const { day, month, days } = parsedDateRef.current;
    setHasError(false);
    setStatus('');
    fetchMessage(name, day, month, days);
  };

  // ── Microfoon ────────────────────────────────────────────────────────────
  const startListening = (target) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setStatus('Microfoon werkt niet in deze browser 🎤'); return; }
    try { recRef.current?.stop(); } catch {}
    const rec = new SR();
    recRef.current = rec;
    rec.lang = 'nl-NL'; rec.continuous = false; rec.interimResults = false;
    rec.onstart  = () => { setIsListening(true);  setListenTarget(target); setStatus('Ik luister... 👂'); };
    rec.onend    = () => { setIsListening(false); setListenTarget(null);   setStatus(''); };
    rec.onerror  = () => { setIsListening(false); setListenTarget(null);   setStatus('Niet goed gehoord 🌟'); };
    rec.onresult = (e) => {
      const heard = e.results[0][0].transcript;
      if (target === STEP.NAME) {
        setName(heard.replace(/[^a-zA-ZÀ-ÿ\s'-]/g, '').trim());
      } else {
        const nums = heard.match(/\d+/g);
        setBirthInput(nums?.length>=2 ? `${nums[0]}-${nums[1]}` : heard);
      }
    };
    rec.start();
  };

  // ── Claude API ───────────────────────────────────────────────────────────
  const fetchMessage = async (n, day, month, days) => {
    if (!apiKey) { setStatus('Geen API sleutel ingesteld 🔑'); return; }
    setIsThinking(true);
    setMessage(null);
    setHasError(false);
    setStatus('De spiegel denkt na... ✨');

    try {
      const resp = await fetchWithRetry(() =>
        fetch('https://api.anthropic.com/v1/messages', {
          method:'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify({
            model:'claude-sonnet-4-20250514',
            max_tokens:1000,
            messages:[{ role:'user', content:buildPrompt(n, day, month, days) }],
          }),
        }).then(r => r.json())
      );

      if (resp.error) throw new Error(resp.error.message || 'API fout');

      const raw = resp.content?.[0]?.text || '{}';
      const data = JSON.parse(raw.replace(/```json|```/g,'').trim());
      setMessage(data);
      setHasError(false);
      setStatus('');
      if (data.nl) {
        setIsSpeaking(true);
        speakWithFallback(data.nl, 'nl', () => setIsSpeaking(false));
      }
    } catch (err) {
      // ── v4: vriendelijke foutmelding, voorgelezen ──────────────────────
      const errorText = 'De spiegel kan nu niet antwoorden. Het is druk op de server. Probeer het later opnieuw!';
      setStatus(errorText + ' ⏳');
      setHasError(true);
      setIsSpeaking(true);
      speakWithFallback(errorText, 'nl', () => setIsSpeaking(false));
    }
    setIsThinking(false);
  };

  // ── Reset voor volgend kind ──────────────────────────────────────────────
  const handleReset = () => {
    window.speechSynthesis.cancel();
    setStep(STEP.NAME); setName(''); setBirthInput('');
    setMessage(null); setDaysInfo(null);
    setStatus(''); setIsSpeaking(false);
    setHasError(false);
    parsedDateRef.current = null;
  };

  const saveKey = (k) => {
    setApiKey(k);
    try { localStorage.setItem('magic_mirror_key', k); } catch {}
    setShowKeyModal(false);
  };

  // Banner boven spiegel
  const banner = (() => {
    if (daysInfo === null) return null;
    if (daysInfo === 0)              return { text:'🎂 Vandaag is jouw grote dag!', color:'#f5e642' };
    if (daysInfo>0 && daysInfo<=7)   return { text:`⏳ Nog ${daysInfo} dag${daysInfo===1?'':'en'} tot jouw verjaardag!`, color:'#ffb347' };
    if (daysInfo<0 && daysInfo>=-7)  return { text:`🎉 Gefeliciteerd! ${Math.abs(daysInfo)} dag${Math.abs(daysInfo)===1?'':'en'} geleden!`, color:'#a8edea' };
    return null;
  })();

  const isDone = step === STEP.DONE;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div style={S.app}>
      <style>{CSS}</style>

      <div style={S.bg}/>
      <div style={S.bgForest}/>

      {/* Vuurvliegjes */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0, overflow:'hidden' }}>
        {FIREFLIES.map(f => (
          <div key={f.id} style={{
            position:'absolute', left:`${f.x}%`, top:`${f.y}%`,
            width:5, height:5, borderRadius:'50%', background:'#f5e642',
            boxShadow:'0 0 7px #f5e642, 0 0 14px rgba(245,230,66,0.38)',
            animation:`ffloat ${f.dur}s ease-in-out ${f.delay}s infinite`,
            '--dx':`${f.dx}px`, '--dy':`${f.dy}px`,
          }}/>
        ))}
      </div>

      {/* Titel */}
      <header style={S.header}>
        <h1 style={S.title}>✦ Magische Spiegel ✦</h1>
        <p style={S.subtitle}>Vertel mij wie jij bent...</p>
      </header>

      {/* Banner */}
      <AnimatePresence>
        {banner && (
          <motion.div
            initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
            style={{ ...S.banner, borderColor:banner.color, color:banner.color }}
          >
            {banner.text}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Spiegel */}
      <div style={S.mirrorWrap}>
        <OrnateFrame W={270} H={330}/>

        <div style={S.mirrorGlass}>
          <video ref={videoRef} autoPlay playsInline muted style={S.video}/>

          {/* Glinsterende deeltjes */}
          {isDone && message && (
            <div style={{ position:'absolute', inset:0, pointerEvents:'none', overflow:'hidden',
              borderRadius:'50% 50% 47% 47%', zIndex:3 }}>
              {PARTICLES.map(p => (
                <div key={p.id} style={{
                  position:'absolute', left:`${p.x}%`, top:`${p.y}%`,
                  width:p.size, height:p.size, borderRadius:'50%',
                  background:p.color, opacity:0,
                  animation:`sparkle ${p.dur}s ease-in-out ${p.delay}s infinite`,
                  boxShadow:`0 0 ${p.size}px ${p.color}`,
                }}/>
              ))}
            </div>
          )}

          {/* Setup overlay */}
          <AnimatePresence>
            {step !== STEP.DONE && (
              <SetupOverlay
                step={step}
                name={name} setName={setName}
                birthInput={birthInput} setBirthInput={setBirthInput}
                onListen={startListening}
                isListening={isListening} listenTarget={listenTarget}
                onConfirm={step===STEP.NAME ? confirmName : confirmDate}
              />
            )}
          </AnimatePresence>

          {/* Denkende bollen */}
          {isThinking && (
            <div style={{ position:'absolute', bottom:14, left:'50%',
              transform:'translateX(-50%)', display:'flex', gap:6, zIndex:15 }}>
              {[0,200,400].map((d,i) => (
                <div key={i} style={{
                  width:8, height:8, borderRadius:'50%', background:'#f5e642',
                  animation:`bounce 1s ease-in-out ${d}ms infinite`,
                  boxShadow:'0 0 6px #f5e642',
                }}/>
              ))}
            </div>
          )}

          {/* Spreekring */}
          {isSpeaking && (
            <div style={{ position:'absolute', inset:-4, borderRadius:'50% 50% 47% 47%',
              border:'3px solid #f5e642', animation:'speakRing 1s ease-in-out infinite',
              pointerEvents:'none', zIndex:4 }}/>
          )}
        </div>

        {/* Naam badge onder spiegel */}
        {isDone && name && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} style={S.nameBadge}>
            ✦ {name} ✦
          </motion.div>
        )}
      </div>

      {/* Status */}
      {status ? <p style={S.status}>{status}</p> : null}

      {/* Tekstballon */}
      <AnimatePresence>
        {message && (
          <div style={{ width:'100%', maxWidth:430, padding:'0 12px', marginTop:6 }}>
            <SpeechBubble
              message={message} lang={lang} setLang={setLang}
              onSpeak={() => {
                setIsSpeaking(true);
                speakWithFallback(message[lang]||message.nl, LANG_CODE[lang],
                  () => setIsSpeaking(false));
              }}
            />
          </div>
        )}
      </AnimatePresence>

      {/* ── v4: Opnieuw-knop bij fout ─────────────────────────────────────── */}
      <AnimatePresence>
        {isDone && !isThinking && hasError && (
          <motion.div
            initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
            style={{ marginTop:12, display:'flex', flexDirection:'column',
              alignItems:'center', gap:6, position:'relative', zIndex:5 }}
          >
            <button onClick={handleRetry} style={S.btnRetry}>
              🔄 Opnieuw proberen
            </button>
            <p style={{ margin:0, fontSize:10, color:'rgba(245,230,66,0.26)', fontStyle:'italic' }}>
              Tik hier om het nog een keer te proberen
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Volgend kind */}
      {isDone && !isThinking && message && (
        <motion.div
          initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
          transition={{ delay:1.8 }}
          style={{ marginTop:14, display:'flex', flexDirection:'column',
            alignItems:'center', gap:5, position:'relative', zIndex:5 }}
        >
          <button onClick={handleReset} style={S.btnNext}>
            ✨ Volgend kind ✨
          </button>
          <p style={{ margin:0, fontSize:10, color:'rgba(245,230,66,0.26)', fontStyle:'italic' }}>
            Tik hier als een ander kind aan de beurt is
          </p>
        </motion.div>
      )}

      {/* API sleutel knop — verborgen als env variabele is ingesteld */}
      {!ENV_KEY && (
        <button onClick={() => setShowKeyModal(true)} style={S.btnKey}>
          <Key size={10} style={{ marginRight:4 }}/>
          {apiKey ? 'API sleutel ✓' : 'API sleutel instellen'}
        </button>
      )}

      {/* API sleutel modal */}
      <AnimatePresence>
        {showKeyModal && (
          <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            style={S.modal}
            onClick={e => e.target===e.currentTarget && setShowKeyModal(false)}
          >
            <div style={S.modalBox}>
              <h2 style={S.modalTitle}>🔑 API Sleutel</h2>
              <p style={S.modalHint}>
                Voer de Anthropic API sleutel in.<br/>
                Wordt alleen op dit apparaat opgeslagen.
              </p>
              <input type="password" id="keyInp" defaultValue={apiKey}
                placeholder="sk-ant-..." style={S.modalInput}/>
              <div style={{ display:'flex', gap:10, marginTop:16 }}>
                <button onClick={() => setShowKeyModal(false)} style={S.modalCancel}>Annuleer</button>
                <button onClick={() => saveKey(document.getElementById('keyInp').value)}
                  style={S.modalSave}>Opslaan</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&display=swap');
  * { box-sizing:border-box; }
  input::placeholder { color:rgba(245,230,66,0.26); }

  @keyframes ffloat {
    0%   { opacity:0; transform:translate(0,0); }
    25%  { opacity:0.82; }
    50%  { opacity:0.28; transform:translate(var(--dx,20px),var(--dy,-15px)); }
    75%  { opacity:0.68; }
    100% { opacity:0; transform:translate(0,0); }
  }
  @keyframes sparkle {
    0%,100% { opacity:0; transform:scale(0.5); }
    50%     { opacity:0.88; transform:scale(1.2); }
  }
  @keyframes bounce {
    0%,100% { transform:translateY(0); opacity:0.38; }
    50%     { transform:translateY(-6px); opacity:1; }
  }
  @keyframes speakRing {
    0%,100% { opacity:0.32; transform:scale(1); }
    50%     { opacity:1; transform:scale(1.05); }
  }
  @keyframes mirrorPulse {
    0%,100% { box-shadow:0 0 32px rgba(212,160,23,0.22),0 0 65px rgba(212,160,23,0.07),inset 0 0 26px rgba(0,0,0,0.55); }
    50%     { box-shadow:0 0 52px rgba(212,160,23,0.42),0 0 105px rgba(212,160,23,0.14),inset 0 0 26px rgba(0,0,0,0.55); }
  }
  @keyframes titleShimmer {
    0%,100% { text-shadow:0 0 10px rgba(245,230,66,0.42),0 2px 4px rgba(0,0,0,0.8); }
    50%     { text-shadow:0 0 22px rgba(245,230,66,0.88),0 0 42px rgba(245,230,66,0.32),0 2px 4px rgba(0,0,0,0.8); }
  }
  @keyframes bannerGlow {
    0%,100% { box-shadow:0 0 9px rgba(245,230,66,0.2); }
    50%     { box-shadow:0 0 20px rgba(245,230,66,0.56); }
  }
  @keyframes retryPulse {
    0%,100% { box-shadow:0 0 10px rgba(255,140,0,0.3); }
    50%     { box-shadow:0 0 22px rgba(255,140,0,0.7); }
  }
`;

// ── Styles ────────────────────────────────────────────────────────────────
const S = {
  app: {
    minHeight:'100vh', background:'#0b0802',
    color:'#f0e8d0', fontFamily:"'IM Fell English', serif",
    display:'flex', flexDirection:'column', alignItems:'center',
    padding:'0 0 44px', position:'relative', overflow:'hidden',
  },
  bg: {
    position:'fixed', inset:0, pointerEvents:'none', zIndex:0,
    background:'radial-gradient(ellipse at 50% 0%,rgba(52,30,4,0.78) 0%,rgba(7,4,2,0.95) 60%,#030200 100%)',
  },
  bgForest: {
    position:'fixed', inset:0, pointerEvents:'none', zIndex:0,
    background:`
      radial-gradient(ellipse at 12% 90%,rgba(16,42,7,0.3) 0%,transparent 50%),
      radial-gradient(ellipse at 88% 90%,rgba(16,42,7,0.3) 0%,transparent 50%),
      radial-gradient(ellipse at 50% 100%,rgba(26,52,7,0.38) 0%,transparent 38%)
    `,
  },
  header: {
    width:'100%', maxWidth:480,
    padding:'18px 16px 8px',
    display:'flex', flexDirection:'column', alignItems:'center',
    position:'relative', zIndex:5,
  },
  title: {
    margin:0, fontSize:22, fontWeight:700,
    color:'#f5e642',
    animation:'titleShimmer 3s ease-in-out infinite',
    letterSpacing:'0.05em',
  },
  subtitle: {
    margin:'3px 0 0', fontSize:11,
    color:'rgba(245,230,66,0.38)',
    letterSpacing:'0.14em', fontStyle:'italic',
  },
  banner: {
    width:'100%', maxWidth:420, margin:'0 12px 8px',
    padding:'7px 16px',
    background:'rgba(16,9,0,0.86)',
    border:'1px solid', borderRadius:20,
    fontSize:13, textAlign:'center',
    fontStyle:'italic', letterSpacing:'0.04em',
    zIndex:5, position:'relative',
    animation:'bannerGlow 2.5s ease-in-out infinite',
  },
  mirrorWrap: {
    position:'relative', width:270, height:330,
    display:'flex', alignItems:'center', justifyContent:'center',
    zIndex:5, marginBottom:6,
  },
  mirrorGlass: {
    position:'absolute',
    top:18, left:22,
    width:226, height:290,
    borderRadius:'50% 50% 47% 47%',
    overflow:'hidden',
    background:'linear-gradient(160deg,#0b1606 0%,#030702 100%)',
    animation:'mirrorPulse 4s ease-in-out infinite',
    zIndex:1,
  },
  video: {
    width:'100%', height:'100%',
    objectFit:'cover',
    transform:'scaleX(-1)',
    filter:'brightness(0.82) contrast(1.06) saturate(0.76)',
  },
  nameBadge: {
    position:'absolute', bottom:-10, left:'50%',
    transform:'translateX(-50%)',
    background:'linear-gradient(135deg,rgba(26,14,2,0.96),rgba(16,9,0,0.96))',
    border:'1px solid rgba(212,160,23,0.46)',
    borderRadius:20, padding:'4px 18px',
    fontSize:12, color:'#f5e642',
    whiteSpace:'nowrap', zIndex:10,
    letterSpacing:'0.08em',
    boxShadow:'0 2px 10px rgba(0,0,0,0.5)',
  },
  status: {
    fontSize:12, color:'rgba(245,230,66,0.55)',
    fontStyle:'italic', margin:'4px 12px',
    zIndex:5, textAlign:'center', position:'relative',
    maxWidth:380, lineHeight:1.6,
  },
  btnRetry: {
    padding:'11px 28px',
    background:'linear-gradient(135deg,#7a3800,#c05a00,#ff8c00,#c05a00,#7a3800)',
    backgroundSize:'200% auto',
    border:'none', borderRadius:30,
    color:'#fff8f0', fontWeight:700, cursor:'pointer',
    fontSize:14, fontFamily:"'IM Fell English', serif",
    letterSpacing:'0.08em',
    boxShadow:'0 4px 18px rgba(200,80,0,0.46)',
    animation:'retryPulse 2s ease-in-out infinite',
  },
  btnNext: {
    padding:'11px 28px',
    background:'linear-gradient(135deg,#8B6914,#d4a017,#f5e642,#d4a017,#8B6914)',
    backgroundSize:'200% auto',
    border:'none', borderRadius:30,
    color:'#160b00', fontWeight:700, cursor:'pointer',
    fontSize:14, fontFamily:"'IM Fell English', serif",
    letterSpacing:'0.08em',
    boxShadow:'0 4px 18px rgba(212,160,23,0.46),0 0 34px rgba(212,160,23,0.16)',
  },
  btnKey: {
    marginTop:14, padding:'5px 14px',
    background:'transparent',
    border:'1px solid rgba(212,160,23,0.13)',
    borderRadius:20, fontSize:10,
    color:'rgba(212,160,23,0.36)',
    letterSpacing:'0.1em', cursor:'pointer',
    display:'flex', alignItems:'center',
    position:'relative', zIndex:5,
    fontFamily:"'IM Fell English', serif",
  },
  modal: {
    position:'fixed', inset:0, background:'rgba(0,0,0,0.88)',
    display:'flex', alignItems:'center', justifyContent:'center', zIndex:100,
  },
  modalBox: {
    background:'linear-gradient(160deg,#160c05,#0a0502)',
    border:'2px solid rgba(212,160,23,0.46)',
    borderRadius:20, padding:24, maxWidth:300, width:'90%',
    boxShadow:'0 8px 40px rgba(0,0,0,0.8)',
  },
  modalTitle: {
    margin:'0 0 4px', fontWeight:400, fontSize:18,
    color:'#f5e642', textAlign:'center',
    fontFamily:"'IM Fell English', serif",
  },
  modalHint: {
    margin:'0 0 14px', fontSize:11, lineHeight:1.6,
    color:'rgba(245,230,66,0.4)', textAlign:'center',
  },
  modalInput: {
    width:'100%',
    background:'rgba(0,0,0,0.4)',
    border:'1px solid rgba(212,160,23,0.26)',
    borderRadius:10, padding:'10px 14px',
    fontSize:13, color:'#f0e8d0', outline:'none', textAlign:'center',
  },
  modalCancel: {
    flex:1, padding:'9px', background:'transparent',
    border:'1px solid rgba(255,255,255,0.1)', borderRadius:10,
    color:'rgba(255,255,255,0.3)', cursor:'pointer', fontSize:12,
    fontFamily:"'IM Fell English', serif",
  },
  modalSave: {
    flex:1, padding:'9px',
    background:'linear-gradient(135deg,#d4a017,#f5e642)',
    border:'none', borderRadius:10,
    color:'#160900', fontWeight:700, cursor:'pointer',
    fontSize:12, fontFamily:"'IM Fell English', serif",
    letterSpacing:'0.05em',
  },
};
