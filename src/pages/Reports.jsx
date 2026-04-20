import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, getDoc, query, where, doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext'; // <--- ADDED THIS
import { 
  FileDown, Loader2, Calculator, Info, DollarSign, 
  UploadCloud, AlertTriangle, CheckCircle2, TrendingDown, Store,
  MapPin, Download, Database, MousePointerSquareDashed, ChevronDown
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export default function Reports() {
  const { user } = useAuth(); // <--- ADDED THIS
  const [userRole, setUserRole] = useState(null); // <--- ADDED THIS
  // --- TAB HISTORY LOGIC ---
  const [activeTab, _setActiveTab] = useState('zones');

  useEffect(() => {
    const handlePopState = (e) => {
      if (e.state && e.state.activeTab) {
        _setActiveTab(e.state.activeTab);
      } else {
        _setActiveTab('zones');
      }
    };
    
    // Initialize the base history state so the back button has a target
    window.history.replaceState({ activeTab: 'zones' }, '');
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const setActiveTab = (newTab) => {
    if (newTab !== activeTab) {
      window.history.pushState({ activeTab: newTab }, '');
      _setActiveTab(newTab);
    }
  };

  // --- FETCH USER ROLE ---
  useEffect(() => {
    if (!user?.uid) return;
    const fetchRole = async () => {
      const docSnap = await getDoc(doc(db, 'users', user.uid));
      if (docSnap.exists()) setUserRole(docSnap.data().role);
    };
    fetchRole();
  }, [user]);
  
  // --- GLOBAL REPORT STATES ---
  const [groupedData, setGroupedData] = useState({});
  const [totals, setTotals] = useState({ salesQty: 0, revenue: 0 });
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(true);

  // --- ZONES & BARS STATES ---
  const [zoneData, setZoneData] = useState({});
  const [isLoadingZones, setIsLoadingZones] = useState(true);
  const [manualSales, setManualSales] = useState({}); // Stores the real sales entered manually
  const [expandedBars, setExpandedBars] = useState({}); // Tracks which accordions are open

  const toggleBarAccordion = (barId) => {
    setExpandedBars(prev => ({ ...prev, [barId]: !prev[barId] }));
  };

  // --- RECONCILIATION STATES ---
  const [isParsing, setIsParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false); // <--- ADDED THIS
  const [reconciliationData, setReconciliationData] = useState([]);
  const [reconciliationTotals, setReconciliationTotals] = useState({ totalLoss: 0, totalMissingUnits: 0 });
  const [isFileUploaded, setIsFileUploaded] = useState(false);
  const [isGapEngineVisible, setIsGapEngineVisible] = useState(true); // <--- ADDED THIS (Defaults to true)

  useEffect(() => {
    generateTheoreticalReport();
    generateZoneReport();
    checkGapEngineVisibility(); // <--- ADDED THIS
  }, []);

  // --- CHECK FEATURE FLAG ---
  const checkGapEngineVisibility = async () => {
    try {
      const factRef = doc(db, 'facts', 'gap_engine'); 
      const factSnap = await getDoc(factRef);
      
      // If the doc exists and the boolean is defined, set the state directly to that boolean.
      // If it doesn't exist, it safely ignores this and keeps the default (true).
      if (factSnap.exists() && typeof factSnap.data().visible === 'boolean') {
        setIsGapEngineVisible(factSnap.data().visible); 
      }
    } catch (error) {
      console.error("Error checking gap engine visibility:", error);
    }
  };

  // =========================================================================
  // 1. GLOBAL THEORETICAL LOGIC 
  // =========================================================================
  const generateTheoreticalReport = async () => {
    setIsLoadingGlobal(true);
    try {
      const [initialSnap, masterSnap] = await Promise.all([
        getDocs(collection(db, 'initial_stock')),
        getDocs(collection(db, 'master_inventory'))
      ]);

      const masterItems = masterSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const categories = {};
      let globalSalesQty = 0;
      let globalRevenue = 0;

      initialSnap.forEach(doc => {
        const initItem = { id: doc.id, ...doc.data() };
        if (initItem.quantity > 0) {
          const masterItem = masterItems.find(m => m.id === initItem.id) || {};
          const initialStock = initItem.quantity;
          const finalStock = masterItem.quantity || 0; 
          let theoreticalSalesQty = initialStock - finalStock;
          if (theoreticalSalesQty < 0) theoreticalSalesQty = 0;

          const price = parseFloat(initItem.price || masterItem.price || 0);
          const doseMultiplier = parseFloat(initItem.dose || masterItem.dose) || 1; 
          const revenue = theoreticalSalesQty * doseMultiplier * price;

          globalSalesQty += theoreticalSalesQty;
          globalRevenue += revenue;

          const cat = initItem.category || 'Uncategorized';
          if (!categories[cat]) categories[cat] = [];

          categories[cat].push({
            id: initItem.id,
            name: initItem.name,
            dose: initItem.dose || masterItem.dose || '',
            price: price,
            initialStock,
            finalStock,
            theoreticalSalesQty,
            revenue
          });
        }
      });

      Object.keys(categories).forEach(cat => {
        categories[cat].sort((a, b) => a.name.localeCompare(b.name));
      });

      setGroupedData(categories);
      setTotals({ salesQty: globalSalesQty, revenue: globalRevenue });
    } catch (error) {
      console.error("Global Report Error:", error);
    } finally {
      setIsLoadingGlobal(false);
    }
  };

  // Saves real sales inputs directly to Firebase instantly
  const handleManualSaleChange = async (barId, prodName, value) => {
    const qty = value === '' ? '' : parseInt(value);
    const docId = `${barId}_${prodName.replace(/[^a-zA-Z0-9]/g, '_')}`;
    
    setManualSales(prev => ({ ...prev, [docId]: qty }));
    
    if (value !== '') {
      try {
        await setDoc(doc(db, 'manual_sales', docId), {
          barId,
          productName: prodName,
          qty: qty,
          lastUpdated: new Date().toISOString()
        }, { merge: true });
      } catch (error) {
        console.error("Error saving manual sale:", error);
      }
    }
  };

  // =========================================================================
  // 2. ZONES & BARS REPORT (Maintained for tracking what's physically out)
  // =========================================================================
  const generateZoneReport = async () => {
    setIsLoadingZones(true);
    try {
      const [transfersSnap, returnsSnap, barsSnap, usersSnap, masterSnap, manualSalesSnap] = await Promise.all([
        getDocs(query(collection(db, 'transfers'), where('status', '==', 'completed'))),
        getDocs(query(collection(db, 'bar_returns'), where('status', '==', 'completed'))),
        getDocs(collection(db, 'bar_locations')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'master_inventory')),
        getDocs(collection(db, 'manual_sales')) // Grab saved manual entries
      ]);

      const savedManualSales = {};
      manualSalesSnap.forEach(d => {
        savedManualSales[d.id] = d.data().qty;
      });
      setManualSales(savedManualSales);

      const masterData = masterSnap.docs.map(d => d.data());
      const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const barLocations = barsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const zoneMap = {}; 

      barLocations.forEach(bar => {
        const zoneId = bar.assignedZoneUid;
        if (!zoneId) return;
        if (!zoneMap[zoneId]) {
          const zoneUser = users.find(u => u.id === zoneId);
          zoneMap[zoneId] = { email: zoneUser?.email || 'Unknown Zone', bars: {} };
        }
        if (!zoneMap[zoneId].bars[bar.id]) {
          zoneMap[zoneId].bars[bar.id] = { name: bar.name, products: {} };
        }
      });

      const initProduct = (zoneId, barId, prodName) => {
        if (!zoneMap[zoneId] || !zoneMap[zoneId].bars[barId]) return null;
        if (!zoneMap[zoneId].bars[barId].products[prodName]) {
          const masterItem = masterData.find(c => c.name === prodName) || {};
          zoneMap[zoneId].bars[barId].products[prodName] = {
            received: 0,
            returned: 0,
            dose: parseFloat(masterItem.dose) || 1,
            price: parseFloat(masterItem.price) || 0
          };
        }
        return zoneMap[zoneId].bars[barId].products[prodName];
      };

      transfersSnap.forEach(d => {
        const t = d.data();
        if (t.type !== 'ZONE_TO_BAR') return;
        const p = initProduct(t.fromSubstockId, t.toBarId, t.productName);
        if (p) p.received += t.quantity;
      });

      returnsSnap.forEach(d => {
        const r = d.data();
        const p = initProduct(r.toSubstockId, r.fromBarId, r.productName);
        if (p) p.returned += r.quantity;
      });

      setZoneData(zoneMap);
    } catch (error) {
      console.error("Zone Report Error:", error);
    } finally {
      setIsLoadingZones(false);
    }
  };

  // =========================================================================
  // 3. GLOBAL CASHLESS RECONCILIATION ENGINE (L'ÉCART) - REWRITTEN TO YOUR LOGIC
  // =========================================================================
  // --- DRAG AND DROP HANDLERS ---
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileProcess(file);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) handleFileProcess(file);
  };

  const handleFileProcess = (file) => {
    setIsParsing(true);
    try {
      if (file.name.endsWith('.csv')) {
        Papa.parse(file, { header: true, skipEmptyLines: true, complete: (results) => processReconciliation(results.data) });
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const excelData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
          processReconciliation(excelData);
        };
        reader.readAsArrayBuffer(file);
      }
    } catch (error) {
      console.error(error); alert("Error parsing file."); setIsParsing(false);
    }
  };

  const processReconciliation = async (cashlessRows) => {
    try {
      const normalizeName = (name) => String(name || '').toUpperCase().trim();

      // 1. Aggregate Actual Sales Grouped by Bar Name
      const actualSales = {}; 
      cashlessRows.forEach(row => {
        const status = String(row['Statut'] || row['Status'] || '').toLowerCase().trim();
        if (status !== 'completed') return; 

        const barName = normalizeName(row['Nom du point de vente'] || row['Point of Sale']);
        const productName = normalizeName(row['Nom du produit'] || row['Product']);
        const qty = parseFloat(row['Qty'] || row['Quantity']) || 1;

        if (!productName || !barName) return;

        if (!actualSales[barName]) actualSales[barName] = {};
        actualSales[barName][productName] = (actualSales[barName][productName] || 0) + qty;
      });

      // 2. Fetch Firebase Data for Theoretical Math & Zone Mapping
      const [transfersSnap, returnsSnap, masterSnap, barsSnap, usersSnap] = await Promise.all([
        getDocs(query(collection(db, 'transfers'), where('status', '==', 'completed'))),
        getDocs(query(collection(db, 'bar_returns'), where('status', '==', 'completed'))),
        getDocs(collection(db, 'master_inventory')),
        getDocs(collection(db, 'bar_locations')),
        getDocs(collection(db, 'users'))
      ]);

      const masterData = masterSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const barsData = barsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const usersData = usersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const theoreticalMap = {}; 

      const getBarInfo = (barId, fallbackName) => {
        const bar = barsData.find(b => b.id === barId || normalizeName(b.name) === normalizeName(fallbackName));
        if (bar) {
           const zoneUser = usersData.find(u => u.uid === bar.assignedZoneUid || u.id === bar.assignedZoneUid);
           return { name: normalizeName(bar.name), zone: zoneUser ? zoneUser.email.split('@')[0] : 'Unassigned Zone' };
        }
        return { name: normalizeName(fallbackName), zone: 'Unknown Zone' };
      };

      const initMap = (barInfo, prod) => {
        if (!theoreticalMap[barInfo.name]) theoreticalMap[barInfo.name] = { zone: barInfo.zone, products: {} };
        if (!theoreticalMap[barInfo.name].products[prod]) {
          const masterItem = masterData.find(m => normalizeName(m.name) === prod || m.id === prod) || {};
          theoreticalMap[barInfo.name].products[prod] = { sent: 0, returned: 0, price: parseFloat(masterItem.price || 0), dose: parseFloat(masterItem.dose || 1) };
        }
      };

      transfersSnap.forEach(d => {
        const t = d.data();
        if (t.type !== 'ZONE_TO_BAR') return;
        const barInfo = getBarInfo(t.toBarId, t.toBarName);
        const prodName = normalizeName(t.productName);
        if (barInfo.name && prodName) {
          initMap(barInfo, prodName);
          theoreticalMap[barInfo.name].products[prodName].sent += t.quantity;
        }
      });

      returnsSnap.forEach(d => {
        const r = d.data();
        const barInfo = getBarInfo(r.fromBarId, r.fromBarName);
        const prodName = normalizeName(r.productName);
        if (barInfo.name && prodName) {
          initMap(barInfo, prodName);
          theoreticalMap[barInfo.name].products[prodName].returned += r.quantity;
        }
      });

      // Catch bars in Cashless that had no explicit transfers
      Object.keys(actualSales).forEach(barName => {
         if (!theoreticalMap[barName]) theoreticalMap[barName] = { zone: 'Unknown (Cashless Only)', products: {} };
         Object.keys(actualSales[barName]).forEach(prodName => {
             if (!theoreticalMap[barName].products[prodName]) {
                 const masterItem = masterData.find(m => normalizeName(m.name) === prodName || m.id === prodName) || {};
                 theoreticalMap[barName].products[prodName] = { sent: 0, returned: 0, price: parseFloat(masterItem.price || 0), dose: parseFloat(masterItem.dose || 1) };
             }
         });
      });

      // 3. Calculate Final Gaps per Bar
      const finalRecon = [];
      let totalLossMAD = 0;
      let totalMissing = 0;

      // SECURITY KILL SWITCH: Only process bars that currently exist in your database or in the file
      const validBars = new Set([
        ...barsData.map(b => normalizeName(b.name)),
        ...Object.keys(actualSales)
      ]);

      Object.keys(theoreticalMap).forEach(barName => {
        if (!validBars.has(barName)) return; // Ignores deleted ghost bars from old tests
        const barData = theoreticalMap[barName];
        const productList = [];
        let barTotalLoss = 0;
        
        Object.keys(barData.products).forEach(prod => {
          const data = barData.products[prod];
          const theoreticalDoses = Math.max(0, (data.sent - data.returned) * data.dose);
          const actualDoses = actualSales[barName]?.[prod] || 0;
          
          const gap = theoreticalDoses - actualDoses;
          const financialLoss = gap > 0 ? gap * data.price : 0;

          if (gap > 0) {
            totalLossMAD += financialLoss;
            totalMissing += gap;
            barTotalLoss += financialLoss;
          }

          productList.push({ product: prod, theoretical: theoreticalDoses, actual: actualDoses, gap: gap, loss: financialLoss, price: data.price });
        });

        if (productList.length > 0) {
          productList.sort((a, b) => b.loss - a.loss);
          finalRecon.push({ barName: barName, zoneName: barData.zone, products: productList, barLoss: barTotalLoss });
        }
      });

      finalRecon.sort((a, b) => b.barLoss - a.barLoss);
      setReconciliationData(finalRecon);
      setReconciliationTotals({ totalLoss: totalLossMAD, totalMissingUnits: totalMissing });
      setIsFileUploaded(true);

    } catch (error) {
      console.error(error); alert("Error processing data."); setIsParsing(false);
    }
  };

  // --- XLSX GENERATOR FOR TESTING ---
  const generateTestXLSX = () => {
    const testData = [
      { "Date (jour)": "5/18/2026", "Date (heure)": "20:00:00", "Statut": "completed", "Nom du point de vente": "All Bars", "Nom du produit": "CORONA 33 CL", "Qty": 330 },
      { "Date (jour)": "5/18/2026", "Date (heure)": "21:30:00", "Statut": "completed", "Nom du point de vente": "All Bars", "Nom du produit": "ABSOLUT 70 CL", "Qty": 126 },
      { "Date (jour)": "5/18/2026", "Date (heure)": "23:00:00", "Statut": "refunded", "Nom du point de vente": "All Bars", "Nom du produit": "RED BULL 25 CL", "Qty": 10 } 
    ];

    const worksheet = XLSX.utils.json_to_sheet(testData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
    XLSX.writeFile(workbook, "Cashless_Test_File.xlsx");
  };

  // =========================================================================
  // 4. EXPORT TO EXCEL LOGIC (WHAT YOU SEE IS WHAT YOU GET)
  // =========================================================================
  const handleDownloadReport = () => {
    if (activeTab === 'global') {
      const exportData = [];
      
      // Loop through categories and items exactly as they appear on screen
      Object.entries(groupedData).sort(([a], [b]) => a.localeCompare(b)).forEach(([category, items]) => {
        items.forEach(item => {
          exportData.push({
            'Category': category,
            'Product': item.name,
            'Doses': item.dose ? `${item.dose}` : '-',
            'Price (MAD)': item.price,
            'Initial Stock': item.initialStock,
            'Final Stock': item.finalStock,
            'Theoretical Sold': item.theoreticalSalesQty,
            'Projected Revenue (MAD)': item.revenue
          });
        });
      });

      // Add a blank row and then the Totals row at the bottom
      exportData.push({});
      exportData.push({
        'Category': 'TOTALS',
        'Theoretical Sold': totals.salesQty,
        'Projected Revenue (MAD)': totals.revenue
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Global Report");
      XLSX.writeFile(workbook, `Global_Report_${new Date().toISOString().split('T')[0]}.xlsx`);

    } else if (activeTab === 'zones') {
      const exportData = [];
      
      // Loop through Zones, Bars, and Products exactly as they map on screen
      Object.entries(zoneData).sort(([, a], [, b]) => a.email.localeCompare(b.email)).forEach(([zoneId, zone]) => {
        Object.entries(zone.bars).sort(([, a], [, b]) => a.name.localeCompare(b.name)).forEach(([barId, bar]) => {
          Object.entries(bar.products).forEach(([prodName, data]) => {
            
            const theoreticalSold = data.received - data.returned;
            const manualDocId = `${barId}_${prodName.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const realSold = manualSales[manualDocId] !== undefined && manualSales[manualDocId] !== '' 
                             ? manualSales[manualDocId] 
                             : theoreticalSold; 
            
            const gap = theoreticalSold - realSold;
            const financialLoss = gap > 0 ? gap * data.price * data.dose : 0;

            exportData.push({
              'Zone Manager': zone.email,
              'Bar Name': bar.name,
              'Product': prodName,
              'Doses': data.dose ? `${data.dose}` : '-',
              'Price (MAD)': data.price,
              'Transferred In (↓)': data.received,
              'Returned (↑)': data.returned,
              'Theoretical Sold': theoreticalSold,
              'Real Sold (Manual)': realSold,
              'Gap': gap > 0 ? `-${gap}` : gap < 0 ? `+${Math.abs(gap)}` : '0',
              'Loss (MAD)': financialLoss
            });
          });
        });
      });

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Zones and Bars Report");
      XLSX.writeFile(workbook, `Zones_Bars_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    }
  };


  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12 px-4">
      
      {/* HEADER & TABS */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">Intelligence</h1>
          <p className="text-gray-500 font-medium mt-1">Analytics, Zone Tracking, and Reconciliation.</p>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="flex flex-wrap bg-gray-100 p-2 rounded-[2rem] gap-2">
            <button 
              onClick={() => setActiveTab('zones')}
              className={`px-6 py-3 rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] transition-all ${activeTab === 'zones' ? 'bg-white text-gray-900 shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Zones & Bars
            </button>
            <button 
              onClick={() => setActiveTab('global')}
              className={`px-6 py-3 rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] transition-all ${activeTab === 'global' ? 'bg-white text-gray-900 shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Global
            </button>
            {isGapEngineVisible && (
              <button 
                onClick={() => setActiveTab('reconciliation')}
                className={`px-6 py-3 rounded-[1.5rem] font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2 ${activeTab === 'reconciliation' ? 'bg-red-600 text-white shadow-md shadow-red-200' : 'text-gray-400 hover:text-red-500'}`}
              >
                Gap Engine
              </button>
            )}
          </div>

          {/* EXPORT BUTTON */}
          {(activeTab === 'global' || activeTab === 'zones') && (
            <button 
              onClick={handleDownloadReport}
              className="px-5 py-3 rounded-[1.5rem] bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2 shadow-sm border border-emerald-200"
            >
              <FileDown size={16} /> Export View
            </button>
          )}
        </div>
      </div>

      {/* ========================================= */}
      {/* TAB 1: GLOBAL THEORETICAL                 */}
      {/* ========================================= */}
      {activeTab === 'global' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {!isLoadingGlobal && Object.keys(groupedData).length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Items Left Warehouse</p>
                  <p className="text-3xl font-black text-gray-900">{totals.salesQty.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-gray-50 text-gray-400 rounded-2xl"><Calculator size={24}/></div>
              </div>
              <div className="bg-emerald-600 p-6 rounded-[2rem] shadow-xl shadow-emerald-900/10 flex items-center justify-between text-white">
                <div>
                  <p className="text-[10px] font-black text-emerald-200 uppercase tracking-widest mb-1">Projected Total Revenue</p>
                  <p className="text-3xl font-black">MAD {totals.revenue.toLocaleString()}</p>
                </div>
                <div className="p-4 bg-emerald-500 rounded-2xl"><DollarSign size={24}/></div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden min-h-[400px]">
          <div className="flex flex-col w-full">
              {isLoadingGlobal ? (
                <div className="p-20 text-center">
                  <Loader2 className="animate-spin mx-auto text-blue-600 mb-4" size={40} />
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Crunching Numbers...</p>
                </div>
              ) : Object.keys(groupedData).length === 0 ? (
                <div className="p-20 text-center text-gray-400 font-black uppercase tracking-widest text-sm">
                  No stock data found.
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {Object.entries(groupedData).sort(([a], [b]) => a.localeCompare(b)).map(([category, items]) => (
                    <React.Fragment key={category}>
                      <div className="bg-gray-50/80 px-4 sm:px-6 py-3 border-y border-gray-100">
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">{category}</span>
                      </div>
                      {items.map((item) => (
                        <div key={item.id} className="p-4 sm:p-6 hover:bg-blue-50/10 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex-1">
                            <p className="font-black text-gray-900 uppercase text-sm">{item.name}</p>
                            <div className="flex items-center gap-2 mt-2">
                              {item.dose && <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-2 py-0.5 rounded-md">{item.dose} doses</span>}
                              <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">MAD {item.price}</span>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-2 sm:gap-6 w-full sm:w-auto">
                            <div className="bg-gray-50 p-3 rounded-xl text-center sm:text-right flex flex-col justify-center">
                              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Initial</p>
                              <p className="font-black text-gray-900 tabular-nums text-lg">{item.initialStock.toLocaleString()}</p>
                            </div>
                            <div className="bg-gray-50 p-3 rounded-xl text-center sm:text-right flex flex-col justify-center">
                              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Final</p>
                              <p className="font-black text-blue-600 tabular-nums text-lg">{item.finalStock.toLocaleString()}</p>
                            </div>
                            <div className="bg-blue-50/40 p-3 rounded-xl text-center sm:text-right border border-blue-100/50 flex flex-col justify-center">
                              <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest mb-1">Sold</p>
                              <p className="font-black text-gray-900 text-lg tabular-nums leading-none mb-1">{item.theoreticalSalesQty.toLocaleString()}</p>
                              <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">MAD {item.revenue.toLocaleString()}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================= */}
      {/* TAB 2: ZONES & BARS                         */}
      {/* ========================================= */}
      {activeTab === 'zones' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {isLoadingZones ? (
             <div className="p-20 text-center bg-white rounded-[3rem] border border-gray-100 shadow-sm">
               <Loader2 className="animate-spin mx-auto text-blue-600 mb-4" size={40} />
               <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Loading Zone Data...</p>
             </div>
          ) : Object.keys(zoneData).length === 0 ? (
             <div className="p-20 text-center bg-white rounded-[3rem] border border-gray-100 shadow-sm">
               <p className="text-xs font-black text-gray-400 uppercase tracking-widest">No active zones or bars found.</p>
             </div>
          ) : (
            Object.entries(zoneData)
              .sort(([, a], [, b]) => a.email.localeCompare(b.email))
              .map(([zoneId, zone]) => (
              <div key={zoneId} className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden mb-8">
                {/* Zone Header with Auto-Calculated Totals */}
                {(() => {
                  let zoneTotalGap = 0;
                  let zoneTotalLoss = 0;
                  Object.entries(zone.bars).forEach(([bId, b]) => {
                    Object.entries(b.products).forEach(([pName, pData]) => {
                      const theoSold = pData.received - pData.returned;
                      const manId = `${bId}_${pName.replace(/[^a-zA-Z0-9]/g, '_')}`;
                      const realSold = manualSales[manId] !== undefined && manualSales[manId] !== '' ? manualSales[manId] : theoSold;
                      const gap = theoSold - realSold;
                      if (gap > 0) {
                        zoneTotalGap += gap;
                        zoneTotalLoss += gap * pData.price * pData.dose;
                      }
                    });
                  });

                  return (
                    <div className="bg-blue-900 text-white p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-800 rounded-xl"><MapPin size={24} /></div>
                        <div>
                          <h2 className="text-2xl font-black uppercase tracking-tighter">Zone Manager</h2>
                          <p className="text-blue-300 font-bold text-sm">{zone.email}</p>
                        </div>
                      </div>
                      
                      {zoneTotalGap > 0 && (
                        <div className="bg-red-500/20 border border-red-500/30 px-5 py-3 rounded-2xl flex items-center gap-3">
                          <AlertTriangle size={20} className="text-red-300" />
                          <div className="text-right">
                            <p className="text-[10px] font-black text-red-200 uppercase tracking-widest leading-none mb-1">Zone Gap</p>
                            <p className="font-black tabular-nums text-white text-sm sm:text-base leading-none">-{zoneTotalGap} Units <span className="text-red-400 font-black mx-2">|</span> MAD {zoneTotalLoss.toLocaleString()}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Bars inside the Zone */}
                {Object.entries(zone.bars)
                  .sort(([, a], [, b]) => a.name.localeCompare(b.name))
                  .map(([barId, bar], idx) => (
                  <div key={idx} className="border-t border-gray-100 first:border-t-0">
                    {/* Bar Header with Auto-Calculated Totals */}
                    {(() => {
                      let barTotalGap = 0;
                      let barTotalLoss = 0;
                      Object.entries(bar.products).forEach(([pName, pData]) => {
                        const theoSold = pData.received - pData.returned;
                        const manId = `${barId}_${pName.replace(/[^a-zA-Z0-9]/g, '_')}`;
                        const realSold = manualSales[manId] !== undefined && manualSales[manId] !== '' ? manualSales[manId] : theoSold;
                        const gap = theoSold - realSold;
                        if (gap > 0) {
                          barTotalGap += gap;
                          barTotalLoss += gap * pData.price * pData.dose;
                        }
                      });

                      return (
                        <div 
                          onClick={() => toggleBarAccordion(barId)}
                          className="bg-amber-50 px-4 sm:px-8 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-amber-100 cursor-pointer hover:bg-amber-100/60 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-2 bg-amber-100 text-amber-600 rounded-xl shadow-sm">
                              <Store size={22} />
                            </div>
                            <h3 className="font-black text-amber-900 uppercase tracking-widest text-xl sm:text-2xl flex items-center gap-3">
                              {bar.name}
                              <ChevronDown size={20} className={`text-amber-400 transition-transform duration-200 ${expandedBars[barId] ? 'rotate-180' : ''}`} />
                            </h3>
                          </div>
                          
                          {barTotalGap > 0 && (
                            <div className="bg-red-50 border border-red-100 px-4 py-2.5 rounded-xl flex items-center gap-3 shadow-sm">
                              <AlertTriangle size={18} className="text-red-500" />
                              <div className="text-right">
                                <p className="text-[9px] font-black text-red-400 uppercase tracking-widest leading-none mb-1">Bar Gap</p>
                                <p className="font-black text-red-600 tabular-nums text-sm leading-none">-{barTotalGap} Units <span className="text-red-200 font-black mx-1.5">|</span> MAD {barTotalLoss.toLocaleString()}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    
                    {expandedBars[barId] && (
                      <div className="divide-y divide-gray-100 bg-white animate-in slide-in-from-top-2 duration-200">
                      {Object.entries(bar.products).length === 0 ? (
                        <div className="px-8 py-10 text-center text-xs font-bold text-gray-400 uppercase tracking-widest">No transfers recorded for this bar.</div>
                      ) : (
                        Object.entries(bar.products).map(([prodName, data]) => {
                          const theoreticalSold = data.received - data.returned;
                          const revenue = Math.max(0, theoreticalSold * data.dose) * data.price;
                          
                          const manualDocId = `${barId}_${prodName.replace(/[^a-zA-Z0-9]/g, '_')}`;
                          const realSold = manualSales[manualDocId] !== undefined && manualSales[manualDocId] !== '' 
                                           ? manualSales[manualDocId] 
                                           : theoreticalSold; 
                          
                          const gap = theoreticalSold - realSold;
                          const financialLoss = gap > 0 ? gap * data.price * data.dose : 0;
                          
                          return (
                            <div key={prodName} className="p-4 sm:p-6 hover:bg-gray-50/50 transition-colors flex flex-col gap-4">
                              
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-black text-gray-900 text-sm uppercase">{prodName}</p>
                                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                    {data.dose && <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-2 py-0.5 rounded-md">{data.dose} doses</span>}
                                    {data.price && <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">MAD {data.price} / dose</span>}
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 sm:gap-4">
                                
                                <div className="bg-gray-50 p-3 rounded-xl flex flex-col justify-center flex-1">
                                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">In / Out</p>
                                  <p className="font-black text-gray-600 tabular-nums mt-1 text-sm">
                                    {data.received} <span className="text-gray-300 font-normal">↓</span> / <span className="text-red-500">{data.returned}</span> <span className="text-red-300 font-normal">↑</span>
                                  </p>
                                </div>
                                
                                <div className="bg-blue-50/40 p-3 rounded-xl flex flex-col justify-center flex-1">
                                  <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">Theoretical</p>
                                  <p className="font-black text-gray-900 tabular-nums mt-1">{theoreticalSold}</p>
                                  <p className="text-[9px] font-black text-blue-600 uppercase mt-0.5">MAD {revenue.toLocaleString()}</p>
                                </div>

                                <div className="bg-purple-50/30 p-3 rounded-xl flex flex-col justify-center flex-[1.5] border border-purple-100/50 col-span-2 sm:col-span-1">
                                  <p className="text-[9px] font-bold text-purple-400 uppercase tracking-widest mb-1.5 flex items-center justify-between">
                                    <span>Real Sales</span> 
                                    <span className="bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded text-[8px]">MANUAL</span>
                                  </p>
                                  <input 
                                    type="number" min="0"
                                    value={manualSales[manualDocId] === undefined ? '' : manualSales[manualDocId]}
                                    onChange={(e) => handleManualSaleChange(barId, prodName, e.target.value)}
                                    disabled={userRole === 'viewer'}
                                    className={`w-full px-3 py-2 text-lg font-black text-gray-900 bg-white border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none placeholder:text-gray-300 transition-all ${userRole === 'viewer' ? 'opacity-60 cursor-not-allowed bg-gray-50' : ''}`}
                                    placeholder={theoreticalSold.toString()}
                                  />
                                </div>

                                <div className={`p-3 rounded-xl flex flex-col justify-center flex-1 ${gap > 0 ? 'bg-red-50/80 border border-red-100' : gap < 0 ? 'bg-emerald-50/80 border border-emerald-100' : 'bg-gray-50 border border-gray-100'}`}>
                                  <p className={`text-[9px] font-bold uppercase tracking-widest ${gap > 0 ? 'text-red-400' : gap < 0 ? 'text-emerald-500' : 'text-gray-400'}`}>Gap</p>
                                  <p className={`font-black tabular-nums text-lg mt-1 ${gap > 0 ? 'text-red-600' : gap < 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                                    {gap > 0 ? `-${gap}` : gap < 0 ? `+${Math.abs(gap)}` : '0'}
                                  </p>
                                  {gap > 0 && <p className="text-[9px] font-black text-red-600 uppercase mt-0.5 tracking-widest">Loss: MAD {financialLoss.toLocaleString()}</p>}
                                </div>

                              </div>
                            </div>
                          );
                        })
                      )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {/* ========================================= */}
      {/* TAB 3: PER-BAR L'ÉCART RECONCILIATION     */}
      {/* ========================================= */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-8 animate-in fade-in duration-300">
          
          {!isFileUploaded ? (
            // UPLOAD STATE (NOW WITH DRAG AND DROP)
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-[3rem] p-12 md:p-24 flex flex-col items-center justify-center text-center relative transition-all duration-200 ${isDragging ? 'bg-blue-50 border-blue-400 scale-[1.02]' : 'bg-white border-gray-200'}`}
            >
              
              <div className="absolute top-6 right-6">
                 <button 
                   onClick={generateTestXLSX}
                   className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                 >
                   <Download size={14} /> Download Test .xlsx
                 </button>
              </div>

              <div className={`p-6 rounded-[2rem] mb-6 mt-8 transition-colors ${isDragging ? 'bg-blue-100 text-blue-600' : 'bg-red-50 text-red-600'}`}>
                {isDragging ? <MousePointerSquareDashed size={48} /> : <UploadCloud size={48} />}
              </div>
              <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tighter mb-4">
                {isDragging ? 'Drop File to Calculate' : 'Upload Cashless Export'}
              </h2>
              <p className="text-gray-500 font-medium max-w-md mb-8">
                Drag and drop your raw transaction export (.csv or .xlsx) here, or click to browse. We will map the L'écart to specific Zones and Bars.
              </p>
              
              <div className="relative">
                <input 
                  type="file" 
                  accept=".csv, .xlsx, .xls"
                  onChange={handleFileUpload}
                  disabled={isParsing}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
                <button 
                  disabled={isParsing}
                  className="px-10 py-5 bg-gray-900 text-white rounded-[2rem] font-black uppercase tracking-widest text-xs flex items-center gap-3 shadow-xl transition-all disabled:opacity-50 hover:bg-black"
                >
                  {isParsing ? <Loader2 className="animate-spin" size={20} /> : 'Select File'}
                </button>
              </div>
            </div>
          ) : (
            // RESULTS STATE
            <div className="space-y-8 animate-in slide-in-from-bottom-6">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-red-600 p-8 rounded-[2.5rem] shadow-xl shadow-red-900/20 text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-8 opacity-10"><AlertTriangle size={100} /></div>
                  <div className="relative z-10">
                    <p className="text-[10px] font-black text-red-200 uppercase tracking-[0.3em] mb-2">Total Confirmed Loss (L'écart)</p>
                    <p className="text-5xl font-black tabular-nums tracking-tighter">MAD {reconciliationTotals.totalLoss.toLocaleString()}</p>
                  </div>
                </div>
                <div className="bg-white border border-gray-100 p-8 rounded-[2.5rem] shadow-sm flex flex-col justify-center">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-2">Missing / Unaccounted Doses</p>
                  <p className="text-5xl font-black text-gray-900 tabular-nums tracking-tighter flex items-center gap-3">
                    {reconciliationTotals.totalMissingUnits.toLocaleString()}
                    <TrendingDown className="text-red-500" size={32} />
                  </p>
                </div>
              </div>

              {/* Per Bar Breakdown */}
              <div className="space-y-8">
                {reconciliationData.length === 0 ? (
                   <div className="p-12 text-center bg-white rounded-[2.5rem] border border-gray-100 shadow-sm text-gray-400 font-black uppercase tracking-widest text-sm">
                      No matching bars found.
                   </div>
                ) : (
                  reconciliationData.map((bar) => (
                    <div key={bar.barName} className="bg-white border border-gray-100 rounded-[2.5rem] shadow-sm overflow-hidden">
                      <div className="p-6 md:p-8 bg-gray-50/50 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-white shadow-sm rounded-xl text-gray-400"><Store size={24} /></div>
                          <div>
                            <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">{bar.barName}</h3>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1">Zone: {bar.zoneName}</p>
                          </div>
                        </div>
                        {bar.barLoss > 0 ? (
                          <div className="bg-red-100 text-red-700 px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 border border-red-200">
                            <AlertTriangle size={14} /> Bar Loss: MAD {bar.barLoss.toLocaleString()}
                          </div>
                        ) : (
                          <div className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 border border-emerald-200">
                            <CheckCircle2 size={14} /> Perfect Reconciliation
                          </div>
                        )}
                      </div>

                      <div className="divide-y divide-gray-50">
                        {bar.products.map((prod, idx) => (
                          <div key={idx} className="p-4 sm:p-6 hover:bg-gray-50/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex-1">
                              <p className="font-black text-gray-900 text-sm uppercase">{prod.product}</p>
                            </div>
                            
                            <div className="grid grid-cols-2 sm:flex sm:flex-row gap-2 sm:gap-4 w-full sm:w-auto">
                              <div className="bg-gray-50 p-3 rounded-xl text-center sm:text-right flex flex-col justify-center flex-1">
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Theoretical</p>
                                <p className="font-black text-gray-500 tabular-nums">{prod.theoretical}</p>
                              </div>
                              <div className="bg-gray-50 p-3 rounded-xl text-center sm:text-right flex flex-col justify-center flex-1">
                                <p className="text-[9px] font-bold text-gray-900 uppercase tracking-widest mb-1">Cashless</p>
                                <p className="font-black text-gray-900 tabular-nums">{prod.actual}</p>
                              </div>
                              <div className={`p-3 rounded-xl text-center sm:text-right flex flex-col justify-center flex-1 ${prod.gap > 0 ? 'bg-red-50/80' : prod.gap < 0 ? 'bg-emerald-50/80' : 'bg-gray-50'}`}>
                                <p className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${prod.gap > 0 ? 'text-red-400' : prod.gap < 0 ? 'text-emerald-500' : 'text-gray-400'}`}>Gap</p>
                                <p className={`font-black tabular-nums ${prod.gap > 0 ? 'text-red-600' : prod.gap < 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
                                  {prod.gap > 0 ? `-${prod.gap}` : prod.gap < 0 ? `+${Math.abs(prod.gap)}` : '0'}
                                </p>
                              </div>
                              <div className={`p-3 rounded-xl text-center sm:text-right flex flex-col justify-center flex-1 ${prod.loss > 0 ? 'bg-red-50/80 border border-red-100' : 'bg-gray-50'}`}>
                                <p className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${prod.loss > 0 ? 'text-red-400' : 'text-gray-400'}`}>Loss</p>
                                <p className={`font-black tabular-nums ${prod.loss > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                                  {prod.loss > 0 ? `MAD ${prod.loss.toLocaleString()}` : '-'}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-center pt-8">
                <button 
                  onClick={() => setIsFileUploaded(false)}
                  className="px-6 py-3 rounded-2xl bg-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-600 hover:bg-gray-200 transition-colors"
                >
                  Upload a different file
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}