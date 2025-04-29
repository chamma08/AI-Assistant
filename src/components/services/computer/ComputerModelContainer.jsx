import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { E } from "./E";
import { OrbitControls, PerspectiveCamera, Stage } from "@react-three/drei";

const ComputerModelContainer = () => {
  return (
    <Canvas>
      <Suspense fallback="loading...">
        <Stage environment="sunset" intensity={5}>
          <E />
        </Stage>
        <OrbitControls enableZoom={false} autoRotate/>
        <PerspectiveCamera position={[0,0,200]} zoom={1.1} makeDefault/>
      </Suspense>
    </Canvas>
  );
};

export default ComputerModelContainer;
