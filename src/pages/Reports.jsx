import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, getDoc, query, where, doc, setDoc } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext'; // <--- ADDED THIS
import { 
  FileDown, Loader2, Calculator, Info, DollarSign, 
  UploadCloud, AlertTriangle, CheckCircle2, TrendingDown, Store,
  MapPin, Download, Database, MousePointerSquareDashed, ChevronDown
} from 'lucide-react';
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

  useEffect(() => {
    generateTheoreticalReport();
    generateZoneReport();
  }, []);

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

    </div>
  );
}