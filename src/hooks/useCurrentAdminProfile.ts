import { useCallback, useEffect, useState } from 'react';
import {
  loadCurrentAdminProfile,
  type CurrentAdminProfile,
} from '../services/currentAdminProfile';

export function useCurrentAdminProfile(enabled: boolean) {
  const [profile, setProfile] = useState<CurrentAdminProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!enabled) {
      setProfile(null);
      setError('');
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    setError('');

    try {
      const nextProfile = await loadCurrentAdminProfile();
      setProfile(nextProfile);
      return nextProfile;
    } catch (nextError) {
      setProfile(null);
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to load your admin profile.',
      );
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { profile, isLoading, error, reload, setProfile };
}
