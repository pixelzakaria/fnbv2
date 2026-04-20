import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, addDoc, onSnapshot, doc, updateDoc, deleteDoc, writeBatch, setDoc, increment } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { PackagePlus, PackageSearch, Loader2, Plus, Minus, Trash2, Save, Upload, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import * as XLSX from 'xlsx'; // IMPORTANT: Run `npm install xlsx` in your terminal
import Papa from 'papaparse'; // <--- ADD THIS


export default function ManageInventory() {
  const { user } = useAuth();
  const fileInputRef = useRef(null);

  // Database States
  const [inventory, setInventory] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [draftDoses, setDraftDoses] = useState({}); // NEW
  const [draftPrices, setDraftPrices] = useState({}); // NEW
  const [isLoading, setIsLoading] = useState(true);

  // Catalog & Form States
  const [catalog, setCatalog] = useState([]);
  const [catSearch, setCatSearch] = useState('');
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const [prodSearch, setProdSearch] = useState('');
  const [showProdDropdown, setShowProdDropdown] = useState(false);
  const [quantity, setQuantity] = useState('');
  const [dose, setDose] = useState(''); // NEW
  const [price, setPrice] = useState(''); // NEW

  // UI States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState({ type: '', msg: '' });
  const [isDragging, setIsDragging] = useState(false); // <--- ADDED THIS

  // --- DRAG AND DROP HANDLERS ---
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processExcelFile(file);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) processExcelFile(file);
  };


  // Fetch the dynamic catalog from Firebase instead of a static JSON file
  useEffect(() => {
    const unsubCatalog = onSnapshot(collection(db, 'catalog'), (snap) => {
      setCatalog(snap.docs.map(d => d.data()));
    });
    return () => unsubCatalog();
  }, []);

  useEffect(() => {
    const inventoryRef = collection(db, 'master_inventory');
    const unsubscribe = onSnapshot(inventoryRef, (snapshot) => {
      const items = [];
      snapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() });
      });
      items.sort((a, b) => a.name.localeCompare(b.name));
      setInventory(items);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- CATALOG FILTERS ---
  const uniqueCategories = Array.from(new Set(catalog.map(c => c.Catégorie))).filter(Boolean);
  const filteredCategories = uniqueCategories.filter(c => c.toLowerCase().includes(catSearch.toLowerCase()));

  // If a category is selected/typed, only show products for that category
  const availableProducts = catSearch
    ? catalog.filter(c => c.Catégorie.toLowerCase() === catSearch.toLowerCase()).map(c => c.Produit)
    : catalog.map(c => c.Produit);
  const uniqueProducts = Array.from(new Set(availableProducts)).filter(Boolean);
  const filteredProducts = uniqueProducts.filter(p => p.toLowerCase().includes(prodSearch.toLowerCase()));

  // --- LOGGING ---
  const logAction = async (actionType, details) => {
    try {
      await addDoc(collection(db, 'audit_logs'), {
        action: actionType,
        details: details,
        user: user.email,
        timestamp: new Date().toISOString()
      });
    } catch (error) { console.error("Log failed: ", error); }
  };

  // --- 1. SINGLE PRODUCT ADD (With Dynamic Catalog Update) ---
  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!prodSearch || !quantity) return;

    setIsSubmitting(true);
    const parsedQty = parseInt(quantity, 10);
    const parsedPrice = parseFloat(price) || 0; // NEW
    const trimmedDose = dose.trim(); // NEW
    const trimmedName = prodSearch.trim();
    const trimmedCat = catSearch.trim() || 'Uncategorized';

    try {
      // 1. Check if product already exists in master_inventory
      const existingProduct = inventory.find(
        item => item.name.toLowerCase() === trimmedName.toLowerCase()
      );

      if (existingProduct) {
        // Update existing record
        const itemRef = doc(db, 'master_inventory', existingProduct.id);
        await updateDoc(itemRef, {
          quantity: existingProduct.quantity + parsedQty,
          dose: trimmedDose || existingProduct.dose || '',
          price: parsedPrice || existingProduct.price || 0,
          lastUpdated: new Date().toISOString()
        });

        // Update initial_stock with full profile + increment
        await setDoc(doc(db, 'initial_stock', existingProduct.id), {
          category: trimmedCat,
          name: trimmedName,
          quantity: increment(parsedQty),
          dose: trimmedDose || existingProduct.dose || '',
          price: parsedPrice || existingProduct.price || 0,
          lastUpdated: new Date().toISOString()
        }, { merge: true });

        await logAction('ADDED_MASTER_STOCK', `Added ${parsedQty} to existing ${trimmedName} (Total: ${existingProduct.quantity + parsedQty})`);
      } else {
        // Create brand new record (Note: we save it to a variable to grab its generated ID)
        const newDocRef = await addDoc(collection(db, 'master_inventory'), {
          category: trimmedCat,
          name: trimmedName,
          quantity: parsedQty,
          dose: trimmedDose,
          price: parsedPrice,
          lastUpdated: new Date().toISOString()
        });

        // NEW: Also create the exact matching doc in initial_stock
        await setDoc(doc(db, 'initial_stock', newDocRef.id), {
          category: trimmedCat,
          name: trimmedName,
          quantity: parsedQty,
          dose: trimmedDose,
          price: parsedPrice,
          lastUpdated: new Date().toISOString()
        });

        await logAction('ADDED_MASTER_STOCK', `Created new product ${trimmedName} with ${parsedQty} units.`);
      }

      // Update Catalog (Same as before)
      if (!catalog.find(c => c.Produit.toLowerCase() === trimmedName.toLowerCase())) {
        await addDoc(collection(db, 'catalog'), { Catégorie: trimmedCat, Produit: trimmedName });
      }

      setProdSearch('');
      setCatSearch('');
      setQuantity('');
      setDose(''); // NEW
      setPrice(''); // NEW
      setStatus({ type: 'success', msg: `${trimmedName} updated successfully!` });
      setTimeout(() => setStatus({ type: '', msg: '' }), 3000);
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', msg: 'Failed to update inventory.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // --- 2. BULK UPLOAD (CSV & EXCEL) ---
  const processExcelFile = (file) => {
    setIsSubmitting(true);

    const processData = async (data) => {
      try {
        const batch = writeBatch(db);
        let count = 0;
        const newCatalogItems = [];

        for (const row of data) {
          const cat = row.Category || row.Catégorie || row.category || 'Uncategorized';
          const prod = row.Product || row.Produit || row.Name || row.name;
          const qty = parseInt(row.Quantity || row.Quantité || row.quantity || 0);
          const dose = row.Dose || row.dose || '';
          const price = parseFloat(row.Price || row.Prix || row.price || row.prix || 0);

          if (prod && qty > 0) {
            const existingInDb = inventory.find(item => item.name.toLowerCase() === prod.toLowerCase());

            if (existingInDb) {
              const itemRef = doc(db, 'master_inventory', existingInDb.id);
              batch.update(itemRef, {
                quantity: existingInDb.quantity + qty,
                dose: dose || existingInDb.dose || '',
                price: price || existingInDb.price || 0,
                lastUpdated: new Date().toISOString()
              });

              const initialRef = doc(db, 'initial_stock', existingInDb.id);
              batch.set(initialRef, {
                category: cat,
                name: prod,
                quantity: increment(qty),
                dose: dose || existingInDb.dose || '',
                price: price || existingInDb.price || 0,
                lastUpdated: new Date().toISOString()
              }, { merge: true });

            } else {
              const newRef = doc(collection(db, 'master_inventory'));
              batch.set(newRef, {
                category: cat,
                name: prod,
                quantity: qty,
                dose: dose,
                price: price,
                lastUpdated: new Date().toISOString()
              });

              const initialRef = doc(db, 'initial_stock', newRef.id);
              batch.set(initialRef, {
                category: cat,
                name: prod,
                quantity: qty,
                dose: dose,
                price: price,
                lastUpdated: new Date().toISOString()
              });
            }

            if (!catalog.find(c => c.Produit.toLowerCase() === prod.toLowerCase()) && !newCatalogItems.find(c => c.Produit === prod)) {
              newCatalogItems.push({ Catégorie: cat, Produit: prod });
              const catRef = doc(collection(db, 'catalog'));
              batch.set(catRef, { Catégorie: cat, Produit: prod });
            }

            const logRef = doc(collection(db, 'audit_logs'));
            batch.set(logRef, {
              action: 'BULK_UPLOAD_EXCEL',
              details: `Imported ${qty} ${prod} from file.`,
              user: user.email,
              timestamp: new Date().toISOString()
            });

            count++;
          }
        }

        await batch.commit();
        if (newCatalogItems.length > 0) setCatalog(prev => [...prev, ...newCatalogItems]);

        setStatus({ type: 'success', msg: `Imported ${count} items successfully!` });
        if (fileInputRef.current) fileInputRef.current.value = '';
      } catch (err) {
        console.error(err);
        setStatus({ type: 'error', msg: 'Failed to process data. Check console.' });
      } finally {
        setIsSubmitting(false);
        setTimeout(() => setStatus({ type: '', msg: '' }), 4000);
      }
    };

    // THE FIX: Route CSVs to PapaParse (Perfect UTF-8 Support)
    if (file.name.toLowerCase().endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => processData(results.data),
        error: () => { setStatus({ type: 'error', msg: 'CSV parsing failed.' }); setIsSubmitting(false); }
      });
    } else {
      // Route .xlsx to SheetJS
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const buffer = new Uint8Array(evt.target.result);
          const wb = XLSX.read(buffer, { type: 'array' });
          const wsname = wb.SheetNames[0];
          const data = XLSX.utils.sheet_to_json(wb.Sheets[wsname]);
          processData(data);
        } catch (e) {
          setStatus({ type: 'error', msg: 'Excel parsing failed.' });
          setIsSubmitting(false);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  };

  // --- EXCEL TEMPLATE DOWNLOAD ---
  const downloadTemplate = () => {
    // Generates a template with all unique categories and empty columns for data entry
    const ws = XLSX.utils.json_to_sheet(
      Array.from(new Set(catalog.map(c => c.Catégorie)))
        .filter(Boolean)
        .map(cat => ({
          Category: cat,
          Product: '',
          Quantity: '',
          Dose: '',
          Prix: ''
        }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory_Template");
    XLSX.writeFile(wb, "Inventory_Template.xlsx");
  };

  // --- 3. DRAFTING & DELETING ---
  const handleDraftChange = (id, currentDbQty, change) => {
    setDrafts(prev => {
      // Safety check in case the user cleared the input field before clicking +/-
      const currentVal = prev[id] !== undefined && prev[id] !== '' ? prev[id] : currentDbQty;
      const newVal = parseInt(currentVal) + change;
      if (newVal < 0 || isNaN(newVal)) return prev;
      return { ...prev, [id]: newVal };
    });
  };

  const handleDraftInput = (id, value) => {
    const val = value === '' ? '' : parseInt(value, 10);
    if (val < 0) return;
    setDrafts(prev => ({ ...prev, [id]: val }));
  };

  // NEW: Handlers for Dose and Price edits
  const handleDoseInput = (id, value) => {
    setDraftDoses(prev => ({ ...prev, [id]: value }));
  };

  const handlePriceInput = (id, value) => {
    setDraftPrices(prev => ({ ...prev, [id]: value }));
  };

  const saveDraft = async (id, name, originalQty, newQty, originalDose, newDose, originalPrice, newPrice) => {
    const finalQty = newQty === '' ? 0 : parseInt(newQty, 10);
    const finalDose = newDose !== undefined ? newDose : (originalDose || '');
    const finalPrice = newPrice !== undefined && newPrice !== '' ? parseFloat(newPrice) : (originalPrice || 0);

    try {
      await updateDoc(doc(db, 'master_inventory', id), {
        quantity: finalQty,
        dose: finalDose,
        price: finalPrice,
        lastUpdated: new Date().toISOString()
      });

      // Mirror full profile edit in initial_stock
      await setDoc(doc(db, 'initial_stock', id), {
        category: inventory.find(item => item.id === id)?.category || 'Uncategorized',
        name: name,
        quantity: finalQty,
        dose: finalDose,
        price: finalPrice,
        lastUpdated: new Date().toISOString()
      }, { merge: true });

      await logAction('ADJUSTED_MASTER_STOCK', `Changed ${name} - Qty: ${finalQty}, Dose: ${finalDose}, Price: ${finalPrice}`);

      // Clear all active drafts for this item
      setDrafts(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
      setDraftDoses(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
      setDraftPrices(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
    } catch (error) { console.error(error); }
  };

  const handleDelete = async (id, name, currentQty) => {
    if (window.confirm(`Are you sure you want to completely remove ${name}?`)) {
      try {
        await deleteDoc(doc(db, 'master_inventory', id));
        await deleteDoc(doc(db, 'initial_stock', id));

        await logAction('DELETED_MASTER_STOCK', `Removed ${name} from master inventory. (Lost ${currentQty} units)`);
        setDrafts(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
        setDraftDoses(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
        setDraftPrices(prev => { const copy = { ...prev }; delete copy[id]; return copy; });
      } catch (error) { console.error(error); }
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12 relative">

      {/* Toast Notification */}
      {status.msg && (
        <div className="fixed top-10 left-0 right-0 z-[100] flex justify-center pointer-events-none animate-in slide-in-from-top-10">
          <div className={`${status.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'} text-white px-8 py-4 rounded-[2rem] shadow-2xl flex items-center gap-3 pointer-events-auto`}>
            <CheckCircle2 size={24} />
            <span className="font-black uppercase tracking-widest text-sm">{status.msg}</span>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">Master Inventory</h1>
        <p className="mt-2 text-gray-500 font-bold">Add stock manually or batch upload via Excel.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* LEFT COLUMN: Add Forms */}
        <div className="lg:col-span-1 space-y-6 lg:sticky lg:top-8 lg:self-start">

          {/* MANUAL ENTRY FORM */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl"><PackagePlus size={20} /></div>
              <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">Receive Stock</h2>
            </div>

            <form onSubmit={handleAddProduct} className="space-y-4">

              {/* CATEGORY COMBOBOX */}
              <div className="relative">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Category</label>
                <input
                  type="text"
                  value={catSearch}
                  onChange={(e) => setCatSearch(e.target.value)}
                  onFocus={() => setShowCatDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCatDropdown(false), 200)}
                  placeholder="Select or type..."
                  className="w-full px-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 font-bold text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                />
                {showCatDropdown && (
                  <div className="absolute z-20 w-full mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar p-2">
                    {filteredCategories.map(c => (
                      <div key={c} onClick={() => { setCatSearch(c); setShowCatDropdown(false); }} className="px-4 py-3 hover:bg-blue-50 hover:text-blue-600 text-sm font-bold rounded-xl cursor-pointer transition-colors">
                        {c}
                      </div>
                    ))}
                    {catSearch && !filteredCategories.includes(catSearch) && (
                      <div onClick={() => { setShowCatDropdown(false); }} className="px-4 py-3 bg-gray-50 text-blue-600 text-sm font-black rounded-xl cursor-pointer mt-1 border border-dashed border-blue-200">
                        + Add "{catSearch}"
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* PRODUCT COMBOBOX */}
              <div className="relative">
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Product Name</label>
                <input
                  type="text"
                  value={prodSearch}
                  onChange={(e) => setProdSearch(e.target.value)}
                  onFocus={() => setShowProdDropdown(true)}
                  onBlur={() => setTimeout(() => setShowProdDropdown(false), 200)}
                  placeholder="Select or type..."
                  className="w-full px-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 font-bold text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                  required
                />
                {showProdDropdown && (
                  <div className="absolute z-10 w-full mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar p-2">
                    {filteredProducts.map(p => (
                      <div key={p} onClick={() => { setProdSearch(p); setShowProdDropdown(false); }} className="px-4 py-3 hover:bg-blue-50 hover:text-blue-600 text-sm font-bold rounded-xl cursor-pointer transition-colors">
                        {p}
                      </div>
                    ))}
                    {prodSearch && !filteredProducts.includes(prodSearch) && (
                      <div onClick={() => setShowProdDropdown(false)} className="px-4 py-3 bg-gray-50 text-blue-600 text-sm font-black rounded-xl cursor-pointer mt-1 border border-dashed border-blue-200">
                        + Add "{prodSearch}"
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Starting Quantity</label>
                <input
                  type="number" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 font-black text-xl focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                  required
                />
              </div>

              {/* NEW: Dose and Price Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Dose</label>
                  <input
                    type="text" value={dose} onChange={(e) => setDose(e.target.value)}
                    placeholder="e.g., 33cl, 1L"
                    className="w-full px-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 font-bold text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Price</label>
                  <input
                    type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-4 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 font-bold text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all"
                  />
                </div>
              </div>

              <button type="submit" disabled={isSubmitting} className="w-full py-5 mt-4 bg-blue-600 hover:bg-blue-700 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl shadow-xl shadow-blue-200 transition-all active:scale-95 flex justify-center items-center">
                {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : 'Add to Warehouse'}
              </button>
            </form>
          </div>

          {/* EXCEL UPLOAD WIDGET */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`p-8 rounded-[2.5rem] shadow-sm border transition-all duration-200 ${isDragging ? 'bg-emerald-50 border-emerald-400 scale-[1.02]' : 'bg-white border-gray-100'}`}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest">Bulk Import</h2>
              <FileSpreadsheet className={`${isDragging ? 'text-emerald-600' : 'text-emerald-500'}`} size={20} />
            </div>
            <p className="text-xs font-bold text-gray-400 mb-6">
              {isDragging ? 'Drop file to upload!' : 'Drag and drop an Excel file, or click below.'} <br /><span className="text-emerald-600">Category, Product, Quantity, Dose, Prix</span>
            </p>

            <input type="file" accept=".xlsx, .xls" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />

            <button
              onClick={() => fileInputRef.current.click()}
              disabled={isSubmitting}
              className={`w-full py-4 font-black uppercase tracking-widest text-xs rounded-2xl border transition-all flex items-center justify-center gap-2 active:scale-95 ${isDragging ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'}`}
            >
              {isSubmitting ? <Loader2 className="animate-spin" size={16} /> : <><Upload size={16} /> Select File</>}
            </button>

            {/* Download Template Button */}
            <button
              onClick={downloadTemplate}
              type="button"
              className="w-full py-3 mt-3 bg-white hover:bg-gray-50 text-gray-400 font-black uppercase tracking-widest text-[10px] rounded-2xl border border-gray-200 transition-all active:scale-95"
            >
              Download Template
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: Stock List */}
        <div className="lg:col-span-2">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-gray-100 min-h-[600px]">
            <div className="flex items-center gap-3 mb-8">
              <div className="p-3 bg-gray-50 text-gray-600 rounded-2xl"><PackageSearch size={20} /></div>
              <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">Active Warehouse Stock</h2>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400"><Loader2 className="animate-spin" size={32} /></div>
            ) : inventory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-gray-400 border-2 border-dashed border-gray-100 rounded-3xl font-bold uppercase tracking-widest text-sm">Warehouse is empty.</div>
            ) : (
              <div className="space-y-8">
                {(() => {
                  // Group master stock by category
                  const groupedStock = inventory.reduce((acc, item) => {
                    const cat = item.category || 'Uncategorized';
                    if (!acc[cat]) acc[cat] = [];
                    acc[cat].push(item);
                    return acc;
                  }, {});

                  return Object.entries(groupedStock)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([category, items]) => (
                      <div key={category} className="space-y-3">
                        {/* Category Header */}
                        <div className="pb-2 border-b border-gray-100">
                          <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] bg-gray-100 px-3 py-1 rounded-lg">
                            {category}
                          </span>
                        </div>

                        {/* Category Items */}
                        {items.sort((a, b) => a.name.localeCompare(b.name)).map((item) => {
                          const hasQtyDraft = drafts[item.id] !== undefined;
                          const hasDoseDraft = draftDoses[item.id] !== undefined;
                          const hasPriceDraft = draftPrices[item.id] !== undefined;

                          const displayQty = hasQtyDraft ? drafts[item.id] : item.quantity;
                          const displayDose = hasDoseDraft ? draftDoses[item.id] : (item.dose || '');
                          const displayPrice = hasPriceDraft ? draftPrices[item.id] : (item.price || '');

                          const isQtyChanged = hasQtyDraft && drafts[item.id] !== item.quantity;
                          const isDoseChanged = hasDoseDraft && draftDoses[item.id] !== (item.dose || '');
                          const isPriceChanged = hasPriceDraft && Number(draftPrices[item.id]) !== Number(item.price || 0);

                          const isChanged = isQtyChanged || isDoseChanged || isPriceChanged;

                          return (
                            <div key={item.id} className={`flex flex-col xl:flex-row xl:items-center justify-between p-5 border rounded-[1.5rem] transition-colors gap-4 ${isChanged ? 'border-yellow-400 bg-yellow-50/30 shadow-sm' : 'border-gray-100 bg-gray-50 hover:border-blue-200 hover:bg-white'}`}>

                              <div className="shrink-0">
                                {/* Removed the small category label here since we have headers now! */}
                                <h3 className="text-xs font-black text-gray-900 uppercase">{item.name}</h3>
                              </div>

                              {/* MOBILE OPTIMIZED GRID WRAPPER */}
                              <div className="grid grid-cols-2 sm:flex sm:flex-row items-center gap-2 sm:gap-3 w-full xl:w-auto xl:justify-end mt-3 xl:mt-0">
                                
                                {/* Dose Input */}
                                <div className={`flex items-center gap-2 bg-white border rounded-xl px-3 py-2 ${isDoseChanged ? 'border-yellow-400' : 'border-gray-200'}`}>
                                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest shrink-0">Dose:</span>
                                  <input 
                                    type="text" value={displayDose} onChange={(e) => handleDoseInput(item.id, e.target.value)} 
                                    placeholder="-" className={`w-full sm:w-12 text-sm font-bold bg-transparent outline-none transition-all focus:ring-2 focus:ring-yellow-400 rounded-md px-1 ${isDoseChanged ? 'text-yellow-600' : 'text-gray-900'}`} 
                                  />
                                </div>

                                {/* Price Input */}
                                <div className={`flex items-center gap-2 bg-white border rounded-xl px-3 py-2 ${isPriceChanged ? 'border-yellow-400' : 'border-gray-200'}`}>
                                  <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest shrink-0">Price:</span>
                                  <input 
                                    type="number" step="0.01" value={displayPrice} onChange={(e) => handlePriceInput(item.id, e.target.value)} 
                                    placeholder="0.00" className={`w-full sm:w-24 text-sm font-bold bg-transparent outline-none transition-all focus:ring-2 focus:ring-yellow-400 rounded-md px-1 ${isPriceChanged ? 'text-yellow-600' : 'text-gray-900'}`} 
                                  />
                                </div>

                                {/* Quantity & Actions Row (Spans both columns on mobile) */}
                                <div className="col-span-2 flex items-stretch justify-between sm:justify-start gap-2 mt-1 sm:mt-0">
                                  
                                  {/* Quantity Input */}
                                  <div className={`flex items-center justify-between flex-1 sm:flex-none gap-1 bg-white border rounded-xl p-1 ${isQtyChanged ? 'border-yellow-400' : 'border-gray-200'}`}>
                                    <button onClick={() => handleDraftChange(item.id, item.quantity, -1)} className="p-2 sm:p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-900 rounded-lg transition-colors"><Minus size={16} /></button>
                                    <input 
                                      type="number" min="0" value={displayQty} onChange={(e) => handleDraftInput(item.id, e.target.value)}
                                      className={`w-full sm:w-24 text-center font-black text-base bg-transparent outline-none rounded-md transition-all focus:ring-2 focus:ring-yellow-400 ${isQtyChanged ? 'text-yellow-600' : 'text-gray-900'}`}
                                    />
                                    <button onClick={() => handleDraftChange(item.id, item.quantity, 1)} className="p-2 sm:p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-900 rounded-lg transition-colors"><Plus size={16} /></button>
                                  </div>

                                  {/* Actions */}
                                  <div className="flex items-center shrink-0">
                                    {isChanged ? (
                                      <button onClick={() => saveDraft(item.id, item.name, item.quantity, displayQty, item.dose, displayDose, item.price, displayPrice)} className="flex items-center justify-center gap-2 bg-gray-900 hover:bg-black text-white px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all shadow-lg active:scale-95 h-full">
                                        <Save size={14} /> Save
                                      </button>
                                    ) : (
                                      <button onClick={() => handleDelete(item.id, item.name, item.quantity)} className="px-4 py-2 text-gray-300 hover:bg-red-50 hover:text-red-500 rounded-xl transition-colors h-full flex items-center justify-center border border-transparent hover:border-red-100">
                                        <Trash2 size={18} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ));
                })()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}