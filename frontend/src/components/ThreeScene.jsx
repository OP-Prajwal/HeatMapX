import React, { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, Float, Sparkles, ContactShadows, Cloud } from '@react-three/drei';
import * as THREE from 'three';

// Highly Stylized, Organic Environmental Tree
function EnvironmentalTree({ position, scale = 1, color = "#2ecc71" }) {
  const group = useRef();
  
  useFrame((state) => {
    // Gentle sway in the wind
    group.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.5 + position[0]) * 0.05;
  });

  return (
    <group position={position} scale={scale} ref={group}>
      {/* Main Trunk */}
      <mesh position={[0, 1.5, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.3, 0.5, 3, 7]} />
        <meshStandardMaterial color="#5c4033" roughness={0.9} />
      </mesh>
      
      {/* Roots base */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <sphereGeometry args={[0.6, 7, 7, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#5c4033" roughness={1} />
      </mesh>

      {/* Main Foliage Clump */}
      <mesh position={[0, 3.5, 0]} castShadow receiveShadow>
        <icosahedronGeometry args={[2, 1]} />
        <meshStandardMaterial color={color} roughness={0.6} flatShading />
      </mesh>

      {/* Sub Foliage left */}
      <mesh position={[-1.2, 2.8, 0.5]} castShadow receiveShadow>
        <icosahedronGeometry args={[1.2, 1]} />
        <meshStandardMaterial color={color} roughness={0.6} flatShading />
      </mesh>

      {/* Sub Foliage right */}
      <mesh position={[1.2, 3.2, -0.5]} castShadow receiveShadow>
        <icosahedronGeometry args={[1.5, 1]} />
        <meshStandardMaterial color={color} roughness={0.6} flatShading />
      </mesh>

      {/* Sub Foliage top/back */}
      <mesh position={[0, 4.5, -1]} castShadow receiveShadow>
        <icosahedronGeometry args={[1.3, 1]} />
        <meshStandardMaterial color={color} roughness={0.6} flatShading />
      </mesh>
    </group>
  );
}

// Lush Ground with varying heights representing nature
function LushGround() {
  return (
    <group>
      {/* Base ground layer */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.1, 0]}>
        <cylinderGeometry args={[15, 15, 0.5, 32]} />
        <meshStandardMaterial color="#1a331a" roughness={1} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[-2, 0.1, -2]}>
        <cylinderGeometry args={[8, 8, 0.3, 16]} />
        <meshStandardMaterial color="#224422" roughness={1} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[4, 0.2, 2]}>
        <cylinderGeometry args={[6, 6, 0.4, 16]} />
        <meshStandardMaterial color="#1f3d1f" roughness={1} />
      </mesh>
    </group>
  );
}

// Particle system representing environmental health and fresh air
function Atmosphere() {
  return (
    <group>
      {/* Fresh air / pollen flowing through the organic structure */}
      <Sparkles count={150} scale={20} size={5} speed={0.2} opacity={0.6} color="#a8ffc4" position={[0, 4, 0]} />
      {/* Sunlight motes */}
      <Sparkles count={50} scale={25} size={3} speed={0.5} opacity={0.3} color="#ffe082" position={[0, 6, 0]} noise={10} />
    </group>
  );
}

export default function ThreeScene() {
  return (
    <Canvas shadows camera={{ position: [0, 8, 18], fov: 40 }}>
      {/* Deeper, more earthy background instead of black sci-fi */}
      <color attach="background" args={['#08170e']} />
      
      {/* Warmer, natural lighting */}
      <ambientLight intensity={0.6} color="#d4e1d4" />
      <directionalLight 
        castShadow 
        position={[15, 20, 10]} 
        intensity={1.2} 
        shadow-mapSize={[2048, 2048]}
        color="#fff1d3" /* Warm sun */
        shadow-bias={-0.0001}
      />
      <directionalLight 
        position={[-15, 5, -10]} 
        intensity={0.4} 
        color="#7ca1d1" /* Cool skylight fill */
      />

      <Float speed={1} rotationIntensity={0.1} floatIntensity={0.2}>
        <group position={[0, -3, 0]}>
          
          <LushGround />

          {/* Core Structure: A dense, beautiful cluster of trees forming an ecosystem */}
          
          {/* Center Giant Tree */}
          <EnvironmentalTree position={[0, 0.3, -1]} scale={1.8} color="#27ae60" />
          
          {/* Surrounding Grove */}
          <EnvironmentalTree position={[-4, 0, 2]} scale={1.2} color="#2ecc71" />
          <EnvironmentalTree position={[3, 0.1, 4]} scale={1.4} color="#1abc9c" />
          <EnvironmentalTree position={[-6, 0.2, -3]} scale={1.0} color="#16a085" />
          <EnvironmentalTree position={[5, 0.1, -4]} scale={1.5} color="#27ae60" />
          <EnvironmentalTree position={[-2, 0.1, -6]} scale={1.3} color="#2ecc71" />
          
          <Atmosphere />
          
          <ContactShadows resolution={1024} scale={30} blur={2.5} opacity={0.6} far={10} color="#0d1f11" />
        </group>
      </Float>

      {/* Environmental natural lighting preset */}
      <Environment preset="forest" />
      
      <OrbitControls 
        autoRotate 
        autoRotateSpeed={0.3} 
        enableZoom={false} 
        enablePan={false}
        maxPolarAngle={Math.PI / 2 - 0.1}
        minPolarAngle={Math.PI / 5}
      />
    </Canvas>
  );
}
