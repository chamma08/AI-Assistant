import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Mic,
  MicOff,
  Volume2,
  ArrowRight,
  Speaker,
  Settings,
  Loader,
  Zap,
  Sparkles,
} from "lucide-react";
import AiModelContainer from "../components/ai/AiModelContainer";
import { useNavigate } from "react-router-dom";
import { HfInference } from "@huggingface/inference";

// Constants for better maintainability
const MOBILE_SPEECH_TIMEOUT = 2000;
const DESKTOP_SPEECH_TIMEOUT = 4000;
const MAX_CONVERSATION_HISTORY = 10;
const MOBILE_MAX_SPEECH_LENGTH = 100;
const DESKTOP_MAX_SPEECH_LENGTH = 200;

const AiVoiceInterface = () => {
  // User interaction states
  const [userText, setUserText] = useState("");
  const [aiText, setAiText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [autoListenMode, setAutoListenMode] = useState(true);
  const [showEndConvo, setShowEndConvo] = useState(false);
  const [confirmingEnd, setConfirmingEnd] = useState(false);
  const [conversationHistory, setConversationHistory] = useState([]);

  // Refs
  const speechRecognitionRef = useRef(null);
  const navigate = useNavigate();
  const initialLoadRef = useRef(true);
  const pauseTimerRef = useRef(null);
  const interimResultRef = useRef("");
  const finalTranscriptRef = useRef("");
  const recognitionActiveRef = useRef(false);
  const hf = useRef(null);
  const utteranceRef = useRef(null);

  // Memoized fallback responses
  const fallbackResponses = useRef({
    greetings: [
      "Hello there! I'm FluentMe AI, your language assistant. How can I help you today?",
      "Hi! I'm here to help with your language practice. What would you like to work on?"
    ],
    howAreYou: [
      "I'm doing well, thank you for asking! How are you doing today?",
      "I'm just a computer program, but I'm functioning perfectly! How about you?"
    ],
    weather: [
      "I don't have access to real-time weather data, but I'd be happy to help you with language learning.",
      "I'm not connected to weather services, but we can practice weather-related vocabulary if you'd like!"
    ],
    time: () => {
      const now = new Date();
      return `The current time is ${now.toLocaleTimeString()}.`;
    },
    name: [
      "My name is FluentMe AI. I'm your language assistant. What would you like to practice today?",
      "You can call me FluentMe! I'm here to help you improve your language skills."
    ],
    thanks: [
      "You're welcome! I'm glad I could help. Anything else you'd like to practice?",
      "My pleasure! What else can I help you with today?"
    ],
    help: [
      "I'm here to help with your language practice! You can speak to me in any language, and I'll help you improve your fluency.",
      "I can help you practice conversation, vocabulary, or grammar. Just tell me what you'd like to work on!"
    ],
    goodbye: [
      "Goodbye! It was nice practicing with you. Feel free to return anytime for more language practice!",
      "See you soon! Come back anytime you want to practice more."
    ],
    default: (text) => [
      `I heard you say: "${text}". Let's continue our language practice. What topic would you like to discuss next?`,
      `Interesting! You mentioned "${text}". What would you like to focus on next in our practice?`
    ]
  });

  // Mobile detection with memoization
  const checkMobile = useCallback(() => {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const mobileRegex = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
    setIsMobile(mobileRegex.test(userAgent.toLowerCase()));
  }, []);

  useEffect(() => {
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [checkMobile]);

  // Initialize Hugging Face client with error handling
  useEffect(() => {
    const initializeHfClient = async () => {
      const hfApiKey = import.meta.env.VITE_HUGGINGFACE_API_KEY;
      if (!hfApiKey) {
        console.warn("Hugging Face API key not found");
        setShowEndConvo(false);
        return;
      }

      try {
        hf.current = new HfInference(hfApiKey);
        console.log("Hugging Face client initialized");
        
        // Test with a lightweight model first
        await hf.current.textGeneration({
          model: "gpt2",
          inputs: "Hello, I am",
          parameters: { max_new_tokens: 5 },
        });
        
        setShowEndConvo(true);
      } catch (error) {
        console.error("Hugging Face initialization failed:", error);
        hf.current = null;
        setShowEndConvo(false);
      }
    };

    initializeHfClient();
  }, []);

  // Speech recognition setup with cleanup
  useEffect(() => {
    if (!("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
      alert("Your browser doesn't support speech recognition. Please use Chrome or Edge.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    speechRecognitionRef.current = recognition;

    // Configuration
    recognition.continuous = !isMobile;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = "en-US";

    // Event handlers
    recognition.onstart = () => {
      console.log("Speech recognition started");
      recognitionActiveRef.current = true;
    };

    recognition.onresult = (event) => {
      let interimTranscript = "";
      let finalTranscript = finalTranscriptRef.current;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += " " + transcript;
          finalTranscriptRef.current = finalTranscript;
        } else {
          interimTranscript += transcript;
        }
      }

      interimResultRef.current = interimTranscript;
      setUserText((finalTranscript + " " + interimTranscript).trim());
      resetPauseDetection();
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      recognitionActiveRef.current = false;
      setIsListening(false);
      setIsProcessing(false);
      clearPauseDetection();

      if (!isMobile && !isProcessing && !isSpeaking) {
        setTimeout(startListening, 1500);
      }
    };

    recognition.onend = () => {
      console.log("Speech recognition ended");
      recognitionActiveRef.current = false;
      setIsListening(false);
      clearPauseDetection();

      if (finalTranscriptRef.current.trim()) {
        setIsProcessing(true);
        handleAiResponse(finalTranscriptRef.current.trim());
        finalTranscriptRef.current = "";
        interimResultRef.current = "";
      } else if (!isMobile && !isProcessing && !isSpeaking) {
        setTimeout(startListening, 1000);
      }
    };

    // Auto-start on desktop
    if (initialLoadRef.current && !isMobile) {
      initialLoadRef.current = false;
      setTimeout(startListening, 800);
    }

    return () => {
      clearPauseDetection();
      if (recognitionActiveRef.current) {
        recognition.stop();
      }
    };
  }, [isMobile, isProcessing, isSpeaking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (speechRecognitionRef.current && recognitionActiveRef.current) {
        speechRecognitionRef.current.stop();
      }
      window.speechSynthesis.cancel();
      clearPauseDetection();
    };
  }, []);

  // Pause detection management
  const resetPauseDetection = useCallback(() => {
    setIsPaused(false);
    clearPauseDetection();
    
    const pauseTimeout = isMobile ? MOBILE_SPEECH_TIMEOUT : DESKTOP_SPEECH_TIMEOUT;
    pauseTimerRef.current = setTimeout(() => {
      setIsPaused(true);
      if (isListening && finalTranscriptRef.current.trim()) {
        stopListening();
      }
    }, pauseTimeout);
  }, [isListening, isMobile]);

  const clearPauseDetection = useCallback(() => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  }, []);

  // Navigation
  const handleHomeNavigation = () => navigate("/");

  // Speech recognition control
  const startListening = useCallback(() => {
    if (!speechRecognitionRef.current || recognitionActiveRef.current) return;

    try {
      setIsListening(true);
      setUserText("");
      finalTranscriptRef.current = "";
      interimResultRef.current = "";

      speechRecognitionRef.current.start();
      resetPauseDetection();

      const autoStopTime = isMobile ? 10000 : 30000;
      setTimeout(() => {
        if (recognitionActiveRef.current) {
          speechRecognitionRef.current.stop();
        }
      }, autoStopTime);
    } catch (error) {
      console.error("Error starting speech recognition:", error);
      setIsListening(false);
      recognitionActiveRef.current = false;

      if (error.message?.includes("already started")) {
        try {
          speechRecognitionRef.current.stop();
          setTimeout(() => {
            setIsListening(false);
            startListening();
          }, 500);
        } catch (stopError) {
          console.error("Error stopping recognition:", stopError);
        }
      }
    }
  }, [isMobile, resetPauseDetection]);

  const stopListening = useCallback(() => {
    if (speechRecognitionRef.current && recognitionActiveRef.current) {
      try {
        speechRecognitionRef.current.stop();
        recognitionActiveRef.current = false;
      } catch (error) {
        console.error("Error stopping speech recognition:", error);
      } finally {
        setIsListening(false);
        clearPauseDetection();

        if (finalTranscriptRef.current.trim()) {
          setIsProcessing(true);
          handleAiResponse(finalTranscriptRef.current.trim());
        } else if (autoListenMode && !isMobile) {
          setTimeout(() => {
            if (!isListening && !isProcessing && !isSpeaking) {
              startListening();
            }
          }, 1000);
        }
      }
    } else {
      setIsListening(false);
      if (finalTranscriptRef.current.trim()) {
        setIsProcessing(true);
        handleAiResponse(finalTranscriptRef.current.trim());
      }
    }
  }, [autoListenMode, clearPauseDetection, isListening, isMobile, isProcessing, isSpeaking, startListening]);

  const toggleListening = useCallback(() => {
    if (isProcessing) return;

    if (isListening) {
      stopListening();
    } else {
      if (recognitionActiveRef.current) {
        try {
          speechRecognitionRef.current.stop();
          setTimeout(startListening, 300);
        } catch (e) {
          console.log("Error resetting recognition:", e);
          startListening();
        }
      } else {
        startListening();
      }
    }
  }, [isListening, isProcessing, startListening, stopListening]);

  // AI response handling
  const handleAiResponse = useCallback(async (text) => {
    if (confirmingEnd) {
      const normalizedText = text.toLowerCase();
      if (normalizedText.includes("yes") || normalizedText.includes("confirm")) {
        handleEndConversation();
        return;
      } else if (normalizedText.includes("no") || normalizedText.includes("cancel")) {
        cancelEndConversation();
        return;
      }
    }

    if (!text) {
      if (!isMobile) setTimeout(startListening, 500);
      setIsProcessing(false);
      return;
    }

    try {
      setIsProcessing(true);

      // Update conversation history
      const updatedHistory = [
        ...conversationHistory.slice(-(MAX_CONVERSATION_HISTORY - 1)),
        { role: "user", content: text }
      ];

      // Create prompt from recent messages
      const recentMessages = updatedHistory.slice(-4);
      let prompt = recentMessages
        .map(msg => `${msg.role === "user" ? "Human" : "Assistant"}: ${msg.content}`)
        .join("\n") + "\nAssistant:";

      let aiResponse = "";

      // Try Hugging Face models in sequence
      if (hf.current) {
        try {
          const models = ["gpt2", "distilgpt2", "EleutherAI/gpt-neo-125M"];
          let response = null;

          for (const model of models) {
            try {
              response = await hf.current.textGeneration({
                model,
                inputs: prompt,
                parameters: {
                  max_new_tokens: 150,
                  temperature: 0.7,
                  top_p: 0.95,
                  return_full_text: false,
                },
              });
              break;
            } catch (modelError) {
              console.warn(`Model ${model} failed:`, modelError);
            }
          }

          if (response) {
            let rawResponse = response.generated_text.trim();
            rawResponse = rawResponse.replace(/^Assistant:\s*/i, "");
            const nextTurnIndex = rawResponse.search(/\n(Human|Assistant):/i);
            aiResponse = nextTurnIndex !== -1 
              ? rawResponse.substring(0, nextTurnIndex).trim() 
              : rawResponse;
          } else {
            throw new Error("All models failed");
          }
        } catch (apiError) {
          console.error("Hugging Face API error:", apiError);
          aiResponse = generateFallbackResponse(text);
        }
      } else {
        aiResponse = generateFallbackResponse(text);
      }

      // Update state
      const newHistory = [
        ...updatedHistory,
        { role: "assistant", content: aiResponse }
      ];

      setConversationHistory(newHistory.slice(-MAX_CONVERSATION_HISTORY));
      setAiText(aiResponse);
      speakText(aiResponse);
    } catch (error) {
      console.error("AI response error:", error);
      const fallbackResponse = generateFallbackResponse(text);
      setAiText(fallbackResponse);
      speakText(fallbackResponse);
    } finally {
      setIsProcessing(false);
    }
  }, [confirmingEnd, conversationHistory, isMobile, startListening]);

  // Enhanced fallback response with variation
  const generateFallbackResponse = useCallback((text) => {
    const userTextLower = text.toLowerCase();
    const responses = fallbackResponses.current;
    const randomIndex = Math.floor(Math.random() * 2); // For variation in responses

    if (userTextLower.includes("hello") || userTextLower.includes("hi")) {
      return responses.greetings[randomIndex];
    } else if (userTextLower.includes("how are you")) {
      return responses.howAreYou[randomIndex];
    } else if (userTextLower.includes("weather")) {
      return responses.weather[randomIndex];
    } else if (userTextLower.includes("time")) {
      return responses.time();
    } else if (userTextLower.includes("name")) {
      return responses.name[randomIndex];
    } else if (userTextLower.includes("thank")) {
      return responses.thanks[randomIndex];
    } else if (userTextLower.includes("help")) {
      return responses.help[randomIndex];
    } else if (userTextLower.includes("bye") || userTextLower.includes("goodbye")) {
      return responses.goodbye[randomIndex];
    } else {
      return responses.default(text)[randomIndex];
    }
  }, []);

  // Text-to-Speech with chunking for mobile
  const speakText = useCallback((text, isPrompt = false) => {
    setIsSpeaking(true);
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utteranceRef.current = utterance;
    utterance.lang = "en-US";

    // Voice selection
    let voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        voices = window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.getVoices();
    }

    setTimeout(() => {
      voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(
        voice => voice.name.includes("Google") && voice.lang.includes("en")
      ) || voices.find(voice => voice.lang.includes("en"));
      
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
    }, 50);

    // Speech parameters
    utterance.pitch = isPrompt ? 1.2 : 1.0;
    utterance.rate = isMobile ? 0.9 : 1.0;
    utterance.volume = isPrompt ? 0.9 : 1.0;

    // Event handlers
    utterance.onend = () => {
      setIsSpeaking(false);
      if (!isPrompt && !isMobile) {
        setTimeout(() => {
          if (!isListening && !isProcessing && !isSpeaking) {
            startListening();
          }
        }, 1000);
      }
    };

    utterance.onerror = (event) => {
      console.error("Speech error:", event.error);
      setIsSpeaking(false);
      if (!isPrompt && !isMobile) {
        setTimeout(() => {
          if (!isListening && !isProcessing && !isSpeaking) {
            startListening();
          }
        }, 1000);
      }
    };

    // Chunking for mobile
    if (isMobile && text.length > MOBILE_MAX_SPEECH_LENGTH) {
      const chunks = splitTextIntoChunks(text, MOBILE_MAX_SPEECH_LENGTH);
      let currentChunk = 0;

      const speakNextChunk = () => {
        if (currentChunk < chunks.length) {
          const chunkUtterance = new SpeechSynthesisUtterance(chunks[currentChunk]);
          chunkUtterance.lang = "en-US";
          chunkUtterance.voice = utterance.voice;
          chunkUtterance.pitch = utterance.pitch;
          chunkUtterance.rate = utterance.rate;
          chunkUtterance.volume = utterance.volume;

          chunkUtterance.onend = () => {
            currentChunk++;
            speakNextChunk();
          };

          chunkUtterance.onerror = (event) => {
            console.error("Chunk error:", event.error);
            currentChunk++;
            speakNextChunk();
          };

          window.speechSynthesis.speak(chunkUtterance);
        } else {
          setIsSpeaking(false);
        }
      };

      speakNextChunk();
    } else {
      window.speechSynthesis.speak(utterance);
    }
  }, [isListening, isMobile, isProcessing, isSpeaking, startListening]);

  // Helper function to split text into chunks
  const splitTextIntoChunks = useCallback((text, maxLength) => {
    const chunks = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    let currentChunk = "";

    sentences.forEach((sentence) => {
      if ((currentChunk + sentence).length <= maxLength) {
        currentChunk += (currentChunk ? " " : "") + sentence;
      } else {
        if (currentChunk) chunks.push(currentChunk);
        currentChunk = sentence;
      }
    });

    if (currentChunk) chunks.push(currentChunk);
    return chunks;
  }, []);

  // Conversation management
  const handleEndConversation = useCallback(() => {
    if (!confirmingEnd) {
      setConfirmingEnd(true);
      const confirmationMessage = "Are you sure you want to end this conversation? All history will be cleared.";
      setAiText(confirmationMessage);
      speakText(confirmationMessage, true);
    } else {
      setConversationHistory([]);
      setUserText("");
      setAiText("");
      setConfirmingEnd(false);
      setShowEndConvo(false);
      finalTranscriptRef.current = "";
      interimResultRef.current = "";

      if (autoListenMode && !isMobile) {
        setTimeout(startListening, 1500);
      }
    }
  }, [autoListenMode, confirmingEnd, isMobile, speakText, startListening]);

  const cancelEndConversation = useCallback(() => {
    setConfirmingEnd(false);
    const continueMessage = "Conversation continued. What would you like to talk about next?";
    setAiText(continueMessage);
    speakText(continueMessage);
  }, [speakText]);

  // Settings modal
  const openSettings = useCallback(() => {
    document.getElementById("settings-modal").showModal();
  }, []);

  // Wave animation component
  const WaveAnimation = useCallback(() => (
    <div className="flex space-x-1 justify-center items-center h-12">
      {[1, 2, 3, 4, 5].map((i) => (
        <motion.div
          key={i}
          className="w-1 h-8 bg-red-600 rounded-full"
          animate={{
            height: [16, 32, 16],
            opacity: [0.6, 1, 0.6],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: i * 0.1,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  ), []);

  return (
    <div className="bg-gray-50 min-h-screen flex flex-col relative">
      {/* Header Bar */}
      <motion.div
        className="bg-gradient-to-r from-red-500 to-red-600 text-white py-4 px-6 flex justify-between items-center shadow-md"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center">
          <Sparkles className="w-6 h-6 mr-2" />
          <button
            onClick={handleHomeNavigation}
            className="text-white font-bold text-lg"
          >
            <h1 className="text-xl font-bold">FluentMe AI</h1>
          </button>
        </div>
        <button
          onClick={openSettings}
          className="p-2 rounded-full hover:bg-orange-600 transition-colors"
        >
          <Settings className="w-5 h-5 text-white" />
        </button>
      </motion.div>

      {/* Main Content */}
      <div className="flex flex-col flex-grow px-4 py-8 md:px-8 md:py-12 max-w-5xl mx-auto w-full">
        {/* Top Container - AI Response Area */}
        <motion.div
          className="w-full bg-white rounded-3xl border border-gray-300 p-6 shadow-lg mb-8 flex flex-col"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          style={{ minHeight: "320px" }}
        >
          {/* Glass effect panel at the top */}
          <div className="bg-red-700 text-white rounded-3xl p-4 mb-6 shadow-md flex items-center justify-between">
            <div className="flex items-center">
              <div className="bg-white rounded-full p-2 mr-3">
                <Speaker className="w-5 h-5 text-orange-500" />
              </div>
              <h2 className="text-xl font-bold">AI Assistant</h2>
            </div>

            {isSpeaking && <WaveAnimation />}
          </div>

          {/* AI Model Container */}
          <div className="flex-grow flex items-center justify-center mb-6 relative">
            <motion.div
              className="absolute inset-0 bg-red-100 rounded-full opacity-30"
              animate={{
                scale: [1, 1.05, 1],
                opacity: [0.1, 0.2, 0.1],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              style={{ width: "80%", height: "80%", margin: "auto" }}
            />
            <AiModelContainer />
          </div>

          {/* AI Response Text Area */}
          <div className="bg-red-500 rounded-2xl p-5 w-full shadow-md">
            <motion.p
              className="text-lg text-center text-white font-medium"
              animate={isSpeaking ? { opacity: [0.9, 1, 0.9] } : {}}
              transition={{ duration: 1.5, repeat: isSpeaking ? Infinity : 0 }}
            >
              {aiText || (isMobile ? "Tap the microphone to start" : "I'm listening to you...")}
            </motion.p>
          </div>
        </motion.div>

        {/* Bottom Container - Microphone Area */}
        <motion.div
          className="w-full bg-white rounded-3xl p-6 shadow-md border border-gray-200"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="flex items-center">
            {/* Microphone Button */}
            <motion.button
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
                isListening
                  ? "bg-red-700 shadow-orange-200"
                  : isProcessing
                  ? "bg-yellow-500"
                  : isSpeaking
                  ? "bg-green-500"
                  : "bg-red-700"
              }`}
              onClick={toggleListening}
              disabled={isProcessing}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              animate={
                isListening
                  ? {
                      boxShadow: [
                        "0 0 0 0 rgba(249, 115, 22, 0.7)",
                        "0 0 0 10px rgba(249, 115, 22, 0)",
                        "0 0 0 0 rgba(249, 115, 22, 0)",
                      ],
                    }
                  : {}
              }
              transition={
                isListening
                  ? {
                      duration: 2,
                      repeat: Infinity,
                      repeatType: "loop",
                    }
                  : {}
              }
            >
              {isListening ? (
                <Mic className="w-10 h-10 text-white" />
              ) : isProcessing ? (
                <Loader className="w-10 h-10 text-white animate-spin" />
              ) : isSpeaking ? (
                <Volume2 className="w-10 h-10 text-white" />
              ) : (
                <Mic className="w-10 h-10 text-white" />
              )}
            </motion.button>

            {/* User Text Area */}
            <div className="ml-6 flex-grow">
              <div className="bg-gray-50 rounded-xl p-4 shadow-md border border-gray-100">
                <textarea
                  className="w-full h-20 bg-transparent text-gray-800 resize-none focus:outline-none font-medium"
                  value={isProcessing ? "Processing your speech..." : userText}
                  readOnly
                  placeholder={isMobile ? "Tap microphone and speak..." : "Speak now..."}
                />
              </div>

              {/* Status Text */}
              <div className="mt-3 text-sm font-medium flex items-center">
                <span
                  className={`inline-block w-2 h-2 rounded-full mr-2 ${
                    isListening
                      ? "bg-orange-500 animate-pulse"
                      : isProcessing
                      ? "bg-yellow-500"
                      : isSpeaking
                      ? "bg-green-500"
                      : "bg-gray-400"
                  }`}
                ></span>
                <span className="text-gray-700">
                  {isListening
                    ? isPaused
                      ? "Paused... Are you still speaking?"
                      : "Listening..."
                    : isProcessing
                    ? "Processing speech..."
                    : isSpeaking
                    ? "Speaking..."
                    : "Click microphone to start"}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
        
        {/* Conversation Controls */}
        <div className="flex justify-center items-center mt-6">
          {showEndConvo && (
            <motion.button
              className={`ml-4 px-4 py-2 rounded-xl font-medium ${
                confirmingEnd
                  ? "bg-red-600 text-white"
                  : "bg-gray-200 text-gray-800"
              }`}
              onClick={handleEndConversation}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {confirmingEnd ? "Confirm End" : "End Conversation"}
            </motion.button>
          )}

          {confirmingEnd && (
            <motion.button
              className="ml-2 px-4 py-2 rounded-xl font-medium bg-gray-200 text-gray-800"
              onClick={cancelEndConversation}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Cancel
            </motion.button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="bg-white border-t border-gray-200 py-4 px-6 text-center">
        <p className="text-gray-500 text-sm">© 2025 FluentMe • AIR Studios</p>
      </div>

      {/* Settings Modal */}
      <dialog
        id="settings-modal"
        className="bg-white rounded-xl p-6 shadow-2xl mt-20 border border-gray-200 w-11/12 max-w-lg mx-auto"
      >
        <div className="flex justify-between items-center mb-6 border-b border-gray-200 pb-4">
          <h2 className="text-2xl font-bold text-black">
            Voice Assistant Settings
          </h2>
          <button
            onClick={() => document.getElementById("settings-modal").close()}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              ></path>
            </svg>
          </button>
        </div>

        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-800">
            Text-to-Speech Options
          </h3>

          <p className="text-sm text-gray-600 mb-3">
            Using your browser's built-in Web Speech API for voice recognition
            and synthesis.
          </p>

          {isMobile && (
            <div className="bg-orange-50 border-l-4 border-orange-500 p-4 mb-4 rounded">
              <p className="text-sm text-orange-700 font-medium">
                Mobile device detected.
              </p>
              <p className="text-sm text-orange-700 mt-1">
                Speech recognition on mobile has some limitations. For best
                results:
              </p>
              <ul className="text-sm text-orange-700 mt-1 list-disc pl-5">
                <li>Speak clearly and at a moderate pace</li>
                <li>Use Chrome browser for best compatibility</li>
                <li>After each response, tap the mic button to speak again</li>
              </ul>
            </div>
          )}

          <div className="bg-orange-50 border-l-4 border-orange-500 p-4 mb-4 rounded">
            <p className="text-sm text-orange-700">
              For best results, use Chrome or Edge browsers, which provide the
              most reliable voice recognition.
            </p>
          </div>

          <div className="mt-4">
            <label className="flex items-center cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={autoListenMode}
                  onChange={() => setAutoListenMode(!autoListenMode)}
                />
                <div
                  className={`block w-10 h-6 rounded-full ${
                    autoListenMode ? "bg-red-500" : "bg-gray-400"
                  }`}
                ></div>
                <div
                  className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition ${
                    autoListenMode ? "transform translate-x-4" : ""
                  }`}
                ></div>
              </div>
              <div className="ml-3 text-sm font-medium text-gray-700">
                Auto-listening mode
              </div>
            </label>
            <p className="text-xs text-gray-500 mt-1">
              When enabled, the microphone will automatically reactivate after
              responses
            </p>
          </div>

          <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h4 className="text-sm font-medium mb-2 flex items-center">
              <Zap className="w-4 h-4 mr-1 text-yellow-500" />
              System Status:
            </h4>
            <p className="text-sm flex items-center mb-2">
              {hf.current ? (
                <span className="flex items-center text-green-600">
                  <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                  AI Service: Connected
                </span>
              ) : (
                <span className="flex items-center text-orange-600">
                  <span className="w-2 h-2 rounded-full bg-orange-500 mr-2"></span>
                  AI Service: Not connected (Using fallback responses)
                </span>
              )}
            </p>
            <p className="text-sm flex items-center">
              <span
                className={`flex items-center ${
                  isMobile ? "text-orange-600" : "text-green-600"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    isMobile ? "bg-orange-500" : "bg-green-500"
                  } mr-2`}
                ></span>
                Device Type:{" "}
                {isMobile
                  ? "Mobile (Limited functionality)"
                  : "Desktop (Full functionality)"}
              </span>
            </p>
          </div>
        </div>

        <div className="flex justify-between">
          <button
            onClick={() => window.location.reload()}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-6 rounded-xl transition-colors shadow-md"
          >
            Reset AI
          </button>

          <button
            onClick={() => document.getElementById("settings-modal").close()}
            className="bg-red-500 hover:bg-red-600 text-white font-medium py-2 px-6 rounded-xl transition-colors shadow-md"
          >
            Close
          </button>
        </div>
      </dialog>
    </div>
  );
};

export default AiVoiceInterface;