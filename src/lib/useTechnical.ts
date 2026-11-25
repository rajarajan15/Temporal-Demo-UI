import { useState } from 'react';
import { prefs } from './store';

/** Whether to show engineering detail (step codes, timings, error codes, Temporal links). Remembered per browser. */
export function useTechnical(): [boolean, (v: boolean) => void] {
  const [on, setOn] = useState(() => prefs.get('technical', '') === '1');
  return [
    on,
    (v: boolean) => {
      prefs.set('technical', v ? '1' : '');
      setOn(v);
    },
  ];
}
