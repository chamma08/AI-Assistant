import { OrbitControls, PerspectiveCamera, Stage } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import React, { Suspense } from "react";
import { A } from "./A";

const AiModelContainer = () => {
  return (
    <Canvas style={{ 
      height: "65vh",
     
      
      }}
      >
      <Suspense fallback="loading...">
        <Stage environment="night" intensity={5}>
          <A position={[0,70,0]}/>
        </Stage>
        <OrbitControls enableZoom={false}/>
        <PerspectiveCamera position={[0, -40, 200]} zoom={2.7} makeDefault />
      </Suspense>
    </Canvas>
  );
};

export default AiModelContainer;
