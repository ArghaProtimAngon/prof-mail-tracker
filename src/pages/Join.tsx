import { useEffect, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import NeedInvite from './NeedInvite';

export default function Join() {
  const [params] = useSearchParams();
  const code = params.get('code') || '';
  const { user, join } = useAuth();
  const [error, setError] = useState('');
  const started = useRef(false); // an invite code works only once, so never send it twice

  useEffect(() => {
    if (user || !code || started.current) return;
    started.current = true;
    join(code).catch((e) => setError(e.message));
  }, [code, user, join]);

  if (user) return <Navigate to="/" replace />;
  if (!code) return <NeedInvite />;
  if (error) return <NeedInvite message={error} />;
  return <div className="grid min-h-screen place-items-center muted">Checking your invite…</div>;
}
