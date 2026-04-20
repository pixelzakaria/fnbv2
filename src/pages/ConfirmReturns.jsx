import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, writeBatch, increment } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Truck, 
  Warehouse, 
  Clock, 
  User as UserIcon,
  PackageCheck
} from 'lucide-react';

export default function ConfirmReturns() {
  const { user } = useAuth();
  const [pendingReturns, setPendingReturns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [masterStock, setMasterStock] = useState([]); // <--- ADDED THIS

  useEffect(() => {
    // Listen for returns that are "pending"
    const q = query(
      collection(db, 'warehouse_returns'),
      where('status', '==', 'pending')
    );

    const unsub = onSnapshot(q, (snap) => {
      setPendingReturns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setIsLoading(false);
    });

    // NEW: Listen to Master Stock to grab Price & Dose
    const unsubMaster = onSnapshot(collection(db, 'master_inventory'), (snap) => {
      setMasterStock(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { 
      unsub();
      unsubMaster(); // <--- ADDED THIS
    };
  }, []);

  const handleAction = async (returnDoc, action) => {
    if (isProcessing) return;
    setIsProcessing(true);
    const batch = writeBatch(db);

    try {
      if (action === 'accept') {
        // 1. Move stock BACK to master_inventory
        const masterRef = doc(db, 'master_inventory', returnDoc.productId);
        batch.update(masterRef, {
          quantity: increment(returnDoc.quantity),
          lastUpdated: new Date().toISOString()
        });

        // 2. Mark return as completed
        const returnRef = doc(db, 'warehouse_returns', returnDoc.id);
        batch.update(returnRef, { 
          status: 'completed',
          processedBy: user.email,
          completedAt: new Date().toISOString()
        });

        // 3. Log the success
        const logRef = doc(collection(db, 'audit_logs'));
        batch.set(logRef, {
          action: 'ZONE_RETURN_ACCEPTED',
          details: `Accepted ${returnDoc.quantity} ${returnDoc.productName} from ${returnDoc.fromManagerEmail}`,
          user: user.email,
          timestamp: new Date().toISOString()
        });
      } else {
        // ACTION: REJECT
        // 1. Mark as rejected (Admin refuses the truck)
        const returnRef = doc(db, 'warehouse_returns', returnDoc.id);
        batch.update(returnRef, { 
          status: 'rejected',
          processedBy: user.email,
          completedAt: new Date().toISOString()
        });

        // 2. IMPORTANT: We MUST give the stock back to the Zone Manager
        // Because the Zone deducted it when they sent it, we put it back.
        // We find the doc in substock_inventory using the ManagerUid + ProductId logic
        const zoneInventoryId = `${returnDoc.fromManagerUid}_${returnDoc.productId}`;
        const zoneInvRef = doc(db, 'substock_inventory', zoneInventoryId);
        batch.update(zoneInvRef, {
          quantity: increment(returnDoc.quantity),
          lastUpdated: new Date().toISOString()
        });

        // 3. Log the rejection
        const logRef = doc(collection(db, 'audit_logs'));
        batch.set(logRef, {
          action: 'ZONE_RETURN_REJECTED',
          details: `Rejected ${returnDoc.quantity} ${returnDoc.productName} from ${returnDoc.fromManagerEmail} (Stock returned to Zone)`,
          user: user.email,
          timestamp: new Date().toISOString()
        });
      }

      await batch.commit();
    } catch (error) {
      console.error("Action failed:", error);
      alert("Something went wrong. Check console.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20 px-4">
      <div>
        <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Incoming Returns</h1>
        <p className="text-gray-500 font-bold">Review and count stock returning from the field.</p>
      </div>

      {pendingReturns.length === 0 ? (
        <div className="bg-white p-16 rounded-[3rem] border-2 border-dashed border-gray-100 text-center">
          <Warehouse className="mx-auto text-gray-200 mb-4" size={48} />
          <p className="font-black text-gray-400 uppercase tracking-widest">No pending returns at this time</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {pendingReturns.map((item) => {
            const masterItem = masterStock.find(m => m.id === item.productId || m.name === item.productName) || {};
            
            return (
            <div key={item.id} className="bg-white p-6 sm:p-8 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-md transition-shadow">
              
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                    <Truck size={24} />
                  </div>
                  <div>
                    <h3 className="font-black text-gray-900 uppercase text-lg">{item.productName}</h3>
                    
                    <div className="flex flex-wrap items-center gap-2 mt-2 mb-2">
                        {masterItem.dose && <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-gray-100 px-2 py-1 rounded-md">{masterItem.dose} doses</span>}
                        {masterItem.price && <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">MAD {masterItem.price} / dose</span>}
                    </div>

                    <p className="text-4xl font-black text-blue-600 tabular-nums">{item.quantity}</p>
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    <UserIcon size={14} className="text-gray-300" />
                    From: <span className="text-gray-900 ml-1">{item.fromManagerEmail.split('@')[0]}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    <Clock size={14} className="text-gray-300" />
                    Sent: <span className="text-gray-900 ml-1">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => handleAction(item, 'reject')}
                  disabled={isProcessing}
                  className="flex-1 md:flex-none px-6 py-4 bg-red-50 text-red-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-red-100 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <XCircle size={18} /> Reject
                </button>
                <button
                  onClick={() => handleAction(item, 'accept')}
                  disabled={isProcessing}
                  className="flex-1 md:flex-none px-8 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  {isProcessing ? <Loader2 className="animate-spin" /> : <><PackageCheck size={18} /> Confirm Count</>}
                  </button>
              </div>

            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}