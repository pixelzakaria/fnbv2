import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { useState, useEffect } from 'react';
import { db, auth } from '../firebase'; // MAKE SURE auth IS EXPORTED FROM YOUR FIREBASE.JS
import { collection, onSnapshot, addDoc, doc, setDoc, deleteDoc, query, orderBy, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { Store, MapPin, Plus, Loader2, X, Package, Trash2 } from 'lucide-react';

export default function ManageChefs() {
  const { user } = useAuth();
  const [bars, setBars] = useState([]);
  const [substocks, setSubstocks] = useState([]); // NEW: To hold Zone Managers
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBarStock, setSelectedBarStock] = useState(null); 
  const [isCalculating, setIsCalculating] = useState(false);
  
  // NEW: Expanded Form States
  const [barName, setBarName] = useState('');
  const [leadName, setLeadName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [assignedZoneUid, setAssignedZoneUid] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // 1. Fetch Bars
    const barsRef = collection(db, 'bar_locations');
    const qBars = query(barsRef, orderBy('name', 'asc'));
    const unsubBars = onSnapshot(qBars, (snapshot) => {
      setBars(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setIsLoading(false);
    });

    // 2. NEW: Fetch Substock Managers for the Dropdown
    const qSub = query(collection(db, 'users'), where('role', '==', 'substock'));
    const unsubSub = onSnapshot(qSub, (snapshot) => {
      // FIX: Manually append doc.id as uid so the dropdown mapping works perfectly
      setSubstocks(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })));
    });

    return () => { unsubBars(); unsubSub(); };
  }, []);

  // --- THE CALCULATION ENGINE ---
  const fetchBarInventory = async (bar) => {
    setIsCalculating(true);
    try {
      const logsRef = collection(db, 'audit_logs');
      const q = query(logsRef, where('details', '>=', ''), where('details', '<=', '\uf8ff'));
      const querySnapshot = await getDocs(q);

      const inventoryMap = {};

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.details.includes(bar.name)) {
          const match = data.details.match(/(\d+)\s+(.+?)\s+(to|from)/);
          if (match) {
            const qty = parseInt(match[1]);
            const productName = match[2].trim();
            const type = data.action; 

            if (!inventoryMap[productName]) inventoryMap[productName] = 0;

            if (type === 'BAR_DISPATCH') inventoryMap[productName] += qty;
            else if (type === 'BAR_RETURN') inventoryMap[productName] -= qty;
          }
        }
      });

      setSelectedBarStock({ name: bar.name, lead: bar.lead, items: inventoryMap });
    } catch (error) {
      console.error(error);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleAddBar = async (e) => {
    e.preventDefault();
    if (!barName || !leadName || !email || !password || !assignedZoneUid) {
      setErrorMsg("Please fill in all fields.");
      return;
    }
    
    setIsSubmitting(true);
    setErrorMsg('');
    
    try {
      // 1. THE SECONDARY APP TRICK: Create a temporary app instance to prevent Admin logout
      const secondaryApp = initializeApp(db.app.options, `SecondaryApp_${Date.now()}`);
      const secondaryAuth = getAuth(secondaryApp);
      
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), password);
      const newUid = userCredential.user.uid;
      
      // Immediately sign out of the temporary instance so it doesn't linger
      await signOut(secondaryAuth);

      // 2. Create the Bar Location Document (Linked to the Zone)
      const barRef = await addDoc(collection(db, 'bar_locations'), {
        name: barName.trim(),
        lead: leadName.trim(),
        assignedZoneUid: assignedZoneUid, 
        leadUid: newUid,
        createdAt: new Date().toISOString()
      });

      // 3. Create the User Document with role: 'bar'
      await setDoc(doc(db, 'users', newUid), {
        uid: newUid,
        email: email.trim(),
        role: 'bar',
        barId: barRef.id,
        assignedZoneUid: assignedZoneUid,
        createdAt: new Date().toISOString()
      });

      // Clear Form
      setBarName('');
      setLeadName('');
      setEmail('');
      setPassword('');
      setAssignedZoneUid('');
      
    } catch (error) { 
      console.error(error); 
      setErrorMsg(error.message);
    } finally { 
      setIsSubmitting(false); 
    }
  };

  const handleDeleteBar = async (e, barId, leadUid, barName) => {
    e.stopPropagation(); // Stops the click from opening the stock modal
    
    if (!window.confirm(`Are you sure you want to delete ${barName}? This removes them from the dashboard and revokes their app access.`)) {
      return;
    }
    
    try {
      // 1. Delete the Bar Location Document
      await deleteDoc(doc(db, 'bar_locations', barId));
      
      // 2. Delete the User Document (This revokes their app privileges)
      if (leadUid) {
        await deleteDoc(doc(db, 'users', leadUid));
      }
    } catch (error) {
      console.error("Error deleting bar:", error);
      alert("Failed to delete bar data.");
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12 relative">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Bar Leads & Inventory</h1>
        <p className="mt-2 text-gray-500">Register bars, assign them to zones, and view live stock.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* REGISTRATION FORM */}
        <div className="lg:col-span-1">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 sticky top-8">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
              <Plus size={20} className="text-blue-500" /> Register Bar
            </h2>
            
            {errorMsg && <div className="mb-4 p-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl">{errorMsg}</div>}

            <form onSubmit={handleAddBar} className="space-y-4">
              
              <div className="space-y-3">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Bar Details</p>
                <input type="text" value={barName} onChange={(e) => setBarName(e.target.value)} placeholder="Bar Name (e.g. VIP Bar 1)" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all" required />
                
                <select 
                  value={assignedZoneUid} 
                  onChange={(e) => setAssignedZoneUid(e.target.value)} 
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all" 
                  required
                >
                  <option value="">Assign to Zone...</option>
                  {substocks.map(sub => (
                    <option key={sub.uid} value={sub.uid}>Zone: {sub.email.split('@')[0]}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3 pt-4 border-t border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Lead Account Setup</p>
                <input type="text" value={leadName} onChange={(e) => setLeadName(e.target.value)} placeholder="Lead Full Name" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all" required />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Login Email" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all" required />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Account Password" minLength="6" className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all" required />
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full py-4 mt-4 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-widest text-xs rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95 flex justify-center items-center">
                {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : "Create Bar & Account"}
              </button>
            </form>
          </div>
        </div>

        {/* BARS LIST */}
        <div className="lg:col-span-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bars.map((bar) => {
              // Find the zone email to display on the card
              const assignedZone = substocks.find(s => s.uid === bar.assignedZoneUid);
              
              return (
                <div 
                  key={bar.id} 
                  onClick={() => fetchBarInventory(bar)}
                  className="relative p-6 bg-white border border-gray-100 rounded-3xl shadow-sm hover:border-blue-500 hover:shadow-md transition-all cursor-pointer group"
                >
                  {/* NEW: Delete Button */}
                  <button 
                    onClick={(e) => handleDeleteBar(e, bar.id, bar.leadUid, bar.name)}
                    className="absolute top-4 right-4 p-2 text-gray-300 hover:bg-red-50 hover:text-red-500 rounded-xl transition-colors z-10"
                    title="Delete Bar & Account"
                  >
                    <Trash2 size={18} />
                  </button>

                  <div className="flex justify-between items-start mt-2">
                    <div>
                      <h3 className="font-black text-xl text-gray-900 group-hover:text-blue-600 uppercase tracking-tight pr-8">{bar.name}</h3>
                      <p className="text-sm text-gray-500 font-bold mt-1">{bar.lead}</p>
                      
                      <div className="mt-3 flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg inline-flex">
                        <MapPin size={12} /> 
                        {assignedZone ? `Zone: ${assignedZone.email.split('@')[0]}` : 'Unassigned'}
                      </div>
                    </div>
                    
                    <div className="p-3 bg-gray-50 rounded-2xl text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      <Store size={24} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* STOCK VIEW MODAL (Unchanged) */}
      {selectedBarStock && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-8 bg-gray-900 text-white flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black tracking-tight uppercase">{selectedBarStock.name}</h2>
                <p className="text-blue-400 text-xs font-bold uppercase tracking-widest mt-1">{selectedBarStock.lead}</p>
              </div>
              <button onClick={() => setSelectedBarStock(null)} className="p-2 hover:bg-gray-800 rounded-xl transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Current Theoretical Stock</h3>
              {Object.keys(selectedBarStock.items).length === 0 ? (
                <p className="text-gray-400 font-bold text-sm py-8 text-center bg-gray-50 rounded-2xl">No products currently at this bar.</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(selectedBarStock.items).map(([name, qty]) => (
                    <div key={name} className="flex items-center justify-between p-5 bg-gray-50 rounded-2xl border border-gray-100">
                      <span className="font-black text-xs uppercase tracking-widest text-gray-800">{name}</span>
                      <span className={`text-2xl font-black tabular-nums ${qty > 10 ? 'text-gray-900' : 'text-red-500 animate-pulse'}`}>
                        {qty}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 bg-gray-50 text-[10px] text-gray-400 text-center font-bold uppercase tracking-widest">
              Calculated via live audit logs
            </div>
          </div>
        </div>
      )}

      {isCalculating && (
        <div className="fixed inset-0 bg-white/40 backdrop-blur-sm z-[60] flex items-center justify-center">
          <Loader2 className="animate-spin text-blue-600" size={48} />
        </div>
      )}
    </div>
  );
}