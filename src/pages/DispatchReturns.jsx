import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, writeBatch, increment, addDoc, setDoc, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../context/AuthContext';
import {
  ArrowUpRight, ArrowDownLeft, Store, Loader2, CheckCircle2,
  ChevronRight, ArrowLeft, Trash2, ShoppingCart, XCircle,
  Database, Plus, Send, UserPlus
} from 'lucide-react';

export default function DispatchReturns() {
  const { user } = useAuth();
  
  // --- WIZARD & MODE HISTORY LOGIC ---
  const [step, _setStep] = useState(1);
  const [transactionType, _setTransactionType] = useState('dispatch');

  useEffect(() => {
    const handlePopState = (e) => {
      if (e.state && e.state.step) {
        _setStep(e.state.step);
        if (e.state.transactionType) _setTransactionType(e.state.transactionType);
      } else {
        _setStep(1);
        _setTransactionType('dispatch');
      }
    };
    
    // Initialize base history state so the back button has a target
    window.history.replaceState({ step: 1, transactionType: 'dispatch' }, '');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const setStep = (newStep) => {
    if (newStep < step) {
      // Moving backward: Unwind history stack to prevent back button trap
      window.history.go(newStep - step);
      _setStep(newStep);
    } else if (newStep > step) {
      // Moving forward: Add to history stack capturing current step and mode
      window.history.pushState({ step: newStep, transactionType }, '');
      _setStep(newStep);
    } else {
      _setStep(newStep);
    }
  };

  const setTransactionType = (newType) => {
    // Toggling mode doesn't push a new page, it just updates the current history entry
    window.history.replaceState({ step, transactionType: newType }, '');
    _setTransactionType(newType);
  };

  const [myInventory, setMyInventory] = useState([]);
  const [barLocations, setBarLocations] = useState([]);
  const [barInventory, setBarInventory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [masterStock, setMasterStock] = useState([]);
  const [catalog, setCatalog] = useState([]);

  // Selection States
  const [selectedBar, setSelectedBar] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null); // <--- ADDED THIS
  const [currentProduct, setCurrentProduct] = useState(null);
  const [tempQty, setTempQty] = useState(0);
  const [manifest, setManifest] = useState([]);

  // UI States
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [showConfirmModal, setShowConfirmModal] = useState(false); // NEW
  const [pendingBars, setPendingBars] = useState([]); // <--- ADDED THIS

  // VIP Add Bar States
  const [isVip, setIsVip] = useState(false); // <--- ADD THIS LINE
  const [showAddBarModal, setShowAddBarModal] = useState(false);
  const [newBarName, setNewBarName] = useState('');
  const [newBarEmail, setNewBarEmail] = useState('');
  const [newBarPassword, setNewBarPassword] = useState('');
  const [isCreatingBar, setIsCreatingBar] = useState(false);

  useEffect(() => {
    if (!user) return;

    // --- ADD THIS NEW BLOCK ---
    const checkVipStatus = async () => {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists() && userDoc.data().isVipZone === true) {
        setIsVip(true);
      }
    };
    checkVipStatus();
    // --- END NEW BLOCK ---

    // 1. Get Zone Manager's Inventory
    const invQuery = query(collection(db, 'substock_inventory'), where('managerUid', '==', user.uid));
    const unsubInv = onSnapshot(invQuery, (snap) => {
      setMyInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Get Bar Locations (Only bars assigned to this Zone Manager)
    const barsQuery = query(collection(db, 'bar_locations'), where('assignedZoneUid', '==', user.uid));
    const unsubBars = onSnapshot(barsQuery, (snap) => {
      setBarLocations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setIsLoading(false);
    });

    // 3. Get Global Bar Inventory (to calculate returns)
    const unsubBarInv = onSnapshot(collection(db, 'bar_inventory'), (snap) => {
      setBarInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 4. Listen to Master Stock to grab Price & Dose
    const unsubMaster = onSnapshot(collection(db, 'master_inventory'), (snap) => {
      setMasterStock(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 5. NEW: Listen to Catalog for Categories
    const unsubCatalog = onSnapshot(collection(db, 'catalog'), (snap) => {
      setCatalog(snap.docs.map(d => d.data()));
    });

    return () => { unsubInv(); unsubBars(); unsubBarInv(); unsubMaster(); unsubCatalog(); };

    return () => { unsubInv(); unsubBars(); unsubBarInv(); unsubMaster(); }; // <--- ADDED unsubMaster()
  }, [user]);

  // --- Dynamic Calculator Logic ---
  const remainingInZone = currentProduct ? currentProduct.quantity - tempQty : 0;

  // Find the exact balance for the selected Bar & Product
  const barStockItem = currentProduct && selectedBar
    ? barInventory.find(b => b.barId === selectedBar.id && b.productId === currentProduct.productId)
    : null;
  const currentBarBalance = barStockItem?.quantity || 0;
  const remainingToReturn = currentBarBalance - tempQty;

  const handleAddQty = (value) => {
    const next = tempQty + value;
    if (transactionType === 'dispatch' && next > currentProduct?.quantity) return;
    if (transactionType === 'return' && next > currentBarBalance) return;

    setTempQty(next);
  };

  const handleManualInput = (e) => {
    const val = parseInt(e.target.value) || 0;
    if (transactionType === 'dispatch' && val > currentProduct?.quantity) {
      setTempQty(currentProduct?.quantity);
      return;
    }
    if (transactionType === 'return' && val > currentBarBalance) {
      setTempQty(currentBarBalance);
      return;
    }
    setTempQty(val);
  };

  const addToManifest = () => {
    if (!currentProduct || tempQty <= 0) return;
    setManifest([...manifest, {
      productId: currentProduct.productId,
      substockDocId: currentProduct.id,
      productName: currentProduct.productName,
      quantity: tempQty
    }]);
    setCurrentProduct(null);
    setTempQty(0);
    setStep(3);
  };

  // Trigger Modal
  const handleFinalProcess = () => {
    if (manifest.length === 0) return;
    setShowConfirmModal(true);
  };

  // Cancel Button
  const cancelProcess = () => {
    setShowConfirmModal(false);
  };

  // Confirm Button (Renamed from confirmEarly)
  const confirmProcess = () => {
    setShowConfirmModal(false);
    executeProcess();
  };

  const handleCreateBar = async (e) => {
    e.preventDefault();
    if (!newBarName) return;

    const barNameToCreate = newBarName.trim();
    const tempId = 'temp-' + Date.now();
    
    // 1. Optimistic UI Update (Instantly close modal & show unclickable pending bar)
    setPendingBars(prev => [...prev, {
      id: tempId,
      name: barNameToCreate,
      lead: barNameToCreate,
      isPending: true, // Flag to keep it unclickable
      createdAt: new Date().toISOString()
    }]);
    setShowAddBarModal(false);
    setNewBarName('');

    // 2. Process in background
    const generatedEmail = `${barNameToCreate.toLowerCase().replace(/[^a-z0-9]/g, '')}@fnb.ma`;
    const defaultPassword = '0645020304';

    try {
      const functions = getFunctions();
      const createStaffAccount = httpsCallable(functions, 'createStaffAccount');

      const result = await createStaffAccount({
        email: generatedEmail,
        password: defaultPassword,
        role: 'bar'
      });

      const newUid = result.data.uid;

      const barRef = await addDoc(collection(db, 'bar_locations'), {
        name: barNameToCreate,
        lead: barNameToCreate,
        assignedZoneUid: user.uid,
        leadUid: newUid,
        createdAt: new Date().toISOString()
      });

      await setDoc(doc(db, 'users', newUid), {
        uid: newUid,
        email: generatedEmail,
        role: 'bar',
        barId: barRef.id,
        assignedZoneUid: user.uid,
        createdAt: new Date().toISOString()
      });

      await addDoc(collection(db, 'audit_logs'), {
        action: 'VIP_BAR_CREATED',
        details: `VIP Zone created a new BAR account. Login: ${generatedEmail}`,
        user: user.email,
        timestamp: new Date().toISOString()
      });

      setStatus({ type: 'success', msg: `Created! Email: ${generatedEmail}` });
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', msg: error.message });
    } finally {
      // Remove from pending once backend finishes (Firebase listener instantly pops the real one in)
      setPendingBars(prev => prev.filter(b => b.id !== tempId));
      setTimeout(() => setStatus({ type: '', msg: '' }), 4000);
    }
  };

  // The actual database execution (Renamed)
  const executeProcess = async () => {
    setShowConfirmModal(false);
    if (manifest.length === 0) return;
    setIsProcessing(true);
    try {
      const batch = writeBatch(db);

      manifest.forEach(item => {
        // 1. UPDATE ZONE STATIC BALANCE
        // We use the substockDocId from our current inventory list
        const stockRef = doc(db, 'substock_inventory', item.substockDocId);
        batch.update(stockRef, {
          quantity: increment(transactionType === 'dispatch' ? -item.quantity : item.quantity),
          lastUpdated: new Date().toISOString()
        });

        // 2. HANDLE BAR LOGIC (The "State-on-Write" Engine)
        if (transactionType === 'dispatch') {
          // DISPATCH MODE: We don't update bar balance yet. 
          // We create a 'pending' transfer. The Bar Lead's "Accept" will trigger the balance increase.
          const transferRef = doc(collection(db, 'transfers'));
          batch.set(transferRef, {
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            fromSubstockId: user.uid,
            fromSubstockEmail: user.email,
            toBarId: selectedBar.id,
            toBarName: selectedBar.name,
            toSubstockId: user.uid, // Required for Bar's filtering
            status: 'pending',
            type: 'ZONE_TO_BAR',
            timestamp: new Date().toISOString()
          });
        } else {
          // RETURN MODE: This is immediate. We update the Bar balance down right now.
          const barInvId = `${selectedBar.id}_${item.productId}`;
          const barRef = doc(db, 'bar_inventory', barInvId);

          batch.set(barRef, {
            barId: selectedBar.id,
            barName: selectedBar.name,
            productId: item.productId,
            productName: item.productName,
            // Decrement the bar's static balance
            quantity: increment(-item.quantity),
            lastUpdated: new Date().toISOString()
          }, { merge: true });
        }

        // 3. LOG FOR HISTORY (Not for calculation)
        batch.set(doc(collection(db, 'audit_logs')), {
          action: transactionType === 'dispatch' ? 'BAR_DISPATCH_SENT' : 'BAR_RETURN_RECEIVED',
          details: `${transactionType === 'dispatch' ? 'Sent' : 'Received'} ${item.quantity} ${item.productName} ${transactionType === 'dispatch' ? 'to' : 'from'} ${selectedBar.name}`,
          user: user.email,
          timestamp: new Date().toISOString()
        });
      });

      await batch.commit();

      setStatus({
        type: 'success',
        msg: transactionType === 'dispatch' ? 'Dispatch Manifest Authorized!' : 'Return Processed & Inventory Updated!'
      });

      setManifest([]);
      setSelectedBar(null);
      setStep(1);
    } catch (e) {
      console.error("Process Error:", e);
      setStatus({ type: 'error', msg: 'Operation failed. Check inventory balances.' });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setStatus({ type: '', msg: '' }), 3000);
    }
  };

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-emerald-600" size={48} /></div>;

  return (
    <div className="max-w-xl mx-auto pb-40 px-4 relative">

      {/* Toast Notification */}
      {status.msg && (
        <div className="fixed top-10 left-0 right-0 z-[100] flex justify-center pointer-events-none animate-in slide-in-from-top-10">
          <div className={`${status.type === 'success' ? 'bg-gray-900' : 'bg-red-600'} text-white px-8 py-4 rounded-[2rem] shadow-2xl flex items-center gap-3 pointer-events-auto`}>
            <CheckCircle2 size={24} />
            <span className="font-black uppercase tracking-widest text-sm">{status.msg}</span>
          </div>
        </div>
      )}

      {/* STEP 1: SELECT MODE & BAR */}
      {step === 1 && (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div>
            <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Bar Operations</h1>
            <p className="text-gray-500 font-bold">Manage flow to and from Bar Leads.</p>
          </div>

          <div className="flex bg-gray-100 p-2 rounded-[2.5rem] gap-2">
            <button
              onClick={() => setTransactionType('dispatch')}
              className={`flex-1 py-4 rounded-[2rem] font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 transition-all ${transactionType === 'dispatch' ? 'bg-emerald-600 text-white shadow-lg' : 'text-gray-400'}`}
            >
              <ArrowUpRight size={16} /> Dispatch
            </button>
            <button
              onClick={() => setTransactionType('return')}
              className={`flex-1 py-4 rounded-[2rem] font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 transition-all ${transactionType === 'return' ? 'bg-red-600 text-white shadow-lg' : 'text-gray-400'}`}
            >
              <ArrowDownLeft size={16} /> Return
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {[...barLocations, ...pendingBars]
              .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
              .map(b => {
              // Calculate total items this specific bar holds
              const totalAtBar = barInventory.filter(item => item.barId === b.id).reduce((acc, curr) => acc + curr.quantity, 0);
              const isDisabled = b.isPending || (transactionType === 'return' && totalAtBar === 0);

              return (
                <button
                  key={b.id}
                  onClick={() => { if (!isDisabled) { setSelectedBar(b); setStep(2); } }}
                  disabled={isDisabled}
                  className={`p-8 border-2 rounded-[2.5rem] text-left transition-all flex justify-between items-center group shadow-sm 
                    ${isDisabled
                      ? 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed grayscale'
                      : `bg-white border-gray-100 active:scale-95 ${transactionType === 'dispatch' ? 'hover:border-emerald-600' : 'hover:border-red-600'}`
                    }`}
                >
                  <div>
                    <span className="font-black text-gray-900 uppercase text-lg flex items-center gap-2 leading-none">
                      {b.name} 
                      {b.isPending && <Loader2 className="animate-spin text-blue-600" size={16} />}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2 block">
                      {b.isPending ? 'PROVISIONING ACCOUNT...' : b.lead}
                    </span>
                    <span className={`mt-3 inline-block px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${totalAtBar > 0 ? 'bg-gray-100 text-gray-600' : 'bg-red-50 text-red-500'}`}>
                      {b.isPending ? 'INITIALIZING' : `Total Bar Stock: ${totalAtBar}`}
                    </span>
                  </div>
                  {!isDisabled && <ChevronRight className={`text-gray-300 ${transactionType === 'dispatch' ? 'group-hover:text-emerald-600' : 'group-hover:text-red-600'}`} />}
                </button>
              );
            })}

            {/* VIP Bar Creation Button */}
            {isVip && (   // <--- CHANGE THIS LINE
              <button
                onClick={() => setShowAddBarModal(true)}
                className="p-6 border-2 border-dashed border-gray-200 rounded-[2.5rem] flex flex-col items-center justify-center text-gray-400 hover:text-blue-600 hover:border-blue-600 hover:bg-blue-50 transition-all active:scale-95 min-h-[120px]"
              >
                <Plus size={32} className="mb-2" />
                <span className="font-black uppercase tracking-widest text-[10px]">Add New Bar</span>
              </button>
            )}

          </div>
        </div>
      )}

      {/* STEP 2: CATEGORY HUB */}
      {step === 2 && (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <div className="flex justify-between items-start mb-6">
            <div>
              <button onClick={() => setStep(1)} className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 hover:text-gray-900 transition-colors">
                <ArrowLeft size={14} /> Change Bar
              </button>
              <h1 className="text-4xl font-black text-gray-900 uppercase tracking-tighter">Category</h1>
              <p className={`${transactionType === 'dispatch' ? 'text-emerald-600' : 'text-red-600'} font-bold text-sm uppercase`}>
                {transactionType} {transactionType === 'dispatch' ? 'to' : 'from'} {selectedBar?.name}
              </p>
            </div>
            {manifest.length > 0 && (
              <div className="bg-gray-900 text-white px-4 py-2 rounded-2xl flex items-center gap-2 animate-in zoom-in">
                <ShoppingCart size={14} />
                <span className="font-black text-xs">{manifest.length} Items</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {Array.from(new Set(catalog.map(c => c.Catégorie)))
              .filter(Boolean)
              .map(cat => {
                let availableStock = 0;
                if (transactionType === 'dispatch') {
                  availableStock = myInventory
                    .filter(p => (p.category || masterStock.find(m => m.id === p.productId)?.category || 'Uncategorized') === cat)
                    .reduce((acc, curr) => acc + curr.quantity, 0);
                } else {
                  availableStock = barInventory
                    .filter(b => b.barId === selectedBar?.id)
                    .filter(p => (p.category || masterStock.find(m => m.id === p.productId)?.category || 'Uncategorized') === cat)
                    .reduce((acc, curr) => acc + curr.quantity, 0);
                }
                return { cat, availableStock };
              })
              .sort((a, b) => {
                if (a.availableStock > 0 && b.availableStock === 0) return -1;
                if (a.availableStock === 0 && b.availableStock > 0) return 1;
                return a.cat.localeCompare(b.cat);
              })
              .map(({ cat, availableStock }) => {
                const isDisabled = availableStock === 0;

                // THE FIX: Correctly maps the manifest items back to the Zone Manager's inventory to verify the category
                const inManifest = manifest.filter(m => {
                  const prod = myInventory.find(p => p.productId === m.productId);
                  const prodCategory = prod?.category || masterStock.find(ms => ms.id === m.productId)?.category || 'Uncategorized';
                  return prodCategory === cat;
                }).reduce((acc, curr) => acc + curr.quantity, 0);

                return (
                  <button
                    key={cat}
                    onClick={() => { if (!isDisabled) { setSelectedCategory(cat); setStep(3); } }}
                    disabled={isDisabled}
                    className={`p-6 sm:p-8 rounded-[2.5rem] text-left transition-all flex flex-col justify-between min-h-[140px] border-2 
                      ${isDisabled 
                        ? 'bg-gray-50 border-gray-100 opacity-50 cursor-not-allowed grayscale' 
                        : inManifest > 0 
                          ? `active:scale-95 ${transactionType === 'dispatch' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}` 
                          : 'bg-white border-gray-100 hover:border-gray-200 active:scale-95'
                      }`}
                  >
                    <div>
                      <p className="font-black text-gray-900 text-xl uppercase leading-tight">{cat}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">{availableStock} Available</p>
                    </div>
                    {inManifest > 0 && (
                      <div className={`inline-block px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-colors text-white shadow-lg mt-4 w-fit ${
                        transactionType === 'dispatch' ? 'bg-emerald-600 shadow-emerald-600/30' : 'bg-red-600 shadow-red-600/30'
                      }`}>
                        {inManifest} Selected
                      </div>
                    )}
                  </button>
                );
              })}
          </div>

          <div className="sticky bottom-8 z-40 mt-auto pt-10 flex justify-center pointer-events-none">
            <div className="w-full pointer-events-auto">
              <button
                onClick={handleFinalProcess}
                disabled={manifest.length === 0 || isProcessing}
                className={`w-full py-6 text-white rounded-[2.5rem] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 shadow-2xl disabled:opacity-20 transition-all active:scale-95 border border-white/10 ${transactionType === 'dispatch' ? 'bg-emerald-600 shadow-emerald-900/20' : 'bg-red-600 shadow-red-900/20'}`}
              >
                {isProcessing ? <Loader2 className="animate-spin" /> : <><Send size={20} /> Authorize {transactionType}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: PRODUCT HUB (FILTERED BY CATEGORY) */}
      {step === 3 && (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <div className="flex justify-between items-start mb-6">
            <div>
              <button onClick={() => setStep(2)} className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 hover:text-gray-900 transition-colors">
                <ArrowLeft size={14} /> Back to Categories
              </button>
              <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">{selectedCategory}</h1>
              <p className={`${transactionType === 'dispatch' ? 'text-emerald-600' : 'text-red-600'} font-bold text-sm uppercase`}>Select Products</p>
            </div>
            {manifest.length > 0 && (
              <div className="bg-gray-900 text-white px-4 py-2 rounded-2xl flex items-center gap-2 animate-in zoom-in">
                <ShoppingCart size={14} />
                <span className="font-black text-xs">{manifest.length} Items</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {myInventory
              .filter(p => (p.category || masterStock.find(m => m.id === p.productId)?.category || 'Uncategorized') === selectedCategory)
              .map(p => {
                const inManifest = manifest.filter(m => m.productId === p.productId).reduce((acc, curr) => acc + curr.quantity, 0);

                const barStock = barInventory.find(item => item.barId === selectedBar?.id && item.productId === p.productId)?.quantity || 0;
                const displayQty = transactionType === 'dispatch' ? p.quantity : barStock;
                const displayLabel = transactionType === 'dispatch' ? 'In Zone' : 'At Bar';
                const isDisabled = transactionType === 'return' && barStock === 0;

                const masterItem = masterStock.find(m => m.id === p.productId || m.name === p.productName) || {};

                return (
                  <button
                    key={p.id}
                    onClick={() => { if (!isDisabled) { setCurrentProduct(p); setStep(4); } }}
                    disabled={isDisabled}
                    className={`relative p-6 sm:p-8 rounded-[2.5rem] text-left transition-all flex flex-col justify-between min-h-[160px]
                    ${isDisabled ? 'opacity-40 cursor-not-allowed bg-gray-50 grayscale border-gray-100 border-2' : 'active:scale-95'}
                    ${inManifest > 0 ? `bg-gray-50 border-2 ${transactionType === 'dispatch' ? 'border-emerald-200' : 'border-red-200'}` : !isDisabled ? 'bg-white border-2 border-gray-100 hover:border-gray-300' : ''}
                  `}
                  >
                    <div>
                      <p className="font-black text-gray-900 text-xs uppercase leading-tight mb-3 pr-4">{p.productName}</p>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {masterItem.dose && <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest bg-gray-200/50 px-2 py-1 rounded-md">{masterItem.dose} doses</span>}
                        {masterItem.price && <span className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">MAD {masterItem.price}</span>}
                      </div>
                    </div>

                    <div className="mt-auto">
                      <p className="text-4xl font-black text-gray-900 leading-none">{displayQty}</p>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2 mb-4">{displayLabel}</p>
                    </div>

                    {inManifest > 0 && (
                      <div className={`inline-block px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors w-fit text-white shadow-md ${transactionType === 'dispatch' ? 'bg-emerald-600 shadow-emerald-200' : 'bg-red-600 shadow-red-200'}`}>
                        {inManifest} Selected
                      </div>
                    )}
                  </button>
                );
              })}
          </div>

          <div className="sticky bottom-8 z-40 mt-10 flex justify-center pointer-events-none">
            <div className="w-full pointer-events-auto">
              <button
                onClick={handleFinalProcess}
                disabled={manifest.length === 0 || isProcessing}
                className={`w-full py-6 text-white rounded-[2.5rem] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 shadow-2xl disabled:opacity-20 transition-all active:scale-95 border border-white/10 ${transactionType === 'dispatch' ? 'bg-emerald-600 shadow-emerald-900/20' : 'bg-red-600 shadow-red-900/20'}`}
              >
                {isProcessing ? <Loader2 className="animate-spin" /> : <><Send size={20} /> Authorize {transactionType}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 4: CALCULATOR (WAS STEP 3) */}
      {step === 4 && (
        <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 p-8 flex flex-col min-h-[600px] animate-in zoom-in-95">
          <div className="flex justify-between items-center mb-8 pb-6 border-b border-gray-50">
            <button onClick={() => { setStep(3); setTempQty(0); }} className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <ArrowLeft size={14} /> Back
            </button>

            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-xl">
                <Database size={12} className="text-gray-400" />
                <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                  Zone: <span className="text-sm ml-1 text-gray-900">{currentProduct?.quantity.toLocaleString()}</span>
                </p>
              </div>
              <div className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded-xl">
                <Store size={12} className="text-gray-600" />
                <p className="text-[9px] font-black text-gray-600 uppercase tracking-widest">
                  At Bar: <span className="text-sm ml-1 text-gray-900">{currentBarBalance.toLocaleString()}</span>
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center items-center text-center">
            <span className={`text-[10px] font-black px-6 py-2 rounded-full uppercase tracking-[0.2em] mb-4 ${transactionType === 'dispatch' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              {transactionType === 'dispatch' ? 'Dispatching' : 'Returning'} {currentProduct?.productName}
            </span>

            <input
              type="number" inputMode="numeric"
              value={tempQty === 0 ? '' : tempQty}
              onChange={handleManualInput}
              placeholder="0"
              className="w-full text-8xl font-black tracking-tighter text-gray-900 text-center bg-transparent border-none outline-none focus:ring-0 placeholder:text-gray-100"
              autoFocus={typeof window !== 'undefined' && window.innerWidth > 768}
            />

            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-12">
              Units to {transactionType}
              {transactionType === 'dispatch' && <span className="text-emerald-600 ml-1">({remainingInZone} left)</span>}
              {transactionType === 'return' && <span className="text-red-600 ml-1">({remainingToReturn} left to return)</span>}
            </p>

            <div className="grid grid-cols-4 gap-3 w-full mb-8">
              {[1, 5, 10, 50, 100, 500, 1000, 2000].map(val => {
                const isOverStock = transactionType === 'dispatch' ? val > remainingInZone : val > remainingToReturn;
                return (
                  <button
                    key={val}
                    onClick={() => handleAddQty(val)}
                    disabled={isOverStock}
                    className={`py-5 rounded-2xl font-black text-sm transition-all active:scale-90 shadow-sm border
                      ${isOverStock
                        ? 'bg-gray-50 text-gray-200 border-gray-50 cursor-not-allowed opacity-50'
                        : 'bg-white text-gray-900 border-gray-100 hover:bg-gray-900 hover:text-white'
                      }`}
                  >
                    +{val}
                  </button>
                );
              })}
            </div>

            {/* Grayed out Discard button to not clash with the Return's red branding */}
            <button
              onClick={() => setTempQty(0)}
              className="w-full py-5 bg-gray-50 text-gray-500 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-2 hover:bg-gray-100 transition-all border border-gray-100"
            >
              <XCircle size={16} /> Clear & Discard
            </button>
          </div>

          <button
            onClick={addToManifest}
            disabled={tempQty <= 0}
            className={`mt-8 w-full py-6 text-white rounded-[2rem] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-2 shadow-xl transition-all active:scale-95 disabled:opacity-20 ${transactionType === 'dispatch' ? 'bg-emerald-600 shadow-emerald-100' : 'bg-red-600 shadow-red-100'}`}
          >
            Add to Manifest <Plus size={20} />
          </button>
        </div>
      )}

      {/* Glovo-Style Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4 transition-all">
          <div className="bg-white w-full sm:w-[450px] rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-300">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Confirm?</h3>
              <div className={`p-2 rounded-xl text-white ${transactionType === 'dispatch' ? 'bg-emerald-600' : 'bg-red-600'}`}>
                <Send size={20} />
              </div>
            </div>

            <div className="mb-8">
              <p className="text-sm font-bold text-gray-500 mb-3 leading-relaxed">
                {transactionType === 'dispatch' ? 'Sending to' : 'Pulling from'} <span className="uppercase text-gray-900">{selectedBar?.name}</span>:
              </p>

              {/* Exact Recap List */}
              <div className="bg-gray-50 rounded-2xl p-4 max-h-32 overflow-y-auto custom-scrollbar border border-gray-100 space-y-3">
                {manifest.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-gray-700">
                    <span className="truncate pr-4">{item.productName}</span>
                    <span className={`tabular-nums ${transactionType === 'dispatch' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {item.quantity} Units
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 w-full">
              <button
                onClick={cancelProcess}
                className="flex-1 py-5 bg-gray-100 text-gray-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all active:scale-95"
              >
                Cancel
              </button>
              <button
                onClick={confirmProcess}
                className={`flex-[2] py-5 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 ${transactionType === 'dispatch' ? 'bg-emerald-600 shadow-emerald-200' : 'bg-red-600 shadow-red-200'}`}
              >
                Confirm Now <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIP Add Bar Modal */}
      {showAddBarModal && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4 transition-all">
          <div className="bg-white w-full sm:w-[400px] rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">New Bar</h3>
              <button onClick={() => setShowAddBarModal(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full transition-colors">
                <XCircle size={24} />
              </button>
            </div>

            <form onSubmit={handleCreateBar} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 block">Bar Name</label>
                <input
                  type="text" required
                  value={newBarName} onChange={(e) => setNewBarName(e.target.value)}
                  placeholder="e.g. VIP Lounge Bar"
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-600 font-medium"
                />
              </div>

              <button
                type="submit"
                disabled={isCreatingBar}
                className="w-full py-4 mt-4 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 shadow-lg shadow-blue-200 active:scale-95 transition-all disabled:opacity-50"
              >
                {isCreatingBar ? <Loader2 className="animate-spin" size={16} /> : <><UserPlus size={16} /> Create Bar Account</>}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}