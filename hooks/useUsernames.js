import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * Fetches usernames for a list of user IDs from Firestore.
 * @param {string[]} userIds
 * @returns {{ usernames: Record<string, string>, loading: boolean }}
 */
export function useUsernames(userIds) {
  const [usernames, setUsernames] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userIds || userIds.length === 0) {
      setUsernames({});
      setLoading(false);
      return;
    }
    let isMounted = true;
    setLoading(true);
    // Fetch user documents by document ID (UID)
    const fetchUsernames = async () => {
      let allUsernames = {};
      await Promise.all(userIds.map(async (uid) => {
        try {
          const userDoc = await getDoc(doc(db, 'users', uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            allUsernames[uid] = data.username || uid;
          } else {
            allUsernames[uid] = uid;
          }
        } catch (e) {
          allUsernames[uid] = uid;
        }
      }));
      if (isMounted) {
        setUsernames(allUsernames);
        setLoading(false);
      }
    };
    fetchUsernames();
    return () => { isMounted = false; };
  }, [JSON.stringify(userIds)]);

  return { usernames, loading };
}
