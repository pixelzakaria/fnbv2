import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import { DownloadCloud, Loader2, ShieldAlert } from 'lucide-react';

export default function DatabaseBackup() {
    const [isDownloading, setIsDownloading] = useState(false);
  
    // --- LOCALHOST SECURITY LOCK ---
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center">
          <p className="text-gray-600 font-black tracking-widest uppercase">404 - Not Found</p>
        </div>
      );
    }
  
    const downloadDatabase = async () => {
    setIsDownloading(true);
    try {
      // List of all your active collections
      const collectionsToBackup = [
        'users', 'bar_locations', 'master_inventory', 'substock_inventory', 
        'bar_inventory', 'catalog', 'initial_stock', 'transfers', 
        'bar_returns', 'warehouse_returns', 'audit_logs', 'manual_sales', 'facts'
      ];

      const backupData = {};

      // Fetch every document from every collection
      for (const colName of collectionsToBackup) {
        const snap = await getDocs(collection(db, colName));
        backupData[colName] = snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      }

      // Convert to a beautifully formatted JSON string
      const jsonString = JSON.stringify(backupData, null, 2);
      
      // Create a downloadable Blob
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Generate a filename with today's date
      const date = new Date().toISOString().split('T')[0];
      const fileName = `fnb_database_backup_${date}.json`;

      // Trigger the hidden download link
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (error) {
      console.error("Backup failed:", error);
      alert("Backup failed. Check console.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white max-w-md w-full rounded-[2.5rem] p-10 text-center shadow-2xl">
        <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
          <ShieldAlert size={40} />
        </div>
        
        <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter mb-2">Master Backup</h1>
        <p className="text-gray-500 font-bold text-sm mb-8">
          This will pull every single document from the live database. Do not close the window while it runs.
        </p>

        <button
          onClick={downloadDatabase}
          disabled={isDownloading}
          className="w-full py-6 bg-gray-900 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
        >
          {isDownloading ? (
            <><Loader2 className="animate-spin" size={24} /> Extracting Data...</>
          ) : (
            <><DownloadCloud size={24} /> Download .JSON</>
          )}
        </button>
      </div>
    </div>
  );
}