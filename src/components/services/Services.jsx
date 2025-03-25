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
  const ref = useRef();
  const isInView = useInView(ref, { margin: "-200px" });
  return (
    <div className="services" ref={ref}>
      <div className="sSection left">
      </div>
      <div className="sSection right">
        {currentServiceId === 1 ? (
          <ComputerModelContainer />
        ) : currentServiceId === 2 ? (
          <MugModelContainer />
        ) : (
          <ConsoleModelContainer />
        )}
      </div>
    </div>
  );
};

export default Services;
