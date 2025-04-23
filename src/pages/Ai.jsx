import React, { useState, useRef, useEffect } from "react";
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

const AiVoiceInterface = () => {
  // User interaction states
  const [userText, setUserText] = useState(""); // User's spoken text
  const [aiText, setAiText] = useState(""); // AI's response text
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false); // Track if user is pausing
  const [isMobile, setIsMobile] = useState(false); // Track if using a mobile device

  // AI conversation history
  const [conversationHistory, setConversationHistory] = useState([]);

  // References
  const speechRecognitionRef = useRef(null);
  const navigate = useNavigate();
  const initialLoadRef = useRef(true);
  const pauseTimerRef = useRef(null);
  const interimResultRef = useRef(""); // Store interim results
  const finalTranscriptRef = useRef(""); // Store final transcript
  const recognitionActiveRef = useRef(false); // Track if recognition is actually active

  // Hugging Face client reference
  const hf = useRef(null);

  // Detect mobile device on component mount
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || window.opera;
      const mobileRegex = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
      setIsMobile(mobileRegex.test(userAgent.toLowerCase()));
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize Hugging Face client on component mount
  useEffect(() => {
    // Get API key from environment variable
    const hfApiKey = import.meta.env.VITE_HUGGINGFACE_API_KEY;

    if (hfApiKey) {
      try {
        hf.current = new HfInference(hfApiKey);
        console.log("Hugging Face client initialized");

        // Test the API with a simple request to verify it works
        hf.current
          .textGeneration({
            model: "gpt2", // Use a simple, reliable model for the test
            inputs: "Hello, I am",
            parameters: { max_new_tokens: 5 },
          })
          .then(() => {
            console.log("Hugging Face API test successful");
          })
          .catch((error) => {
            console.error("Hugging Face API test failed:", error);
            hf.current = null; // Reset if test fails
          });
      } catch (error) {
        console.error("Error initializing Hugging Face client:", error);
        hf.current = null;
      }
    } else {
      console.warn("Hugging Face API key not found in environment variables");
    }
  }, []);

  // Initialize Web Speech API on component mount with mobile-specific handling
  useEffect(() => {
    // Check if browser supports the Web Speech API
    if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      speechRecognitionRef.current = new SpeechRecognition();
      
      // Different configuration for mobile vs desktop
      if (isMobile) {
        // On mobile, continuous mode is less reliable, so we use shorter sessions
        speechRecognitionRef.current.continuous = false;
        speechRecognitionRef.current.interimResults = true;
        speechRecognitionRef.current.maxAlternatives = 1;
      } else {
        // Desktop configuration
        speechRecognitionRef.current.continuous = true;
        speechRecognitionRef.current.interimResults = true;
      }
      
      speechRecognitionRef.current.lang = "en-US";

      // Configure speech recognition event handlers
      speechRecognitionRef.current.onstart = () => {
        console.log("Speech recognition started");
        recognitionActiveRef.current = true;
      };

      speechRecognitionRef.current.onresult = (event) => {
        let interimTranscript = "";
        let finalTranscript = finalTranscriptRef.current;

        // Process both interim and final results
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

        // Update shown text with both final and interim results
        const displayText = (finalTranscript + " " + interimTranscript).trim();
        setUserText(displayText);

        // Reset pause detection timer whenever we get new speech
        resetPauseDetection();
      };

      speechRecognitionRef.current.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        recognitionActiveRef.current = false;
        
        if (isListening) {
          setIsListening(false);
        }
        
        setIsProcessing(false);
        clearPauseDetection();
        
        // For mobile, don't auto-restart on errors to prevent loops
        if (!isMobile && !isProcessing && !isSpeaking) {
          setTimeout(() => startListening(), 1500);
        }
      };

      speechRecognitionRef.current.onend = () => {
        console.log("Speech recognition ended");
        recognitionActiveRef.current = false;
        
        // When recognition ends without explicit stop (timeout or error)
        if (isListening) {
          setIsListening(false);
        }

        clearPauseDetection();

        // If we have some final transcript, process it
        if (finalTranscriptRef.current.trim()) {
          setIsProcessing(true);
          handleAiResponse(finalTranscriptRef.current.trim());
          // Reset for next listening session
          finalTranscriptRef.current = "";
          interimResultRef.current = "";
        } else if (!isMobile && !isProcessing && !isSpeaking) {
          // Auto-restart only on desktop
          setTimeout(() => startListening(), 1000);
        }
      };
    } else {
      alert(
        "Your browser does not support the Web Speech API. Please try Chrome or Edge."
      );
    }

    // Auto-start listening when component mounts, but only on desktop
    if (initialLoadRef.current && !isMobile) {
      initialLoadRef.current = false;
      // Small delay to ensure component is fully mounted
      const timer = setTimeout(() => {
        startListening();
      }, 800);
      return () => clearTimeout(timer);
    }

    // Cleanup pause detection on unmount
    return () => {
      clearPauseDetection();
    };
  }, [isMobile]); // Re-run when mobile status changes

  // Handle cleanup on component unmount
  useEffect(() => {
    return () => {
      if (speechRecognitionRef.current && recognitionActiveRef.current) {
        try {
          speechRecognitionRef.current.stop();
          recognitionActiveRef.current = false;
        } catch (e) {
          // Ignore errors when stopping
        }
      }
      // Cancel any ongoing speech synthesis
      window.speechSynthesis.cancel();
      clearPauseDetection();
    };
  }, []);

  // Reset pause detection timer
  const resetPauseDetection = () => {
    setIsPaused(false);

    // Clear existing timer
    clearPauseDetection();

    // Set new timer for pause detection (shorter for mobile)
    const pauseTimeout = isMobile ? 2000 : 4000;
    pauseTimerRef.current = setTimeout(() => {
      setIsPaused(true);

      // Automatically process speech after detecting a pause
      if (isListening && finalTranscriptRef.current.trim()) {
        // Call stopListening() which will process the speech
        stopListening();
      }
    }, pauseTimeout);
  };

  // Clear pause detection timer
  const clearPauseDetection = () => {
    if (pauseTimerRef.current) {
      clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
  };

  // Home button navigation handler
  const handleHomeNavigation = () => {
    navigate("/"); // Navigate to the home page
  };

  // Improved start listening function with mobile-specific handling
  const startListening = () => {
    if (!speechRecognitionRef.current) return;

    // Prevent starting if already active
    if (recognitionActiveRef.current) {
      console.log("Recognition already active, not restarting");
      return;
    }

    try {
      setIsListening(true);
      setUserText("");
      finalTranscriptRef.current = "";
      interimResultRef.current = "";

      speechRecognitionRef.current.start();
      resetPauseDetection();

      // Auto stop after shorter period on mobile to prevent issues
      const autoStopTime = isMobile ? 10000 : 30000;
      setTimeout(() => {
        if (recognitionActiveRef.current) {
          try {
            speechRecognitionRef.current.stop();
          } catch (e) {
            console.log("Error stopping timed recognition:", e);
          }
        }
      }, autoStopTime);
    } catch (error) {
      console.error("Error starting speech recognition:", error);
      setIsListening(false);
      recognitionActiveRef.current = false;

      // If the error is about recognition already started, force reset it
      if (error.message && error.message.includes("already started")) {
        try {
          speechRecognitionRef.current.stop();
          recognitionActiveRef.current = false;
          // Try again after a short delay
          setTimeout(() => {
            setIsListening(false);
            startListening();
          }, 500);
        } catch (stopError) {
          console.error(
            "Error stopping already running recognition:",
            stopError
          );
        }
      }
    }
  };

  const stopListening = () => {
    if (speechRecognitionRef.current && recognitionActiveRef.current) {
      try {
        speechRecognitionRef.current.stop();
        recognitionActiveRef.current = false;
      } catch (error) {
        console.error("Error stopping speech recognition:", error);
      } finally {
        setIsListening(false);
        clearPauseDetection();

        // If we have content, process it
        if (finalTranscriptRef.current.trim()) {
          setIsProcessing(true);
          handleAiResponse(finalTranscriptRef.current.trim());
        } else if (!isMobile) {
          // If no content and on desktop, restart listening after a short delay
          setTimeout(() => {
            if (!isListening && !isProcessing && !isSpeaking) {
              startListening();
            }
          }, 1000);
        }
      }
    } else {
      // If recognition isn't actually active but UI thinks it is
      setIsListening(false);
      
      // Check if we have content to process
      if (finalTranscriptRef.current.trim()) {
        setIsProcessing(true);
        handleAiResponse(finalTranscriptRef.current.trim());
      }
    }
  };

  // Enhanced AI response handling
  const handleAiResponse = async (text) => {
    if (!text) {
      if (!isMobile) {
        setTimeout(startListening, 500);
      }
      setIsProcessing(false);
      return;
    }

    try {
      setIsProcessing(true);

      // Add user message to history
      const updatedHistory = [
        ...conversationHistory,
        { role: "user", content: text },
      ];

      // Create a cleaner prompt
      let prompt = "";
      if (updatedHistory.length > 0) {
        // Only take the last few messages to avoid repetition
        const recentMessages = updatedHistory.slice(-4);

        prompt = recentMessages
          .map(
            (msg) =>
              `${msg.role === "user" ? "Human" : "Assistant"}: ${msg.content}`
          )
          .join("\n");

        prompt += "\nAssistant:";
      } else {
        prompt = `Human: ${text}\nAssistant:`;
      }

      let aiResponse = "";

      // Try to use Hugging Face if available
      if (hf.current) {
        try {
          // Try multiple models in sequence until one works
          const models = [
            "gpt2", // This is a very reliable model on HF
            "distilgpt2",
            "EleutherAI/gpt-neo-125M",
          ];

          let response = null;

          // Try each model until one works
          for (const model of models) {
            try {
              console.log(`Trying model: ${model}`);
              response = await hf.current.textGeneration({
                model: model,
                inputs: prompt,
                parameters: {
                  max_new_tokens: 150,
                  temperature: 0.7,
                  top_p: 0.95,
                  return_full_text: false,
                },
              });

              // If we get here, the model worked
              console.log(`Successfully used model: ${model}`);
              break;
            } catch (modelError) {
              console.warn(`Model ${model} failed:`, modelError);
              // Continue to next model
            }
          }

          // If we got a response, use it
          if (response) {
            // Clean the response to prevent repetition patterns
            let rawResponse = response.generated_text.trim();

            // Remove any "Assistant:" prefixes that might have been generated
            rawResponse = rawResponse.replace(/^Assistant:\s*/i, "");

            // Cut off at the first instance of "Human:" or "Assistant:" to prevent repetition
            const nextTurnIndex = rawResponse.search(/\n(Human|Assistant):/i);
            if (nextTurnIndex !== -1) {
              rawResponse = rawResponse.substring(0, nextTurnIndex).trim();
            }

            // Assign cleaned response
            aiResponse = rawResponse;
          } else {
            // All models failed, use fallback
            throw new Error("All models failed");
          }
        } catch (apiError) {
          console.error("All Hugging Face models failed:", apiError);
          // Fall back to our simple responses
          aiResponse = generateFallbackResponse(text);
        }
      } else {
        // No HF client, use fallback
        aiResponse = generateFallbackResponse(text);
      }

      // Update conversation history
      const newHistory = [
        ...updatedHistory,
        { role: "assistant", content: aiResponse },
      ];

      // Only keep the last 10 messages to prevent buildup
      if (newHistory.length > 10) {
        setConversationHistory(newHistory.slice(-10));
      } else {
        setConversationHistory(newHistory);
      }

      // Update UI and speak response
      setAiText(aiResponse);
      speakText(aiResponse);
    } catch (error) {
      console.error("Error in AI response flow:", error);
      const fallbackResponse = generateFallbackResponse(text);
      setAiText(fallbackResponse);
      speakText(fallbackResponse);
    } finally {
      setIsProcessing(false);
    }
  };

  // Enhanced fallback response generator
  const generateFallbackResponse = (text) => {
    const userTextLower = text.toLowerCase();

    if (userTextLower.includes("hello") || userTextLower.includes("hi")) {
      return "Hello there! I'm FluentMe AI, your language assistant. How can I help you today?";
    } else if (userTextLower.includes("how are you")) {
      return "I'm doing well, thank you for asking! How are you doing today?";
    } else if (userTextLower.includes("weather")) {
      return "I don't have access to real-time weather data, but I'd be happy to help you with language learning.";
    } else if (userTextLower.includes("time")) {
      const now = new Date();
      return `The current time is ${now.toLocaleTimeString()}.`;
    } else if (userTextLower.includes("name")) {
      return "My name is FluentMe AI. I'm your language assistant. What would you like to practice today?";
    } else if (userTextLower.includes("thank")) {
      return "You're welcome! I'm glad I could help. Anything else you'd like to practice?";
    } else if (userTextLower.includes("help")) {
      return "I'm here to help with your language practice! You can speak to me in any language, and I'll help you improve your fluency.";
    } else if (
      userTextLower.includes("bye") ||
      userTextLower.includes("goodbye")
    ) {
      return "Goodbye! It was nice practicing with you. Feel free to return anytime for more language practice!";
    } else {
      return `I heard you say: "${text}". Let's continue our language practice. What topic would you like to discuss next?`;
    }
  };

  // Text-to-Speech function with Web Speech API - improved for mobile
  const speakText = (text, isPrompt = false) => {
    setIsSpeaking(true);

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";

    // Get available voices - forcing fetch on mobile
    let voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) {
      // On some mobile browsers, we need to force voices to load
      window.speechSynthesis.onvoiceschanged = () => {
        voices = window.speechSynthesis.getVoices();
      };
      window.speechSynthesis.getVoices();
    }

    // Try to find a good English voice after a small delay
    setTimeout(() => {
      voices = window.speechSynthesis.getVoices();
      const preferredVoice =
        voices.find(
          (voice) => voice.name.includes("Google") && voice.lang.includes("en")
        ) || voices.find((voice) => voice.lang.includes("en"));

      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
    }, 50);

    // For prompts, use different pitch and rate
    if (isPrompt) {
      utterance.pitch = 1.2; // Slightly higher pitch
      utterance.rate = 1.1; // Slightly faster
      utterance.volume = 0.9; // Slightly quieter
    } else {
      // More mobile-friendly voice settings
      utterance.pitch = 1.0;
      utterance.rate = isMobile ? 0.9 : 1.0; // Slower on mobile for clarity
      utterance.volume = 1.0;
    }

    // Handle speech completion
    utterance.onend = () => {
      setIsSpeaking(false);
      if (!isPrompt && !isMobile) {
        // Only restart listening after full responses on desktop
        setTimeout(() => {
          if (!isListening && !isProcessing && !isSpeaking) {
            startListening();
          }
        }, 1000);
      }
    };

    // Handle speech errors
    utterance.onerror = (event) => {
      console.error("Speech synthesis error:", event.error);
      setIsSpeaking(false);
      if (!isPrompt && !isMobile) {
        setTimeout(() => {
          if (!isListening && !isProcessing && !isSpeaking) {
            startListening();
          }
        }, 1000);
      }
    };

    // Work around mobile browser limitations by chunking text
    if (isMobile && text.length > 100) {
      // On mobile, long text can cause issues, so we split into smaller chunks
      const chunks = splitTextIntoChunks(text, 100);
      
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
            console.error("Chunk speech error:", event.error);
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
  };

  // Helper function to split text into smaller chunks for mobile speech
  const splitTextIntoChunks = (text, maxLength) => {
    const chunks = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    let currentChunk = "";
    
    sentences.forEach(sentence => {
      if ((currentChunk + sentence).length <= maxLength) {
        currentChunk += (currentChunk ? " " : "") + sentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        currentChunk = sentence;
      }
    });
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  };

  // Toggle listening state when button is clicked - with safeguards
  const toggleListening = () => {
    // Prevent multiple rapid clicks
    if (isProcessing) return;
    
    if (isListening) {
      stopListening();
    } else {
      // Make sure we're not in a bad state before starting
      if (recognitionActiveRef.current) {
        try {
          speechRecognitionRef.current.stop();
          recognitionActiveRef.current = false;
          
          // Give the system time to clean up before restarting
          setTimeout(() => {
            startListening();
          }, 300);
        } catch (e) {
          console.log("Error resetting recognition before restart:", e);
          startListening();
        }
      } else {
        startListening();
      }
    }
  };

  // Settings modal functions
  const openSettings = () => {
    document.getElementById("settings-modal").showModal();
  };

  // Wave animation component for visual feedback
  const WaveAnimation = () => (
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
  );

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
          <h1 className="text-xl font-bold">FluentMe AI</h1>
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

            {/* Wave animation when speaking */}
            {isSpeaking && <WaveAnimation />}
          </div>

          {/* AI Model Container with enhanced styling */}
          <div className="flex-grow flex items-center justify-center mb-6 relative">
            {/* Add subtle pulse animation */}
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

          {/* AI Response Text Area with modern styling */}
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

        {/* Bottom Container - Microphone Area with enhanced styling */}
        <motion.div
          className="w-full bg-white rounded-3xl p-6 shadow-md border border-gray-200"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <div className="flex items-center">
            {/* Enhanced Microphone Button */}
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

            {/* User Text Area with enhanced styling */}
            <div className="ml-6 flex-grow">
              <div className="bg-gray-50 rounded-xl p-4 shadow-md border border-gray-100">
                <textarea
                  className="w-full h-20 bg-transparent text-gray-800 resize-none focus:outline-none font-medium"
                  value={isProcessing ? "Processing your speech..." : userText}
                  readOnly
                  placeholder={isMobile ? "Tap microphone and speak..." : "Speak now..."}
                />
              </div>

              {/* Status Text with nicer styling */}
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
                Speech recognition on mobile has some limitations. For best results:
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
              <span className={`flex items-center ${isMobile ? "text-orange-600" : "text-green-600"}`}>
                <span className={`w-2 h-2 rounded-full ${isMobile ? "bg-orange-500" : "bg-green-500"} mr-2`}></span>
                Device Type: {isMobile ? "Mobile (Limited functionality)" : "Desktop (Full functionality)"}
              </span>
            </p>
          </div>
        </div>

        <div className="flex justify-between">
          <button
            onClick={() => {
              window.location.reload();
            }}
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