import React from 'react';
import { useNavigate } from 'react-router-dom';
import { InstallAppButton } from '../components/InstallAppButton';
import { Button } from '../components/common';
import IconNearMe from '~icons/material-symbols/near-me-outline';
import IconSchool from '~icons/material-symbols/school-outline';
import IconBus from '~icons/material-symbols/directions-bus-outline';
import IconShield from '~icons/material-symbols/shield-outline';
import IconBuild from '~icons/material-symbols/build-outline';
import IconGroups from '~icons/material-symbols/groups-outline';
import IconInsights from '~icons/material-symbols/insights';
import IconArrow from '~icons/material-symbols/arrow-forward';
import IconVerifiedUser from '~icons/material-symbols/verified-user-outline';
import IconBolt from '~icons/material-symbols/bolt';
import IconSmartphone from '~icons/material-symbols/smartphone-outline';

const ROLE_CARDS = [
  { icon: IconSchool, title: 'Student / Professor', desc: 'Create an account and track every bus on a live map — position, route, and driver.', cta: 'Sign Up', to: '/signup' },
  { icon: IconBus, title: 'Driver', desc: "Share your GPS location with students. Start and stop tracking with one tap.", cta: 'Driver Login', to: '/driver/login' },
  { icon: IconShield, title: 'Admin', desc: 'Manage buses, drivers, routes, and monitor all active vehicles in real time.', cta: 'Admin Panel', to: '/admin/login' },
  { icon: IconBuild, title: 'Maintenance', desc: 'Track fuel, service schedules, and close repair requests across the fleet.', cta: 'Maintenance Login', to: '/maintenance/login' },
  { icon: IconGroups, title: 'Parent', desc: "See your child's bus and ETA live, the moment it's on the road.", cta: 'Parent Login', to: '/parent/login' },
  { icon: IconInsights, title: 'Principal', desc: 'A high-level view of fleet utilization, spend, and ridership.', cta: 'Principal Login', to: '/principal/login' },
];

const FEATURES = [
  { icon: IconVerifiedUser, title: 'Secure & Private', desc: "Every role signs in with their own account. Only your driver can share a bus's location." },
  { icon: IconBolt, title: 'Live Updates', desc: 'Bus positions refresh every few seconds in real time — no page reload needed.' },
  { icon: IconSmartphone, title: 'Works on Mobile', desc: 'Fully responsive, installable as an app. Track buses from any smartphone.' },
];

export const HomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body-md">
      {/* ── NAV ── */}
      <nav className="sticky top-0 z-40 bg-surface/95 backdrop-blur border-b border-outline-variant">
        <div className="max-w-container-max mx-auto px-md md:px-gutter h-16 flex items-center justify-between">
          <div className="flex items-center gap-sm">
            <img src="/act-logo.jpeg" alt="Agni College of Technology" className="w-9 h-9 rounded-full object-cover border border-outline-variant" />
            <div>
              <div className="font-headline-md text-title-lg font-bold text-primary leading-tight">ACT To Go</div>
              <div className="text-[11px] text-on-surface-variant leading-tight">Agni College of Technology</div>
            </div>
          </div>
          <div className="flex items-center gap-sm">
            <InstallAppButton className="hidden sm:inline-flex items-center gap-xs px-md py-sm rounded text-body-md font-semibold text-primary border border-outline-variant hover:bg-surface-container-high transition-colors" />
            <Button variant="secondary" size="sm" onClick={() => navigate('/login')}>Sign In</Button>
            <Button variant="accent" size="sm" onClick={() => navigate('/map')}>Track Now</Button>
          </div>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="max-w-container-max mx-auto px-md md:px-gutter py-2xl md:py-3xl grid md:grid-cols-2 gap-2xl items-center">
        <div>
          <span className="inline-block px-md py-xs rounded-full bg-secondary-fixed text-on-secondary-fixed-variant font-label-md text-label-md uppercase tracking-wider mb-md">
            Live Campus Transit Intelligence
          </span>
          <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-primary mb-md">
            Know where your bus is,{' '}
            <span className="text-secondary">right now.</span>
          </h1>
          <p className="font-body-lg text-body-lg text-on-surface-variant mb-lg max-w-md">
            Real-time GPS tracking for every Agni College bus. See live positions, ETAs, and routes — on any device.
          </p>
          <div className="flex flex-wrap gap-sm mb-xl">
            <Button size="lg" onClick={() => navigate('/map')}>
              <IconNearMe className="w-5 h-5" /> Open Live Map
            </Button>
            <Button size="lg" variant="secondary" onClick={() => navigate('/driver/login')}>
              Driver Sign In
            </Button>
          </div>
          <div className="flex flex-wrap gap-lg">
            {[
              ['Live', 'Updates every 5s'],
              ['3', 'Active routes'],
              ['GPS', 'Precision tracking'],
            ].map(([stat, label]) => (
              <div key={label}>
                <div className="font-title-lg text-title-lg font-bold text-primary">{stat}</div>
                <div className="text-label-md text-on-surface-variant">{label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center gap-sm px-md py-sm border-b border-outline-variant">
            <span className="w-2 h-2 rounded-full bg-green-600 animate-pulse" />
            <span className="font-label-md text-label-md text-on-surface-variant flex-1">Live Bus Positions</span>
            <span className="text-label-md text-on-surface-variant">Now</span>
          </div>
          <svg viewBox="0 0 360 240" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full block">
            <rect width="360" height="240" fill="#f3f3f9" />
            <path d="M0 120 Q90 100 180 120 Q270 140 360 120" stroke="#c2c6d2" strokeWidth="18" strokeLinecap="round" />
            <path d="M180 0 Q170 60 180 120 Q190 180 180 240" stroke="#c2c6d2" strokeWidth="14" strokeLinecap="round" />
            <path d="M0 120 Q90 100 180 120 Q270 140 360 120" stroke="white" strokeWidth="2" strokeDasharray="12 8" strokeLinecap="round" />
            <rect x="155" y="95" width="50" height="50" rx="6" fill="#003162" opacity=".15" />
            <rect x="163" y="103" width="34" height="34" rx="4" fill="#003162" opacity=".25" />
            <text x="180" y="125" textAnchor="middle" fontSize="8" fill="#003162" fontWeight="600">AGNI</text>
            <g transform="translate(82, 107)">
              <circle cx="0" cy="0" r="14" fill="#003162" opacity=".15" />
              <circle cx="0" cy="0" r="9" fill="#003162" />
              <text x="0" y="4" textAnchor="middle" fontSize="9" fill="white">🚌</text>
            </g>
            <g transform="translate(268, 126)">
              <circle cx="0" cy="0" r="14" fill="#16a34a" opacity=".15" />
              <circle cx="0" cy="0" r="9" fill="#16a34a" />
              <text x="0" y="4" textAnchor="middle" fontSize="9" fill="white">🚌</text>
            </g>
            <g transform="translate(180, 64)">
              <circle cx="0" cy="0" r="14" fill="#f7d03d" opacity=".25" />
              <circle cx="0" cy="0" r="9" fill="#c9973a" />
              <text x="0" y="4" textAnchor="middle" fontSize="9" fill="white">🚌</text>
            </g>
            <text x="82" y="130" textAnchor="middle" fontSize="7" fill="#003162" fontWeight="600">Bus 1</text>
            <text x="268" y="149" textAnchor="middle" fontSize="7" fill="#16a34a" fontWeight="600">Bus 2</text>
            <text x="180" y="87" textAnchor="middle" fontSize="7" fill="#c9973a" fontWeight="600">Bus 3</text>
          </svg>
          <div className="px-md py-sm flex flex-col gap-xs text-label-md text-on-surface-variant">
            <div className="flex items-center gap-xs"><span className="w-2 h-2 rounded-full bg-primary" />Bus 1 · Navalur → Agni College</div>
            <div className="flex items-center gap-xs"><span className="w-2 h-2 rounded-full bg-green-600" />Bus 2 · Semmenchery → Agni College</div>
          </div>
        </div>
      </section>

      {/* ── ROLE CARDS ── */}
      <section className="bg-surface-container-low py-2xl">
        <div className="max-w-container-max mx-auto px-md md:px-gutter">
          <h2 className="font-headline-md text-headline-md text-primary text-center mb-xl">Built for every role on campus</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-md">
            {ROLE_CARDS.map((role) => (
              <div
                key={role.title}
                onClick={() => navigate(role.to)}
                className="bg-surface-container-lowest border border-outline-variant rounded-xl p-lg cursor-pointer hover:border-primary hover:shadow-sm transition-all flex flex-col gap-sm"
              >
                <div className="w-11 h-11 rounded-lg bg-primary-fixed text-primary flex items-center justify-center">
                  <role.icon className="w-6 h-6" />
                </div>
                <h3 className="font-title-lg text-title-lg text-on-surface">{role.title}</h3>
                <p className="font-body-md text-body-md text-on-surface-variant flex-1">{role.desc}</p>
                <span className="font-label-md text-label-md font-bold text-primary flex items-center gap-xs">
                  {role.cta} <IconArrow className="w-3.5 h-3.5" />
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="max-w-container-max mx-auto px-md md:px-gutter py-2xl grid md:grid-cols-3 gap-lg">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex gap-md">
            <div className="w-11 h-11 shrink-0 rounded-lg bg-secondary-fixed text-secondary flex items-center justify-center">
              <f.icon className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-title-lg text-title-lg text-on-surface mb-xs">{f.title}</h4>
              <p className="font-body-md text-body-md text-on-surface-variant">{f.desc}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ── CTA BANNER ── */}
      <section className="bg-primary text-on-primary">
        <div className="max-w-container-max mx-auto px-md md:px-gutter py-2xl text-center">
          <h2 className="font-headline-md text-headline-md mb-sm">Ready to get started?</h2>
          <p className="font-body-lg text-body-lg opacity-80 mb-lg">Track a bus right now, or sign in to your role's dashboard.</p>
          <div className="flex flex-wrap gap-sm justify-center">
            <Button variant="accent" size="lg" onClick={() => navigate('/map')}>Track Now</Button>
            <Button
              size="lg"
              className="!bg-transparent !border-on-primary !text-on-primary hover:!bg-on-primary/10"
              onClick={() => navigate('/login')}
            >
              Sign In
            </Button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-outline-variant">
        <div className="max-w-container-max mx-auto px-md md:px-gutter py-lg flex flex-col sm:flex-row items-center justify-between gap-sm">
          <div className="font-title-lg text-title-lg font-bold text-primary">ACT To Go</div>
          <div className="text-label-md text-on-surface-variant">© 2026 Agni College of Technology · All rights reserved</div>
        </div>
      </footer>
    </div>
  );
};

export default HomePage;
