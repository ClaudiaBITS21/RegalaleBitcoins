import { getNetwork, type Network } from '@regalale/core';
import { useEffect, useState } from 'preact/hooks';
import { api } from '../api.ts';
import { ALLOW_MAINNET } from '../config.ts';

/** Red y tope por aporte que informa la API. */
export function useNetwork(): { network: Network | null; ceilingUsd: number; error: boolean } {
  const [network, setNetwork] = useState<Network | null>(null);
  const [ceilingUsd, setCeiling] = useState(20);
  const [error, setError] = useState(false);
  useEffect(() => {
    api
      .health()
      .then(({ red, topeUsd }) => {
        if (typeof topeUsd === 'number' && topeUsd > 0) setCeiling(topeUsd);
        setNetwork(getNetwork(red, { allowMainnet: ALLOW_MAINNET }));
      })
      .catch(() => setError(true));
  }, []);
  return { network, ceilingUsd, error };
}
