import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import styles from './Toast.module.css';

interface ToastItem {
  id: number;
  type: 'success' | 'error' | 'warning';
  message: string;
  action?: { label: string; onClick: () => void };
}

interface ToastContextType {
  showToast: (type: ToastItem['type'], message: string, action?: ToastItem['action']) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((type: ToastItem['type'], message: string, action?: ToastItem['action']) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, message, action }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const dismiss = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className={styles.container}>
        {toasts.map((toast) => (
          <div key={toast.id} className={`${styles.toast} ${styles[toast.type]}`}>
            <span className={styles.icon}>
              {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✗' : '⚠'}
            </span>
            <span className={styles.message}>{toast.message}</span>
            {toast.action && (
              <button className={styles.action} onClick={toast.action.onClick}>
                {toast.action.label}
              </button>
            )}
            <button className={styles.close} onClick={() => dismiss(toast.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
