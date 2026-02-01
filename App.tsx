
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { Language, Proficiency, Scenario, TranscriptionEntry } from './types';
import { SCENARIOS } from './constants';
import { decodeBase64, decodeAudioData, createPcmBlob } from './services/audioService';
import Visualizer from './components/Visualizer';
import Auth from './components/Auth';
import { auth, onAuthStateChanged, signOut, User } from './services/firebase';

const LANGUAGE_FLAGS: Record<Language, string> = {
  [Language.ENGLISH]: '🇺🇸',
  [Language.SPANISH]: '🇪🇸',
  [Language.FRENCH]: '🇫🇷',
  [Language.GERMAN]: '🇩🇪',
  [Language.JAPANESE]: '🇯🇵',
  [Language.CHINESE]: '🇨🇳',
  [Language.ITALIAN]: '🇮🇹',
  [Language.PORTUGUESE]: '🇵🇹',
  [Language.KOREAN]: '🇰🇷',
  [Language.URDU]: '🇵🇰',
};

const App: React.FC = () => {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Config state
  const [language, setLanguage] = useState<Language>(Language.SPANISH);
  const [proficiency, setProficiency] = useState<Proficiency>(Proficiency.BEGINNER);
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  
  // Connection state
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Conversation state
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');
  
  // Audio refs
  const audioContextIn = useRef<AudioContext | null>(null);
  const audioContextOut = useRef<AudioContext | null>(null);
  const nextStartTime = useRef(0);
  const sources = useRef<Set<AudioBufferSourceNode>>(new Set());
  const micStream = useRef<MediaStream | null>(null);
  const sessionPromise = useRef<Promise<any> | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSignOut = () => {
    signOut(auth);
    if (isConnected) handleEndConversation();
  };

  const cleanup = useCallback(() => {
    if (micStream.current) {
      micStream.current.getTracks().forEach(track => track.stop());
      micStream.current = null;
    }
    if (audioContextIn.current) {
      audioContextIn.current.close();
      audioContextIn.current = null;
    }
    if (audioContextOut.current) {
      audioContextOut.current.close();
      audioContextOut.current = null;
    }
    sources.current.forEach(source => source.stop());
    sources.current.clear();
    nextStartTime.current = 0;
    sessionPromise.current = null;
  }, []);

  const handleStartConversation = async () => {
    setIsConnecting(true);
    setError(null);
    setTranscriptions([]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      micStream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContextIn.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextOut.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });

      const systemInstruction = `
        You are a highly skilled and patient language tutor and conversational partner.
        Your goal is to help the user practice their ${language} skills.
        The user's current level is ${proficiency}.
        The current scenario is: ${scenario.name} - ${scenario.description}.
        
        Guidelines:
        1. Speak naturally in ${language} for the chosen scenario.
        2. Adjust your complexity and speed to match the user's ${proficiency} level.
        3. If the user makes a significant mistake, gently correct them while keeping the conversation flowing.
        4. Encourage the user to speak more by asking open-ended questions related to the scenario.
        5. Stay in character for the scenario (e.g., if it's a coffee shop, you are the barista or a fellow customer).
        6. Always respond in the target language (${language}).
      `;

      sessionPromise.current = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setIsConnecting(false);
            const source = audioContextIn.current!.createMediaStreamSource(micStream.current!);
            const scriptProcessor = audioContextIn.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              sessionPromise.current?.then((session) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmBlob = createPcmBlob(inputData);
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextIn.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioContextOut.current) {
              const ctx = audioContextOut.current;
              nextStartTime.current = Math.max(nextStartTime.current, ctx.currentTime);
              const audioData = decodeBase64(base64Audio);
              const buffer = await decodeAudioData(audioData, ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.addEventListener('ended', () => { sources.current.delete(source); });
              source.start(nextStartTime.current);
              nextStartTime.current += buffer.duration;
              sources.current.add(source);
            }
            if (message.serverContent?.interrupted) {
              sources.current.forEach(s => s.stop());
              sources.current.clear();
              nextStartTime.current = 0;
            }
            if (message.serverContent?.inputTranscription) {
              currentInputTranscription.current += message.serverContent.inputTranscription.text;
            }
            if (message.serverContent?.outputTranscription) {
              currentOutputTranscription.current += message.serverContent.outputTranscription.text;
            }
            if (message.serverContent?.turnComplete) {
              const userText = currentInputTranscription.current.trim();
              const aiText = currentOutputTranscription.current.trim();
              if (userText || aiText) {
                setTranscriptions(prev => [
                  ...prev,
                  ...(userText ? [{ role: 'user' as const, text: userText, timestamp: Date.now() }] : []),
                  ...(aiText ? [{ role: 'ai' as const, text: aiText, timestamp: Date.now() + 1 }] : [])
                ]);
              }
              currentInputTranscription.current = '';
              currentOutputTranscription.current = '';
            }
          },
          onerror: (e) => {
            console.error('Live error:', e);
            setError('An error occurred during the session.');
            setIsConnected(false);
            setIsConnecting(false);
          },
          onclose: () => {
            setIsConnected(false);
            setIsConnecting(false);
          }
        }
      });
    } catch (err: any) {
      setError(err.message || 'Failed to start conversation. Check microphone permissions.');
      setIsConnecting(false);
    }
  };

  const handleEndConversation = () => {
    if (sessionPromise.current) {
      sessionPromise.current.then(session => session.close());
    }
    cleanup();
    setIsConnected(false);
  };

  const chatEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptions]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4 md:p-8">
      {/* Header */}
      <header className="w-full max-w-5xl flex justify-between items-center mb-8">
        <div className="flex items-center space-x-2">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white text-xl font-bold">
            L
          </div>
          <h1 className="text-2xl font-bold text-gray-800">LingoLive AI</h1>
        </div>
        
        {user ? (
          <div className="flex items-center space-x-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-xs font-bold text-gray-400 uppercase">Current User</span>
              <span className="text-sm font-semibold text-gray-700">{user.displayName || user.email}</span>
            </div>
            <button 
              onClick={handleSignOut}
              className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors text-gray-600"
              title="Sign Out"
            >
              <i className="fas fa-sign-out-alt"></i>
            </button>
            <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
          </div>
        ) : (
          <div className="text-sm font-medium text-gray-500">Practice smarter.</div>
        )}
      </header>

      {!user ? (
        <Auth />
      ) : !isConnected ? (
        /* Configuration Screen */
        <main className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in">
          <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 p-8 border border-gray-100">
            <h2 className="text-xl font-bold mb-6 text-gray-800 flex items-center">
              <i className="fas fa-sliders-h mr-3 text-blue-500"></i> Session Settings
            </h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Target Language</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(Language).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setLanguage(lang)}
                      className={`flex items-center space-x-2 py-2 px-3 rounded-xl text-sm font-medium transition-all ${
                        language === lang 
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
                          : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <span className="text-lg">{LANGUAGE_FLAGS[lang]}</span>
                      <span>{lang}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Proficiency Level</label>
                <div className="flex p-1 bg-gray-50 rounded-xl">
                  {Object.values(Proficiency).map((level) => (
                    <button
                      key={level}
                      onClick={() => setProficiency(level)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                        proficiency === level 
                          ? 'bg-white text-blue-600 shadow-sm' 
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4">
                <button
                  disabled={isConnecting}
                  onClick={handleStartConversation}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold text-lg shadow-xl shadow-blue-200 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {isConnecting ? (
                    <>
                      <i className="fas fa-circle-notch fa-spin"></i>
                      <span>Preparing Tutor...</span>
                    </>
                  ) : (
                    <>
                      <i className="fas fa-microphone"></i>
                      <span>Start Speaking</span>
                    </>
                  )}
                </button>
                {error && <p className="mt-4 text-sm text-red-500 text-center font-medium">{error}</p>}
              </div>
            </div>
          </div>

          <div className="space-y-4 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
            <h2 className="text-xl font-bold mb-4 text-gray-800 flex items-center sticky top-0 bg-[#f8fafc] z-10 py-2">
              <i className="fas fa-map-marked-alt mr-3 text-blue-500"></i> Choose a Scenario
            </h2>
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                onClick={() => setScenario(s)}
                className={`w-full flex items-start p-4 rounded-2xl border-2 transition-all text-left ${
                  scenario.id === s.id 
                    ? 'border-blue-500 bg-blue-50/50 shadow-md' 
                    : 'border-white bg-white hover:border-gray-100 shadow-sm'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl mr-4 ${
                  scenario.id === s.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'
                }`}>
                  <i className={`fas ${s.icon}`}></i>
                </div>
                <div>
                  <h3 className="font-bold text-gray-800">{s.name}</h3>
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.description}</p>
                </div>
              </button>
            ))}
          </div>
        </main>
      ) : (
        /* Active Conversation Screen */
        <main className="w-full max-w-4xl flex flex-col h-[calc(100vh-180px)] bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden animate-slide-up">
          {/* Active Header */}
          <div className="bg-gray-50/50 p-6 border-b border-gray-100 flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-xl">
                <i className={`fas ${scenario.icon}`}></i>
              </div>
              <div>
                <h2 className="font-bold text-gray-800">{scenario.name}</h2>
                <div className="flex items-center space-x-2">
                  <span className="text-sm">{LANGUAGE_FLAGS[language]}</span>
                  <p className="text-sm text-blue-600 font-medium">Practicing {language} ({proficiency})</p>
                </div>
              </div>
            </div>
            <button
              onClick={handleEndConversation}
              className="px-6 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-bold transition-all flex items-center space-x-2"
            >
              <i className="fas fa-phone-slash"></i>
              <span>End Session</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/20">
            {transcriptions.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center animate-bounce">
                  <i className="fas fa-comment-dots text-3xl"></i>
                </div>
                <p className="font-medium">The tutor is listening... Go ahead and say hi!</p>
              </div>
            )}
            
            {transcriptions.map((entry, idx) => (
              <div 
                key={`${entry.timestamp}-${idx}`}
                className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
              >
                <div className={`max-w-[80%] p-4 rounded-2xl shadow-sm ${
                  entry.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none'
                }`}>
                  <p className="text-base leading-relaxed">{entry.text}</p>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="bg-gray-50 p-6 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Audio Feedback</span>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Live Connection</span>
              </div>
            </div>
            <div className="flex flex-col md:flex-row items-center space-y-4 md:space-y-0 md:space-x-8">
              <div className="flex-1 w-full bg-white rounded-2xl p-4 shadow-inner">
                <Visualizer stream={micStream.current} isActive={isConnected} color="#3b82f6" />
              </div>
              <div className="flex items-center space-x-4">
                <div className="relative group">
                  <div className="absolute inset-0 bg-blue-400 rounded-full blur-xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
                  <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center text-2xl shadow-lg relative z-10 transition-transform hover:scale-105 active:scale-95 cursor-default">
                    <i className="fas fa-microphone"></i>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* Footer Info */}
      <footer className="mt-8 text-gray-400 text-sm flex items-center space-x-2">
        <i className="fas fa-shield-alt"></i>
        <span>Encrypted Voice Data &bull; Powered by Gemini 2.5 Live</span>
      </footer>
    </div>
  );
};

export default App;
