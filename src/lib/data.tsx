import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { useAuth } from './auth';
import { useToast } from './toast';
import type { AppData, AppUser, Contact, Professor, Status } from './types';

interface DataState {
  data: AppData;
  loading: boolean; // true only on the very first load, when there is nothing to show yet
  refreshing: boolean;
  stale: boolean; // true when we are showing saved data because the server could not be reached
  online: boolean;
  followUpDays: number;
  /** Active people (not revoked). */
  people: AppUser[];
  refresh: () => Promise<void>;
  /** Send a change to the server, then reload the data. Returns true on success. */
  save: (action: string, params: Record<string, unknown>, successMessage?: string) => Promise<boolean>;
  professorById: (id: string) => Professor | undefined;
  contactOf: (professorId: string, userId: string) => Contact | undefined;
  statusOf: (professorId: string, userId: string) => Status;
  userName: (userId: string) => string;
}

const EMPTY: AppData = { professors: [], contacts: [], users: [], templates: [], settings: {}, activity: [] };
const DataContext = createContext<DataState | null>(null);

function readCache(key: string): AppData | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as AppData) : null;
  } catch {
    return null;
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const toast = useToast();
  const cacheKey = `pmt_cache_v1_${user?.user_id}`;

  // Show the last saved data straight away, then update it from the server.
  const [data, setData] = useState<AppData>(() => readCache(cacheKey) || EMPTY);
  const [loading, setLoading] = useState(() => !readCache(cacheKey));
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const lastLoad = useRef(0);

  const handleError = useCallback((e: unknown): string => {
    if (e instanceof ApiError && e.code === 'AUTH') logout();
    return e instanceof Error ? e.message : 'Something went wrong.';
  }, [logout]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const fresh = await api<AppData>('getAll');
      setData(fresh);
      setStale(false);
      lastLoad.current = Date.now();
      try { localStorage.setItem(cacheKey, JSON.stringify(fresh)); } catch { /* storage full: ignore */ }
    } catch (e) {
      const message = handleError(e);
      setStale(true);
      if (!(e instanceof ApiError && (e.code === 'OFFLINE' || e.code === 'NETWORK'))) toast(message, 'error');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [cacheKey, handleError, toast]);

  useEffect(() => { refresh(); }, [refresh]);

  // Keep the online/offline banner right, and pick up the other person's changes when you come back to the app.
  useEffect(() => {
    const goOnline = () => { setOnline(true); refresh(); };
    const goOffline = () => setOnline(false);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > 60000) refresh();
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const save = useCallback(async (action: string, params: Record<string, unknown>, successMessage?: string) => {
    try {
      await api(action, params);
    } catch (e) {
      toast(handleError(e), 'error');
      return false;
    }
    if (successMessage) toast(successMessage);
    await refresh();
    return true;
  }, [handleError, refresh, toast]);

  const value = useMemo<DataState>(() => {
    const contactMap = new Map<string, Contact>();
    data.contacts.forEach((c) => contactMap.set(`${c.professor_id}|${c.user_id}`, c));
    const profMap = new Map(data.professors.map((p) => [p.id, p]));
    const userMap = new Map(data.users.map((u) => [u.user_id, u.name]));
    const days = Number(data.settings.follow_up_days);
    return {
      data, loading, refreshing, stale, online, refresh, save,
      followUpDays: days >= 1 ? days : 10,
      people: data.users.filter((u) => !u.revoked),
      professorById: (id) => profMap.get(id),
      contactOf: (pid, uid) => contactMap.get(`${pid}|${uid}`),
      statusOf: (pid, uid) => contactMap.get(`${pid}|${uid}`)?.status || 'Not sent',
      userName: (id) => userMap.get(id) || 'Someone',
    };
  }, [data, loading, refreshing, stale, online, refresh, save]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
