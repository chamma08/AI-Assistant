import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import { A } from "./A";
import { OrbitControls, PerspectiveCamera, Stage } from "@react-three/drei";

const ComputerModelContainer = () => {
  return (
    <Canvas>
      <Suspense fallback="loading...">
        <Stage environment="night" intensity={5}>
          <A />
        </Stage>
        <OrbitControls enableZoom={false} autoRotate/>
        <PerspectiveCamera position={[0,0,200]} zoom={0.8} makeDefault/>
      </Suspense>
    </Canvas>
  );
};

export default ComputerModelContainer;
