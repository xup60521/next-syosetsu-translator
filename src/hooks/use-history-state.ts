'use client';

import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';

const HistoryStateSchema = z.object({
    url_string: z.string(),
});

export type HistoryState = z.infer<typeof HistoryStateSchema>;

const HISTORY_KEY = 'app_history_state';
const DEFAULT_STATE: HistoryState = { url_string: '' };

export function useHistoryState() {

    const getValidatedState = useCallback((): HistoryState => {
        if (typeof window === 'undefined') return DEFAULT_STATE;
        const result = HistoryStateSchema.safeParse(window.history.state?.[HISTORY_KEY]);
        return result.success ? result.data : DEFAULT_STATE;
    }, []);
    const [state, setState] = useState<HistoryState>(() => getValidatedState());
    useEffect(() => {

        const handlePopState = () => setState(getValidatedState());
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [getValidatedState]);

    const setHistoryState = useCallback(
        (newValue: HistoryState | ((prev: HistoryState) => HistoryState)) => {
            const resolved = newValue instanceof Function ? newValue(state) : newValue;
            const validation = HistoryStateSchema.safeParse(resolved);

            if (!validation.success) {
                console.error('Invalid history state:', validation.error.format());
                return;
            }

            setState(validation.data);
            window.history.pushState(
                { ...window.history.state, [HISTORY_KEY]: validation.data },
                '',
                window.location.href
            );
        },
        [state]
    );

    return [state, setHistoryState] as const;
}