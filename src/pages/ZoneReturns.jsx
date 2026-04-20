import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, doc, writeBatch, increment } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { 
  Undo2, 
  Package, 
  ArrowLeft, 
  Send, 
  Loader2, 
  CheckCircle2, 
  Database,
  AlertCircle, ShoppingCart, Plus
} from 'lucide-react';

export default function ZoneReturns() {
  const { user } = useAuth();
  
  // Data States
  const [myInventory, setMyInventory] = useState([]);
  const [masterStock, setMasterStock] = useState([]); 
  const [catalog, setCatalog] = useState([]); // <--- ADDED THIS
  const [isLoading, setIsLoading] = useState(true);
  
  // --- WIZARD HISTORY LOGIC ---
  const [step, _setStep] = useState(1); // 1: Category, 2: Product, 3: Calculator

  useEffect(() => {
    const handlePopState = (e) => {
      if (e.state && e.state.step) {
        _setStep(e.state.step);
      } else {
        _setStep(1);
      }
    };
    
    // Initialize base history state so the back button has a target
    window.history.replaceState({ step: 1 }, '');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const setStep = (newStep) => {
    if (newStep < step) {
      // Moving backward: Unwind history stack to prevent back button trap
      window.history.go(newStep - step);
      _setStep(newStep);
    } else if (newStep > step) {
      // Moving forward: Push to history stack
      window.history.pushState({ step: newStep }, '');
      _setStep(newStep);
    } else {
      _setStep(newStep);
    }
  };

  // Selection States
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [returnQty, setReturnQty] = useState(0);
  const [manifest, setManifest] = useState([]); // <--- ADDED MANIFEST STATE
  const [showConfirmModal, setShowConfirmModal] = useState(false); // <--- ADDED MODAL STATE

  // UI States
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' });

  useEffect(() => {
    if (!user?.uid) return;

    // Only fetch products where this Zone actually has stock > 0
    const q = query(
      collection(db, 'substock_inventory'), 
      where('managerUid', '==', user.uid)
    );

    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(item => item.quantity > 0);
      setMyInventory(items);
      setIsLoading(false);
    });

    // NEW: Listen to Master Stock to grab Price & Dose
    const unsubMaster = onSnapshot(collection(db, 'master_inventory'), (snap) => {
      setMasterStock(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // NEW: Listen to Catalog for Categories
    const unsubCatalog = onSnapshot(collection(db, 'catalog'), (snap) => {
      setCatalog(snap.docs.map(d => d.data()));
    });

    return () => { unsub(); unsubMaster(); unsubCatalog(); };
  }, [user]);

  const addToManifest = () => {
    if (!selectedProduct || returnQty <= 0) return;
    
    const existingIndex = manifest.findIndex(m => m.productId === selectedProduct.productId);
    
    if (existingIndex >= 0) {
      // Combine duplicates
      const newManifest = [...manifest];
      newManifest[existingIndex].quantity += returnQty;
      setManifest(newManifest);
    } else {
      // Add new
      setManifest([...manifest, {
        id: selectedProduct.id, // The Zone Inventory Doc ID
        productId: selectedProduct.productId, // The Master Product ID
        productName: selectedProduct.productName,
        quantity: returnQty
      }]);
    }
    
    setSelectedProduct(null);
    setReturnQty(0);
    setStep(2); // Go back to products list
  };

  const handleFinalReturn = () => setShowConfirmModal(true);
  const cancelReturn = () => setShowConfirmModal(false);
  const confirmReturn = () => { setShowConfirmModal(false); executeReturn(); };

  const executeReturn = async () => {
    if (manifest.length === 0) return;
    setIsProcessing(true);
    const batch = writeBatch(db);

    try {
      manifest.forEach(item => {
        // 1. DEDUCT from Zone Inventory
        const zoneInvRef = doc(db, 'substock_inventory', item.id);
        batch.update(zoneInvRef, {
          quantity: increment(-item.quantity),
          lastUpdated: new Date().toISOString()
        });

        // 2. CREATE Return Request
        const returnRef = doc(collection(db, 'warehouse_returns'));
        batch.set(returnRef, {
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity,
          fromManagerUid: user.uid,
          fromManagerEmail: user.email,
          status: 'pending',
          timestamp: new Date().toISOString()
        });

        // 3. LOG Audit
        const logRef = doc(collection(db, 'audit_logs'));
        batch.set(logRef, {
          action: 'ZONE_RETURN_INITIATED',
          details: `${user.email} initiated return of ${item.quantity} ${item.productName} to Warehouse.`,
          user: user.email,
          timestamp: new Date().toISOString()
        });
      });

      await batch.commit();

      setStatus({ type: 'success', msg: 'Return initiated! Pending Admin count.' });
      setManifest([]);
      setStep(1);
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', msg: 'Return failed. Try again.' });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setStatus({ type: '', msg: '' }), 3000);
    }
  };

  const handleReturnExecution = async () => {
    if (!selectedProduct || returnQty <= 0) return;
    
    setIsProcessing(true);
    const batch = writeBatch(db);

    try {
      // 1. DEDUCT from Zone Inventory immediately
      const zoneInvRef = doc(db, 'substock_inventory', selectedProduct.id);
      batch.update(zoneInvRef, {
        quantity: increment(-returnQty),
        lastUpdated: new Date().toISOString()
      });

      // 2. CREATE the Return Request (The "Limbo" Record)
      const returnRef = doc(collection(db, 'warehouse_returns'));
      batch.set(returnRef, {
        productId: selectedProduct.productId, // The original master ID
        productName: selectedProduct.productName,
        quantity: returnQty,
        fromManagerUid: user.uid,
        fromManagerEmail: user.email,
        status: 'pending', // Key for the Admin acceptance page
        timestamp: new Date().toISOString()
      });

      // 3. LOG for Audit
      const logRef = doc(collection(db, 'audit_logs'));
      batch.set(logRef, {
        action: 'ZONE_RETURN_INITIATED',
        details: `${user.email} initiated return of ${returnQty} ${selectedProduct.productName} to Warehouse.`,
        user: user.email,
        timestamp: new Date().toISOString()
      });

      await batch.commit();

      setStatus({ type: 'success', msg: 'Return initiated! Pending Admin count.' });
      setStep(1);
      setReturnQty(0);
      setSelectedProduct(null);
      setSelectedCategory(null);
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', msg: 'Return failed. Try again.' });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setStatus({ type: '', msg: '' }), 3000);
    }
  };

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-emerald-600" size={48} /></div>;

  return (
    <div className="max-w-xl mx-auto pb-20 px-4 relative">
      
      {/* Toast Notification */}
      {status.msg && (
        <div className="fixed top-10 left-0 right-0 z-[100] flex justify-center pointer-events-none animate-in slide-in-from-top-10">
          <div className="bg-emerald-600 text-white px-8 py-4 rounded-[2rem] shadow-2xl flex items-center gap-3 pointer-events-auto">
            <CheckCircle2 size={24} />
            <span className="font-black uppercase tracking-widest text-sm">{status.msg}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Return to Warehouse</h1>
          <p className="text-gray-500 font-bold">Send excess stock back to the main supply.</p>
        </div>
        {manifest.length > 0 && step !== 3 && (
          <div className="bg-gray-900 text-white px-4 py-2 rounded-2xl flex items-center gap-2 animate-in zoom-in shadow-lg">
            <ShoppingCart size={14} />
            <span className="font-black text-xs">{manifest.length} Items</span>
          </div>
        )}
      </div>

      {/* STEP 1: CATEGORY SELECTION */}
      {step === 1 && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="grid grid-cols-2 gap-4">
            {Array.from(new Set(catalog.map(c => c.Catégorie)))
              .filter(Boolean)
              .map(cat => {
                // Calculate available stock for this specific category
                const availableStock = myInventory.filter(item => {
                  const masterItem = masterStock.find(m => m.id === item.productId || m.name === item.productName) || {};
                  const itemCat = masterItem.category || catalog.find(c => c.Produit === item.productName)?.Catégorie || 'Uncategorized';
                  return itemCat === cat;
                }).reduce((sum, item) => sum + item.quantity, 0);

                return { cat, availableStock };
              })
              .sort((a, b) => {
                // Sort: Stock > 0 first, Empty categories at the bottom
                if (a.availableStock > 0 && b.availableStock === 0) return -1;
                if (a.availableStock === 0 && b.availableStock > 0) return 1;
                return a.cat.localeCompare(b.cat);
              })
              .map(({ cat, availableStock }) => {
                const isDisabled = availableStock === 0;

                return (
                  <button
                    key={cat}
                    disabled={isDisabled}
                    onClick={() => { setSelectedCategory(cat); setStep(2); }}
                    className={`p-6 sm:p-8 rounded-[2.5rem] text-left transition-all flex flex-col justify-between min-h-[140px] border-2 shadow-sm
                      ${isDisabled
                        ? 'bg-gray-50 border-gray-100 opacity-40 cursor-not-allowed grayscale'
                        : 'bg-white border-gray-100 hover:border-emerald-500 active:scale-95'}`}
                  >
                    <p className="font-black text-gray-900 text-lg uppercase leading-tight">{cat}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-2">
                      {isDisabled ? 'No Stock' : `${availableStock} Available`}
                    </p>
                  </button>
                );
              })}
          </div>

          {/* STICKY AUTHORIZE BUTTON (Now visible on Categories Step) */}
          <div className="sticky bottom-8 z-40 mt-10 flex justify-center pointer-events-none">
            <div className="w-full pointer-events-auto">
              <button
                onClick={handleFinalReturn}
                disabled={manifest.length === 0 || isProcessing}
                className="w-full py-6 bg-gray-900 text-white rounded-[2.5rem] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 shadow-2xl disabled:opacity-20 transition-all active:scale-95 border border-white/10"
              >
                {isProcessing ? <Loader2 className="animate-spin" /> : <><Send size={20} /> Authorize Return Manifest</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2: PRODUCT SELECTION */}
      {step === 2 && (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <button onClick={() => setStep(1)} className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-900">
            <ArrowLeft size={14} /> Back to Categories
          </button>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {myInventory
              .filter(item => {
                const masterItem = masterStock.find(m => m.id === item.productId || m.name === item.productName) || {};
                const itemCat = masterItem.category || catalog.find(c => c.Produit === item.productName)?.Catégorie || 'Uncategorized';
                return itemCat === selectedCategory;
              })
              .map(item => {
                const masterItem = masterStock.find(m => m.id === item.productId || m.name === item.productName) || {};
                // Math to show items already in cart
                const inManifest = manifest.filter(m => m.productId === item.productId).reduce((sum, curr) => sum + curr.quantity, 0);
                const remaining = item.quantity - inManifest;
                const isDisabled = remaining <= 0;

                return (
                  <div
                    key={item.id}
                    className={`relative p-6 sm:p-8 border rounded-[2.5rem] text-left transition-all flex flex-col justify-between min-h-[160px] shadow-sm
                      ${isDisabled ? 'bg-gray-50 border-gray-100' : inManifest > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100 hover:border-emerald-500'}`}
                  >
                    {/* Clickable Area to Add More */}
                    <div 
                      onClick={() => { if (!isDisabled) { setSelectedProduct(item); setStep(3); } }}
                      className={`flex-1 flex flex-col ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95 transition-transform'}`}
                    >
                      <div>
                        <p className="font-black text-gray-900 text-xs uppercase leading-tight mb-2 pr-4">{item.productName}</p>
                        <div className="flex flex-wrap items-center gap-2 mb-4">
                          {masterItem.dose && <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-1.5 py-0.5 rounded-md">{masterItem.dose} doses</span>}
                        </div>
                      </div>
                      <div className="mt-auto flex justify-between items-end">
                        <div>
                          <p className="text-4xl font-black text-gray-900 leading-none">{remaining}</p>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">Available to Return</p>
                        </div>
                        {inManifest === 0 && (
                          <Undo2 className="text-gray-200 mb-2" size={20} />
                        )}
                      </div>
                    </div>

                    {/* Cart Actions Overlay (Appears when item is in Manifest) */}
                    {inManifest > 0 && (
                      <div className="mt-4 pt-4 border-t border-emerald-200/50 flex items-center justify-between">
                        <div className="inline-block px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors bg-emerald-600 text-white shadow-md shadow-emerald-200">
                          {inManifest} Selected
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation(); // Prevents triggering the parent div
                            setManifest(manifest.filter(m => m.productId !== item.productId));
                          }}
                          className="px-3 py-2 bg-red-50 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-colors active:scale-95"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                );
            })}
          </div>

          <div className="sticky bottom-8 z-40 mt-10 flex justify-center pointer-events-none">
            <div className="w-full pointer-events-auto">
              <button
                onClick={handleFinalReturn}
                disabled={manifest.length === 0 || isProcessing}
                className="w-full py-6 bg-gray-900 text-white rounded-[2.5rem] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 shadow-2xl disabled:opacity-20 transition-all active:scale-95 border border-white/10"
              >
                {isProcessing ? <Loader2 className="animate-spin" /> : <><Send size={20} /> Authorize Return Manifest</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: SMART CALCULATOR */}
      {step === 3 && (() => {
        // Calculate max available locally
        const alreadyInCart = manifest.find(m => m.productId === selectedProduct?.productId)?.quantity || 0;
        const maxAvailable = (selectedProduct?.quantity || 0) - alreadyInCart;

        return (
          <div className="bg-white rounded-[3rem] p-8 sm:p-10 border border-gray-100 shadow-2xl animate-in zoom-in-95 flex flex-col min-h-[600px] relative">
            <div className="flex justify-between items-center mb-8 pb-6 border-b border-gray-50">
              <button onClick={() => { setStep(2); setReturnQty(0); }} className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                <ArrowLeft size={14} /> Back
              </button>
              <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-2xl">
                <Database size={14} className="text-emerald-600" />
                <p className="text-[10px] font-black text-emerald-900 uppercase tracking-widest">
                  Zone Hub: <span className="text-sm ml-1">{selectedProduct?.quantity}</span>
                </p>
              </div>
            </div>

            <div className="flex-1 flex flex-col items-center text-center">
              <span className="px-6 py-2 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-6">
                Returning: {selectedProduct?.productName}
              </span>

              <input
                type="number" inputMode="numeric"
                value={returnQty === 0 ? '' : returnQty}
                onChange={(e) => setReturnQty(Math.min(maxAvailable, parseInt(e.target.value) || 0))}
                onWheel={(e) => e.target.blur()}
                className="w-full text-8xl font-black text-center bg-transparent outline-none text-gray-900 tabular-nums placeholder:text-gray-100 py-4"
                placeholder="0"
                autoFocus={typeof window !== 'undefined' && window.innerWidth > 768}
              />

              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mt-4 mb-12">
                Units to Return <span className="text-emerald-600 ml-2">({maxAvailable - returnQty} left)</span>
              </p>

              <div className="grid grid-cols-4 gap-3 w-full max-w-md mb-8">
                {[1, 5, 10, 50, 100, 500, 1000, 2000].map(val => {
                  const isOver = (returnQty + val) > maxAvailable;
                  return (
                    <button
                      key={val}
                      disabled={isOver}
                      onClick={() => setReturnQty(prev => prev + val)}
                      className={`py-5 rounded-2xl font-black text-sm transition-all shadow-sm border
                        ${isOver ? 'bg-gray-50 text-gray-200 border-gray-50 opacity-50 cursor-not-allowed' : 'bg-white text-gray-900 border-gray-100 hover:bg-gray-900 hover:text-white active:scale-90'}`}
                    >
                      +{val}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-4 w-full max-w-md mb-8">
                <button 
                  onClick={() => setReturnQty(maxAvailable)} 
                  disabled={maxAvailable === 0}
                  className="py-5 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Full Return
                </button>
                <button 
                  onClick={() => setReturnQty(0)} 
                  className="py-5 bg-gray-50 text-gray-500 rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all border border-gray-100 hover:bg-gray-100"
                >
                  Clear & Discard
                </button>
              </div>

              <button
                onClick={addToManifest}
                disabled={returnQty <= 0}
                className="w-full max-w-md py-6 bg-emerald-600 text-white rounded-[2.5rem] font-black uppercase tracking-[0.3em] text-xs shadow-xl shadow-emerald-200 active:scale-95 transition-all flex justify-center items-center gap-3 disabled:opacity-20"
              >
                Add to Manifest <Plus size={18} />
              </button>
            </div>
          </div>
        );
      })()}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4 transition-all">
          <div className="bg-white w-full sm:w-[450px] rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-300">
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Confirm?</h3>
              <div className="bg-emerald-100 text-emerald-700 p-2 rounded-xl"><Send size={20} /></div>
            </div>
            <div className="mb-8">
              <p className="text-sm font-bold text-gray-500 mb-3 leading-relaxed">
                Sending Manifest to <span className="uppercase text-gray-900">Master Warehouse</span>:
              </p>
              
              <div className="bg-gray-50 rounded-2xl p-4 max-h-32 overflow-y-auto custom-scrollbar border border-gray-100 space-y-3">
                {manifest.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-gray-700">
                    <span className="truncate pr-4">{item.productName}</span>
                    <span className="tabular-nums text-emerald-600">
                      {item.quantity} Units
                    </span>
                  </div>
                ))}
              </div>

              <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex items-start gap-3 mt-4">
                 <AlertCircle className="text-amber-600 shrink-0" size={14} />
                 <p className="text-[9px] font-bold text-amber-800 leading-relaxed uppercase">
                   Units will leave your hub immediately but won't reach the warehouse until Admin confirms receipt.
                 </p>
              </div>
            </div>

            <div className="flex gap-3 w-full">
              <button onClick={cancelReturn} className="flex-1 py-5 bg-gray-100 text-gray-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all active:scale-95">
                Cancel
              </button>
              <button onClick={confirmReturn} disabled={isProcessing} className="flex-[2] py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-emerald-200 transition-all active:scale-95 flex items-center justify-center gap-2">
                {isProcessing ? <Loader2 className="animate-spin" size={16} /> : 'Ship Return'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}