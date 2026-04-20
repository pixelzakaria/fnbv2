import { createContext, useContext, useEffect, useState } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react'; // <--- ADD THIS IMPORT

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        // Fetch the user's role from our Firestore database
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          setRole(userDoc.data().role); // This will be 'admin' or 'substock'
        }
      } else {
        setUser(null);
        setRole(null);
      }
      setLoading(false);
    });

    return unsubscribe; // Cleanup listener on unmount
  }, []);

  // <--- ADD THIS LOADING BLOCK --->
  // This physically blocks the router from loading the login/landing page 
  // until Firebase makes its final decision.
  if (loading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, role }}>
      {/* Since we catch the loading state above, we can just render children here */}
      {children} 
    </AuthContext.Provider>
  );
}

// Custom hook to easily grab user info in any file
export const useAuth = () => useContext(AuthContext);