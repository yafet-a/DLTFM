import { useReducer, useCallback } from 'react';

type TransactionState = {
  status: 'idle' | 'pending' | 'success' | 'error';
  error: Error | null;
  data: any;
};

type TransactionAction = 
  | { type: 'PENDING' }
  | { type: 'SUCCESS'; payload: any }
  | { type: 'ERROR'; payload: Error };

const initialState: TransactionState = {
  status: 'idle',
  error: null,
  data: null
};

function transactionReducer(state: TransactionState, action: TransactionAction): TransactionState {
  switch (action.type) {
    case 'PENDING':
      return { ...state, status: 'pending', error: null };
    case 'SUCCESS':
      return { status: 'success', error: null, data: action.payload };
    case 'ERROR':
      return { status: 'error', error: action.payload, data: null };
    default:
      return state;
  }
}

export const useBlockchainTransaction = () => {
  const [state, dispatch] = useReducer(transactionReducer, initialState);
  
  const executeTransaction = useCallback(async <T>(action: () => Promise<T>): Promise<T> => {
    dispatch({ type: 'PENDING' });
    try {
      const result = await action();
      dispatch({ type: 'SUCCESS', payload: result });
      return result;
    } catch (error) {
      dispatch({ type: 'ERROR', payload: error as Error });
      throw error;
    }
  }, []);
  
  return { state, executeTransaction };
};