import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleMap, useJsApiLoader, Marker, DrawingManager } from '@react-google-maps/api';
import { Leaf, Upload, MapPin, Activity, ThermometerSun, TreePine, AlertCircle, CheckCircle2, ArrowLeft, Loader2, Sparkles, Satellite, Droplets } from 'lucide-react';
import axios from 'axios';
import TemporalChart from '../components/TemporalChart';

const libraries = ['places', 'drawing'];
const initialCenter = { lat: 28.6139, lng: 77.2090 };

export default function Dashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('upload'); 
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [position, setPosition] = useState(null);
  const [drawMode, setDrawMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const [center, setCenter] = useState(initialCenter);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [drawBounds, setDrawBounds] = useState(null);

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      if (searchQuery.length >= 3) {
        setIsSearching(true);
        fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=5`)
          .then(res => res.json())
          .then(data => {
            setSearchResults(data);
            setIsSearching(false);
          })
          .catch(err => {
            console.error(err);
            setIsSearching(false);
          });
      } else {
        setSearchResults([]);
      }
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery]);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: libraries
  });
  
  const mapContainerStyle = { width: '100%', height: '100%', minHeight: '400px', borderRadius: '16px' };

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected) {
      setFile(selected);
      setPreview(URL.createObjectURL(selected));
      setResult(null);
    }
  };

  const simulateProcessing = async (hasFile) => {
    setLoading(true);
    setResult(null);
    setError('');
    
    try {
      const formData = new FormData();
      if (hasFile && file) {
        formData.append('image', file);
        formData.append('generate_heatmap', 'true');
      } else if (position) {
        formData.append('lat', position.lat);
        formData.append('lng', position.lng);
        if (drawBounds) {
          formData.append('minLat', drawBounds.minLat);
          formData.append('maxLat', drawBounds.maxLat);
          formData.append('minLng', drawBounds.minLng);
          formData.append('maxLng', drawBounds.maxLng);
        }
        // If it's a drawing, backend will also process heat overlay
        formData.append('generate_heatmap', 'true');
      } else {
        setLoading(false);
        setError('Select an image or map target before running analysis.');
        return;
      }
      
      try {
          const response = await axios.post('http://localhost:5000/api/predict', formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
          });
          setResult(response.data);
          setLoading(false);
      } catch(err) {
          console.error("API Error", err);
          setError(err.response?.data?.error || 'Analysis failed. Check that the Flask backend is running on port 5000.');
          setLoading(false);
          return;
      }
    } catch(err) {
      setError('Analysis failed before the request could be sent.');
      setLoading(false);
    }
  };

  const renderResultBadge = (code, text) => {
    const isHigh = code === 'high';
    const isMod = code === 'moderate';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: isHigh ? '#dc2626' : isMod ? '#d97706' : '#059669', background: isHigh ? '#fef2f2' : isMod ? '#fffbeb' : '#ecfdf5', padding: '10px 20px', borderRadius: '12px', fontWeight: 600, width: 'fit-content' }}>
        {isHigh ? <AlertCircle size={20} /> : isMod ? <Activity size={20} /> : <CheckCircle2 size={20} />}
        {text}
      </div>
    );
  };

  return (
    <div className="dashboard-layout animate-fade-in">
      
      {/* Sidebar - Clean, light glassmorphism */}
      <aside className="sidebar">
        <div className="logo" onClick={() => navigate('/')}>
          <Leaf className="logo-icon" size={28} />
          <span className="text-gradient">HeatMapX</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '2rem' }}>
          <p style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.05em' }}>Analysis Input</p>
          <button 
            className={`btn ${activeTab === 'upload' ? 'btn-primary' : 'btn-glass'}`}
            style={{ width: '100%', justifyContent: 'flex-start', padding: '14px 20px' }}
            onClick={() => setActiveTab('upload')}
          >
            <Upload size={18} /> Upload Image
          </button>
          <button 
            className={`btn ${activeTab === 'map' ? 'btn-primary' : 'btn-glass'}`}
            style={{ width: '100%', justifyContent: 'flex-start', padding: '14px 20px' }}
            onClick={() => setActiveTab('map')}
          >
            <MapPin size={18} /> Map Selection
          </button>
        </div>

        <div style={{ marginTop: 'auto' }}>
          <button className="btn btn-glass" onClick={() => navigate('/')} style={{ width: '100%', justifyContent: 'center' }}>
            <ArrowLeft size={18} /> Exit
          </button>
        </div>
      </aside>

      {/* Main Content Pane */}
      <main className="main-content">
        
        <header style={{ marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '2.5rem', marginBottom: '8px' }}>Analysis Dashboard</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>Analyze urban heat risk with satellite thermal data, spectral indices, and image-based fallback detection.</p>
        </header>

        {/* Input Bento Box */}
        <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flexShrink: 0 }}>
          {activeTab === 'upload' ? (
            <div style={{ width: '100%' }}>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" style={{ display: 'none' }} />
              {!file ? (
                <div className="upload-zone" onClick={() => fileInputRef.current?.click()}>
                  <Upload size={48} color="rgba(16, 185, 129, 0.5)" style={{ margin: '0 auto 16px' }} />
                  <h3 style={{ fontSize: '1.4rem', marginBottom: '8px' }}>Drop Satellite Imagery</h3>
                  <p style={{ color: 'var(--text-muted)' }}>High resolution JPEG/PNG strictly.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '32px', alignItems: 'center' }}>
                  <img src={preview} alt="Target" style={{ width: '300px', height: '180px', objectFit: 'cover', borderRadius: '16px', boxShadow: 'var(--shadow-sm)' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h3 style={{ fontSize: '1.2rem' }}>{file.name}</h3>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button className="btn btn-primary" onClick={() => simulateProcessing(true)} disabled={loading}>
                        {loading ? <><Loader2 className="spin" size={18} /> Processing model...</> : <><Sparkles size={18} /> Run AI Analysis</>}
                      </button>
                      <button className="btn btn-glass" onClick={() => {setFile(null); setPreview(null); setResult(null);}}>Clear</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '32px', height: '400px' }}>
              <div style={{ flex: 1, borderRadius: '16px', overflow: 'hidden', boxShadow: 'var(--shadow-sm)', position: 'relative' }}>
                 {isLoaded ? (
                  <>
                    <div style={{ position: 'absolute', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 10, width: '80%', maxWidth: '400px' }}>
                      <div style={{ position: 'relative', width: '100%' }}>
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setShowDropdown(true);
                          }}
                          placeholder="Search for any free location..."
                          style={{
                            boxSizing: 'border-box',
                            border: '1px solid var(--glass-border)',
                            width: '100%',
                            height: '48px',
                            padding: '0 20px',
                            borderRadius: '24px',
                            boxShadow: 'var(--shadow-lg)',
                            fontSize: '1rem',
                            outline: 'none',
                            fontFamily: 'var(--font-main)',
                            background: 'white'
                          }}
                        />
                        {isSearching && <Loader2 className="spin" size={16} color="gray" style={{ position: 'absolute', right: '16px', top: '16px' }} />}
                      </div>

                      {showDropdown && searchResults.length > 0 && (
                        <div style={{
                          position: 'absolute', top: '56px', width: '100%', background: 'white', borderRadius: '12px', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', border: '1px solid var(--glass-border)'
                        }}>
                          {searchResults.map((place, idx) => (
                            <div 
                              key={idx}
                              onClick={() => {
                                const lat = parseFloat(place.lat);
                                const lng = parseFloat(place.lon);
                                setCenter({ lat, lng });
                                setPosition({ lat, lng });
                                setSearchQuery(place.display_name.split(',')[0]);
                                setShowDropdown(false);
                              }}
                              style={{ padding: '12px 20px', cursor: 'pointer', borderBottom: idx !== searchResults.length - 1 ? '1px solid #f1f5f9' : 'none', fontSize: '0.95rem', color: '#334155' }}
                              onMouseEnter={(e) => e.target.style.background = '#f8fafc'}
                              onMouseLeave={(e) => e.target.style.background = 'white'}
                            >
                              {place.display_name.split(',').slice(0, 3).join(', ')}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <GoogleMap mapContainerStyle={mapContainerStyle} center={center} zoom={11} mapTypeId="satellite" options={{ disableDefaultUI: true, zoomControl: true, gestureHandling: 'greedy' }} onClick={(e) => { if(!drawMode) { setPosition({ lat: e.latLng.lat(), lng: e.latLng.lng() }); setDrawBounds(null); } }}>
                      {position && !drawMode && <Marker position={position} />}
                      {drawMode && (
                        <DrawingManager
                          onOverlayComplete={(e) => {
                            if (e.type === 'rectangle' || e.type === 'polygon') {
                              let centerLat, centerLng;
                              if (e.type === 'rectangle') {
                                const bounds = e.overlay.getBounds();
                                centerLat = bounds.getCenter().lat();
                                centerLng = bounds.getCenter().lng();
                                const ne = bounds.getNorthEast();
                                const sw = bounds.getSouthWest();
                                setDrawBounds({ minLat: sw.lat(), maxLat: ne.lat(), minLng: sw.lng(), maxLng: ne.lng() });
                              } else {
                                const path = e.overlay.getPath().getArray();
                                centerLat = path[0].lat();
                                centerLng = path[0].lng(); // Appx center for polygon
                                let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
                                path.forEach(p => {
                                  if (p.lat() < minLat) minLat = p.lat();
                                  if (p.lat() > maxLat) maxLat = p.lat();
                                  if (p.lng() < minLng) minLng = p.lng();
                                  if (p.lng() > maxLng) maxLng = p.lng();
                                });
                                setDrawBounds({ minLat, maxLat, minLng, maxLng });
                              }
                              setPosition({ lat: centerLat, lng: centerLng });
                            }
                          }}
                          options={{
                            drawingControl: true,
                            drawingControlOptions: {
                              drawingModes: ['rectangle', 'polygon']
                            },
                            rectangleOptions: {
                              fillColor: '#10b981', fillOpacity: 0.2, strokeColor: '#10b981', strokeWeight: 2
                            },
                            polygonOptions: {
                              fillColor: '#10b981', fillOpacity: 0.2, strokeColor: '#10b981', strokeWeight: 2
                            }
                          }}
                        />
                      )}
                    </GoogleMap>
                  </>
                ) : (
                  <div style={{ height: '100%', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}><Loader2 className="spin" color="var(--accent-main)" /></div>
                )}
              </div>
              <div style={{ width: '300px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '20px' }}>
                <div>
                  <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Target Coordinates</h3>
                  <p style={{ color: 'var(--text-muted)' }}>{position ? `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)} (Zone Selected)` : "No pin or zone selected."}</p>
                </div>
                <button 
                  className={`btn ${drawMode ? 'btn-primary' : 'btn-glass'}`} 
                  style={{ width: '100%', marginBottom: '-10px' }} 
                  onClick={() => setDrawMode(!drawMode)}
                >
                  {drawMode ? "Disable Drawing" : "Draw Custom Zone"}
                </button>
                <button className="btn btn-primary" style={{ width: '100%' }} disabled={!position || loading} onClick={() => simulateProcessing(false)}>
                  {loading ? <><Loader2 className="spin" /> Scanning Area...</> : <><Activity size={18} /> Analyze Target</>}
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="bento-card" style={{ marginTop: '1rem', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca' }}>
            {error}
          </div>
        )}

        {/* Results Bento Grid */}
        {result && (
          <div className="stats-grid animate-fade-in" style={{ animationDelay: '0.1s' }}>
            
            {/* Primary Result Card */}
            <div className="bento-card" style={{ gridColumn: 'span 3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: '1.8rem' }}>UHI Analysis</h3>
                  {renderResultBadge(result.classification_code, result.classification)}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.03em', background: result.dataSource === 'satellite' ? 'linear-gradient(135deg, #dbeafe, #ede9fe)' : '#f1f5f9', color: result.dataSource === 'satellite' ? '#4338ca' : '#64748b', border: result.dataSource === 'satellite' ? '1px solid #c7d2fe' : '1px solid #e2e8f0' }}>
                    {result.dataSource === 'satellite' ? <><Satellite size={14} /> Landsat + Sentinel-2</> : <><Upload size={14} /> Image Analysis</>}
                  </div>
                </div>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', maxWidth: '600px' }}>
                  {result.dataSource === 'satellite'
                    ? 'Analysis powered by real Landsat 8 thermal bands and Sentinel-2 spectral indices via Google Earth Engine.'
                    : 'Analyzed using OpenCV multi-gate vegetation, water body, and surface detection on the uploaded image.'}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="stat-label" style={{ marginBottom: '8px' }}>UHI Risk Probability</div>
                <div className="text-gradient" style={{ fontSize: '4.5rem', fontWeight: 800, lineHeight: 1 }}>
                  {result.heatRisk}%
                </div>
              </div>
            </div>

            {/* ---- Temperature Card ---- */}
            {result.realTemperature != null && (
              <div className="bento-card" style={{ background: 'linear-gradient(135deg, #fff7ed, #fff)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', color: '#ea580c' }}>
                  <div style={{ padding: '10px', background: '#ffedd5', borderRadius: '12px' }}><ThermometerSun size={24} /></div>
                  <span className="stat-label" style={{ color: 'var(--text-main)' }}>Surface Temperature</span>
                </div>
                <div className="stat-value" style={{ fontSize: '3.5rem', color: result.realTemperature > 35 ? '#dc2626' : result.realTemperature > 25 ? '#ea580c' : '#059669' }}>{result.realTemperature}°C</div>
                <p style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '0.9rem' }}>Real LST from Landsat 8 thermal band (ST_B10).</p>
              </div>
            )}
            {result.estimatedTemperature != null && (
              <div className="bento-card" style={{ background: 'linear-gradient(135deg, #fff7ed, #fff)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', color: '#ea580c' }}>
                  <div style={{ padding: '10px', background: '#ffedd5', borderRadius: '12px' }}><ThermometerSun size={24} /></div>
                  <span className="stat-label" style={{ color: 'var(--text-main)' }}>Est. Surface Temperature</span>
                </div>
                <div className="stat-value" style={{ fontSize: '3.5rem', color: result.estimatedTemperature > 35 ? '#dc2626' : result.estimatedTemperature > 25 ? '#ea580c' : '#059669' }}>{result.estimatedTemperature}°C</div>
                <p style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '0.9rem' }}>Estimated from built-up surface ratio (OpenCV analysis).</p>
              </div>
            )}

            {/* ---- Vegetation Card ---- */}
            <div className="bento-card" style={{ background: 'var(--bg-surface-solid)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', color: 'var(--accent-main)' }}>
                <div style={{ padding: '10px', background: 'var(--accent-light)', borderRadius: '12px' }}><Leaf size={24} /></div>
                <span className="stat-label" style={{ color: 'var(--text-main)' }}>{result.ndvi != null ? 'NDVI Vegetation Index' : 'Green Cover Detection'}</span>
              </div>
              {result.ndvi != null ? (
                <>
                  <div className="stat-value text-gradient" style={{ fontSize: '3.5rem' }}>{result.ndvi}</div>
                  <p style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '0.9rem' }}>Sentinel-2 NDVI: (NIR−Red)/(NIR+Red). &gt;0.4 = dense vegetation.</p>
                </>
              ) : (
                <>
                  <div className="stat-value text-gradient" style={{ fontSize: '3.5rem' }}>{result.greenCover}%</div>
                  <p style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '0.9rem' }}>4-gate filter: ExG + GCC + green dominance + HSV hue.</p>
                </>
              )}
            </div>

            {/* ---- Built-up / NDBI Card ---- */}
            {result.ndbi != null ? (
              <div className="bento-card" style={{ background: 'linear-gradient(135deg, #fef2f2, #fff)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', color: '#dc2626' }}>
                  <div style={{ padding: '10px', background: '#fee2e2', borderRadius: '12px' }}><Activity size={24} /></div>
                  <span className="stat-label" style={{ color: 'var(--text-main)' }}>NDBI Built-up Index</span>
                </div>
                <div className="stat-value" style={{ fontSize: '3.5rem', color: result.ndbi > 0.1 ? '#dc2626' : '#059669' }}>{result.ndbi}</div>
                <p style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '0.9rem' }}>Sentinel-2 NDBI: (SWIR−NIR)/(SWIR+NIR). &gt;0 = built-up area.</p>
              </div>
            ) : result.builtUp != null ? (
              <div className="bento-card" style={{ background: 'linear-gradient(135deg, #fef2f2, #fff)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', color: '#dc2626' }}>
                  <div style={{ padding: '10px', background: '#fee2e2', borderRadius: '12px' }}><Activity size={24} /></div>
                  <span className="stat-label" style={{ color: 'var(--text-main)' }}>Built-up Surface</span>
                </div>
                <div className="stat-value" style={{ fontSize: '3.5rem', color: result.builtUp > 70 ? '#dc2626' : result.builtUp > 40 ? '#d97706' : '#059669' }}>{result.builtUp}%</div>
                <p style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '0.9rem' }}>Concrete, asphalt & impervious surfaces (100% − green − water).</p>
              </div>
            ) : null}

            {/* ---- Water Card ---- */}
            {result.ndwi != null ? (
              <div className="bento-card" style={{ background: 'linear-gradient(135deg, #eff6ff, #fff)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', color: '#2563eb' }}>
                  <div style={{ padding: '10px', background: '#dbeafe', borderRadius: '12px' }}><Droplets size={24} /></div>
                  <span className="stat-label" style={{ color: 'var(--text-main)' }}>NDWI Water Index</span>
                </div>
                <div className="stat-value" style={{ fontSize: '3.5rem', color: '#2563eb' }}>{result.ndwi}</div>
                <p style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '0.9rem' }}>Sentinel-2 NDWI: (Green−NIR)/(Green+NIR). &gt;0 = water present.</p>
              </div>
            ) : result.waterCover != null ? (
              <div className="bento-card" style={{ background: 'linear-gradient(135deg, #eff6ff, #fff)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', color: '#2563eb' }}>
                  <div style={{ padding: '10px', background: '#dbeafe', borderRadius: '12px' }}><Droplets size={24} /></div>
                  <span className="stat-label" style={{ color: 'var(--text-main)' }}>Water Body Coverage</span>
                </div>
                <div className="stat-value" style={{ fontSize: '3.5rem', color: '#2563eb' }}>{result.waterCover}%</div>
                <p style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '0.9rem' }}>Detected via HSV blue/cyan range water body masking.</p>
              </div>
            ) : null}

            {/* ---- Thermal Reduction Card ---- */}
            <div className="bento-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', color: '#0ea5e9' }}>
                <div style={{ padding: '10px', background: '#e0f2fe', borderRadius: '12px' }}><ThermometerSun size={24} /></div>
                <span className="stat-label" style={{ color: 'var(--text-main)' }}>Thermal Reduction</span>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, lineHeight: 1.4, color: 'var(--text-main)' }}>
                {result.tempReductionText}
              </div>
              <p style={{ color: 'var(--text-muted)', marginTop: '12px', fontSize: '0.9rem' }}>Calculated projection based on 5-year maturation.</p>
            </div>

            {/* ---- Tree Recommendations Card ---- */}
            <div className="bento-card">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', color: 'var(--accent-main)' }}>
                <div style={{ padding: '10px', background: 'var(--accent-light)', borderRadius: '12px' }}><TreePine size={24} /></div>
                <span className="stat-label" style={{ color: 'var(--text-main)' }}>Tree Recommendations</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {result.suggestions.map((tree, i) => (
                  <span key={i} className="badge-tag">
                    {tree}
                  </span>
                ))}
              </div>
            </div>

            {/* ---- Thermal Heatmap Overlay ---- */}
            {result.heatmap_image && (
              <div className="bento-card" style={{ gridColumn: 'span 3' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', color: '#dc2626' }}>
                  <div style={{ padding: '10px', background: '#fef2f2', borderRadius: '12px' }}><ThermometerSun size={24} /></div>
                  <span className="stat-label" style={{ color: 'var(--text-main)' }}>Zone Thermal Mapping Overlay</span>
                </div>
                <img src={`data:image/jpeg;base64,${result.heatmap_image}`} alt="Thermal Zone Map" style={{ width: '100%', maxHeight: '400px', objectFit: 'cover', borderRadius: '12px', border: '1px solid var(--glass-border)' }} />
              </div>
            )}

          </div>
        )}

        {/* Temporal Trend Analysis — shown whenever a map pin is set */}
        {activeTab === 'map' && position && (
          <TemporalChart position={position} drawBounds={drawBounds} />
        )}

      </main>
    </div>
  );
}
