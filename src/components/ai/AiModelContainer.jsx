import { OrbitControls, PerspectiveCamera, Stage } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import React, { Suspense } from "react";
import { E } from "./E";

const AiModelContainer = () => {
  return (
    <Canvas style={{ 
      height: "65vh",
     
      
      }}
      >
      <Suspense fallback="loading...">
        <Stage environment="sunset" intensity={5}>
          <E position={[0,10,0]}/>
        </Stage>
        <OrbitControls enableZoom={false}/>
        <PerspectiveCamera position={[0, -40, 200]} zoom={1.1} makeDefault />
      </Suspense>
    </Canvas>
  );
};

export default AiModelContainer;
