import React, { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Mic,
  MicOff,
  Volume2,
  ArrowRight,
  Speaker,
  Settings,
  Zap,
  House,
  Loader
} from "lucide-react";
import AiModelContainer from "../components/ai/AiModelContainer";
import { useNavigate } from "react-router-dom";
import { HfInference } from '@huggingface/inference';

const AiVoiceInterface = () => {
  // User interaction states
  const [userText, setUserText] = useState(""); // User's spoken text
  const [aiText, setAiText] = useState(""); // AI's response text
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false); // Track if user is pausing
  const [showSettings, setShowSettings] = useState(false); // For mobile settings toggle
  
  // AI conversation history
  const [conversationHistory, setConversationHistory] = useState([]);
  
  // References
  const speechRecognitionRef = useRef(null);
  const navigate = useNavigate();
  const initialLoadRef = useRef(true);
  const pauseTimerRef = useRef(null);
  const interimResultRef = useRef(""); // Store interim results
  const finalTranscriptRef = useRef(""); // Store final transcript
  
  // Hugging Face client reference
  const hf = useRef(null);
  
  // Initialize Hugging Face client on component mount
  useEffect(() => {
    // Get API key from environment variable
    const hfApiKey = import.meta.env.VITE_HUGGINGFACE_API_KEY;
    
    if (hfApiKey) {
      try {
        hf.current = new HfInference(hfApiKey);
        console.log("Hugging Face client initialized");
        
        // Test the API with a simple request to verify it works
        hf.current.textGeneration({
          model: 'gpt2',  // Use a simple, reliable model for the test
          inputs: 'Hello, I am',
          parameters: { max_new_tokens: 5 }
        }).then(() => {
          console.log("Hugging Face API test successful");
        }).catch(error => {
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

  // Initialize Web Speech API on component mount
  useEffect(() => {
    // Check if browser supports the Web Speech API
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      speechRecognitionRef.current = new SpeechRecognition();
      speechRecognitionRef.current.continuous = true; // Keep recognition active
      speechRecognitionRef.current.interimResults = true; // Get interim results
      speechRecognitionRef.current.lang = 'en-US';
      
      // Configure speech recognition event handlers
      speechRecognitionRef.current.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = finalTranscriptRef.current;
        
        // Process both interim and final results
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += ' ' + transcript;
            finalTranscriptRef.current = finalTranscript;
          } else {
            interimTranscript += transcript;
          }
        }
        
        interimResultRef.current = interimTranscript;
        
        // Update shown text with both final and interim results
        const displayText = (finalTranscript + ' ' + interimTranscript).trim();
        setUserText(displayText);
        
        // Reset pause detection timer whenever we get new speech
        resetPauseDetection();
      };
      
      speechRecognitionRef.current.onerror = (event) => {
        console.error("Speech recognition error:", event.error);
        setIsListening(false);
        setIsProcessing(false);
        clearPauseDetection();
        setTimeout(() => {
          if (!isListening && !isProcessing && !isSpeaking) {
            startListening();
          }
        }, 1500);
      };
      
      speechRecognitionRef.current.onend = () => {
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
        }
      };
    } else {
      alert("Your browser does not support the Web Speech API. Please try Chrome or Edge.");
    }
    
    // Auto-start listening when component mounts
    if (initialLoadRef.current) {
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
  }, []);

  // Handle cleanup on component unmount
  useEffect(() => {
    return () => {
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
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
    
    // Set new timer for pause detection (4 seconds)
    pauseTimerRef.current = setTimeout(() => {
      setIsPaused(true);
      // Ask if still speaking
      if (isListening) {
        speakText("Are you still speaking?", true);
        
        // Give user additional time to respond
        setTimeout(() => {
          if (isListening && interimResultRef.current === "" && finalTranscriptRef.current.trim()) {
            // No new speech after prompt, finish up
            stopListening();
          } else {
            // Clear the "Are you still speaking?" prompt as user continued
            setAiText("");
          }
        }, 5000);
      }
    }, 4000);
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
    navigate('/'); // Navigate to the home page
  };

  // Improved start listening function
  const startListening = () => {
    if (!speechRecognitionRef.current) return;
    
    try {
      // Check if recognition is already active before starting
      if (isListening) {
        console.log("Recognition already active, not restarting");
        return; // Don't restart if already listening
      }
      
      setIsListening(true);
      setUserText("");
      finalTranscriptRef.current = "";
      interimResultRef.current = "";
      
      speechRecognitionRef.current.start();
      resetPauseDetection();
      
      // Auto stop after 30 seconds if still listening
      setTimeout(() => {
        if (isListening) {
          try {
            speechRecognitionRef.current.stop();
          } catch (e) {
            console.log("Error stopping timed recognition:", e);
          }
        }
      }, 30000);
    } catch (error) {
      console.error("Error starting speech recognition:", error);
      setIsListening(false);
      
      // If the error is about recognition already started, force reset it
      if (error.message && error.message.includes("already started")) {
        try {
          speechRecognitionRef.current.stop();
          // Try again after a short delay
          setTimeout(() => {
            setIsListening(false);
            startListening();
          }, 500);
        } catch (stopError) {
          console.error("Error stopping already running recognition:", stopError);
        }
      }
    }
  };

  // Safe stop function with better error handling
  const stopListening = () => {
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (error) {
        console.error("Error stopping speech recognition:", error);
      } finally {
        setIsListening(false);
        clearPauseDetection();
        
        // If we have content, process it
        if (finalTranscriptRef.current.trim()) {
          setIsProcessing(true);
          handleAiResponse(finalTranscriptRef.current.trim());
        } else {
          // If no content, restart listening after a short delay
          setTimeout(() => {
            if (!isListening && !isProcessing && !isSpeaking) {
              startListening();
            }
          }, 1000);
        }
      }
    }
  };

  // Enhanced AI response handling - FIXED
  const handleAiResponse = async (text) => {
    if (!text) {
      setTimeout(startListening, 500);
      setIsProcessing(false);
      return;
    }
    
    try {
      setIsProcessing(true);
      
      // Add user message to history
      const updatedHistory = [
        ...conversationHistory, 
        { role: 'user', content: text }
      ];
      
      // Create a cleaner prompt - FIXED: Don't include "Assistant:" multiple times
      let prompt = '';
      if (updatedHistory.length > 0) {
        // Only take the last few messages to avoid repetition
        const recentMessages = updatedHistory.slice(-4);
        
        prompt = recentMessages.map(msg => 
          `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`
        ).join('\n');
        
        prompt += '\nAssistant:';
      } else {
        prompt = `Human: ${text}\nAssistant:`;
      }
      
      let aiResponse = "";
      
      // Try to use Hugging Face if available
      if (hf.current) {
        try {
          // Try multiple models in sequence until one works
          const models = [
            'gpt2',  // This is a very reliable model on HF
            'distilgpt2',
            'EleutherAI/gpt-neo-125M'
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
                  return_full_text: false
                }
              });
              
              // If we get here, the model worked
              console.log(`Successfully used model: ${model}`);
              break;
            } catch (modelError) {
              console.warn(`Model ${model} failed:`, modelError);
              // Continue to next model
            }
          }
          
          // If we got a response, use it - FIXED: Clean up response
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
      
      // Update conversation history - FIXED: Limit history size better
      const newHistory = [
        ...updatedHistory,
        { role: 'assistant', content: aiResponse }
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
  
  // Enhanced fallback response generator - IMPROVED
  const generateFallbackResponse = (text) => {
    const userTextLower = text.toLowerCase();
    
    // Added a personalized name and improved responses
    if (userTextLower.includes("hello") || userTextLower.includes("hi")) {
      return "Hello there! I'm Bailey, your AI assistant. How can I help you today?";
    } else if (userTextLower.includes("how are you")) {
      return "I'm doing well, thank you for asking! How are you doing today?";
    } else if (userTextLower.includes("weather")) {
      return "I don't have access to real-time weather data, but I'd be happy to help you with something else.";
    } else if (userTextLower.includes("time")) {
      const now = new Date();
      return `The current time is ${now.toLocaleTimeString()}.`;
    } else if (userTextLower.includes("name")) {
      return "My name is Bailey. I'm your AI voice assistant. What would you like to talk about?";
    } else if (userTextLower.includes("thank")) {
      return "You're welcome! I'm glad I could help. Anything else you'd like to chat about?";
    } else if (userTextLower.includes("help")) {
      return "I'm here to help! You can ask me questions, chat with me, or just tell me what's on your mind.";
    } else if (userTextLower.includes("bye") || userTextLower.includes("goodbye")) {
      return "Goodbye! It was nice talking with you. Feel free to chat again anytime!";
    } else {
      return `I heard you say: "${text}". I'm currently operating in offline mode with limited responses. What would you like to know more about?`;
    }
  };
  
  // Text-to-Speech function with Web Speech API
  const speakText = (text, isPrompt = false) => {
    setIsSpeaking(true);
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    
    // Get available voices
    const voices = window.speechSynthesis.getVoices();
    
    // Try to find a good English voice
    const preferredVoice = voices.find(voice => 
      voice.name.includes("Google") && voice.lang.includes("en")
    ) || voices.find(voice => voice.lang.includes("en"));
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    
    // For prompts, use different pitch and rate
    if (isPrompt) {
      utterance.pitch = 1.2;  // Slightly higher pitch
      utterance.rate = 1.1;   // Slightly faster
      utterance.volume = 0.9; // Slightly quieter
    }
    
    utterance.onend = () => {
      setIsSpeaking(false);
      if (!isPrompt) {
        // Only restart listening after full responses, not prompts
        setTimeout(() => {
          if (!isListening && !isProcessing && !isSpeaking) {
            startListening();
          }
        }, 1000);
      }
    };
    
    utterance.onerror = () => {
      setIsSpeaking(false);
      if (!isPrompt) {
        setTimeout(() => {
          if (!isListening && !isProcessing && !isSpeaking) {
            startListening();
          }
        }, 1000);
      }
    };
    
    window.speechSynthesis.speak(utterance);
  };

  // Toggle listening state when button is clicked
  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Toggle settings panel for mobile
  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

  // Animate each letter
  const AnimatedText = ({ text, className }) => {
    return (
      <motion.span>
        {text.split("").map((char, index) => (
          <motion.span
            key={index}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              delay: index * 0.05,
              duration: 0.3,
              type: "spring",
              stiffness: 100,
            }}
            className={className}
          >
            {char === " " ? "\u00A0" : char}
          </motion.span>
        ))}
      </motion.span>
    );
  };

  return (
    <div className="bg-gradient-to-br from-gray-900 to-blue-900 min-h-screen flex flex-col relative">
      {/* Header Area with Responsive Layout */}
      <div className="w-full flex flex-wrap justify-between items-center p-4 sm:p-6">
        {/* AI Logo - Left */}
        <motion.div
          className="flex items-center"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="bg-white/20 p-2 sm:p-3 rounded-full backdrop-blur-xl">
            <Zap className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400" />
          </div>
          <span className="ml-2 sm:ml-3 text-white font-semibold text-base sm:text-lg">
            AI Assistant
          </span>
        </motion.div>

        {/* Button Group - Right (Responsive) */}
        <div className="flex items-center space-x-2 sm:space-x-4">
          {/* Settings Button */}
          <motion.button
            onClick={() => document.getElementById('settings-modal').showModal()}
            className="bg-white/20 p-2 sm:p-3 rounded-full backdrop-blur-xl hover:bg-white/30 transition-all duration-300"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <Settings className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </motion.button>

          {/* Home Button */}
          <motion.button
            onClick={handleHomeNavigation}
            className="bg-white/20 p-2 sm:p-3 rounded-full backdrop-blur-xl hover:bg-white/30 transition-all duration-300"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <House className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
          </motion.button>
        </div>
      </div>

      {/* Settings Modal - Made Responsive */}
      <dialog id="settings-modal" className="bg-gray-900/95 text-white rounded-xl p-4 sm:p-6 backdrop-blur-xl shadow-2xl border border-blue-500/30 w-11/12 max-w-lg mx-auto">
        <h2 className="text-xl sm:text-2xl font-bold mb-4 text-blue-400">Voice Assistant Settings</h2>
        
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-2">Text-to-Speech Options</h3>
          
          <p className="text-xs sm:text-sm text-gray-400">
            Using your browser's built-in Web Speech API for voice recognition and synthesis.
          </p>
          
          <p className="text-xs sm:text-sm text-gray-300 mt-3">
            For best results, use Chrome or Edge browsers, which provide the most reliable voice recognition.
          </p>
          
          <div className="mt-4 p-3 bg-blue-900/50 rounded-lg">
            <h4 className="text-sm font-medium mb-1">AI Status:</h4>
            <p className="text-xs text-gray-300">
              {hf.current 
                ? "AI Service: Connected ✓" 
                : "AI Service: Not connected ✗ (Check your .env configuration)"}
            </p>
          </div>
        </div>
        
        <div className="flex justify-end">
          <button
            onClick={() => document.getElementById('settings-modal').close()}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-1.5 sm:py-2 px-3 sm:px-4 rounded-lg text-sm sm:text-base"
          >
            Close
          </button>
        </div>
      </dialog>

      {/* Main Heading - Responsive */}
      <motion.header
        className="w-full text-center py-2 sm:py-4"
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
          <AnimatedText text="AI Voice Assistant" className="inline-block" />
          <span className="block text-xs sm:text-sm font-normal text-gray-300 mt-1 sm:mt-2">
            Always listening
          </span>
        </h1>
      </motion.header>

      {/* Main Content - Fully Responsive Layout */}
      <div className="flex flex-col lg:flex-row items-center justify-center flex-grow px-3 sm:px-6 pb-4 sm:pb-6">
        {/* Left Section - AI Model (Show first on all devices) */}
        <div className="w-full lg:w-3/5 flex flex-col items-center justify-center mb-4 lg:mb-0 lg:mr-4 order-1">
          {/* Smaller container for AI model with responsive height */}
          <div className="w-full max-w-4xl bg-gradient-to-b from-blue-900 to-blue-950 backdrop-blur-xl rounded-2xl sm:rounded-3xl p-3 sm:p-6 shadow-2xl mt-2 sm:mt-5 relative overflow-hidden">
            {/* Responsive height container */}
            <div className="h-[200px] sm:h-[300px] md:h-[400px] flex items-center justify-center">
              <div className="w-full h-full flex items-center justify-center">
                <AiModelContainer />
              </div>
            </div>
          </div>

          {/* AI Speaking Text Area - Responsive */}
          <motion.div
            className="w-full max-w-4xl mt-2 sm:mt-4 bg-white/10 backdrop-blur-3xl rounded-2xl sm:rounded-3xl p-3 sm:p-5 shadow-xl"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="flex items-center text-white mb-1 sm:mb-2">
              <Speaker className="mr-1 sm:mr-2 text-blue-400 w-4 h-4 sm:w-5 sm:h-5" />
              <h3 className="text-base sm:text-lg font-semibold">AI Response</h3>
            </div>
            <div className="w-full min-h-[60px] sm:min-h-[100px] flex items-center justify-center">
              <p className="text-base sm:text-xl font-semibold text-center bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent">
                {aiText || "I'm listening to you..."}
              </p>
            </div>
          </motion.div>
        </div>

        {/* Right Section - Voice Interface (Always second) */}
        <motion.div
          className="w-full lg:w-2/5 bg-white/10 backdrop-blur-xl border border-white/20 mt-2 sm:mt-4 lg:mt-7 rounded-2xl sm:rounded-3xl p-3 sm:p-6 shadow-2xl order-2"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="text-center text-white mb-3 sm:mb-6">
            <h2 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2 flex items-center justify-center gap-1 sm:gap-2">
              Talk to AI <ArrowRight className="inline-block w-4 h-4 sm:w-6 sm:h-6" />
            </h2>
            <p className="text-xs sm:text-sm text-gray-300">
              Automatically listening - speak naturally
            </p>
          </div>

          {/* Voice Button - Responsive size */}
          <div className="flex justify-center mb-3 sm:mb-4">
            <button
              className={`w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center transition-all duration-300 ease-in-out ${
                isListening
                  ? isPaused
                    ? "bg-orange-500/80 animate-pulse"
                    : "bg-red-500/80 animate-pulse"
                  : isProcessing
                  ? "bg-yellow-500/80"
                  : isSpeaking
                  ? "bg-green-500/80"
                  : "bg-blue-500/80 hover:bg-blue-600/80"
              }`}
              onClick={toggleListening}
              disabled={isProcessing}
            >
              {isListening ? (
                isPaused ? (
                  <MicOff className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                ) : (
                  <Mic className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                )
              ) : isProcessing ? (
                <Loader className="w-6 h-6 sm:w-8 sm:h-8 text-white animate-spin" />
              ) : isSpeaking ? (
                <Volume2 className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              ) : (
                <Mic className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
              )}
            </button>
          </div>

          {/* Status Text - Responsive font size */}
          <div className="flex justify-center items-center mb-2 sm:mb-3">
            <span className="text-xs text-blue-300">
              {isListening ? 
                isPaused ? "Paused... Are you still speaking?" : "Listening... (Click to finish)" 
                : isProcessing ? "Processing speech..." 
                : isSpeaking ? "Speaking..." 
                : "Click microphone to start"}
            </span>
          </div>

          {/* User Text Output - Responsive height */}
          <div className="bg-black/30 rounded-lg sm:rounded-xl p-2 sm:p-4 mb-1 sm:mb-2">
            <textarea
              className="w-full h-20 sm:h-32 bg-transparent text-white text-center text-sm sm:text-base resize-none focus:outline-none"
              value={isProcessing ? "Processing your speech..." : userText}
              readOnly
              placeholder="I'm listening... say something"
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default AiVoiceInterface;