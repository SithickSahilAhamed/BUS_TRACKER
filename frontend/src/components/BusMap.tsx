import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { CAMPUS_CENTER as CAMPUS_CENTER_LATLNG } from '../constants';
import type { Bus } from '../types';

// Leaflet wants [lat, lng] tuples, not the app's {lat, lng} shape.
export const CAMPUS_CENTER: [number, number] = [CAMPUS_CENTER_LATLNG.lat, CAMPUS_CENTER_LATLNG.lng];

export const isFresh = (bus: Bus): boolean => {
  const ts = bus.lastLocation?.updatedAt;
  if (!ts) return false;
  return Date.now() - ts.toDate().getTime() < 30_000;
};

/** Colored circle + bus emoji + number label. divIcon avoids the classic
 *  broken default-icon problem Leaflet has under bundlers like Vite. */
const busIcon = (bus: Bus, selected: boolean) => {
  const color = !bus.isActive ? '#8a94a0' : isFresh(bus) ? '#1b7a5a' : '#d18b2b';
  const ring = selected ? 'box-shadow: 0 0 0 4px rgba(15,93,143,.35);' : '';
  return L.divIcon({
    className: 'bus-div-icon',
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;">
        <div style="width:36px;height:36px;border-radius:50%;background:${color};${ring}
                    display:flex;align-items:center;justify-content:center;font-size:18px;
                    border:2.5px solid #fff;box-shadow:0 2px 8px rgba(15,29,46,.35);">🚌</div>
        <div style="margin-top:2px;background:#fffdfa;border:1px solid #d9d2c7;border-radius:8px;
                    padding:0 6px;font:600 10px 'Source Sans 3',sans-serif;color:#0f1d2e;
                    white-space:nowrap;box-shadow:0 1px 3px rgba(15,29,46,.2);">${bus.busNumber}</div>
      </div>`,
    iconSize: [36, 50],
    iconAnchor: [18, 18],
    popupAnchor: [0, -16],
  });
};

const stopIcon = L.divIcon({
  className: 'bus-stop-icon',
  html: `<div style="width:12px;height:12px;border-radius:50%;background:#0f5d8f;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.3);"></div>`,
  iconSize: [12, 12],
  iconAnchor: [6, 6],
});

const lastUpdateText = (bus: Bus): string => {
  const ts = bus.lastLocation?.updatedAt;
  if (!ts) return 'no GPS yet';
  const secs = Math.round((Date.now() - ts.toDate().getTime()) / 1000);
  if (secs < 10) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.round(secs / 60)} min ago`;
};

/** Pans to the selected bus whenever its position changes. */
const FollowBus: React.FC<{ bus: Bus | null }> = ({ bus }) => {
  const map = useMap();
  const lat = bus?.lastLocation?.lat;
  const lng = bus?.lastLocation?.lng;
  useEffect(() => {
    if (lat != null && lng != null) {
      map.panTo([lat, lng], { animate: true });
    }
  }, [map, lat, lng]);
  return null;
};

interface BusMapProps {
  buses: Bus[];
  selectedBusId?: string | null;
  onSelectBus?: (busId: string | null) => void;
  follow?: boolean;
  height?: string; // defaults to 100% (fill parent)
}

export const BusMap: React.FC<BusMapProps> = ({
  buses,
  selectedBusId = null,
  onSelectBus,
  follow = false,
  height = '100%',
}) => {
  const selectedBus = useMemo(
    () => buses.find((b) => b.busId === selectedBusId) ?? null,
    [buses, selectedBusId]
  );

  return (
    <MapContainer
      center={CAMPUS_CENTER}
      zoom={13}
      style={{ height, width: '100%' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* Selected bus's route + stops */}
      {selectedBus?.routePath && selectedBus.routePath.length > 1 && (
        <Polyline
          positions={selectedBus.routePath.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={{ color: '#0f5d8f', weight: 5, opacity: 0.75 }}
        />
      )}
      {selectedBus?.stops?.map((stop, i) => (
        <Marker key={`${stop.name}-${i}`} position={[stop.lat, stop.lng]} icon={stopIcon}>
          <Popup>{stop.name}</Popup>
        </Marker>
      ))}

      {/* Live bus markers */}
      {buses
        .filter((b) => b.lastLocation)
        .map((bus) => (
          <Marker
            key={bus.busId}
            position={[bus.lastLocation!.lat, bus.lastLocation!.lng]}
            icon={busIcon(bus, bus.busId === selectedBusId)}
            eventHandlers={{ click: () => onSelectBus?.(bus.busId) }}
          >
            <Popup>
              <div style={{ minWidth: 170, fontFamily: "'Source Sans 3', sans-serif" }}>
                <strong>
                  {bus.busNumber} · {bus.busName}
                </strong>
                <div style={{ fontSize: 12, color: '#4b5a6b', marginTop: 4 }}>
                  <div>Route: {bus.routeName || '—'}</div>
                  <div>Driver: {bus.activeDriverName ?? 'not on trip'}</div>
                  <div>
                    Speed:{' '}
                    {bus.lastLocation?.speedKmh != null
                      ? `${Math.round(bus.lastLocation.speedKmh)} km/h`
                      : '—'}
                  </div>
                  <div>Updated: {lastUpdateText(bus)}</div>
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

      {/* Fallback circles at route origin for buses with no GPS fix yet */}
      {buses
        .filter((b) => !b.lastLocation && b.stops?.length)
        .map((bus) => (
          <CircleMarker
            key={bus.busId}
            center={[bus.stops![0].lat, bus.stops![0].lng]}
            radius={8}
            pathOptions={{ color: '#8a94a0', fillColor: '#8a94a0', fillOpacity: 0.5 }}
            eventHandlers={{ click: () => onSelectBus?.(bus.busId) }}
          >
            <Popup>
              {bus.busNumber} · {bus.busName} — waiting for GPS
            </Popup>
          </CircleMarker>
        ))}

      {follow && <FollowBus bus={selectedBus} />}
    </MapContainer>
  );
};
