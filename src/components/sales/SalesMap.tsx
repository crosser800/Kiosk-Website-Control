import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import philippinesRegions from '../../../2B Sales Map/src/data/philippines-regions.json';
import { supabase } from '../../lib/supabase';
import { COMPLETED_RAW_STATUSES, ORDER_STATUS_FIELD } from '../../services/completedSales';
import 'leaflet/dist/leaflet.css';
import styles from './SalesMap.module.css';

type RegionProperties = { adm1_psgc: number; adm1_en: string };
type OrderLocationRow = { branch_name: string | null; branch_code: string | null; client_name: string | null; grand_total: number | null };

const regions = philippinesRegions as FeatureCollection<Geometry, RegionProperties>;

const regionKeywords: Record<string, string[]> = {
  'National Capital Region': ['manila', 'quezon city', 'makati', 'taguig', 'pasig', 'caloocan', 'paranaque', 'las pinas', 'muntinlupa', 'marikina', 'mandaluyong', 'valenzuela', 'malabon', 'navotas'],
  'Region IV-A (CALABARZON)': ['cavite', 'laguna', 'batangas', 'rizal', 'quezon'],
  'Region III (Central Luzon)': ['bulacan', 'pampanga', 'bataan', 'zambales', 'tarlac', 'nueva ecija', 'aurora'],
  'Region VII (Central Visayas)': ['cebu', 'bohol', 'negros oriental', 'siquijor'],
  'Region VI (Western Visayas)': ['iloilo', 'bacolod', 'negros occidental', 'antique', 'capiz', 'aklan', 'guimaras'],
  'Region XI (Davao Region)': ['davao', 'digos', 'tagum', 'panabo'],
  'Region X (Northern Mindanao)': ['cagayan de oro', 'misamis', 'bukidnon', 'camiguin', 'lanao del norte'],
};

function displayName(feature: Feature<Geometry, RegionProperties>) {
  return feature.properties.adm1_en === 'MIMAROPA Region' ? 'Region IV-B (MIMAROPA)' : feature.properties.adm1_en;
}

function locateRegion(row: OrderLocationRow, features: Feature<Geometry, RegionProperties>[]) {
  const source = `${row.branch_name ?? ''} ${row.branch_code ?? ''} ${row.client_name ?? ''}`.toLowerCase();
  const direct = features.find((feature) => source.includes(displayName(feature).toLowerCase()));
  if (direct) return String(direct.properties.adm1_psgc);
  const match = Object.entries(regionKeywords).find(([, keywords]) => keywords.some((keyword) => source.includes(keyword)));
  const feature = match ? features.find((entry) => displayName(entry) === match[0]) : undefined;
  return feature ? String(feature.properties.adm1_psgc) : null;
}

export default function SalesMap() {
  const mapElement = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.GeoJSON | null>(null);
  const [sales, setSales] = useState<Record<string, number>>({});
  const [unmappedSales, setUnmappedSales] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedRegionId, setSelectedRegionId] = useState('');

  const regionFeatures = useMemo(() => [...regions.features].sort((a, b) => displayName(a).localeCompare(displayName(b))), []);
  const totalSales = useMemo(() => Object.values(sales).reduce((sum, value) => sum + value, 0), [sales]);
  const rankedRegions = useMemo(() => regionFeatures
    .map((feature) => ({ id: String(feature.properties.adm1_psgc), name: displayName(feature), amount: sales[String(feature.properties.adm1_psgc)] ?? 0 }))
    .filter((entry) => entry.amount > 0)
    .sort((a, b) => b.amount - a.amount), [regionFeatures, sales]);
  const selected = rankedRegions.find((region) => region.id === selectedRegionId);

  useEffect(() => {
    let active = true;
    async function loadSales() {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('orders')
        .select('branch_name, branch_code, client_name, grand_total')
        .in(ORDER_STATUS_FIELD, COMPLETED_RAW_STATUSES);
      if (!active) return;
      if (error) { setSales({}); setUnmappedSales(0); setIsLoading(false); return; }
      const nextSales: Record<string, number> = {};
      let nextUnmapped = 0;
      ((data ?? []) as OrderLocationRow[]).forEach((row) => {
        const amount = Number(row.grand_total ?? 0) || 0;
        const regionId = locateRegion(row, regionFeatures);
        if (!regionId) { nextUnmapped += amount; return; }
        nextSales[regionId] = (nextSales[regionId] ?? 0) + amount;
      });
      setSales(nextSales);
      setUnmappedSales(nextUnmapped);
      setIsLoading(false);
    }
    void loadSales();
    return () => { active = false; };
  }, [regionFeatures]);

  useEffect(() => {
    if (!mapElement.current || mapRef.current) return;
    const map = L.map(mapElement.current, { center: [12.8797, 121.774], zoom: 5, minZoom: 5, maxZoom: 9, zoomControl: false, attributionControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    layerRef.current?.remove();
    const maximum = Math.max(...Object.values(sales), 1);
    const layer = L.geoJSON(regions, {
      style: (feature) => {
        const id = String((feature?.properties as RegionProperties | undefined)?.adm1_psgc ?? '');
        const amount = sales[id] ?? 0;
        const selected = id === selectedRegionId;
        return { color: selected ? '#facc15' : '#8a6b17', weight: selected ? 3 : 1.2, fillColor: amount ? '#22c55e' : '#334155', fillOpacity: amount ? 0.24 + (amount / maximum) * 0.62 : 0.12 };
      },
      onEachFeature: (feature, layerItem) => {
        const id = String((feature.properties as RegionProperties).adm1_psgc);
        const amount = sales[id] ?? 0;
        layerItem.bindTooltip(`<strong>${displayName(feature as Feature<Geometry, RegionProperties>)}</strong><br>PHP ${amount.toLocaleString()}`, { sticky: true });
        layerItem.on('click', () => setSelectedRegionId(id));
      },
    }).addTo(map);
    layerRef.current = layer;
    map.fitBounds(layer.getBounds(), { padding: [20, 20] });
  }, [sales, selectedRegionId]);

  return (
    <section className={styles.section} aria-labelledby="sales-map-title">
      <div className={styles.header}>
        <div><p className={styles.eyebrow}>Location intelligence</p><h2 id="sales-map-title">Sales Map</h2><p>Completed sales grouped by the region detected from each branch or client location.</p></div>
        <div className={styles.total}><span>Mapped sales</span><strong>PHP {totalSales.toLocaleString()}</strong></div>
      </div>
      <div className={styles.content}>
        <div className={styles.mapFrame}><div ref={mapElement} className={styles.map} />{isLoading ? <div className={styles.loading}>Loading sales locations…</div> : null}</div>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}><div><span>Regional performance</span><strong>{rankedRegions.length} active regions</strong></div><span className={styles.badge}>PHP</span></div>
          <div className={styles.regionList}>
            {rankedRegions.length ? rankedRegions.map((region) => <button key={region.id} type="button" className={`${styles.regionButton} ${selectedRegionId === region.id ? styles.regionButtonActive : ''}`} onClick={() => setSelectedRegionId(region.id)}><span>{region.name}</span><strong>PHP {region.amount.toLocaleString()}</strong></button>) : <p className={styles.empty}>No completed sales could be mapped to a Philippine region yet.</p>}
          </div>
          {selected ? <p className={styles.selection}>Selected: <strong>{selected.name}</strong></p> : null}
          {unmappedSales > 0 ? <p className={styles.note}>PHP {unmappedSales.toLocaleString()} is not mapped because its branch or client location does not contain a recognized region or city.</p> : null}
        </aside>
      </div>
    </section>
  );
}
