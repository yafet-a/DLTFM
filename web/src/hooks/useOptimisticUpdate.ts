import { useState } from 'react';

export const useOptimisticUpdate = <T>(
  key: string, 
  updateFn: (data: T) => Promise<void>
) => {
  const [optimisticData, setOptimisticData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const mutate = async (data: T) => {
    // Immediately update UI
    const previousData = optimisticData;
    setOptimisticData(data);
    setError(null);

    try {
      await updateFn(data);
    } catch (err) {
      // Rollback on failure
      setOptimisticData(previousData);
      setError(err instanceof Error ? err : new Error('Update failed'));
    }
  };

  return { mutate, optimisticData, error };
};