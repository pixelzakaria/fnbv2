import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Truck, Loader2, ArrowRight, Search, Clock, CheckCircle2 } from 'lucide-react';

export default function InTransit() {
  const [transfers, setTransfers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // Queries for ALL THREE collections
    const qTransfers = query(collection(db, 'transfers'), orderBy('timestamp', 'desc'));
    const qBarReturns = query(collection(db, 'bar_returns'), orderBy('timestamp', 'desc'));
    const qWarehouseReturns = query(collection(db, 'warehouse_returns'), orderBy('timestamp', 'desc')); // <--- ADDED THIS

    let transfersData = [];
    let barReturnsData = [];
    let warehouseReturnsData = [];

    // Helper to merge and sort all arrays
    const updateState = () => {
      const combined = [...transfersData, ...barReturnsData, ...warehouseReturnsData].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      setTransfers(combined);
      setIsLoading(false);
    };

    const unsubTransfers = onSnapshot(qTransfers, (snap) => {
      transfersData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateState();
    });

    const unsubBarReturns = onSnapshot(qBarReturns, (snap) => {
      barReturnsData = snap.docs.map(doc => ({ id: doc.id, isBarReturn: true, ...doc.data() }));
      updateState();
    });

    const unsubWarehouseReturns = onSnapshot(qWarehouseReturns, (snap) => {
      warehouseReturnsData = snap.docs.map(doc => ({ id: doc.id, isWarehouseReturn: true, ...doc.data() }));
      updateState();
    });

    return () => { unsubTransfers(); unsubBarReturns(); unsubWarehouseReturns(); };
  }, []);

  const filteredTransfers = transfers.filter(t => 
    t.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.fromAdmin?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.fromSubstockEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.toSubstockEmail?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.toBarName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.fromBarName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.fromManagerEmail?.toLowerCase().includes(searchTerm.toLowerCase()) // <--- ADDED THIS LINE
  );

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12 px-4 animate-in fade-in duration-500">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase flex items-center gap-3">
            <Truck className="text-blue-600" size={32} />
            Transit Log
          </h1>
          <p className="text-gray-500 font-medium mt-1">Live tracking of all system-wide stock movements.</p>
        </div>

        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search products or locations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-blue-600 outline-none shadow-sm"
          />
        </div>
      </div>

      {/* TRANSIT TABLE */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden min-h-[400px]">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] border-b border-gray-100">
              <tr>
                <th className="p-6">Timestamp</th>
                <th className="p-6">Product & Qty</th>
                <th className="p-6">Origin</th>
                <th className="p-6"></th>
                <th className="p-6">Destination</th>
                <th className="p-6 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr>
                  <td colSpan="6" className="p-20 text-center">
                    <Loader2 className="animate-spin mx-auto text-blue-600 mb-4" size={40} />
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Loading Manifests...</p>
                  </td>
                </tr>
              ) : filteredTransfers.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-20 text-center text-gray-400 font-black uppercase tracking-widest text-sm">
                    No transit records found.
                  </td>
                </tr>
              ) : (
                filteredTransfers.map((t) => {
                    const date = new Date(t.timestamp);
                    const isPending = t.status === 'pending';
                    
                    // Determine Sender & Receiver dynamically based on explicit database fields
                    let senderName = 'Unknown';
                    let receiverName = 'Unknown';

                    if (t.fromBarName) {
                      // 1. BAR RETURNS (Bar -> Zone)
                      senderName = t.fromBarName;
                      receiverName = 'Zone Hub';
                    } else if (t.fromManagerEmail) {
                      // 2. ZONE RETURNS (Zone -> Master Warehouse)
                      senderName = t.fromManagerEmail.split('@')[0];
                      receiverName = 'Master Warehouse';
                    } else {
                      // 3. DISPATCHES (Admin -> Zone, or Zone -> Bar)
                      senderName = t.fromAdmin ? 'Master Warehouse' : (t.fromSubstockEmail ? t.fromSubstockEmail.split('@')[0] : 'Unknown');
                      receiverName = t.toBarName ? t.toBarName : (t.toSubstockEmail ? t.toSubstockEmail.split('@')[0] : 'Unknown');
                    }

                  return (
                    <tr key={t.id} className="hover:bg-blue-50/10 transition-colors">
                      <td className="p-6">
                        <p className="font-black text-gray-900 text-sm">{date.toLocaleDateString()}</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</p>
                      </td>
                      <td className="p-6">
                        <p className="font-black text-gray-900 uppercase text-xs">{t.productName}</p>
                        <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-md uppercase tracking-widest mt-1.5 inline-block border border-blue-100">
                          {t.quantity} Units
                        </span>
                      </td>
                      <td className="p-6">
                        <p className="font-black text-gray-600 uppercase text-[10px] tracking-widest">{senderName}</p>
                      </td>
                      <td className="p-6 text-center">
                        <ArrowRight size={16} className="text-gray-300 mx-auto" />
                      </td>
                      <td className="p-6">
                        <p className="font-black text-gray-900 uppercase text-[10px] tracking-widest">{receiverName}</p>
                      </td>
                      <td className="p-6 text-right">
                        {isPending ? (
                          <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-amber-200">
                            <Clock size={12} /> Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-emerald-200">
                            <CheckCircle2 size={12} /> Completed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}