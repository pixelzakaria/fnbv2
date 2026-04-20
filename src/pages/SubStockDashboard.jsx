import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, limit, orderBy } from 'firebase/firestore';
import { useAuth } from '../context/AuthContext';
import { 
  Package, 
  Truck, 
  History, 
  AlertCircle, 
  CheckCircle2, 
  ArrowUpRight,
  Store,
  ChevronDown,
  ChevronUp,
  MapPin,
  Loader2
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function SubStockDashboard() {
  const { user } = useAuth();
  
  // Data States
  const [stats, setStats] = useState({ pendingDeliveries: 0, pendingReturns: 0 });
  const [recentTransfers, setRecentTransfers] = useState([]);
  const [zoneStock, setZoneStock] = useState([]);
  const [assignedBars, setAssignedBars] = useState([]);
  const [barInventory, setBarInventory] = useState([]);
  const [masterStock, setMasterStock] = useState([]); // <--- ADDED THIS
  const [isLoading, setIsLoading] = useState(true);

  // Accordion State
  const [expandedSection, setExpandedSection] = useState('hub'); // Default open their hub

  useEffect(() => {
    if (!user?.uid) return;

    // 1. Pending Deliveries & Returns
    const pendingQuery = query(
      collection(db, 'transfers'),
      where('toSubstockEmail', '==', user.email),
      where('status', '==', 'pending')
    );
    const unsubPending = onSnapshot(pendingQuery, (snap) => {
      setStats(prev => ({ ...prev, pendingDeliveries: snap.size }));
    });

    const returnsQuery = query(
      collection(db, 'bar_returns'),
      where('toSubstockId', '==', user.uid),
      where('status', '==', 'pending')
    );
    const unsubReturns = onSnapshot(returnsQuery, (snap) => {
      setStats(prev => ({ ...prev, pendingReturns: snap.size }));
    });

    // 2. Recent Transfers (Activity Feed)

    // 2. Recent Transfers (Activity Feed)
    const recentQuery = query(
      collection(db, 'transfers'),
      where('toSubstockEmail', '==', user.email),
      orderBy('timestamp', 'desc'),
      limit(5)
    );
    const unsubRecent = onSnapshot(recentQuery, (snap) => {
      setRecentTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 3. This Zone Manager's Hub Inventory
    const qZone = query(collection(db, 'substock_inventory'), where('managerUid', '==', user.uid));
    const unsubZone = onSnapshot(qZone, (snap) => {
      setZoneStock(snap.docs.map(d => d.data()));
    });

    // 4. Bars assigned to this Zone Manager
    const qBars = query(collection(db, 'bar_locations'), where('assignedZoneUid', '==', user.uid));
    const unsubBars = onSnapshot(qBars, (snap) => {
      setAssignedBars(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 5. Global Bar Inventory (Filtered locally for security/simplicity)
    const unsubBarInv = onSnapshot(collection(db, 'bar_inventory'), (snap) => {
      setBarInventory(snap.docs.map(d => d.data()));
      setIsLoading(false);
    });

    // 6. NEW: Listen to Master Stock to grab Price & Dose
    const unsubMaster = onSnapshot(collection(db, 'master_inventory'), (snap) => {
      setMasterStock(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubPending(); unsubReturns(); unsubRecent(); unsubZone(); unsubBars(); unsubBarInv(); unsubMaster(); };
  }, [user]);

  const toggleSection = (sectionName) => {
    setExpandedSection(expandedSection === sectionName ? null : sectionName);
  };

  // --- DATA PROCESSING ---
  const totalHubUnits = zoneStock.reduce((acc, item) => acc + (item.quantity || 0), 0);
  const myBarIds = assignedBars.map(b => b.id);
  const myBarsStock = barInventory.filter(item => myBarIds.includes(item.barId));

  // Build a unique list of all products this manager controls
  const uniqueProducts = Array.from(new Set([
    ...zoneStock.map(s => s.productName),
    ...myBarsStock.map(b => b.productName)
  ]));

  // Generate the Carousel Data
  const carouselData = uniqueProducts.map(productName => {
    const hubQty = zoneStock
      .filter(s => s.productName === productName)
      .reduce((acc, s) => acc + (s.quantity || 0), 0);
      
    const barQty = myBarsStock
      .filter(b => b.productName === productName)
      .reduce((acc, b) => acc + (b.quantity || 0), 0);

    return {
      name: productName,
      hub: hubQty,
      deployed: barQty
    };
  });

  const totalPending = stats.pendingDeliveries + stats.pendingReturns;

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">
          Zone Overview
        </h1>
        <p className="text-gray-500 font-medium mt-1 italic">
          Welcome back, {user?.email}
        </p>
      </div>

      {/* Top Section: Alerts & Carousel */}
      <div className="space-y-6">
        
        {/* Pending Deliveries & Returns Banner */}
        <Link to="/substock/deliveries" className="group block">
          <div className={`p-6 rounded-[2rem] shadow-sm border transition-all duration-300 flex items-center justify-between ${totalPending > 0 ? 'bg-orange-50 border-orange-200 hover:shadow-md' : 'bg-white border-gray-100 hover:border-blue-200'}`}>
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-2xl ${totalPending > 0 ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-400 group-hover:bg-blue-50 group-hover:text-blue-600'}`}>
                <Truck size={24} />
              </div>
              <div>
                <p className={`text-xl sm:text-2xl font-black leading-none uppercase tracking-tight ${totalPending > 0 ? 'text-orange-900' : 'text-gray-900'}`}>
                  {totalPending} Pending Deliveries & Returns
                </p>
                <p className={`font-bold uppercase tracking-widest text-[10px] mt-1 ${totalPending > 0 ? 'text-orange-700' : 'text-gray-400'}`}>
                  {totalPending > 0 ? 'Action Required' : 'All caught up'}
                </p>
              </div>
            </div>
            <ArrowUpRight className={`hidden sm:block ${totalPending > 0 ? 'text-orange-400 group-hover:text-orange-600' : 'text-gray-300 group-hover:text-blue-500'} transition-colors`} size={28} />
          </div>
        </Link>

        {/* Zone Product Carousel */}
        {carouselData.length > 0 ? (
          <div className="flex overflow-x-auto gap-4 pb-4 snap-x custom-scrollbar">
            {carouselData.map((item, idx) => (
              <div key={idx} className="min-w-[180px] sm:min-w-[240px] bg-gray-900 text-white p-4 sm:p-5 rounded-[1.5rem] sm:rounded-[2rem] shrink-0 snap-start flex flex-col justify-between shadow-xl">
                <p className="font-black uppercase tracking-widest text-xs sm:text-sm mb-4 sm:mb-6 truncate">{item.name}</p>
                <div className="flex justify-between items-end gap-2">
                  <div>
                    <p className="text-2xl sm:text-3xl font-black leading-none text-emerald-400">{item.hub}</p>
                    <p className="text-[8px] sm:text-[9px] text-gray-400 uppercase tracking-widest mt-1">In Hub</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg sm:text-xl font-bold text-amber-400 leading-none">{item.deployed}</p>
                    <p className="text-[8px] sm:text-[9px] text-gray-500 uppercase tracking-widest mt-1">At Bars</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white p-8 rounded-[2rem] border-2 border-dashed border-gray-100 text-center">
            <Package className="mx-auto text-gray-300 mb-2" size={32} />
            <p className="font-black text-gray-400 uppercase tracking-widest text-sm">No Stock in Your Zone</p>
          </div>
        )}
      </div>

      {/* DETAILED ACCORDIONS */}
      <div className="space-y-6">
        
        {/* 1. ZONE HUB ACCORDION (EMERALD) */}
        <div className="bg-white rounded-[2rem] shadow-sm border border-emerald-600 overflow-hidden">
          <button 
            onClick={() => toggleSection('hub')}
            className="w-full p-6 flex items-center justify-between bg-emerald-600 hover:bg-emerald-700 transition-colors text-white"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-2xl"><Truck size={20}/></div>
              <div className="text-left">
                <p className="font-black uppercase sm:text-lg">My Distribution Hub</p>
                <p className="text-[10px] font-bold text-emerald-200 uppercase tracking-widest mt-1">Ready to Dispatch</p>
              </div>
            </div>
            <div className="flex items-center gap-4 sm:gap-6">
              <span className="text-xl sm:text-2xl font-black">{totalHubUnits.toLocaleString()}</span>
              {expandedSection === 'hub' ? <ChevronUp className="text-emerald-200"/> : <ChevronDown className="text-emerald-200"/>}
            </div>
          </button>
          
          {expandedSection === 'hub' && (
            <div className="bg-white overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="p-6">Product</th>
                    <th className="p-6 text-right">Quantity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                {zoneStock.length === 0 ? (
                    <tr><td colSpan="2" className="p-8 text-center text-xs font-black text-gray-400 uppercase tracking-widest">Hub is Empty</td></tr>
                  ) : (
                    zoneStock.map((item, idx) => {
                      const masterItem = masterStock.find(m => m.id === item.productId || m.name === item.productName) || {};
                      
                      return (
                      <tr key={idx} className="hover:bg-emerald-50/50 transition-colors">
                        <td className="p-6">
                          <p className="font-black text-gray-900 uppercase text-xs">{item.productName}</p>
                          <div className="flex items-center gap-2 mt-1.5">
                            {masterItem.dose && <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-2 py-0.5 rounded-md">{masterItem.dose} doses</span>}
                            {masterItem.price && <span className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">MAD {masterItem.price} / dose</span>}
                          </div>
                        </td>
                        <td className="p-6 font-bold text-emerald-600 text-right tabular-nums">{item.quantity}</td>
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 2. ASSIGNED BARS GRID (AMBER/ORANGE) */}
        {assignedBars.length > 0 && (
          <div className="pt-4 space-y-4">
            <h2 className="text-sm font-black text-amber-600 uppercase tracking-[0.2em] pl-4 flex items-center gap-2">
              <MapPin size={16}/> My Assigned Bars
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
              {assignedBars.map(bar => {
                // Filter stock just for this specific bar
                const currentBarStock = myBarsStock.filter(b => b.barId === bar.id);
                const barTotal = currentBarStock.reduce((acc, item) => acc + item.quantity, 0);

                return (
                  <div key={bar.id} className="bg-white rounded-[2rem] shadow-sm border border-amber-200 overflow-hidden">
                    <button 
                      onClick={() => toggleSection(`bar_${bar.id}`)}
                      className="w-full p-6 flex items-center justify-between hover:bg-amber-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 text-amber-600 rounded-xl"><Store size={18}/></div>
                        <div className="text-left">
                          <p className="font-black text-gray-900 uppercase text-sm">{bar.name}</p>
                          <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest mt-1">Lead: {bar.lead}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-black text-gray-900">{barTotal.toLocaleString()}</span>
                        {expandedSection === `bar_${bar.id}` ? <ChevronUp size={18} className="text-gray-400"/> : <ChevronDown size={18} className="text-gray-400"/>}
                      </div>
                    </button>
                    
                    {expandedSection === `bar_${bar.id}` && (
                      <div className="border-t border-gray-100 bg-white overflow-x-auto">
                        <table className="w-full text-left">
                          <thead className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] bg-gray-50">
                            <tr>
                              <th className="p-4">Product</th>
                              <th className="p-4 text-right">Qty</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                          {currentBarStock.length === 0 ? (
                              <tr><td colSpan="2" className="p-6 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">Empty Bar</td></tr>
                            ) : (
                              currentBarStock.map((item, idx) => {
                                const masterItem = masterStock.find(m => m.id === item.productId || m.name === item.productName) || {};

                                return (
                                <tr key={idx} className="hover:bg-amber-50 transition-colors">
                                  <td className="p-4">
                                    <p className="font-black text-gray-900 uppercase text-xs">{item.productName}</p>
                                    <div className="flex items-center gap-2 mt-1.5">
                                      {masterItem.dose && <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-1.5 py-0.5 rounded-md">{masterItem.dose} doses</span>}
                                      {masterItem.price && <span className="text-[8px] font-bold text-amber-600 uppercase tracking-widest bg-amber-50 px-1.5 py-0.5 rounded-md border border-amber-100">MAD {masterItem.price} / dose</span>}
                                    </div>
                                  </td>
                                  <td className="p-4 font-bold text-amber-600 text-right tabular-nums text-sm">{item.quantity}</td>
                                </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Recent Activity Feed (Kept from your original file) */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden mt-8">
        <div className="p-6 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
          <History className="text-gray-400" size={20} />
          <h2 className="text-lg font-bold text-gray-800 uppercase tracking-tight">Recent Dispatches</h2>
        </div>

        <div className="divide-y divide-gray-50">
          {isLoading ? (
            <div className="p-12 flex justify-center"><Loader2 className="animate-spin text-gray-300" /></div>
          ) : recentTransfers.length === 0 ? (
            <div className="p-12 text-center text-gray-400 font-medium uppercase tracking-widest text-xs">No recent activity</div>
          ) : (
            recentTransfers.map((item) => (
              <div key={item.id} className="p-6 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-full ${item.status === 'pending' ? 'bg-orange-100 text-orange-600' : 'bg-emerald-100 text-emerald-600'}`}>
                    {item.status === 'pending' ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
                  </div>
                  <div>
                    <p className="font-black text-gray-900 uppercase text-sm">{item.quantity} × {item.productName}</p>
                    <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mt-1">
                      {new Date(item.timestamp).toLocaleDateString()} at {new Date(item.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </p>
                  </div>
                </div>
                <span className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border ${
                  item.status === 'pending' ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                }`}>
                  {item.status}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}