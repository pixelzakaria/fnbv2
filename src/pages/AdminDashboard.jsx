import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot } from 'firebase/firestore';
import {
  Warehouse,
  Truck,
  Store,
  ChevronDown,
  ChevronUp,
  AlertCircle
} from 'lucide-react';

export default function AdminDashboard() {
  const [masterStock, setMasterStock] = useState([]);
  const [subStock, setSubStock] = useState([]);
  const [users, setUsers] = useState([]);
  const [barLocations, setBarLocations] = useState([]);
  const [barInventory, setBarInventory] = useState([]);

  // Accordion States (Two layers now: Zones and Bars)
  const [expandedSection, setExpandedSection] = useState(null);
  const [expandedBar, setExpandedBar] = useState(null);

  useEffect(() => {
    const unsubMaster = onSnapshot(collection(db, 'master_inventory'), (snap) => {
      setMasterStock(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubSub = onSnapshot(collection(db, 'substock_inventory'), (snap) => {
      setSubStock(snap.docs.map(d => d.data()));
    });
    const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
      // FIX: Force the document ID to be saved as 'uid' so it matches the inventory records
      setUsers(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    });
    const unsubBars = onSnapshot(collection(db, 'bar_locations'), (snap) => {
      setBarLocations(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    const unsubBarInv = onSnapshot(collection(db, 'bar_inventory'), (snap) => {
      setBarInventory(snap.docs.map(d => d.data()));
    });

    return () => { unsubMaster(); unsubSub(); unsubUsers(); unsubBars(); unsubBarInv(); };
  }, []);

  const toggleSection = (sectionName) => {
    setExpandedSection(expandedSection === sectionName ? null : sectionName);
  };

  // Generate data for the top carousel
  const carouselData = masterStock.map(item => {
    // Stock sitting in Zone Manager hubs
    const zoneQty = subStock
      .filter(s => s.productId === item.id || s.productName === item.name)
      .reduce((acc, s) => acc + (s.quantity || 0), 0);

    // Stock sitting physically at the Bars
    const barQty = barInventory
      .filter(b => b.productId === item.id || b.productName === item.name)
      .reduce((acc, b) => acc + (b.quantity || 0), 0);

    return {
      id: item.id,
      name: item.name,
      warehouse: item.quantity || 0,
      deployed: zoneQty + barQty // Total items out in the field
    };
  });

  const totalWarehouseUnits = masterStock.reduce((acc, item) => acc + (item.quantity || 0), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12 px-4">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">Mission Control</h1>
        <p className="text-gray-500 font-medium">Real-time product availability and location.</p>
      </div>

      {/* Compact Product Carousel */}
      <div className="flex overflow-x-auto gap-4 pb-4 snap-x custom-scrollbar">
        {carouselData.map((item) => (
          <div key={item.id} className="min-w-[180px] sm:min-w-[240px] bg-gray-900 text-white p-4 sm:p-5 rounded-[1.5rem] sm:rounded-[2rem] shrink-0 snap-start flex flex-col justify-between shadow-xl">
            <p className="font-black uppercase tracking-widest text-xs sm:text-sm mb-4 sm:mb-6 truncate">{item.name}</p>
            <div className="flex justify-between items-end gap-2">
              <div>
                <p className="text-2xl sm:text-3xl font-black leading-none">{item.warehouse}</p>
                <p className="text-[8px] sm:text-[9px] text-gray-400 uppercase tracking-widest mt-1">Warehouse</p>
              </div>
              <div className="text-right">
                <p className="text-lg sm:text-xl font-bold text-blue-400 leading-none">{item.deployed}</p>
                <p className="text-[8px] sm:text-[9px] text-gray-500 uppercase tracking-widest mt-1">Deployed</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-6">

        {/* 1. MAIN WAREHOUSE ACCORDION (BLUE) */}
        <div className="bg-white rounded-[2rem] shadow-lg shadow-blue-900/10 border border-blue-600 overflow-hidden">
          <button
            onClick={() => toggleSection('warehouse')}
            className="w-full p-6 sm:p-8 flex items-center justify-between bg-blue-600 hover:bg-blue-700 transition-colors text-white"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl"><Warehouse size={20} /></div>
              <div className="text-left">
                <p className="font-black uppercase sm:text-lg">Main Warehouse</p>
                <p className="text-[10px] font-bold text-blue-200 uppercase tracking-widest mt-1">Master Inventory</p>
              </div>
            </div>
            <div className="flex items-center gap-4 sm:gap-6">
              <span className="text-xl sm:text-2xl font-black">{totalWarehouseUnits.toLocaleString()}</span>
              {expandedSection === 'warehouse' ? <ChevronUp className="text-blue-200" /> : <ChevronDown className="text-blue-200" />}
            </div>
          </button>

          {expandedSection === 'warehouse' && (
            <div className="bg-white overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="p-6">Product</th>
                    <th className="p-6 text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(() => {
                    // Group master stock by category
                    const groupedStock = masterStock.reduce((acc, item) => {
                      const cat = item.category || 'Uncategorized';
                      if (!acc[cat]) acc[cat] = [];
                      acc[cat].push(item);
                      return acc;
                    }, {});

                    return Object.entries(groupedStock)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([category, items]) => (
                        <React.Fragment key={category}>
                          {/* Category Header Row */}
                          <tr className="bg-gray-50">
                            <td colSpan="2" className="px-6 py-4">
                              <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] bg-white px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm">
                                {category}
                              </span>
                            </td>
                          </tr>
                          
                          {/* Product Rows for this Category */}
                          {items.sort((a, b) => a.name.localeCompare(b.name)).map((item, idx) => (
                            <tr key={item.id || idx} className="hover:bg-blue-50/50 transition-colors">
                              <td className="p-6">
                                <p className="font-black text-gray-900 uppercase text-xs">{item.name}</p>
                                <div className="flex items-center gap-2 mt-1.5">
                                  {item.dose && <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-2 py-0.5 rounded-md">{item.dose}</span>}
                                  {item.price && <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">MAD {item.price}</span>}
                                </div>
                              </td>
                              <td className="p-6 font-bold text-blue-600 text-right tabular-nums">{item.quantity}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      ));
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 2. SUBSTOCK (ZONES) GRID W/ NESTED BARS (GREEN) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
          {(() => {
            const managersMap = new Map();

            // 1. Grab all official Zone Managers from the Users collection first
            users.filter(u => u.role === 'substock').forEach(u => {
              if (u.uid) managersMap.set(u.uid, { uid: u.uid, email: u.email || 'Unknown Zone' });
            });

            // 2. Catch any orphaned inventory that belongs to a deleted/missing user
            subStock.forEach(item => {
              if (item.managerUid && !managersMap.has(item.managerUid)) {
                managersMap.set(item.managerUid, { uid: item.managerUid, email: item.managerEmail || 'Unknown Zone' });
              }
            });

            return Array.from(managersMap.values()).map(manager => {
              const managerStock = subStock.filter(s => s.managerUid === manager.uid);
              const managerTotal = managerStock.reduce((acc, item) => acc + item.quantity, 0);

              return (
                <div key={manager.uid} className="bg-white rounded-[2rem] shadow-sm border border-emerald-600 overflow-hidden">
                  <button
                    onClick={() => toggleSection(`zone_${manager.uid}`)}
                    className="w-full p-6 flex items-center justify-between bg-emerald-600 hover:bg-emerald-700 transition-colors text-white"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white/20 rounded-xl"><Truck size={18} /></div>
                      <div className="text-left">
                        <p className="font-black uppercase text-sm">{manager.email.split('@')[0]}</p>
                        <p className="text-[9px] font-bold text-emerald-200 uppercase tracking-widest mt-1">Zone Manager</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-black">{managerTotal.toLocaleString()}</span>
                      {expandedSection === `zone_${manager.uid}` ? <ChevronUp size={18} className="text-emerald-200" /> : <ChevronDown size={18} className="text-emerald-200" />}
                    </div>
                  </button>

                  {expandedSection === `zone_${manager.uid}` && (
                    <div className="flex flex-col">
                      {/* Zone's Personal Stock Table */}
                      <div className="bg-white overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] bg-gray-50 border-b border-gray-100">
                            <tr>
                              <th className="p-4">Zone Stock</th>
                              <th className="p-4 text-right">Qty</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                          {managerStock.map((item, idx) => {
                              const masterItem = masterStock.find(m => m.id === item.productId || m.name === item.productName) || {};
                              const displayDose = item.dose || masterItem.dose;
                              const displayPrice = item.price || masterItem.price;

                              return (
                                <tr key={idx} className="hover:bg-emerald-50/50 transition-colors">
                                  <td className="p-4">
                                    <p className="font-black text-gray-900 uppercase text-xs">{item.productName}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      {displayDose && <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-1.5 py-0.5 rounded-md">{displayDose}</span>}
                                      {displayPrice && <span className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">MAD {displayPrice}</span>}
                                    </div>
                                  </td>
                                  <td className="p-4 font-bold text-emerald-600 text-right tabular-nums">{item.quantity}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Nested Bars Assigned to this Zone */}
                      {(() => {
                        const assignedBars = barLocations.filter(b => b.assignedZoneUid === manager.uid);
                        if (assignedBars.length === 0) return null;

                        return (
                          <div className="bg-gray-50 p-4 space-y-3 border-t border-gray-200">
                            <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest pl-2">Bars in this Zone</h3>
                            {assignedBars.map(bar => {
                              const currentBarStock = barInventory.filter(b => b.barId === bar.id);
                              const barTotal = currentBarStock.reduce((acc, item) => acc + item.quantity, 0);

                              return (
                                <div key={bar.id} className="bg-white rounded-2xl shadow-sm border border-orange-200 overflow-hidden">
                                  <button
                                    onClick={() => setExpandedBar(expandedBar === bar.id ? null : bar.id)}
                                    className="w-full p-4 flex items-center justify-between hover:bg-orange-50 transition-colors"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div className="p-2 bg-orange-100 text-orange-600 rounded-xl"><Store size={14} /></div>
                                      <div className="text-left">
                                        <p className="font-black text-gray-900 uppercase text-xs">{bar.name}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-sm font-black text-gray-900">{barTotal.toLocaleString()}</span>
                                      {expandedBar === bar.id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                                    </div>
                                  </button>

                                  {expandedBar === bar.id && (
                                    <div className="border-t border-gray-100 bg-white overflow-x-auto">
                                      <table className="w-full text-left">
                                        <thead className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] bg-gray-50">
                                          <tr>
                                            <th className="p-3">Product</th>
                                            <th className="p-3 text-right">Qty</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                        {currentBarStock.map((item, idx) => {
                                            const masterItem = masterStock.find(m => m.id === item.productId || m.name === item.productName) || {};
                                            const displayDose = item.dose || masterItem.dose;
                                            const displayPrice = item.price || masterItem.price;

                                            return (
                                              <tr key={idx} className="hover:bg-orange-50/50 transition-colors">
                                                <td className="p-3">
                                                  <p className="font-black text-gray-900 uppercase text-[10px]">{item.productName}</p>
                                                  <div className="flex items-center gap-2 mt-1">
                                                    {displayDose && <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-1.5 py-0.5 rounded-md">{displayDose}</span>}
                                                    {displayPrice && <span className="text-[8px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-100">MAD {displayPrice}</span>}
                                                  </div>
                                                </td>
                                                <td className="p-3 font-bold text-orange-600 text-right tabular-nums text-xs">{item.quantity}</td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>

        {/* 3. UNASSIGNED BAR LEADS (Safety Fallback) */}
        {/* Only displays bars that DO NOT have an 'assignedZoneUid' */}
        {barLocations.filter(b => !b.assignedZoneUid).length > 0 && (
          <div className="pt-4 space-y-4">
            <h2 className="text-sm font-black text-red-500 uppercase tracking-[0.2em] pl-4 flex items-center gap-2">
              <AlertCircle size={16} /> Unassigned Bars (Action Required)
            </h2>
            {barLocations.filter(b => !b.assignedZoneUid).map(bar => {
              const currentBarStock = barInventory.filter(b => b.barId === bar.id);
              const barTotal = currentBarStock.reduce((acc, item) => acc + item.quantity, 0);

              return (
                <div key={bar.id} className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden opacity-80 hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => toggleSection(`bar_${bar.id}`)}
                    className="w-full p-6 sm:p-8 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl"><Store size={20} /></div>
                      <div className="text-left">
                        <p className="font-black text-gray-900 uppercase sm:text-lg">{bar.name}</p>
                        <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mt-1">Lead: {bar.lead} (Unlinked)</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 sm:gap-6">
                      <span className="text-xl sm:text-2xl font-black text-gray-900">{barTotal.toLocaleString()}</span>
                      {expandedSection === `bar_${bar.id}` ? <ChevronUp className="text-gray-400" /> : <ChevronDown className="text-gray-400" />}
                    </div>
                  </button>

                  {expandedSection === `bar_${bar.id}` && (
                    <div className="border-t border-gray-100 bg-gray-50/30 overflow-x-auto">
                      <table className="w-full text-left">
                        <thead className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] bg-gray-50">
                          <tr>
                            <th className="p-6">Product</th>
                            <th className="p-6 text-right">Quantity</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                        {currentBarStock.map((item, idx) => {
                              const masterItem = masterStock.find(m => m.id === item.productId || m.name === item.productName) || {};
                              const displayDose = item.dose || masterItem.dose;
                              const displayPrice = item.price || masterItem.price;

                              return (
                                <tr key={idx} className="hover:bg-white transition-colors">
                                  <td className="p-6">
                                    <p className="font-black text-gray-900 uppercase text-xs">{item.productName}</p>
                                    <div className="flex items-center gap-2 mt-1.5">
                                      {displayDose && <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-2 py-0.5 rounded-md">{displayDose}</span>}
                                      {displayPrice && <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">MAD {displayPrice}</span>}
                                    </div>
                                  </td>
                                  <td className="p-6 font-bold text-orange-600 text-right tabular-nums">{item.quantity}</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}