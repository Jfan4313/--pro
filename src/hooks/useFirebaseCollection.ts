import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc, query, where } from 'firebase/firestore';
import { db, auth } from '../firebase';

export function useFirebaseCollection<T>(collectionName: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const q = query(collection(db, collectionName));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
      setData(items);
      setLoading(false);
    }, (err) => {
      console.error(`Error fetching ${collectionName}:`, err);
      setError(err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [collectionName]);

  const addDocument = async (item: Omit<T, 'id'>) => {
    const docRef = doc(collection(db, collectionName));
    await setDoc(docRef, {
      ...item,
      authorUID: auth.currentUser?.uid || 'dev-user',
      createdAt: new Date().toISOString()
    });
    return docRef.id;
  };

  const updateDocument = async (id: string, item: Partial<T>) => {
    const docRef = doc(db, collectionName, id);
    await updateDoc(docRef, item as any);
  };

  const deleteDocument = async (id: string) => {
    const docRef = doc(db, collectionName, id);
    await deleteDoc(docRef);
  };

  return { data, loading, error, addDocument, updateDocument, deleteDocument };
}
