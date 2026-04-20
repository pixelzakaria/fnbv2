import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, where, doc, writeBatch, addDoc, increment } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import {
    LayoutDashboard, PackageCheck, ArrowLeftRight, Loader2,
    CheckCircle2, ChevronRight, ArrowLeft, Database, Store,
    Plus, Minus, XCircle
} from 'lucide-react';

export default function BarDashboard() {
    const { user } = useAuth();

    // --- TAB & WIZARD HISTORY LOGIC ---
    const [activeTab, _setActiveTab] = useState('stock');
    const [returnStep, _setReturnStep] = useState(1);

    useEffect(() => {
        const handlePopState = (e) => {
            if (e.state) {
                if (e.state.activeTab) _setActiveTab(e.state.activeTab);
                if (e.state.returnStep) _setReturnStep(e.state.returnStep);
            } else {
                _setActiveTab('stock');
                _setReturnStep(1);
            }
        };
        
        window.history.replaceState({ activeTab: 'stock', returnStep: 1 }, '');
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    const setActiveTab = (newTab) => {
        if (newTab !== activeTab) {
            // Push new tab to history and reset wizard
            window.history.pushState({ activeTab: newTab, returnStep: 1 }, '');
            _setActiveTab(newTab);
            _setReturnStep(1);
        } else if (newTab === 'return' && returnStep > 1) {
            // If they click the 'return' tab while already deep in the wizard, cleanly rewind
            window.history.go(1 - returnStep);
            _setReturnStep(1);
        }
    };

    const setReturnStep = (newStep) => {
        if (newStep < returnStep) {
            // Moving backward: Unwind history stack to prevent back button trap
            window.history.go(newStep - returnStep);
            _setReturnStep(newStep);
        } else if (newStep > returnStep) {
            // Moving forward: Push to history stack
            window.history.pushState({ activeTab, returnStep: newStep }, '');
            _setReturnStep(newStep);
        } else {
            _setReturnStep(newStep);
        }
    };

    // UI States
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [status, setStatus] = useState({ type: '', msg: '' });
    const [showConfirmModal, setShowConfirmModal] = useState(false);

    // Data States
    const [barData, setBarData] = useState(null);
    const [barName, setBarName] = useState('');
    const [myStock, setMyStock] = useState({});
    const [pendingTransfers, setPendingTransfers] = useState([]);
    const [catalog, setCatalog] = useState([]);
    const [rawInventory, setRawInventory] = useState([]);
    const [masterStock, setMasterStock] = useState([]);

    // Return Stepper States
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);
    const [returnQty, setReturnQty] = useState(0);

    useEffect(() => {
        if (!user?.uid) return;

        // NEW: Listen to Global Catalog
        const unsubCatalog = onSnapshot(collection(db, 'catalog'), (snap) => {
            setCatalog(snap.docs.map(d => d.data()));
        });

        // NEW: Listen to Master Stock for Prices & Doses
        const unsubMaster = onSnapshot(collection(db, 'master_inventory'), (snap) => {
            setMasterStock(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        // 1. Listen to Bar Profile
        const unsubBar = onSnapshot(doc(db, 'users', user.uid), (userDoc) => {
            const data = userDoc.data();
            setBarData(data);

            if (data?.barId) {
                // NEW: Fetch the actual beautifully formatted name from bar_locations
                const unsubLocation = onSnapshot(doc(db, 'bar_locations', data.barId), (locDoc) => {
                    if (locDoc.exists()) setBarName(locDoc.data().name);
                });

                // 2. Listen to Pending Deliveries (From Zone to this specific Bar)
                const q = query(
                    collection(db, 'transfers'),
                    where('toBarId', '==', data.barId),
                    where('status', '==', 'pending')
                );
                const unsubTransfers = onSnapshot(q, (snap) => {
                    setPendingTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                });

                // 3. NEW: Listen to STATIC inventory (No more audit log parsing!)
                const qInventory = query(collection(db, 'bar_inventory'), where('barId', '==', data.barId));
                const unsubInventory = onSnapshot(qInventory, (snap) => {
                    const stockObj = {};
                    const rawDocs = []; // NEW: Array to hold full documents

                    snap.forEach(document => {
                        const item = document.data();
                        stockObj[item.productName] = item.quantity;
                        rawDocs.push(item); // NEW: Save the whole item
                    });

                    setMyStock(stockObj);
                    setRawInventory(rawDocs); // NEW: Store in state
                    setIsLoading(false);
                });

                return () => {
                    unsubLocation(); // <--- ADD THIS
                    unsubTransfers();
                    unsubInventory();
                    unsubCatalog();
                    unsubMaster(); // <--- ADDED THIS
                };
            }
        });

        return () => unsubBar();
    }, [user]);


    // --- HANDLERS ---

    const handleAcceptDelivery = async (transfer) => {
        setIsProcessing(true);
        try {
            const batch = writeBatch(db);

            // 1. Mark transfer as completed
            batch.update(doc(db, 'transfers', transfer.id), {
                status: 'completed',
                acceptedAt: new Date().toISOString()
            });

            // 2. UPDATE STATIC BALANCE
            const barInvId = `${barData.barId}_${transfer.productId}`;
            const barRef = doc(db, 'bar_inventory', barInvId);

            batch.set(barRef, {
                barId: barData.barId,
                // FIXED: Uses the true name or the email prefix
                barName: barName || (user?.email ? user.email.split('@')[0] : 'Unknown Bar'),
                productId: transfer.productId,
                productName: transfer.productName,
                quantity: increment(transfer.quantity),
                lastUpdated: new Date().toISOString()
            }, { merge: true });

            // 3. Simple Audit Log for history
            const logDetails = `${user.email} confirmed receipt of ${transfer.quantity} ${transfer.productName}.`;
            batch.set(doc(collection(db, 'audit_logs')), {
                action: 'BAR_RECEIPT_CONFIRMED',
                details: logDetails,
                user: user.email,
                timestamp: new Date().toISOString(),
                productName: transfer.productName,
                quantity: transfer.quantity,
                barEmail: user.email,
                transferId: transfer.id
            });

            await batch.commit();
            setStatus({ type: 'success', msg: 'Stock Received!' });
        } catch (e) {
            console.error("Acceptance Error:", e);
            setStatus({ type: 'error', msg: 'Acceptance failed.' });
        } finally {
            setIsProcessing(false);
            setTimeout(() => setStatus({ type: '', msg: '' }), 3000);
        }
    };

    // Trigger Modal
    const handleProcessReturn = () => {
        if (returnQty <= 0 || !selectedItem) return;
        setShowConfirmModal(true);
    };

    // Cancel Button
    const cancelReturn = () => {
        setShowConfirmModal(false);
    };

    // Confirm Button
    const confirmReturn = () => {
        setShowConfirmModal(false);
        executeReturn();
    };

    // The actual database execution (Renamed)
    const executeReturn = async () => {
        setShowConfirmModal(false);
        if (returnQty <= 0 || !selectedItem) return;
        setIsProcessing(true);

        // Ensure we use the correct product name
        const productName = typeof selectedItem === 'object' ? selectedItem.name : selectedItem;

        // FIXED: Uses the true name or the email prefix
        const fromName = barName || (user?.email ? user.email.split('@')[0] : 'Unknown Bar');

        try {
            const batch = writeBatch(db);
            const targetZoneId = barData?.assignedZoneUid || 'Main Warehouse';

            // 1. DEDUCT FROM STATIC BALANCE IMMEDIATELY
            // Find the exact item from the inventory we loaded, which guarantees we have the real Firebase ID
            const inventoryItem = rawInventory.find(item => item.productName === productName);
            const productId = inventoryItem?.productId;

            if (!productId) {
                setStatus({ type: 'error', msg: 'System Error: Could not locate Product ID.' });
                setIsProcessing(false);
                return;
            }

            const barInvId = `${barData.barId}_${productId}`;
            const barRef = doc(db, 'bar_inventory', barInvId);

            batch.update(barRef, {
                quantity: increment(-returnQty),
                lastUpdated: new Date().toISOString()
            });

            // 2. CREATE BAR RETURN REQUEST (The "Limbo" Record)
            const barReturnRef = doc(collection(db, 'bar_returns'));
            batch.set(barReturnRef, {
                productId: productId,
                productName: productName,
                quantity: returnQty,
                fromBarId: barData?.barId || '',
                fromBarName: fromName,
                toSubstockId: targetZoneId,
                status: 'pending', // This keeps it in limbo
                timestamp: new Date().toISOString()
            });

            // 3. LOG THE INITIATION
            batch.set(doc(collection(db, 'audit_logs')), {
                action: 'BAR_RETURN_INITIATED',
                details: `${returnQty} ${productName} sent from ${fromName} to Zone Manager. Pending confirmation.`,
                user: user.email,
                timestamp: new Date().toISOString(),
                productName: productName,
                quantity: returnQty,
                fromBarId: barData?.barId || '',
                toSubstockId: targetZoneId
            });

            await batch.commit();

            setStatus({ type: 'success', msg: 'Return logged successfully!' });
            setReturnStep(1);
            setReturnQty(0);
            setSelectedItem(null);
            setSelectedCategory(null); // <--- Added this to reset the category
        } catch (e) {
            console.error("Return Error:", e);
            setStatus({ type: 'error', msg: 'Return process failed.' });
        } finally {
            setIsProcessing(false);
            setTimeout(() => setStatus({ type: '', msg: '' }), 3000);
        }
    };

    if (isLoading) return (
        <div className="flex flex-col h-screen items-center justify-center bg-gray-50">
            <Loader2 className="animate-spin text-blue-600 mb-4" size={48} />
            <p className="font-black uppercase tracking-widest text-xs text-gray-400">Syncing Station...</p>
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-32 pt-4 px-4">

            {/* Toast Notification */}
            {status.msg && (
                <div className="fixed top-10 left-0 right-0 z-[100] flex justify-center pointer-events-none animate-in slide-in-from-top-10">
                    <div className={`${status.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'} text-white px-8 py-4 rounded-[2rem] shadow-2xl flex items-center gap-3 pointer-events-auto border border-white/10`}>
                        <CheckCircle2 size={24} />
                        <span className="font-black uppercase tracking-widest text-sm">{status.msg}</span>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-4xl font-black text-gray-900 tracking-tighter uppercase">{barName || 'Station'}</h1>
                    <div className="mt-1 text-gray-400 font-bold uppercase text-[10px] tracking-[0.3em] flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Live Station Status
                    </div>
                </div>
                <div className="p-4 bg-white rounded-3xl shadow-sm border border-gray-100 text-blue-600">
                    <Store size={24} />
                </div>
            </div>

            {/* Tabs */}
            <div className="flex p-2 bg-white rounded-[2.5rem] shadow-sm border border-gray-100 gap-2 sticky top-4 z-40">
                {[
                    { id: 'stock', label: 'Inventory', icon: LayoutDashboard },
                    { id: 'accept', label: 'Deliveries', icon: PackageCheck, count: pendingTransfers.length },
                    { id: 'return', label: 'Returns', icon: ArrowLeftRight }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 flex items-center justify-center gap-3 py-5 rounded-[2rem] text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-gray-900 text-white shadow-xl' : 'text-gray-400 hover:bg-gray-50'}`}
                    >
                        <tab.icon size={18} />
                        <span className="hidden sm:inline">{tab.label}</span>
                        {tab.count > 0 && (
                            <span className="bg-blue-600 text-white w-5 h-5 rounded-full flex items-center justify-center text-[10px] animate-bounce">
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* --- VIEW: STOCK --- */}
            {activeTab === 'stock' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-6">
                    {Object.entries(myStock).length === 0 ? (
                        <div className="col-span-full py-24 text-center bg-white rounded-[3rem] border-4 border-dashed border-gray-50 text-gray-300 font-black uppercase tracking-widest text-sm">
                            Station is currently empty
                        </div>
                    ) : (
                        Object.entries(myStock).map(([name, qty]) => {
                            const masterItem = masterStock.find(m => m.name === name) || {};
                            return (
                            <div key={name} className="p-10 bg-white border border-gray-100 rounded-[3rem] shadow-sm group hover:border-blue-500 transition-all flex flex-col justify-between">
                                <div>
                                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.2em] mb-4">Stock</p>
                                    <h3 className="text-lg font-black text-gray-900 uppercase leading-tight">{name}</h3>
                                    <div className="flex items-center gap-2 mt-3">
                                        {masterItem.dose && <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-2 py-0.5 rounded-md">{masterItem.dose} doses</span>}
                                        {masterItem.price && <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">MAD {masterItem.price} / dose</span>}
                                    </div>
                                </div>
                                <div className="mt-8 flex items-baseline gap-3">
                                    <span className={`text-6xl font-black tabular-nums ${qty < 10 ? 'text-red-500' : 'text-gray-900'}`}>{qty}</span>
                                    <span className="text-gray-400 font-black text-xs uppercase tracking-widest">Units</span>
                                </div>
                            </div>
                        )})
                    )}
                </div>
            )}

            {/* --- VIEW: ACCEPT --- */}
            {activeTab === 'accept' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-6">
                    {pendingTransfers.length === 0 ? (
                        <div className="py-24 text-center bg-white rounded-[3rem] text-gray-400 font-black uppercase tracking-widest text-xs">
                            No pending deliveries for this station
                        </div>
                    ) : (
                        pendingTransfers.map(t => {
                            const masterItem = masterStock.find(m => m.id === t.productId || m.name === t.productName) || {};
                            
                            return (
                            <div key={t.id} className="bg-white border-2 border-blue-50 rounded-[3.5rem] p-10 flex flex-col sm:flex-row items-center justify-between gap-10 shadow-sm">
                                <div className="text-center sm:text-left">
                                    <span className="px-4 py-1 bg-blue-100 text-blue-700 rounded-full text-[10px] font-black uppercase tracking-widest">Incoming Stock</span>
                                    <h3 className="text-4xl font-black text-gray-900 uppercase tracking-tighter mt-4 leading-none">{t.productName}</h3>
                                    
                                    <div className="flex items-center justify-center sm:justify-start gap-2 mt-4">
                                        {masterItem.dose && <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest bg-gray-100 px-2 py-1 rounded-md">{masterItem.dose} doses</span>}
                                        {masterItem.price && <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">MAD {masterItem.price} / dose</span>}
                                    </div>

                                    <p className="text-gray-400 font-bold text-sm mt-4">Authorized by Distribution Center</p>
                                </div>
                                <div className="flex flex-col items-center sm:items-end">
                                    <span className="text-7xl font-black text-gray-900 tabular-nums leading-none mb-8">{t.quantity}</span>
                                    <button
                                        onClick={() => handleAcceptDelivery(t)}
                                        disabled={isProcessing}
                                        className="w-full sm:w-auto px-12 py-6 bg-blue-600 text-white rounded-[2rem] font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-all active:scale-95 shadow-2xl shadow-blue-200"
                                    >
                                        {isProcessing ? <Loader2 className="animate-spin" /> : 'Confirm Delivery'}
                                    </button>
                                </div>
                            </div>
                            );
                        })
                    )}
                </div>
            )}

            {/* VIEW: RETURNS (3-STEP SYSTEM) */}
            {activeTab === 'return' && (
                <div className="animate-in fade-in slide-in-from-bottom-6">

                    {/* STEP 1: CATEGORY SELECTION */}
                    {returnStep === 1 && (
                        <div className="grid grid-cols-2 gap-4">
                            {Array.from(new Set(catalog.map(c => c.Catégorie))).filter(Boolean).map(cat => {
                                const categoryProducts = catalog.filter(c => c.Catégorie === cat).map(c => c.Produit);
                                const hasStockInCategory = Object.entries(myStock).some(([name, qty]) =>
                                    categoryProducts.includes(name) && qty > 0
                                );

                                return (
                                    <button
                                        key={cat}
                                        disabled={!hasStockInCategory}
                                        onClick={() => { setSelectedCategory(cat); setReturnStep(2); }}
                                        className={`p-8 rounded-[2.5rem] text-left transition-all flex flex-col justify-between min-h-[140px] border-2 shadow-sm
                      ${hasStockInCategory
                                                ? 'bg-white border-gray-100 hover:border-blue-500 active:scale-95'
                                                : 'bg-gray-50 border-transparent opacity-40 cursor-not-allowed'}`}
                                    >
                                        <p className="font-black text-gray-900 text-lg uppercase leading-tight">{cat}</p>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                            {hasStockInCategory ? 'Items Available' : 'No Stock'}
                                        </p>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* STEP 2: PRODUCT SELECTION */}
                    {returnStep === 2 && (
                        <div className="space-y-6">
                            <button onClick={() => setReturnStep(1)} className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-900">
                                <ArrowLeft size={14} /> Back to Categories
                            </button>
                            <div className="grid grid-cols-2 gap-4">
                                {catalog
                                    .filter(c => c.Catégorie === selectedCategory)
                                    .filter(c => (myStock[c.Produit] || 0) > 0)
                                    .map(p => (
                                        <button
                                            key={p.Produit}
                                            onClick={() => { setSelectedItem(p.Produit); setReturnStep(3); }}
                                            className="p-8 bg-white border border-gray-100 rounded-[2.5rem] text-left hover:border-blue-500 transition-all flex flex-col justify-between min-h-[160px] shadow-sm active:scale-95"
                                        >
                                            <p className="font-black text-gray-900 text-xs uppercase leading-tight mb-2">{p.Produit}</p>
                                            <div className="mt-auto">
                                                <p className="text-3xl font-black text-gray-900">{myStock[p.Produit]}</p>
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Available</p>
                                            </div>
                                        </button>
                                    ))}
                            </div>
                        </div>
                    )}

                    {/* STEP 3: CALCULATOR */}
                    {returnStep === 3 && (
                        <div className="bg-white rounded-[3rem] p-10 border border-gray-100 shadow-sm animate-in zoom-in-95 flex flex-col min-h-[600px]">
                            <div className="flex justify-between items-center mb-12 pb-6 border-b border-gray-50">
                                <button onClick={() => { setReturnStep(2); setReturnQty(0); }} className="flex items-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    <ArrowLeft size={14} /> Back
                                </button>
                                <div className="flex items-center gap-2 bg-blue-50 px-4 py-2 rounded-2xl">
                                    <Database size={14} className="text-blue-600" />
                                    <p className="text-[10px] font-black text-blue-900 uppercase tracking-widest">
                                        Possession: <span className="text-sm ml-1">{myStock[selectedItem]}</span>
                                    </p>
                                </div>
                            </div>

                            <div className="flex-1 flex flex-col items-center text-center">
                                <span className="px-6 py-2 bg-gray-100 text-gray-500 rounded-full text-[10px] font-black uppercase tracking-widest mb-6">
                                    {selectedItem}
                                </span>

                                <input
                                    type="number" inputMode="numeric"
                                    value={returnQty === 0 ? '' : returnQty}
                                    onChange={(e) => setReturnQty(Math.min(myStock[selectedItem], parseInt(e.target.value) || 0))}
                                    onWheel={(e) => e.target.blur()}
                                    className="w-full text-8xl font-black text-center bg-transparent outline-none text-gray-900 tabular-nums placeholder:text-gray-100 py-4"
                                    placeholder="0"
                                    autoFocus={typeof window !== 'undefined' && window.innerWidth > 768}
                                />

                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mt-4 mb-12">
                                    Units to Return <span className="text-blue-600 ml-2">({myStock[selectedItem] - returnQty} left)</span>
                                </p>

                                {/* CLICKABLE NUMBERS */}
                                <div className="grid grid-cols-4 gap-3 w-full max-w-md mb-8">
                                    {[1, 5, 10, 50, 100, 500, 1000, 2000].map(val => {
                                        const isOver = (returnQty + val) > (myStock[selectedItem] || 0);
                                        return (
                                            <button
                                                key={val}
                                                disabled={isOver}
                                                onClick={() => setReturnQty(prev => prev + val)}
                                                className={`py-5 rounded-2xl font-black text-sm transition-all shadow-sm border
                          ${isOver ? 'bg-gray-50 text-gray-200 border-gray-50 opacity-50' : 'bg-white text-gray-900 border-gray-100 hover:bg-gray-900 hover:text-white active:scale-90'}`}
                                            >
                                                +{val}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="grid grid-cols-2 gap-4 w-full max-w-md mb-8">
                                    <button onClick={() => setReturnQty(myStock[selectedItem])} className="py-5 bg-gray-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all">Full Return</button>
                                    <button onClick={() => setReturnQty(0)} className="py-5 bg-red-50 text-red-500 rounded-2xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all">Reset</button>
                                </div>

                                {/* NEW: Limbo Warning Disclaimer */}
                                <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex items-start gap-3 mb-6 w-full max-w-md">
                                    <div className="p-1.5 bg-amber-500 text-white rounded-lg">
                                        <ArrowLeftRight size={14} />
                                    </div>
                                    <p className="text-[10px] font-bold text-amber-800 leading-relaxed uppercase text-left">
                                        Note: These units are removed from your station immediately. They will remain "in-transit" until your Zone Manager confirms the physical count.
                                    </p>
                                </div>

                                <button
                                    onClick={handleProcessReturn}
                                    disabled={returnQty <= 0 || isProcessing}
                                    className="w-full py-6 bg-blue-600 text-white rounded-[2rem] font-black uppercase tracking-[0.3em] text-xs shadow-xl shadow-blue-100 active:scale-95 transition-all flex justify-center items-center gap-3 disabled:opacity-20"
                                >
                                    {isProcessing ? <Loader2 className="animate-spin" /> : <>Authorize Return <ArrowLeftRight size={20} /></>}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Glovo-Style Confirmation Modal (Red Theme for Returns) */}
            {showConfirmModal && (
                <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4 transition-all">
                    <div className="bg-white w-full sm:w-[450px] rounded-t-[2.5rem] sm:rounded-[2.5rem] p-8 shadow-2xl animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-300">
                        <div className="flex justify-between items-start mb-2">
                            <h3 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">Confirm?</h3>
                            <div className="bg-red-600 text-white p-2 rounded-xl"><ArrowLeftRight size={20} /></div>
                        </div>

                        <div className="mb-8">
                            <p className="text-sm font-bold text-gray-500 mb-3 leading-relaxed">
                                Sending Return to <span className="uppercase text-emerald-600">Zone Hub</span>:
                            </p>

                            {/* Exact Recap Box (Only 1 item at a time for Bars) */}
                            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-gray-700">
                                    <span className="truncate pr-4">{typeof selectedItem === 'object' ? selectedItem.name : selectedItem}</span>
                                    <span className="tabular-nums text-red-600">
                                        {returnQty} Units
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 w-full">
                            <button
                                onClick={cancelReturn}
                                className="flex-1 py-5 bg-gray-100 text-gray-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-200 transition-all active:scale-95"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmReturn}
                                className="flex-[2] py-5 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-red-200 transition-all active:scale-95 flex items-center justify-center gap-2"
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