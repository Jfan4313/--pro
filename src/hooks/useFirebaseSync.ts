import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

export function useFirebaseSync<T>(key: string, initialValue: T) {
  const [data, setData] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const docRef = doc(db, 'appData', key);
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        setData(snapshot.data().value as T);
      } else {
        // Initialize if it doesn't exist
        setDoc(docRef, { value: initialValue }, { merge: true });
        setData(initialValue);
      }
      setLoading(false);
    }, (error) => {
      console.error(`Error syncing ${key}:`, error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [key]);

  const updateData = async (newValue: T | ((val: T) => T)) => {
    try {
      const valueToStore = newValue instanceof Function ? newValue(data) : newValue;
      setData(valueToStore); // Optimistic update
      const docRef = doc(db, 'appData', key);
      await setDoc(docRef, { value: valueToStore }, { merge: true });
    } catch (error) {
      console.error(`Error updating ${key}:`, error);
    }
  };

  return [data, updateData, loading] as const;
}
