import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { ScrollText, Search, Loader2, FileDown, Filter, ChevronLeft, ChevronRight } from 'lucide-react';

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Text Search State
  const [searchTerm, setSearchTerm] = useState('');
  
  // NEW: Filter States
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  
  // NEW: Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    const logsQuery = query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'));
    
    const unsubscribe = onSnapshot(logsQuery, (snapshot) => {
      const logItems = [];
      snapshot.forEach((doc) => {
        logItems.push({ id: doc.id, ...doc.data() });
      });
      setLogs(logItems);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Automatically reset to page 1 whenever any filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterUser, filterAction, filterStartDate, filterEndDate]);

  // Extract unique values for the dropdowns
  const uniqueUsers = Array.from(new Set(logs.map(l => l.user))).filter(Boolean);
  const uniqueActions = Array.from(new Set(logs.map(l => l.action))).filter(Boolean);

  // --- FILTERING LOGIC ---
  const filteredLogs = logs.filter(log => {
    // 1. Text Search Match
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || (
      log.details?.toLowerCase().includes(searchLower) ||
      log.user?.toLowerCase().includes(searchLower) ||
      log.action?.toLowerCase().includes(searchLower)
    );

    // 2. Dropdown Matches
    const matchesUser = !filterUser || log.user === filterUser;
    const matchesAction = !filterAction || log.action === filterAction;

    // 3. Date Range Matches (Using ISO string prefixes YYYY-MM-DD for reliable comparison)
    const logDateStr = log.timestamp?.split('T')[0] || '';
    const matchesStartDate = !filterStartDate || logDateStr >= filterStartDate;
    const matchesEndDate = !filterEndDate || logDateStr <= filterEndDate;

    return matchesSearch && matchesUser && matchesAction && matchesStartDate && matchesEndDate;
  });

  // --- PAGINATION LOGIC ---
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / itemsPerPage));
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // --- NATIVE CSV EXPORT LOGIC (Uses filteredLogs, NOT paginatedLogs) ---
  const downloadLogsCSV = () => {
    const headers = ['Date', 'Time', 'User', 'Action', 'Details'];
    
    const rows = filteredLogs.map(log => {
      const logDate = new Date(log.timestamp);
      return [
        logDate.toLocaleDateString().replace(/,/g, ''),
        logDate.toLocaleTimeString().replace(/,/g, ''),
        log.user,
        log.action,
        `"${log.details?.replace(/"/g, '""')}"`
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename = `System_Audit_Logs_${new Date().toISOString().split('T')[0]}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getBadgeStyle = (action) => {
    if (!action) return 'bg-gray-100 text-gray-800 border-gray-200';
    if (action.includes('ADDED')) return 'bg-green-100 text-green-800 border-green-200';
    if (action.includes('ADJUSTED')) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (action.includes('DELETED')) return 'bg-red-100 text-red-800 border-red-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12 relative">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">System Audit Logs</h1>
          <p className="mt-2 text-gray-500 font-medium">Immutable record of all inventory and transfer actions.</p>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {/* Export Button */}
          <button 
            onClick={downloadLogsCSV}
            disabled={filteredLogs.length === 0}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-emerald-200"
          >
            <FileDown size={16} /> Export {filteredLogs.length} Rows
          </button>

          {/* Search Bar */}
          <div className="relative w-full md:w-72">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input 
              type="text" 
              placeholder="Search logs..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 text-sm font-medium focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all outline-none shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* NEW: ADVANCED FILTERS SECTION */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Filter by User</label>
          <select value={filterUser} onChange={e => setFilterUser(e.target.value)} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-600 outline-none">
            <option value="">All Users</option>
            {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Filter by Action</label>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-600 outline-none">
            <option value="">All Actions</option>
            {uniqueActions.map(a => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Start Date</label>
          <input type="date" value={filterStartDate} onChange={e => setFilterStartDate(e.target.value)} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-600 outline-none" />
        </div>
        <div>
          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">End Date</label>
          <input type="date" value={filterEndDate} onChange={e => setFilterEndDate(e.target.value)} className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-600 outline-none" />
        </div>
      </div>

      {/* TABLE SECTION */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><ScrollText size={20} /></div>
            <h2 className="text-lg font-black text-gray-800 uppercase tracking-tight">Activity Ledger</h2>
          </div>
          <div className="flex items-center gap-2 text-xs font-bold text-gray-400 uppercase tracking-widest">
            <Filter size={14}/> {filteredLogs.length} Records Found
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <Loader2 className="animate-spin mb-4 text-blue-600" size={32} />
              <p className="font-bold text-sm">Fetching logs...</p>
            </div>
          ) : paginatedLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <p className="font-bold text-sm uppercase tracking-widest">No matching records.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white border-b border-gray-100 text-[10px] uppercase tracking-[0.2em] text-gray-400 font-black">
                  <th className="p-6">Date & Time</th>
                  <th className="p-6">User</th>
                  <th className="p-6">Action</th>
                  <th className="p-6">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-sm">
                {paginatedLogs.map((log) => {
                  const logDate = new Date(log.timestamp);
                  return (
                    <tr key={log.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="p-6 whitespace-nowrap text-gray-500">
                        <div className="font-black text-gray-900">{logDate.toLocaleDateString()}</div>
                        <div className="text-[10px] font-bold uppercase tracking-widest mt-1">{logDate.toLocaleTimeString()}</div>
                      </td>
                      <td className="p-6 font-bold text-gray-700">{log.user}</td>
                      <td className="p-6 whitespace-nowrap">
                        <span className={`px-3 py-1.5 rounded-xl text-[10px] uppercase tracking-widest font-black border ${getBadgeStyle(log.action)}`}>
                          {log.action?.replace(/_/g, ' ') || 'UNKNOWN'}
                        </span>
                      </td>
                      <td className="p-6 text-gray-600 min-w-[300px] font-medium leading-relaxed">
                        {log.details}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* PAGINATION FOOTER */}
        {!isLoading && filteredLogs.length > 0 && (
          <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest pl-2">
              Showing {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredLogs.length)} of {filteredLogs.length}
            </p>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-xl bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="flex items-center gap-2 px-2">
                <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Page</span>
                <input 
                  type="number"
                  min={1}
                  max={totalPages}
                  value={currentPage}
                  onChange={(e) => {
                    let val = parseInt(e.target.value);
                    if (!isNaN(val)) {
                      // Prevent jumping past the first or last page
                      if (val < 1) val = 1;
                      if (val > totalPages) val = totalPages;
                      setCurrentPage(val);
                    }
                  }}
                  className="w-14 py-1.5 text-center text-xs font-black text-blue-600 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all shadow-sm"
                />
                <span className="text-xs font-black text-gray-500 uppercase tracking-widest">of {totalPages}</span>
              </div>
              <button 
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-xl bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}