import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

export const HomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="home-root">
      {/* ── NAV ── */}
      <nav className="home-nav">
        <div className="home-nav-inner">
          <div className="home-nav-brand">
            <div className="home-nav-logo">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="32" height="32" rx="8" fill="#0f5d8f"/>
                <path d="M6 20V13a2 2 0 012-2h16a2 2 0 012 2v7" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M4 20h24" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                <circle cx="10" cy="22" r="2" fill="white"/>
                <circle cx="22" cy="22" r="2" fill="white"/>
                <path d="M6 15h20M14 11v9" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className="home-nav-title">Agni College of Technology</div>
              <div className="home-nav-sub">Campus Bus Tracking System</div>
            </div>
          </div>
          <div className="home-nav-actions">
            <button className="home-nav-btn ghost" onClick={() => navigate('/login')}>Sign In</button>
            <button className="home-nav-btn primary" onClick={() => navigate('/map')}>Track Now</button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="home-hero">
        <div className="home-hero-inner">
          <div className="home-hero-text">
            <div className="home-tag">Live Campus Transit</div>
            <h1 className="home-hero-h1">
              Know where<br/>
              your bus is,<br/>
              <span className="home-hero-accent">right now.</span>
            </h1>
            <p className="home-hero-desc">
              Real-time GPS tracking for every Agni College bus.
              See live positions, ETAs, and routes — on any device.
            </p>
            <div className="home-hero-btns">
              <button className="home-cta-primary" onClick={() => navigate('/map')}>
                <svg viewBox="0 0 20 20" fill="none" width="18" height="18">
                  <path d="M10 2C6.686 2 4 4.686 4 8c0 4.5 6 10 6 10s6-5.5 6-10c0-3.314-2.686-6-6-6z" fill="white" opacity=".9"/>
                  <circle cx="10" cy="8" r="2" fill="white"/>
                </svg>
                Open Live Map
              </button>
              <button className="home-cta-secondary" onClick={() => navigate('/driver/login')}>
                Driver Sign In
              </button>
            </div>

            <div className="home-stats">
              <div className="home-stat">
                <strong>Live</strong>
                <span>Updates every 5s</span>
              </div>
              <div className="home-stat-divider"/>
              <div className="home-stat">
                <strong>3</strong>
                <span>Active routes</span>
              </div>
              <div className="home-stat-divider"/>
              <div className="home-stat">
                <strong>GPS</strong>
                <span>Precision tracking</span>
              </div>
            </div>
          </div>

          <div className="home-hero-visual">
            <div className="home-map-card">
              <div className="home-map-header">
                <div className="home-map-dot live"/>
                <span>Live Bus Positions</span>
                <div className="home-map-time">Now</div>
              </div>
              <div className="home-map-body">
                <svg viewBox="0 0 360 240" fill="none" xmlns="http://www.w3.org/2000/svg" className="home-map-svg">
                  <rect width="360" height="240" rx="12" fill="#e8f0f7"/>
                  {/* Road network */}
                  <path d="M0 120 Q90 100 180 120 Q270 140 360 120" stroke="#c5d5e8" strokeWidth="18" strokeLinecap="round"/>
                  <path d="M180 0 Q170 60 180 120 Q190 180 180 240" stroke="#c5d5e8" strokeWidth="14" strokeLinecap="round"/>
                  <path d="M0 120 Q90 100 180 120 Q270 140 360 120" stroke="white" strokeWidth="2" strokeDasharray="12 8" strokeLinecap="round"/>
                  {/* College block */}
                  <rect x="155" y="95" width="50" height="50" rx="6" fill="#0f5d8f" opacity=".15"/>
                  <rect x="163" y="103" width="34" height="34" rx="4" fill="#0f5d8f" opacity=".25"/>
                  <text x="180" y="125" textAnchor="middle" fontSize="8" fill="#0f5d8f" fontWeight="600">AGNI</text>
                  {/* Bus 1 */}
                  <g transform="translate(82, 107)">
                    <circle cx="0" cy="0" r="14" fill="#0f5d8f" opacity=".15"/>
                    <circle cx="0" cy="0" r="9" fill="#0f5d8f"/>
                    <text x="0" y="4" textAnchor="middle" fontSize="9" fill="white">🚌</text>
                  </g>
                  {/* Bus 2 */}
                  <g transform="translate(268, 126)">
                    <circle cx="0" cy="0" r="14" fill="#1b7a5a" opacity=".15"/>
                    <circle cx="0" cy="0" r="9" fill="#1b7a5a"/>
                    <text x="0" y="4" textAnchor="middle" fontSize="9" fill="white">🚌</text>
                  </g>
                  {/* Bus 3 */}
                  <g transform="translate(180, 64)">
                    <circle cx="0" cy="0" r="14" fill="#e0b84c" opacity=".2"/>
                    <circle cx="0" cy="0" r="9" fill="#c9973a"/>
                    <text x="0" y="4" textAnchor="middle" fontSize="9" fill="white">🚌</text>
                  </g>
                  {/* Labels */}
                  <text x="82" y="130" textAnchor="middle" fontSize="7" fill="#0f5d8f" fontWeight="600">Bus 1</text>
                  <text x="268" y="149" textAnchor="middle" fontSize="7" fill="#1b7a5a" fontWeight="600">Bus 2</text>
                  <text x="180" y="87" textAnchor="middle" fontSize="7" fill="#c9973a" fontWeight="600">Bus 3</text>
                </svg>
              </div>
              <div className="home-map-footer">
                <div className="home-map-bus-row">
                  <span className="dot blue"/>Bus 1 · Navalur → Agni College
                </div>
                <div className="home-map-bus-row">
                  <span className="dot green"/>Bus 2 · Semmenchery → Agni College
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ROLE CARDS ── */}
      <section className="home-roles">
        <div className="home-roles-inner">
          <h2 className="home-section-title">Choose your access</h2>
          <div className="home-role-grid">
            <div className="home-role-card student" onClick={() => navigate('/signup')}>
              <div className="home-role-icon">
                <svg viewBox="0 0 24 24" fill="none" width="26" height="26">
                  <path d="M12 2C8.686 2 6 4.686 6 8c0 4.5 6 12 6 12s6-7.5 6-12c0-3.314-2.686-6-6-6z" fill="currentColor"/>
                  <circle cx="12" cy="8" r="2.5" fill="white"/>
                </svg>
              </div>
              <div className="home-role-body">
                <h3>Student / Professor</h3>
                <p>Create an account and track every bus on a live map — position, route, and driver.</p>
              </div>
              <div className="home-role-cta">Sign Up →</div>
            </div>

            <div className="home-role-card driver" onClick={() => navigate('/driver/login')}>
              <div className="home-role-icon">
                <svg viewBox="0 0 24 24" fill="none" width="26" height="26">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <circle cx="12" cy="12" r="4" fill="currentColor"/>
                  <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </div>
              <div className="home-role-body">
                <h3>Driver</h3>
                <p>Share your GPS location with students. Start and stop tracking with one tap.</p>
              </div>
              <div className="home-role-cta">Driver Login →</div>
            </div>

            <div className="home-role-card admin" onClick={() => navigate('/admin/login')}>
              <div className="home-role-icon">
                <svg viewBox="0 0 24 24" fill="none" width="26" height="26">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/>
                </svg>
              </div>
              <div className="home-role-body">
                <h3>Admin</h3>
                <p>Manage buses, drivers, routes, and monitor all active vehicles in real time.</p>
              </div>
              <div className="home-role-cta">Admin Panel →</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="home-features">
        <div className="home-features-inner">
          <div className="home-feature">
            <div className="home-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="#0f5d8f" opacity=".15" stroke="#0f5d8f" strokeWidth="1.5" strokeLinejoin="round"/>
                <path d="M9 12l2 2 4-4" stroke="#0f5d8f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <h4>Secure & Private</h4>
              <p>Every role signs in with their own account. Only your driver can share a bus's location.</p>
            </div>
          </div>
          <div className="home-feature">
            <div className="home-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
                <circle cx="12" cy="12" r="10" stroke="#1b7a5a" strokeWidth="1.5" opacity=".3"/>
                <path d="M12 6v6l4 2" stroke="#1b7a5a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <h4>Live Updates</h4>
              <p>Bus positions refresh every few seconds in real time — no page reload needed.</p>
            </div>
          </div>
          <div className="home-feature">
            <div className="home-feature-icon">
              <svg viewBox="0 0 24 24" fill="none" width="22" height="22">
                <rect x="5" y="2" width="14" height="20" rx="3" stroke="#e0b84c" strokeWidth="1.5" opacity=".5"/>
                <path d="M9 7h6M9 11h6M9 15h4" stroke="#e0b84c" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <h4>Works on Mobile</h4>
              <p>Fully responsive. Students can track buses from any smartphone browser.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="home-footer">
        <div className="home-footer-inner">
          <div className="home-footer-brand">Agni College of Technology</div>
          <div className="home-footer-copy">© 2026 Campus Bus Tracking System · All rights reserved</div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
