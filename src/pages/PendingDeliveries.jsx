import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, writeBatch, increment } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { 
  Truck, CheckCircle2, Loader2, AlertTriangle, 
  PackageCheck, Store, XCircle, ArrowDownLeft 
} from 'lucide-react';

export default function PendingDeliveries() {
  const { user } = useAuth();
  const [warehouseDeliveries, setWarehouseDeliveries] = useState([]);
  const [barReturns, setBarReturns] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(null);
  const [masterStock, setMasterStock] = useState([]); // <--- ADDED THIS

  useEffect(() => {
    if (!user) return;

    // 1. Listen for Warehouse -> Zone Transfers
    const qWarehouse = query(
      collection(db, 'transfers'),
      where('toSubstockEmail', '==', user.email),
      where('status', '==', 'pending')
    );

    // 2. Listen for Bar -> Zone Returns
    const qBarReturns = query(
      collection(db, 'bar_returns'),
      where('toSubstockId', '==', user.uid),
      where('status', '==', 'pending')
    );

    const unsubWarehouse = onSnapshot(qWarehouse, (snap) => {
      setWarehouseDeliveries(snap.docs.map(d => ({ id: d.id, type: 'WAREHOUSE', ...d.data() })));
    });

    const unsubBars = onSnapshot(qBarReturns, (snap) => {
      setBarReturns(snap.docs.map(d => ({ id: d.id, type: 'BAR_RETURN', ...d.data() })));
      setIsLoading(false);
    });

    // NEW: Listen to Master Stock to grab Price & Dose
    const unsubMaster = onSnapshot(collection(db, 'master_inventory'), (snap) => {
      setMasterStock(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubWarehouse(); unsubBars(); unsubMaster(); }; // <--- ADDED unsubMaster()
  }, [user]);

  // --- HANDLER: ACCEPT WAREHOUSE DELIVERY ---
  const handleAcceptWarehouse = async (transfer) => {
    setIsProcessing(transfer.id);
    try {
      const batch = writeBatch(db);
      
      // 1. Mark transfer as completed
      batch.update(doc(db, 'transfers', transfer.id), { 
        status: 'completed',
        acceptedAt: new Date().toISOString() 
      });

      // 2. ACTUALLY ADD TO ZONE INVENTORY (The missing piece!)
      const zoneInvId = `${user.uid}_${transfer.productId}`;
      batch.set(doc(db, 'substock_inventory', zoneInvId), {
        managerUid: user.uid,
        managerEmail: user.email,
        productId: transfer.productId,
        productName: transfer.productName,
        category: transfer.category || 'Uncategorized',
        price: transfer.price || 0,
        dose: transfer.dose || 1,
        quantity: increment(transfer.quantity),
        lastUpdated: new Date().toISOString()
      }, { merge: true });

      // 3. Log it
      batch.set(doc(collection(db, 'audit_logs')), {
        action: 'DELIVERY_ACCEPTED',
        details: `${user.email} confirmed receipt of ${transfer.quantity} ${transfer.productName} from Warehouse.`,
        user: user.email,
        timestamp: new Date().toISOString()
      });
      
      await batch.commit();
    } catch (e) { console.error(e); }
    setIsProcessing(null);
  };

  // --- HANDLER: REJECT WAREHOUSE DELIVERY ---
  const handleRejectWarehouse = async (transfer) => {
    if (!window.confirm(`Are you sure you want to refuse ${transfer.quantity} ${transfer.productName}? This will return the stock to the Main Warehouse.`)) return;

    setIsProcessing(transfer.id);
    try {
      const batch = writeBatch(db);
      
      // 1. Mark transfer as rejected
      batch.update(doc(db, 'transfers', transfer.id), { 
        status: 'rejected',
        rejectedAt: new Date().toISOString() 
      });

      // 2. Return the stock to the master warehouse
      batch.update(doc(db, 'master_inventory', transfer.productId), {
        quantity: increment(transfer.quantity),
        lastUpdated: new Date().toISOString()
      });

      // 3. Log the refusal
      batch.set(doc(collection(db, 'audit_logs')), {
        action: 'DELIVERY_REJECTED',
        details: `${user.email} refused ${transfer.quantity} ${transfer.productName}. Stock returned to Main Warehouse.`,
        user: user.email,
        timestamp: new Date().toISOString()
      });

      await batch.commit();
    } catch (e) { 
      console.error(e); 
    }
    setIsProcessing(null);
  };

  // --- HANDLER: BAR RETURN (ACCEPT OR REJECT) ---
  const handleBarReturnAction = async (returnDoc, action) => {
    setIsProcessing(returnDoc.id);
    const batch = writeBatch(db);
    try {
      if (action === 'accept') {
        const zoneInvId = `${user.uid}_${returnDoc.productId}`;
        batch.set(doc(db, 'substock_inventory', zoneInvId), {
          managerUid: user.uid,
          productId: returnDoc.productId,
          productName: returnDoc.productName,
          quantity: increment(returnDoc.quantity),
          lastUpdated: new Date().toISOString()
        }, { merge: true });

        batch.update(doc(db, 'bar_returns', returnDoc.id), { 
          status: 'completed',
          processedAt: new Date().toISOString()
        });

        batch.set(doc(collection(db, 'audit_logs')), {
          action: 'BAR_RETURN_ACCEPTED',
          details: `Accepted ${returnDoc.quantity} ${returnDoc.productName} from ${returnDoc.fromBarName}`,
          user: user.email,
          timestamp: new Date().toISOString()
        });
      } else {
        // REJECT: Send back to Bar inventory
        const barInvId = `${returnDoc.fromBarId}_${returnDoc.productId}`;
        batch.update(doc(db, 'bar_inventory', barInvId), {
          quantity: increment(returnDoc.quantity),
          lastUpdated: new Date().toISOString()
        });
        batch.update(doc(db, 'bar_returns', returnDoc.id), { status: 'rejected' });
      }
      await batch.commit();
    } catch (e) { console.error(e); }
    setIsProcessing(null);
  };

  const hasNothing = warehouseDeliveries.length === 0 && barReturns.length === 0;

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-20">
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">Incoming Stock Hub</h1>
        <p className="text-gray-500 font-medium">Verify deliveries from Warehouse and returns from Bars.</p>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={40} /></div>
      ) : hasNothing ? (
        <div className="bg-white border-2 border-dashed border-gray-100 rounded-[3rem] p-20 text-center">
          <Truck className="mx-auto text-gray-200 mb-4" size={48} />
          <p className="font-black text-gray-400 uppercase tracking-widest text-sm">No incoming stock detected</p>
        </div>
      ) : (
        <div className="space-y-12">
          
          {/* SECTION 1: WAREHOUSE DELIVERIES (ORANGE) */}
          {warehouseDeliveries.length > 0 && (
            <div className="space-y-4">
              <h2 className="flex items-center gap-2 text-xs font-black text-orange-600 uppercase tracking-[0.2em] px-4">
                <Truck size={16} /> From Main Warehouse
              </h2>
              {warehouseDeliveries.map(item => {
                const masterItem = masterStock.find(m => m.id === item.productId || m.name === item.productName) || {};
                return (
                <div key={item.id} className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-orange-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-orange-50 text-orange-600 rounded-2xl"><PackageCheck size={24} /></div>
                    <div>
                      <h3 className="font-black text-gray-900 uppercase text-lg">{item.productName}</h3>
                      
                      <div className="flex flex-wrap items-center gap-2 mt-1 mb-2">
                        {masterItem.dose && <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-gray-100 px-2 py-1 rounded-md">{masterItem.dose} doses</span>}
                        {masterItem.price && <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">MAD {masterItem.price} / dose</span>}
                      </div>

                      <p className="text-3xl font-black text-orange-600 tabular-nums leading-none mt-1">{item.quantity}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleRejectWarehouse(item)}
                      disabled={isProcessing}
                      className="px-6 py-4 bg-red-50 text-red-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-red-100 active:scale-95 transition-all disabled:opacity-50"
                      title="Refuse Delivery"
                    >
                      <XCircle size={16} />
                    </button>
                    <button 
                      onClick={() => handleAcceptWarehouse(item)}
                      disabled={isProcessing}
                      className="px-8 py-4 bg-gray-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isProcessing === item.id ? <Loader2 className="animate-spin" /> : <><CheckCircle2 size={16} /> Confirm Receipt</>}
                    </button>
                  </div>
                </div>
              ); })}
            </div>
          )}

          {/* SECTION 2: BAR RETURNS (EMERALD) */}
          {barReturns.length > 0 && (
            <div className="space-y-4">
              <h2 className="flex items-center gap-2 text-xs font-black text-emerald-600 uppercase tracking-[0.2em] px-4">
                <Store size={16} /> Returns from Bars
              </h2>
              {barReturns.map(item => {
                const masterItem = masterStock.find(m => m.id === item.productId || m.name === item.productName) || {};
                return (
                <div key={item.id} className="bg-white rounded-[2.5rem] p-6 shadow-sm border border-emerald-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl"><ArrowDownLeft size={24} /></div>
                    <div>
                      <h3 className="font-black text-gray-900 uppercase text-lg">{item.productName}</h3>
                      
                      <div className="flex flex-wrap items-center gap-2 mt-1 mb-2">
                        {masterItem.dose && <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-gray-100 px-2 py-1 rounded-md">{masterItem.dose} doses</span>}
                        {masterItem.price && <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">MAD {masterItem.price} / dose</span>}
                      </div>

                      <div className="flex items-center gap-2">
                        <p className="text-3xl font-black text-emerald-600 tabular-nums leading-none mt-1">{item.quantity}</p>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 rounded-md mt-1">From {item.fromBarName}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleBarReturnAction(item, 'reject')}
                      disabled={isProcessing}
                      className="px-6 py-4 bg-red-50 text-red-600 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-red-100 active:scale-95 transition-all"
                    >
                      <XCircle size={16} />
                    </button>
                    <button 
                      onClick={() => handleBarReturnAction(item, 'accept')}
                      disabled={isProcessing}
                      className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-100 active:scale-95 transition-all"
                    >
                      {isProcessing === item.id ? <Loader2 className="animate-spin" /> : 'Accept Return'}
                    </button>
                  </div>
                </div>
              ); })}
            </div>
          )}
        </div>
      )}

      {/* Security Tip */}
      <div className="bg-blue-50 border border-blue-100 p-6 rounded-[2rem] flex items-start gap-4">
        <AlertTriangle className="text-blue-600 shrink-0 mt-1" size={20} />
        <p className="text-[11px] text-blue-800 font-bold uppercase leading-relaxed tracking-tight">
          Operational Note: Only confirm receipt/returns once the physical stock has been hand-counted and verified. Accepted stock is added to your zone inventory immediately.
        </p>
      </div>
    </div>
  );
}