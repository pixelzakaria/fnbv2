import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, deleteDoc, addDoc, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuth } from '../context/AuthContext';
import { Users, UserPlus, Trash2, ShieldCheck, UserCircle, Loader2, Search, Store, MapPin } from 'lucide-react';

export default function ManageUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Form States
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('substock');
  const [isVipZone, setIsVipZone] = useState(false); // <--- ADD THIS

  // Bar-Specific Form States
  const [barName, setBarName] = useState('');
  const [leadName, setLeadName] = useState('');
  const [assignedZoneUid, setAssignedZoneUid] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      // Extract doc.id as uid to ensure consistency across the app
      const uList = snapshot.docs.map(doc => ({ id: doc.id, uid: doc.id, ...doc.data() }));
      setUsers(uList);
      setIsLoading(false);
    });
    return () => unsub();
  }, []);

  const handleAddUserRecord = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (newRole === 'bar') {
        // --- BAR LEAD CREATION LOGIC ---
        if (!barName || !leadName || !assignedZoneUid) {
          throw new Error("Please fill in all Bar Assignment Details.");
        }

        // 1. Secondary App Trick to create Auth user without logging Admin out
        const secondaryApp = initializeApp(db.app.options, `SecondaryApp_${Date.now()}`);
        const secondaryAuth = getAuth(secondaryApp);
        const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newEmail.trim(), newPassword);
        const newUid = userCredential.user.uid;
        await signOut(secondaryAuth);

        // 2. Create the Bar Location Document
        const barRef = await addDoc(collection(db, 'bar_locations'), {
          name: barName.trim(),
          lead: leadName.trim(),
          assignedZoneUid: assignedZoneUid,
          leadUid: newUid,
          createdAt: new Date().toISOString()
        });

        // 3. Create the User Document mapped to the Bar
        await setDoc(doc(db, 'users', newUid), {
          uid: newUid,
          email: newEmail.trim(),
          role: 'bar',
          barId: barRef.id,
          assignedZoneUid: assignedZoneUid,
          createdAt: new Date().toISOString()
        });

        await addDoc(collection(db, 'audit_logs'), {
          action: 'USER_ACCOUNT_CREATED',
          details: `Created BAR account for ${newEmail} (${barName})`,
          user: currentUser.email,
          timestamp: new Date().toISOString()
        });

      } else {
        // --- ADMIN / SUBSTOCK CREATION LOGIC ---
        const functions = getFunctions();
        const createStaffAccount = httpsCallable(functions, 'createStaffAccount');

        await createStaffAccount({
          email: newEmail.trim(),
          password: newPassword,
          role: newRole,
          isVipZone: newRole === 'substock' ? isVipZone : false // <--- ADD THIS LINE
        });

        await addDoc(collection(db, 'audit_logs'), {
          action: 'USER_ACCOUNT_CREATED',
          details: `Created ${newRole.toUpperCase()} account for ${newEmail}`,
          user: currentUser.email,
          timestamp: new Date().toISOString()
        });
      }

      alert(`Success! Account for ${newEmail} is live.`);

      // Reset all form fields
      setNewEmail('');
      setNewPassword('');
      setBarName('');
      setLeadName('');
      setAssignedZoneUid('');
      setNewRole('substock');
      setIsVipZone(false); // <--- ADD THIS

    } catch (error) {
      console.error(error);
      alert("Error: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async (u) => {
    if (u.email === currentUser.email) {
      alert("You cannot delete your own admin account.");
      return;
    }

    if (window.confirm(`Revoke all access for ${u.email}?`)) {
      try {
        // If it's a bar, delete their associated location profile so they vanish from dashboards
        if (u.role === 'bar' && u.barId) {
          await deleteDoc(doc(db, 'bar_locations', u.barId));
        }

        // Delete the main user record
        await deleteDoc(doc(db, 'users', u.id));

        await addDoc(collection(db, 'audit_logs'), {
          action: 'USER_ACCESS_REVOKED',
          details: `Removed all permissions for ${u.email}`,
          user: currentUser.email,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error(error);
      }
    }
  };

  const filteredUsers = users.filter(u =>
    u.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Helper to extract Zone Managers for the dropdown
  const zoneManagers = users.filter(u => u.role === 'substock');

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Staff & Roles</h1>
        <p className="mt-2 text-gray-500">Manage all system access levels, zones, and bars from one place.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Registration Form */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100 sticky top-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <UserPlus size={20} />
              </div>
              <h2 className="text-xl font-bold text-gray-800">Create Account</h2>
            </div>

            <form onSubmit={handleAddUserRecord} className="space-y-4">

              <div className="space-y-3">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Account Credentials</p>
                <input
                  type="email"
                  placeholder="Email Address"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all font-medium"
                  required
                />
                <input
                  type="password"
                  placeholder="Set Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all font-medium"
                  minLength="6"
                  required
                />
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all font-bold text-gray-700 cursor-pointer"
                >
                  <option value="substock">Zone Manager</option>
                  <option value="bar">Bar</option>
                  <option value="viewer">System Viewer (Read-Only)</option>
                  <option value="admin">System Admin</option>
                </select>
              </div>

              {/* <--- ADD THIS NEW VIP CHECKBOX BLOCK ---> */}
              {newRole === 'substock' && (
                <div className="flex items-center gap-3 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <input
                    type="checkbox"
                    id="vipZone"
                    checked={isVipZone}
                    onChange={(e) => setIsVipZone(e.target.checked)}
                    className="w-5 h-5 text-blue-600 bg-gray-50 border-gray-300 rounded focus:ring-2 focus:ring-blue-600 cursor-pointer accent-blue-600"
                  />
                  <label htmlFor="vipZone" className="text-sm font-bold text-gray-700 cursor-pointer select-none">
                    VIP ?
                  </label>
                </div>
              )}
              {/* <--- END NEW VIP CHECKBOX BLOCK ---> */}

              {/* Dynamic Bar Assignment Fields */}

              {/* Dynamic Bar Assignment Fields */}
              {newRole === 'bar' && (
                <div className="space-y-3 pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-2 duration-300">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Bar Assignment Details</p>
                  <input
                    type="text"
                    placeholder="Bar Name (e.g. VIP Bar 1)"
                    value={barName}
                    onChange={e => setBarName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all font-medium"
                    required={newRole === 'bar'}
                  />
                  <input
                    type="text"
                    placeholder="Lead Full Name"
                    value={leadName}
                    onChange={e => setLeadName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all font-medium"
                    required={newRole === 'bar'}
                  />
                  <select
                    value={assignedZoneUid}
                    onChange={e => setAssignedZoneUid(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-600 outline-none transition-all font-medium cursor-pointer"
                    required={newRole === 'bar'}
                  >
                    <option value="">Assign to Zone...</option>
                    {zoneManagers.map(zone => (
                      <option key={zone.uid} value={zone.uid}>{zone.email.split('@')[0]}</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 mt-2 bg-gray-900 text-white font-black uppercase tracking-widest text-xs rounded-xl hover:bg-black transition-all flex justify-center items-center gap-2 active:scale-95 disabled:opacity-50 shadow-lg"
              >
                {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : "Create Staff Account"}
              </button>
            </form>
          </div>
        </div>

        {/* Users List */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-6 md:p-8 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-white shadow-sm text-gray-600 rounded-xl">
                  <Users size={20} />
                </div>
                <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">Active Roster</h2>
              </div>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Search staff..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-600 font-medium shadow-sm transition-all"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-white text-[10px] uppercase text-gray-400 font-black tracking-[0.2em] border-b border-gray-50">
                  <tr>
                    <th className="p-6">Staff Member</th>
                    <th className="p-6">Role & Assignment</th>
                    <th className="p-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredUsers.length === 0 ? (
                    <tr><td colSpan="3" className="p-8 text-center text-sm font-bold text-gray-400">No matching staff found.</td></tr>
                  ) : (
                    filteredUsers.map((u) => {
                      // Find assigned zone specifically for bar leads to display their linkage
                      const assignedZone = u.assignedZoneUid ? zoneManagers.find(z => z.uid === u.assignedZoneUid) : null;

                      return (
                        <tr key={u.id} className="hover:bg-gray-50/50 transition-colors group">
                          <td className="p-6">
                            <div className="flex items-center gap-4">
                              <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                                <UserCircle size={20} />
                              </div>
                              <span className="font-bold text-gray-900">{u.email}</span>
                            </div>
                          </td>
                          <td className="p-6">
                            <div className="flex flex-col items-start gap-2">
                              {/* Role Badges */}
                              {u.role === 'admin' && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-purple-100 text-purple-700 border border-purple-200"><ShieldCheck size={12} /> System Admin</span>}
                              {u.role === 'substock' && (
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-blue-100 text-blue-700 border border-blue-200">
                                    <MapPin size={12} /> Zone Manager
                                  </span>
                                  {u.isVipZone && (
                                    <span className="inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-yellow-100 text-yellow-700 border border-yellow-300">
                                      VIP
                                    </span>
                                  )}
                                </div>
                              )}
                              {u.role === 'bar' && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-orange-100 text-orange-700 border border-orange-200"><Store size={12} /> Bar</span>}
                              {u.role === 'viewer' && <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-700 border border-slate-200"><Search size={12} /> System Viewer</span>}

                              {/* Extra details for Bars */}
                              {u.role === 'bar' && (
                                <div className="text-[10px] font-bold text-gray-500 mt-1">
                                  {assignedZone ? `Linked to Zone: ${assignedZone.email.split('@')[0]}` : <span className="text-red-500">No Zone Assigned</span>}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-6 text-right">
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="p-3 text-gray-300 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors"
                              title="Revoke Access"
                            >
                              <Trash2 size={18} />
                            </button>
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
      </div>
    </div>
  );
}