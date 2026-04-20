import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Leaf, ArrowRight, Activity, ThermometerSun, ShieldCheck } from 'lucide-react';

// Svg Tree Component for the left and right sides
function TreeSVG({ className }) {
  return (
    <svg 
      className={className} 
      viewBox="0 0 400 600" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMax meet"
    >
      {/* Trunk */}
      <path d="M185 600C185 600 170 450 195 300C220 150 205 0 205 0H215C215 0 230 150 205 300C180 450 195 600 195 600H185Z" fill="#8B5A2B"/>
      {/* Branches */}
      <path d="M195 350Q150 250 80 200" stroke="#8B5A2B" strokeWidth="12" strokeLinecap="round" />
      <path d="M205 280Q260 200 320 150" stroke="#8B5A2B" strokeWidth="10" strokeLinecap="round" />
      <path d="M192 200Q130 120 100 80" stroke="#8B5A2B" strokeWidth="8" strokeLinecap="round" />
      
      {/* Leaves (Multiple circles/blobs) */}
      <circle cx="80" cy="180" r="60" fill="#22c55e" opacity="0.9" />
      <circle cx="130" cy="220" r="70" fill="#16a34a" opacity="0.8" />
      <circle cx="320" cy="130" r="65" fill="#15803d" opacity="0.9" />
      <circle cx="280" cy="190" r="55" fill="#22c55e" opacity="0.8" />
      <circle cx="100" cy="70" r="50" fill="#16a34a" opacity="0.9" />
      <circle cx="205" cy="40" r="80" fill="#15803d" opacity="0.85" />
      <circle cx="240" cy="90" r="65" fill="#22c55e" opacity="0.9" />
      <circle cx="150" cy="100" r="75" fill="#16a34a" opacity="0.85" />
      <circle cx="250" cy="280" r="50" fill="#15803d" opacity="0.9" />
      <circle cx="140" cy="300" r="45" fill="#22c55e" opacity="0.8" />
      <circle cx="200" cy="180" r="90" fill="#16a34a" opacity="0.95" />
    </svg>
  );
}

// Falling Leaves Overlay
function FallingLeaves() {
  const [leaves, setLeaves] = useState([]);

  useEffect(() => {
    // Generate 30 random leaves
    const newLeaves = Array.from({ length: 30 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100, // random start horizontal %
      animationDuration: 8 + Math.random() * 12, // random fall speed 8-20s
      animationDelay: Math.random() * 10, // random start delay
      scale: 0.5 + Math.random() * 1 // random size
    }));
    setLeaves(newLeaves);
  }, []);

  return (
    <div className="falling-leaves">
      {leaves.map((leaf) => (
        <div 
          key={leaf.id} 
          className="leaf" 
          style={{
            left: `${leaf.left}vw`,
            animationDuration: `${leaf.animationDuration}s`,
            animationDelay: `${leaf.animationDelay}s`,
            transform: `scale(${leaf.scale})`
          }}
        />
      ))}
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="full-screen-container">
      
      {/* 2D Background Animations */}
      <FallingLeaves />
      <TreeSVG className="tree-left" />
      <TreeSVG className="tree-right" />

      {/* UI Overlay */}
      <div className="content-overlay">
        <nav className="navbar animate-fade-in" style={{ animationDelay: '0.2s', opacity: 0 }}>
          <div className="logo">
            <Leaf className="logo-icon" size={32} color="var(--accent-green)" />
            <span className="text-gradient">HeatMapX</span>
          </div>
          <div>
            <button className="btn btn-glass" onClick={() => navigate('/dashboard')}>
              Go to Dashboard
            </button>
          </div>
        </nav>

        <main className="landing-main" style={{ 
          height: 'calc(100vh - 100px)', 
          display: 'flex', 
          alignItems: 'center', 
          padding: '0 10%',
          justifyContent: 'center',
          textAlign: 'center'
        }}>
          <div 
            className="bento-card animate-fade-in" 
            style={{ 
              maxWidth: '800px', 
              padding: '4rem', 
              animationDelay: '0.4s', 
              opacity: 0,
              pointerEvents: 'auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              boxShadow: 'var(--shadow-lg)'
            }}
          >
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
              <span className="badge-tag">
                <Activity size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} />
                AI-Powered Detection
              </span>
            </div>
            
            <h1 style={{ fontSize: '4rem', lineHeight: 1.1, marginBottom: '1.5rem', color: 'var(--text-main)' }}>
              Detect & Cool <br />
              <span className="text-gradient">Urban Heat Islands</span>
            </h1>
            
            <p style={{ color: 'var(--text-muted)', fontSize: '1.25rem', marginBottom: '3rem', lineHeight: 1.6, maxWidth: '600px' }}>
              Upload imagery or select a location to identify high-risk heat zones. 
              Our advanced deep learning model recommends specific vegetation and estimates temperature reductions to help restore our urban ecosystems.
            </p>
            
            <div style={{ display: 'flex', gap: '16px' }}>
              <button className="btn btn-primary" onClick={() => navigate('/dashboard')} style={{ padding: '16px 32px', fontSize: '1.1rem' }}>
                Start Analysis <ArrowRight size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', gap: '32px', marginTop: '4rem', borderTop: '1px solid rgba(0,0,0,0.05)', paddingTop: '2rem', width: '100%', justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                <ThermometerSun size={20} color="var(--accent-main)" />
                <span style={{ fontSize: '1rem', fontWeight: 600 }}>Microclimate CNN</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                <ShieldCheck size={20} color="var(--accent-main)" />
                <span style={{ fontSize: '1rem', fontWeight: 600 }}>94% Accuracy</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
