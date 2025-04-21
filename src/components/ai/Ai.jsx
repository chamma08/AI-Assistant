import React from 'react'
import { useGraph } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'

export function Ai(props) {
  const { scene } = useGLTF('/a.glb')
  const clone = React.useMemo(() => SkeletonUtils.clone(scene), [scene])
  const { nodes, materials } = useGraph(clone)
  return (
    <group {...props} dispose={null}>
      <primitive object={nodes.GLTF_created_0_rootJoint} />
      <skinnedMesh geometry={nodes.Object_7.geometry} material={materials.M_Med_Assassin_Suit} skeleton={nodes.Object_7.skeleton} />
      <skinnedMesh geometry={nodes.Object_8.geometry} material={materials.M_Med_Soldier_Head} skeleton={nodes.Object_8.skeleton} />
      <skinnedMesh geometry={nodes.Object_9.geometry} material={materials.M_SML_Survivor_Hair_02} skeleton={nodes.Object_9.skeleton} />
    </group>
  )
}

useGLTF.preload('/a.glb')
