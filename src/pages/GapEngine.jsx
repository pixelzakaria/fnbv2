import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { 
  Loader2, UploadCloud, AlertTriangle, CheckCircle2, TrendingDown, 
  Store, Download, MousePointerSquareDashed, ChevronDown
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export default function GapEngine() {
  const [isParsing, setIsParsing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [reconciliationData, setReconciliationData] = useState([]);
  const [reconciliationTotals, setReconciliationTotals] = useState({ totalMissingUnits: 0 });
  const [isFileUploaded, setIsFileUploaded] = useState(false);
  const [rawCashlessData, setRawCashlessData] = useState([]);
  const [expandedBars, setExpandedBars] = useState({}); // <--- ADDED THIS

  // Toggle function for the accordion
  const toggleBarAccordion = (barName) => {
    setExpandedBars(prev => ({ ...prev, [barName]: !prev[barName] }));
  };

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
      const validRows = []; // <--- ADDED THIS TO HOLD RAW DATA

      cashlessRows.forEach(row => {
        const status = String(row['Statut'] || row['Status'] || '').toLowerCase().trim();
        if (status !== 'completed') return; 

        const barName = normalizeName(row['Nom du point de vente'] || row['Point of Sale']);
        let productName = normalizeName(row['Nom du produit'] || row['Product']); // Changed to 'let'
        
        // --- NEW: HANDLE COMMA DECIMALS FOR SPLIT PAYMENTS (e.g., "0,60") ---
        const rawQtyStr = String(row['Quantité'] || row['Qty'] || row['Quantity'] || '1').replace(',', '.');
        let qty = parseFloat(rawQtyStr) || 1; // Changed to 'let'
        
        // Grab date for the table
        const date = `${row['Date (jour)'] || ''} ${row['Date (heure)'] || ''}`.trim();

        if (!productName || !barName) return;

        // --- NEW: MULTIPACK PARSER ---
        // Look for patterns like "X2", "2X", "X 2", or "2 X" anywhere in the name
        const packRegex = /(?:^|\s)(X\s*\d+|\d+\s*X)(?:\s|$)/;
        const match = productName.match(packRegex);

        if (match) {
          // Extract just the number (e.g., "X2" becomes 2)
          const packMultiplier = parseInt(match[1].replace(/\D/g, ''), 10) || 1;
          
          // Remove the "X2" from the string and clean up double spaces so it matches Firebase
          productName = productName.replace(match[1], '').replace(/\s+/g, ' ').trim();
          
          // Multiply the POS quantity by the pack amount
          qty = qty * packMultiplier;
        }

        // --- NEW: COMBO DRINK SPLITTER ---
        // Map POS mix names to their separate Master Inventory components.
        // NOTE: Make sure the array values exactly match your Firebase inventory names!
        // --- NEW: COMBO DRINK SPLITTER ---
        // Map POS mix names to their separate Master Inventory components.
        const comboDictionary = {
          // VODKA MIXERS
          'ABSOLUT REDBULL': ['ABSOLUT', 'REDBULL'],
          'VODKA REDBULL': ['ABSOLUT', 'REDBULL'], // Generic fallback
          'PRAVDA REDBULL': ['PRAVDA', 'REDBULL'],
          'ABSOLUT ELYX REDBULL': ['ABSOLUT ELYX', 'REDBULL'],
          'BALLANTINES REDBULL':  ['BALLANTINES', 'REDBULL'],
          
          // GIN MIXERS
          'BEEFEATER REDBULL': ['BEEFEATER', 'REDBULL'],
          'BEEFEATER TONIC': ['BEEFEATER', 'SHWEPESS TONIC'],
          'GIN TONIC': ['BEEFEATER', 'SHWEPESS TONIC'], // Generic fallback
          'MALFY TONIC': ['MALFY', 'SHWEPESS TONIC'],
          'MONKEY 47 TONIC': ['MONKEY 47', 'SHWEPESS TONIC'],
          'BEEFEATER CITRON': ['BEEFEATER', 'SHWEPESS CITRON'],

          // WHISKEY MIXERS
          'CHIVAS COCA': ['CHIVAS', 'COCA'],
          'WHISKEY COCA': ['JAMESON', 'COCA'], // Generic fallback
          'JAMESON COCA': ['JAMESON', 'COCA'],
          'BALLANTINES COCA': ['BALLANTINES', 'COCA'],
          'CHIVAS COCA ZERO': ['CHIVAS', 'COCA ZERO'],
          
          // COGNAC MIXERS
          'HENNESSEY COCA': ['HENNESSEY 70 CL', 'COCA'],
          'MARTELL COCA': ['MARTELL', 'COCA']

          // You can add as many drink combos here as you need in the future
        };

        // If the product is a combo, split it. Otherwise, keep it as an array of 1.
        const productsToLog = comboDictionary[productName] ? comboDictionary[productName] : [productName];

        productsToLog.forEach(item => {
          // Push to our raw table array so you see the engine explicitly splitting them in the UI
          validRows.push({ date, barName, productName: item, qty });

          if (!actualSales[barName]) actualSales[barName] = {};
          actualSales[barName][item] = (actualSales[barName][item] || 0) + qty;
        });
      });

      setRawCashlessData(validRows); // <--- SAVE TO STATE

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
          theoreticalMap[barInfo.name].products[prod] = { sent: 0, returned: 0, dose: parseFloat(masterItem.dose || 1) };
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

      Object.keys(actualSales).forEach(barName => {
         if (!theoreticalMap[barName]) theoreticalMap[barName] = { zone: 'Unknown (Cashless Only)', products: {} };
         Object.keys(actualSales[barName]).forEach(prodName => {
             if (!theoreticalMap[barName].products[prodName]) {
                 const masterItem = masterData.find(m => normalizeName(m.name) === prodName || m.id === prodName) || {};
                 theoreticalMap[barName].products[prodName] = { sent: 0, returned: 0, dose: parseFloat(masterItem.dose || 1) };
             }
         });
      });

      // 3. Calculate Final Gaps per Bar
      const finalRecon = [];
      let totalMissing = 0;

      const validBars = new Set([
        ...barsData.map(b => normalizeName(b.name)),
        ...Object.keys(actualSales)
      ]);

      Object.keys(theoreticalMap).forEach(barName => {
        if (!validBars.has(barName)) return; 
        const barData = theoreticalMap[barName];
        const productList = [];
        let barTotalMissing = 0; // Track missing units
        let barTotalExtra = 0;   // <--- NEW: Track overages

        // <--- NEW: Check if this bar had ANY transactions in the cashless file
        const isMissingFromFile = !actualSales[barName]; 
        
        Object.keys(barData.products).forEach(prod => {
          const data = barData.products[prod];
          const theoreticalDoses = Math.max(0, (data.sent - data.returned) * data.dose);
          
          const rawActual = actualSales[barName]?.[prod] || 0;
          const actualDoses = Math.round(rawActual);
          
          let gap = theoreticalDoses - actualDoses;

          // --- NEW: ONLY CALCULATE GAPS IF THE BAR WAS IN THE FILE ---
          if (isMissingFromFile) {
            gap = 0; // Force gap to 0 so we don't falsely claim a massive theft
          } else {
            if (gap > 0) {
              totalMissing += gap;
              barTotalMissing += gap;
            } else if (gap < 0) {
              barTotalExtra += Math.abs(gap);
            }
          }

          productList.push({ product: prod, theoretical: theoreticalDoses, actual: actualDoses, gap: gap });
        });

        if (productList.length > 0) {
          productList.sort((a, b) => b.gap - a.gap); 
          finalRecon.push({ 
            barName: barName, 
            zoneName: barData.zone, 
            products: productList, 
            barMissing: barTotalMissing,
            barExtra: barTotalExtra,     // <--- NEW
            isMissingFromFile: isMissingFromFile // <--- NEW
          });
        }
      });

      finalRecon.sort((a, b) => b.barMissing - a.barMissing); 
      setReconciliationData(finalRecon);
      setReconciliationTotals({ totalMissingUnits: totalMissing });
      setIsFileUploaded(true);

    } catch (error) {
      console.error(error); alert("Error processing data."); setIsParsing(false);
    }
  };

  const generateTestXLSX = () => {
    const testData = [
      { "Date (jour)": "5/18/2026", "Date (heure)": "20:00:00", "Statut": "completed", "Nom du point de vente": "All Bars", "Nom du produit": "CORONA 33 CL", "Quantité": 330 },
      { "Date (jour)": "5/18/2026", "Date (heure)": "21:30:00", "Statut": "completed", "Nom du point de vente": "All Bars", "Nom du produit": "ABSOLUT 70 CL", "Quantité": 126 },
      { "Date (jour)": "5/18/2026", "Date (heure)": "23:00:00", "Statut": "refunded", "Nom du point de vente": "All Bars", "Nom du produit": "RED BULL 25 CL", "Quantité": 10 } 
    ];
    const worksheet = XLSX.utils.json_to_sheet(testData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Transactions");
    XLSX.writeFile(workbook, "Cashless_Test_File.xlsx");
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12 px-4">
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">Gap Engine</h1>
        <p className="text-gray-500 font-medium mt-1">Cashless Reconciliation & L'écart Analysis.</p>
      </div>

      <div className="space-y-8 animate-in fade-in duration-300">
        {!isFileUploaded ? (
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
                type="file" accept=".csv, .xlsx, .xls" onChange={handleFileUpload} disabled={isParsing}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <button disabled={isParsing} className="px-10 py-5 bg-gray-900 text-white rounded-[2rem] font-black uppercase tracking-widest text-xs flex items-center gap-3 shadow-xl transition-all disabled:opacity-50 hover:bg-black">
                {isParsing ? <Loader2 className="animate-spin" size={20} /> : 'Select File'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in slide-in-from-bottom-6">
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-red-600 p-8 rounded-[2.5rem] shadow-xl shadow-red-900/20 text-white relative overflow-hidden flex flex-col justify-center">
                <div className="absolute top-0 right-0 p-8 opacity-10"><TrendingDown size={100} /></div>
                <div className="relative z-10">
                  <p className="text-[10px] font-black text-red-200 uppercase tracking-[0.3em] mb-2">Missing / Unaccounted Doses</p>
                  <p className="text-5xl font-black tabular-nums tracking-tighter flex items-center gap-3">
                    {reconciliationTotals.totalMissingUnits.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* NEW: RAW EXTRACTED SALES TABLE */}
            <div className="bg-white border border-gray-100 rounded-[2.5rem] shadow-sm overflow-hidden mb-8">
              <div className="p-6 md:p-8 bg-gray-50/50 border-b border-gray-100">
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tighter">Raw Cashless Extract</h3>
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                  Showing {rawCashlessData.length} completed transactions from the file
                </p>
              </div>
              <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left">
                  <thead className="bg-white sticky top-0 text-[9px] uppercase text-gray-400 font-black tracking-[0.2em] border-b border-gray-50 shadow-sm z-10">
                    <tr>
                      <th className="p-4 pl-6 md:pl-8">Date / Time</th>
                      <th className="p-4">Bar Point of Sale</th>
                      <th className="p-4">Product Name</th>
                      <th className="p-4 text-right pr-6 md:pr-8">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rawCashlessData.map((sale, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/30 transition-colors text-sm">
                        <td className="p-4 pl-6 md:pl-8 font-medium text-gray-500 text-xs">{sale.date || '-'}</td>
                        <td className="p-4 font-black text-gray-900 text-xs">{sale.barName}</td>
                        <td className="p-4 font-bold text-gray-700 text-xs">{sale.productName}</td>
                        <td className="p-4 text-right pr-6 md:pr-8 font-black text-blue-600">{sale.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                    <div 
                      onClick={() => toggleBarAccordion(bar.barName)}
                      className="p-6 md:p-8 bg-gray-50/50 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-gray-100 transition-colors group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-white shadow-sm rounded-xl text-gray-400 group-hover:text-blue-600 transition-colors"><Store size={24} /></div>
                        <div>
                          <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter flex items-center gap-3">
                            {bar.barName}
                            <ChevronDown size={20} className={`text-gray-400 transition-transform duration-200 ${expandedBars[bar.barName] ? 'rotate-180' : ''}`} />
                          </h3>
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1">Zone: {bar.zoneName}</p>
                        </div>
                      </div>
                      {bar.isMissingFromFile ? (
                        <div className="bg-gray-100 text-gray-500 px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 border border-gray-200">
                          <AlertTriangle size={14} /> No Cashless Data Found
                        </div>
                      ) : bar.barMissing > 0 || bar.barExtra > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {bar.barMissing > 0 && (
                            <div className="bg-red-100 text-red-700 px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 border border-red-200">
                              <AlertTriangle size={14} /> Missing: {bar.barMissing.toLocaleString()} Units
                            </div>
                          )}
                          {bar.barExtra > 0 && (
                            <div className="bg-blue-100 text-blue-700 px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 border border-blue-200">
                              <AlertTriangle size={14} /> Extra: {bar.barExtra.toLocaleString()} Units
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl font-black uppercase tracking-widest text-[10px] flex items-center gap-2 border border-emerald-200">
                          <CheckCircle2 size={14} /> Perfect Reconciliation
                        </div>
                      )}
                    </div>

                    {expandedBars[bar.barName] && (
                      <div className="divide-y divide-gray-50 animate-in slide-in-from-top-2 duration-200">
                        {bar.products.map((prod, idx) => (
                        <div key={idx} className="p-4 sm:p-6 hover:bg-gray-50/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex-1">
                            <p className="font-black text-gray-900 text-sm uppercase">{prod.product}</p>
                          </div>
                          
                          <div className="grid grid-cols-3 sm:flex sm:flex-row gap-2 sm:gap-4 w-full sm:w-auto">
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
                          </div>
                        </div>
                      ))}
                      </div>
                    )}
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
    </div>
  );
}