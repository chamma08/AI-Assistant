import { Link } from "react-router-dom";
import ComputerModelContainer from "./computer/ComputerModelContainer";
import ConsoleModelContainer from "./console/ConsoleModelContainer";
import Counter from "./Counter";
import MugModelContainer from "./mug/MugModelContainer";
import "./services.css";
import { motion, useInView } from "motion/react";
import { useRef, useState } from "react";

const textVariants = {
  initial: {
    x: -100,
    y: -100,
    opacity: 0,
  },
  animate: {
    x: 0,
    y: 0,
    opacity: 1,
    transition: {
      duration: 1,
    },
  },
};

const listVariants = {
  initial: {
    x: -100,
    opacity: 0,
  },
  animate: {
    x: 0,
    opacity: 1,
    transition: {
      duration: 1,
      staggerChildren: 0.5,
    },
  },
};

const services = [
  {
    id: 1,
    img: "/service1.png",
    title: "Web Development",
    counter: 35,
  },
  {
    id: 2,
    img: "/service2.png",
    title: "Product Design",
    counter: 23,
  },
  {
    id: 3,
    img: "/service3.png",
    title: "Branding",
    counter: 46,
  },
];

const Services = () => {
  const [currentServiceId, setCurrentServiceId] = useState(1);
  const [recognizedText, setRecognizedText] = useState(""); // Real-time Speech-to-Text
  const [speakingText, setSpeakingText] = useState(""); // AI Spoken Text
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);
  const ref = useRef();
  const isInView = useInView(ref, { margin: "-10px" });
  return (
    <div className="services" ref={ref}>
      {/* Model container (Shown on top in mobile, side in desktop) */}
      <div className="sSection right order-1 md:order-2">
        {currentServiceId === 1 ? (
          <ComputerModelContainer />
        ) : currentServiceId === 2 ? (
          <MugModelContainer />
        ) : (
          <ConsoleModelContainer />
        )}
      </div>

      {/* Text content (Shown below the model in mobile, side in desktop) */}
      <div className="sSection left order-2 md:order-1 text-center md:text-left px-6 md:px-12">
        <h1 className="text-2xl md:text-4xl font-bold text-black mb-6">
          Your AI Assistant with Advanced Voice Capabilities
        </h1>
        <p className="text-white text-justify mb-6">
          Communicate effortlessly with our AI assistant using cutting-edge
          speech recognition and natural language processing. Speak, listen, and
          interact like never before – all with the power of advanced AI
          technology.
        </p>
        <Link to={"/ai"}>
          <div className="flex justify-center md:justify-start space-x-4 mt-4">
            <button className="bg-[#E52A00] text-white px-6 py-3 rounded-3xl hover:bg-orange-600 transition duration-300">
              Get Started
            </button>
          </div>
        </Link>
      </div>
    </div>
  );
};

export default Services;
