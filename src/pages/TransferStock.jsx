import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, writeBatch, increment } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import {
  User, Package, Plus, Send, Loader2, CheckCircle2,
  ChevronRight, ArrowLeft, Trash2, ShoppingCart, XCircle,
  Database, Pause
} from 'lucide-react';

export default function TransferStock() {
  const { user } = useAuth();
  
  // --- WIZARD HISTORY LOGIC ---
  const [step, _setStep] = useState(1);
  
  useEffect(() => {
    const handlePopState = (e) => {
      if (e.state && e.state.step) {
        _setStep(e.state.step);
      } else {
        _setStep(1);
      }
    };
    
    // Initialize the base history state so the back button has a target
    window.history.replaceState({ step: 1 }, '');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const setStep = (newStep) => {
    if (newStep < step) {
      // Moving backward: Unwind history stack to prevent "back button trap"
      window.history.go(newStep - step);
      _setStep(newStep); // Update UI instantly
    } else if (newStep > step) {
      // Moving forward: Add to history stack so phone back button works
      window.history.pushState({ step: newStep }, '');
      _setStep(newStep);
    } else {
      _setStep(newStep);
    }
  };

  const [inventory, setInventory] = useState([]);
  const [substocks, setSubstocks] = useState([]);
  const [catalog, setCatalog] = useState([]); // NEW
  const [isLoading, setIsLoading] = useState(true);

  // Selection States
  const [selectedManager, setSelectedManager] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null); // NEW
  const [currentProduct, setCurrentProduct] = useState(null);
  const [tempQty, setTempQty] = useState(0);
  const [manifest, setManifest] = useState([]);

  // UI States
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [showConfirmModal, setShowConfirmModal] = useState(false); 

  useEffect(() => {
    const unsubInv = onSnapshot(collection(db, 'master_inventory'), (snap) => {
      setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      setSubstocks(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.role === 'substock'));
      setIsLoading(false);
    });
    // NEW: Fetch catalog
    const unsubCatalog = onSnapshot(collection(db, 'catalog'), (snap) => {
      setCatalog(snap.docs.map(d => d.data()));
    });
    
    return () => { unsubInv(); unsubUsers(); unsubCatalog(); };
  }, []);

  
  const handleAddQty = (value) => {
    // Check how many are already sitting in the cart
    const alreadyInCart = manifest.find(m => m.productId === currentProduct?.id)?.quantity || 0;
    const maxAvailable = (currentProduct?.quantity || 0) - alreadyInCart;
    
    const next = tempQty + value;
    if (next > maxAvailable) return;
    setTempQty(next);
  };

  const handleManualInput = (e) => {
    const val = parseInt(e.target.value) || 0;
    
    // Check how many are already sitting in the cart
    const alreadyInCart = manifest.find(m => m.productId === currentProduct?.id)?.quantity || 0;
    const maxAvailable = (currentProduct?.quantity || 0) - alreadyInCart;
    
    if (val > maxAvailable) {
      setTempQty(maxAvailable); // Auto-correct to the true max available
      return;
    }
    setTempQty(val);
  };

  const addToManifest = () => {
    if (!currentProduct || tempQty <= 0) return;
    
    // Check if the product is already in the manifest
    const existingIndex = manifest.findIndex(m => m.productId === currentProduct.id);
    
    if (existingIndex >= 0) {
      // If it exists, combine the quantities so we don't clobber the database
      const newManifest = [...manifest];
      newManifest[existingIndex].quantity += tempQty;
      setManifest(newManifest);
    } else {
      // If it's new, add it normally
      setManifest([...manifest, {
        productId: currentProduct.id,
        productName: currentProduct.name,
        quantity: tempQty
      }]);
    }
    
    setCurrentProduct(null);
    setTempQty(0);
    setStep(3);
  };

  // Trigger Modal
  const handleFinalDispatch = () => {
    if (manifest.length === 0) return;
    setShowConfirmModal(true);
  };

  // Cancel Button
  const cancelDispatch = () => {
    setShowConfirmModal(false);
  };

  // Confirm Button
  const confirmDispatch = () => {
    setShowConfirmModal(false);
    executeDispatch();
  };

  // The actual database execution (Renamed)
  const executeDispatch = async () => {
    setShowConfirmModal(false);
    if (manifest.length === 0) return;
    setIsProcessing(true);
    try {
      const batch = writeBatch(db);

      manifest.forEach(item => {
        // 1. DEDUCT FROM MASTER WAREHOUSE IMMEDIATELY
        const masterProd = inventory.find(p => p.id === item.productId);
        const masterRef = doc(db, 'master_inventory', item.productId);
        batch.update(masterRef, {
          quantity: masterProd.quantity - item.quantity,
          lastUpdated: new Date().toISOString()
        });

        // --- STEP 2 WAS REMOVED HERE ---
        // We NO LONGER update substock_inventory here! It stays in limbo.

        // 2. CREATE TRANSFER RECORD (The "Limbo" Ticket)
        const transferRef = doc(collection(db, 'transfers'));
        batch.set(transferRef, {
          ...item,
          price: masterProd.price || 0, 
          dose: masterProd.dose || 1,   
          category: masterProd.category || 'Uncategorized', // Passed along for the final injection
          fromAdmin: user.email,
          toSubstockId: selectedManager.id,
          toSubstockEmail: selectedManager.email,
          status: 'pending',
          timestamp: new Date().toISOString()
        });

        // 3. LOG FOR HUMAN EYES ONLY
        batch.set(doc(collection(db, 'audit_logs')), {
          action: 'BULK_DISPATCH_SENT',
          details: `Admin dispatched ${item.quantity} ${item.productName} to ${selectedManager.email}. Pending acceptance.`,
          user: user.email,
          timestamp: new Date().toISOString()
        });
      });

      await batch.commit();

      // Updated Success Message
      setStatus({ type: 'success', msg: 'Stock Dispatched! Pending Zone Acceptance.' });
      setManifest([]);
      setSelectedManager(null);
      setStep(1);
    } catch (e) {
      console.error(e);
      setStatus({ type: 'error', msg: 'Dispatch failed. Check console.' });
    } finally {
      setIsProcessing(false);
      setTimeout(() => setStatus({ type: '', msg: '' }), 3000);
    }
  };

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;

  // Ensure the UI accurately reflects what is left after accounting for the cart
  const alreadyInCart = currentProduct ? (manifest.find(m => m.productId === currentProduct.id)?.quantity || 0) : 0;
  const remainingInWarehouse = currentProduct ? currentProduct.quantity - alreadyInCart - tempQty : 0;

  return (
    <div className="max-w-xl mx-auto pb-40 px-4 relative">

      {/* Toast Notification (Top Center) */}
      {status.msg && (
        <div className="fixed top-10 left-0 right-0 z-[100] flex justify-center pointer-events-none animate-in slide-in-from-top-10 duration-500">
          <div className="bg-emerald-600 text-white px-8 py-4 rounded-[2rem] shadow-2xl flex items-center gap-3 border border-emerald-500/20 pointer-events-auto">
            <CheckCircle2 size={24} />
            <span className="font-black uppercase tracking-widest text-sm">{status.msg}</span>
          </div>
        </div>
      )}

      {/* Step 1: Recipient Selector */}
      {step === 1 && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="mb-8">
            <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">New Dispatch</h1>
            <p className="text-gray-500 font-bold">Select recipient to start manifest.</p>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {substocks.map(s => (
              <button
                key={s.id}
                onClick={() => { setSelectedManager(s); setStep(2); }}
                className="p-8 bg-white border-2 border-gray-100 rounded-[2.5rem] text-left hover:border-blue-600 transition-all flex justify-between items-center group shadow-sm active:scale-95"
              >
                <span className="font-black text-gray-900 uppercase text-lg">{s.email.split('@')[0]}</span>
                <ChevronRight className="text-gray-300 group-hover:text-blue-600" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Category Grid */}
      {step === 2 && (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <div className="flex justify-between items-start mb-6">
            <div>
              <button onClick={() => setStep(1)} className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 hover:text-gray-900 transition-colors">
                <ArrowLeft size={14} /> Change Recipient
              </button>
              <h1 className="text-4xl font-black text-gray-900 uppercase tracking-tighter">Category</h1>
              <p className="text-blue-600 font-bold text-sm">To: {selectedManager?.email.split('@')[0].toUpperCase()}</p>
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
              // 1. Map to an object first so we can calculate the stock for sorting
              .map(cat => {
                const availableStock = inventory
                  .filter(p => p.category === cat)
                  .reduce((acc, curr) => acc + curr.quantity, 0);
                return { cat, availableStock };
              })
              // 2. Sort: Categories with stock > 0 come first, empty ones go to the bottom
              .sort((a, b) => {
                if (a.availableStock > 0 && b.availableStock === 0) return -1;
                if (a.availableStock === 0 && b.availableStock > 0) return 1;
                return a.cat.localeCompare(b.cat); // Alphabetical fallback
              })
              // 3. Render the buttons
              .map(({ cat, availableStock }) => {
                const isDisabled = availableStock === 0;

                // Show how many items from this category are in the manifest
                const inManifest = manifest.filter(m => {
                  const prod = inventory.find(p => p.id === m.productId);
                  return prod?.category === cat;
                }).reduce((acc, curr) => acc + curr.quantity, 0);

                return (
                  <button
                    key={cat}
                    onClick={() => { if (!isDisabled) { setSelectedCategory(cat); setStep(3); } }}
                    disabled={isDisabled}
                    className={`p-6 sm:p-8 rounded-[2.5rem] text-left transition-all flex flex-col justify-between min-h-[140px] 
                      ${isDisabled 
                        ? 'bg-gray-50 border-2 border-gray-100 opacity-50 cursor-not-allowed grayscale' 
                        : inManifest > 0 
                          ? 'bg-blue-50 border-2 border-blue-200 active:scale-95' 
                          : 'bg-white border-2 border-gray-100 hover:border-blue-200 active:scale-95'
                      }`}
                  >
                    <div>
                      <p className="font-black text-gray-900 text-lg uppercase leading-tight">{cat}</p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">{availableStock} Available</p>
                    </div>
                    {inManifest > 0 && (
                      <div className="inline-block px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors bg-blue-600 text-white shadow-md shadow-blue-200 w-fit mt-4">
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
                onClick={handleFinalDispatch}
                disabled={manifest.length === 0 || isProcessing}
                className="w-full py-6 bg-gray-900 text-white rounded-[2.5rem] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 shadow-2xl disabled:opacity-20 transition-all active:scale-95 border border-white/10"
              >
                {isProcessing ? <Loader2 className="animate-spin" /> : <><Send size={20} /> Authorize Dispatch</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Product Grid */}
      {step === 3 && (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
          <div className="flex justify-between items-start mb-6">
            <div>
              <button onClick={() => setStep(2)} className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-2 hover:text-gray-900 transition-colors">
                <ArrowLeft size={14} /> Back to Categories
              </button>
              <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">{selectedCategory}</h1>
              <p className="text-blue-600 font-bold text-sm">Select Products</p>
            </div>
            {manifest.length > 0 && (
              <div className="bg-gray-900 text-white px-4 py-2 rounded-2xl flex items-center gap-2 animate-in zoom-in">
                <ShoppingCart size={14} />
                <span className="font-black text-xs">{manifest.length} Items</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {inventory.filter(p => p.category === selectedCategory).map(p => {
              const inManifest = manifest.filter(m => m.productId === p.id).reduce((acc, curr) => acc + curr.quantity, 0);
              return (
                <button
                  key={p.id}
                  onClick={() => { setCurrentProduct(p); setStep(4); }}
                  className={`relative p-6 sm:p-8 rounded-[2.5rem] text-left transition-all active:scale-95 flex flex-col justify-between ${inManifest > 0 ? 'bg-blue-50 border-2 border-blue-200' : 'bg-white border-2 border-gray-100 hover:border-blue-200'}`}
                >
                  <div>
                    <p className="font-black text-gray-900 text-xs uppercase leading-tight mb-3 pr-4">{p.name}</p>
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      {p.dose && <span className="text-[8px] font-bold text-gray-500 uppercase tracking-widest bg-gray-100 px-2 py-1 rounded-md">{p.dose} doses</span>}
                      {p.price && <span className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">MAD {p.price}</span>}
                    </div>

                    <p className="text-4xl font-black text-gray-900 leading-none">{p.quantity}</p>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2 mb-4">Warehouse</p>
                  </div>
                  
                  <div className={`inline-block px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors w-fit ${inManifest > 0 ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-gray-100 text-gray-400'}`}>
                    {inManifest} Selected
                  </div>
                </button>
              );
            })}
            
            {/* If no items in this category */}
            {inventory.filter(p => p.category === selectedCategory).length === 0 && (
              <div className="col-span-2 p-8 text-center bg-gray-50 rounded-[2.5rem] border-2 border-dashed border-gray-200">
                <p className="font-black text-gray-400 uppercase tracking-widest text-sm">No stock in this category</p>
              </div>
            )}
          </div>

          <div className="sticky bottom-8 z-40 mt-auto pt-10 flex justify-center pointer-events-none">
            <div className="w-full pointer-events-auto">
              <button
                onClick={handleFinalDispatch}
                disabled={manifest.length === 0 || isProcessing}
                className="w-full py-6 bg-gray-900 text-white rounded-[2.5rem] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-3 shadow-2xl disabled:opacity-20 transition-all active:scale-95 border border-white/10"
              >
                {isProcessing ? <Loader2 className="animate-spin" /> : <><Send size={20} /> Authorize Dispatch</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 4: Smart Calculator (Was Step 3) */}
      {step === 4 && (
        <div className="bg-white rounded-[3rem] shadow-2xl border border-gray-100 p-8 flex flex-col min-h-[600px] animate-in zoom-in-95 duration-300">
          <div className="flex justify-between items-center mb-8 pb-6 border-b border-gray-50">
            <button onClick={() => { setStep(3); setTempQty(0); }} className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
              <ArrowLeft size={14} /> Back
            </button>
            <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-2xl">
              <Database size={14} className="text-blue-600" />
              <p className="text-[10px] font-black text-blue-900 uppercase tracking-widest">
                Warehouse: <span className="text-sm ml-1">{currentProduct?.quantity.toLocaleString()}</span>
              </p>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-center items-center text-center">
            <span className="bg-gray-100 text-gray-500 text-[10px] font-black px-6 py-2 rounded-full uppercase tracking-[0.2em] mb-4">
              {currentProduct?.name}
            </span>

            <input
              type="number"
              inputMode="numeric"
              value={tempQty === 0 ? '' : tempQty}
              onChange={handleManualInput}
              placeholder="0"
              className="w-full text-8xl font-black tabular-nums tracking-tighter text-gray-900 text-center bg-transparent border-none outline-none focus:ring-0 placeholder:text-gray-100"
              autoFocus={typeof window !== 'undefined' && window.innerWidth > 768}
            />

            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-12">
              Units to Dispatch <span className="text-blue-600 ml-2">({remainingInWarehouse} left)</span>
            </p>

            <div className="grid grid-cols-4 gap-3 w-full mb-8">
              {[1, 5, 10, 50, 100, 500, 1000, 2000].map(val => {
                const isOverStock = val > remainingInWarehouse;
                return (
                  <button
                    key={val}
                    onClick={() => handleAddQty(val)}
                    disabled={isOverStock}
                    className={`py-5 rounded-2xl font-black text-sm transition-all active:scale-90 shadow-sm border
                      ${isOverStock
                        ? 'bg-gray-50 text-gray-200 border-gray-50 cursor-not-allowed opacity-50'
                        : 'bg-white text-gray-900 border-gray-100 hover:bg-blue-600 hover:text-white hover:border-blue-600'
                      }`}
                  >
                    +{val}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setTempQty(0)}
              className="w-full py-5 bg-red-50 text-red-600 rounded-2xl font-black uppercase tracking-[0.2em] text-[10px] flex items-center justify-center gap-2 hover:bg-red-100 transition-all border border-red-100 active:scale-95"
            >
              <XCircle size={16} /> Clear & Discard Total
            </button>
          </div>

          <button
            onClick={addToManifest}
            disabled={tempQty <= 0}
            className="mt-8 w-full py-6 bg-blue-600 text-white rounded-[2rem] font-black uppercase tracking-[0.3em] flex items-center justify-center gap-2 shadow-xl shadow-blue-100 transition-all active:scale-95 disabled:opacity-20"
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
              <div className="bg-blue-100 text-blue-700 p-2 rounded-xl"><Send size={20} /></div>
            </div>
            <div className="mb-8">
              <p className="text-sm font-bold text-gray-500 mb-3 leading-relaxed">
                Sending to <span className="uppercase text-gray-900">{selectedManager?.email.split('@')[0]}</span>:
              </p>
              
              {/* Exact Recap List */}
              <div className="bg-gray-50 rounded-2xl p-4 max-h-32 overflow-y-auto custom-scrollbar border border-gray-100 space-y-3">
                {manifest.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-gray-700">
                    <span className="truncate pr-4">{item.productName}</span>
                    <span className="tabular-nums text-blue-600">
                      {item.quantity} Units
                    </span>
                  </div>
                ))}
              </div>
            </div>


            <div className="flex gap-3 w-full">
              <button 
                onClick={cancelDispatch}
                className="flex-1 py-5 bg-gray-100 text-gray-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all active:scale-95"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDispatch}
                className="flex-[2] py-5 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-blue-200 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                Confirm Now <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}