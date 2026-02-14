/**
 * useLocalStorage Hook
 *
 * Persists state to localStorage with type safety and validation.
 */

import { useState, useCallback, useEffect } from 'react';

export interface UseLocalStorageOptions<T> {
  serializer?: (value: T) => string;
  deserializer?: (value: string) => T;
  validator?: (value: unknown) => value is T;
}

export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  options: UseLocalStorageOptions<T> = {}
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const {
    serializer = JSON.stringify,
    deserializer = JSON.parse,
    validator,
  } = options;

  // Initialize state from localStorage
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      if (item === null) {
        return defaultValue;
      }

      const parsed = deserializer(item);

      // SECURITY: Always validate localStorage data - it can be manipulated by users
      if (validator) {
        if (!validator(parsed)) {
          console.warn(`Invalid data in localStorage for key "${key}", using default`);
          return defaultValue;
        }
      } else {
        // Warn if no validator provided - this is a potential security issue
        console.warn(
          `SECURITY: No validator for localStorage key "${key}". ` +
          `User-manipulated data may cause unexpected behavior.`
        );
      }

      return parsed as T;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return defaultValue;
    }
  });

  // Update localStorage when value changes
  useEffect(() => {
    try {
      localStorage.setItem(key, serializer(storedValue));
    } catch (error) {
      console.error(`Error writing to localStorage key "${key}":`, error);
    }
  }, [key, storedValue, serializer]);

  // Setter function
  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const newValue = value instanceof Function ? value(prev) : value;
        return newValue;
      });
    },
    []
  );

  // Remove from localStorage
  const removeValue = useCallback(() => {
    try {
      localStorage.removeItem(key);
      setStoredValue(defaultValue);
    } catch (error) {
      console.error(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, defaultValue]);

  return [storedValue, setValue, removeValue];
}

/**
 * Type-safe localStorage for theme settings
 */
export interface ThemeSettings {
  themeId: string;
  neonColor: string;
  savedAt: string;
}

const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  themeId: 'classic',
  neonColor: 'cyan',
  savedAt: new Date().toISOString(),
};

export function useThemeSettings() {
  return useLocalStorage<ThemeSettings>(
    'quikdarts_theme',
    DEFAULT_THEME_SETTINGS,
    {
      validator: (value): value is ThemeSettings => {
        if (!value || typeof value !== 'object') return false;
        const v = value as Record<string, unknown>;
        return (
          typeof v.themeId === 'string' &&
          typeof v.neonColor === 'string'
        );
      },
    }
  );
}

export default useLocalStorage;
