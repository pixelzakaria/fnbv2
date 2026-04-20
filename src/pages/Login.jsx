import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { Mail, Lock, Loader2, AlertCircle } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (userDoc.exists()) {
        const role = userDoc.data().role;
        
        // --- 2026 ROLE-BASED REDIRECTION ---
        if (role === 'admin' || role === 'viewer') {
          navigate('/admin');
        } else if (role === 'substock') {
          navigate('/substock');
        } else if (role === 'bar') {
          navigate('/bar/dashboard'); // Or wherever your frontline app lives
        } else {
          setError('Role undefined. Contact system admin.');
        }
      } else {
        setError('User profile not found in database.');
      }
    } catch (err) {
      setError('Invalid credentials. Access denied.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#0A0A0B] flex flex-col justify-center items-center p-6 selection:bg-blue-500/30">
      
      {/* 2026 Background Ambient Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-blue-600/20 blur-[120px] rounded-full" />
        <div className="absolute -bottom-[10%] -right-[10%] w-[40%] h-[40%] bg-emerald-600/10 blur-[120px] rounded-full" />
      </div>

      {/* Brand Section */}
      <div className="text-center mb-12 relative z-10">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-[2rem] mb-6 shadow-2xl shadow-blue-500/20">
          <span className="text-2xl font-black text-black tracking-tighter">FNB</span>
        </div>
        <h1 className="text-5xl font-black text-white tracking-tighter uppercase sm:text-6xl">
          FNB<span className="text-blue-500">.ma</span>
        </h1>
        <p className="text-gray-500 text-xs font-black uppercase tracking-[0.4em] mt-4 opacity-60">
          Smart Logistics Engine
        </p>
      </div>

      {/* Login Container */}
      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[3rem] p-8 sm:p-10 shadow-2xl">
          
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white tracking-tight">System Login</h2>
            <p className="text-gray-500 text-sm mt-1">Authorized personnel only.</p>
          </div>

          {error && (
            <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <AlertCircle className="text-red-500 shrink-0" size={18} />
              <p className="text-xs text-red-200 font-bold uppercase tracking-widest">{error}</p>
            </div>
          )}
          
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-4">Credentials</label>
              <div className="relative group">
                <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={18} />
                <input 
                  type="email" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required 
                  placeholder="name@fnb.ma"
                  className="w-full pl-14 pr-6 py-5 bg-white/[0.05] border border-white/5 rounded-[2rem] text-white text-sm font-medium focus:ring-2 focus:ring-blue-500/50 focus:bg-white/[0.08] transition-all outline-none placeholder:text-gray-600"
                />
              </div>

              <div className="relative group">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={18} />
                <input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required 
                  placeholder="••••••••"
                  className="w-full pl-14 pr-6 py-5 bg-white/[0.05] border border-white/5 rounded-[2rem] text-white text-sm font-medium focus:ring-2 focus:ring-blue-500/50 focus:bg-white/[0.08] transition-all outline-none placeholder:text-gray-600"
                />
              </div>
            </div>
            
            <button 
              type="submit" 
              disabled={isLoading}
              className="group w-full relative overflow-hidden bg-white text-black font-black uppercase tracking-[0.2em] text-xs py-5 rounded-[2rem] transition-all hover:shadow-[0_0_40px_rgba(255,255,255,0.2)] active:scale-[0.98] disabled:opacity-50"
            >
              <div className="relative z-10 flex justify-center items-center gap-3">
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    Securing Connection...
                  </>
                ) : (
                  <>
                    Initialize Portal
                  </>
                )}
              </div>
            </button>
          </form>
        </div>

        {/* Footer Meta */}
        <div className="mt-8 text-center">
          <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em]">
            © 2026 FNB.ma Infrastructure
          </p>
        </div>
      </div>
    </div>
  );
}