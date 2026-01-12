import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp, 
  deleteDoc, 
  doc, 
  setDoc,
  getDocs
} from 'firebase/firestore';
import { 
  ArrowRightLeft, 
  Wallet, 
  TrendingUp, 
  TrendingDown, 
  History, 
  Users, 
  LogOut, 
  Calculator,
  Landmark,
  PiggyBank,
  ArrowUpRight,
  ArrowDownLeft,
  PlusCircle,
  Trash2,
  RefreshCw,
  Edit2,
  Calendar,
  PieChart,
  Utensils,
  Zap,
  Shirt,
  Heart,
  Car,
  HelpCircle,
  Cross,
  Save,
  X,
  AlertTriangle,
  Info,
  Activity,
  User,
  RefreshCcw,
  Settings,
  Repeat,
  BarChart3,
  ArrowRight,
  Lock,
  ToggleLeft,
  ToggleRight,
  Target,
  Pencil,
  Scale,
  MessageCircle,
  Diamond,
  Smartphone
} from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyCaa72nfDTjHn-VDRe2-IqjnlbXAqJkEu4",
  authDomain: "miwallet-p2p.firebaseapp.com",
  projectId: "miwallet-p2p",
  storageBucket: "miwallet-p2p.firebasestorage.app",
  messagingSenderId: "1028160097126",
  appId: "1:1028160097126:web:170715208170f367e616a7"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// --- UTILIDAD DE SEGURIDAD ---
const safeNum = (val) => {
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
};

// --- COMPONENTE PRINCIPAL ---
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard');
  const [transactions, setTransactions] = useState([]);
  const [inventory, setInventory] = useState({ usdt: 0, ves: 0, avgPrice: 0 });
  const [goals, setGoals] = useState({ daily: 30, monthly: 600 });
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [editingInventory, setEditingInventory] = useState(false);
  const [tempInv, setTempInv] = useState({ usdt: '', ves: '', avgPrice: '' });

  const appId = 'p2p-v2-production';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser({ ...u, role: 'owner' });
      } else {
        if (user?.role !== 'guest') setUser(null); 
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role === 'guest') {
      setLoading(false);
      return; 
    }

    const safetyTimeout = setTimeout(() => setLoading(false), 5000);

    const qTx = query(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), orderBy('createdAt', 'desc'));
    const unsubTx = onSnapshot(qTx, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Tx Error", err));

    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory');
    const unsubInv = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setInventory({
          usdt: safeNum(data.usdt),
          ves: safeNum(data.ves),
          avgPrice: safeNum(data.avgPrice)
        });
      } else {
        setInventory({ usdt: 0, ves: 0, avgPrice: 0 });
      }
    }, (err) => console.error("Inv Error", err));

    const goalsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'goals');
    const unsubGoals = onSnapshot(goalsRef, (snap) => {
        if (snap.exists()) {
            setGoals(snap.data());
        }
    });

    const qLoans = query(collection(db, 'artifacts', appId, 'users', user.uid, 'loans'), orderBy('createdAt', 'desc'));
    const unsubLoans = onSnapshot(qLoans, (snap) => {
      setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Loans Error", err));

    setLoading(false);
    clearTimeout(safetyTimeout);

    return () => { unsubTx(); unsubInv(); unsubGoals(); unsubLoans(); clearTimeout(safetyTimeout); };
  }, [user]);

  const handleTrade = async (data) => {
    if (user.role === 'guest') {
        alert("🔒 Modo Invitado: No se pueden guardar operaciones.");
        return;
    }

    let newInv = { ...inventory };
    newInv.usdt = safeNum(newInv.usdt);
    newInv.ves = safeNum(newInv.ves);
    newInv.avgPrice = safeNum(newInv.avgPrice);

    if (data.type === 'buy') {
      const totalCostOld = newInv.usdt * newInv.avgPrice;
      const costNew = safeNum(data.totalBS); 
      const totalUSDT = newInv.usdt + safeNum(data.amountUSDT); 
      const totalCost = totalCostOld + costNew;
      newInv.avgPrice = totalUSDT > 0 ? totalCost / totalUSDT : 0;
      newInv.usdt = totalUSDT;
      newInv.ves -= costNew;

    } else if (data.type === 'sell') {
      const revenueVES = safeNum(data.totalBS); 
      const costOfSold = safeNum(data.amountUSDT) * newInv.avgPrice;
      const profitBS = revenueVES - costOfSold;
      data.profitUSDT = safeNum(data.rate) > 0 ? profitBS / safeNum(data.rate) : 0;
      newInv.usdt -= (safeNum(data.amountUSDT) + safeNum(data.feeUSDT));
      newInv.ves += revenueVES;
    
    } else if (data.type === 'swap') {
      const fee = safeNum(data.feeUSDT);
      const totalCost = newInv.usdt * newInv.avgPrice;
      const newTotalUSDT = newInv.usdt - fee;
      newInv.usdt = newTotalUSDT;
      newInv.avgPrice = newTotalUSDT > 0 ? totalCost / newTotalUSDT : 0;

    } else if (data.type === 'expense') {
      newInv.ves -= safeNum(data.amountBS);
      data.expenseUSDT = newInv.avgPrice > 0 ? safeNum(data.amountBS) / newInv.avgPrice : 0;

    } else if (data.type === 'capital') {
      if (data.currency === 'VES') {
        newInv.ves += safeNum(data.amount);
      } else if (data.currency === 'USDT') {
        const totalCostOld = newInv.usdt * newInv.avgPrice;
        const costNew = safeNum(data.amount) * safeNum(data.rate); 
        const totalUSDT = newInv.usdt + safeNum(data.amount);
        const totalCost = totalCostOld + costNew;
        newInv.avgPrice = totalUSDT > 0 ? totalCost / totalUSDT : 0;
        newInv.usdt = totalUSDT;
      }
    }

    data.avgPriceAtMoment = newInv.avgPrice;

    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), {
      ...data,
      createdAt: serverTimestamp()
    });

    const invRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory');
    await setDoc(invRef, newInv);
    setView('dashboard');
  };

  const handleDeleteTransaction = async (tx) => {
    if (user.role === 'guest') return;
    if(!confirm("¿Borrar esta transacción y revertir los saldos?")) return;
    
    let newInv = { ...inventory };
    newInv.usdt = safeNum(newInv.usdt);
    newInv.ves = safeNum(newInv.ves);
    newInv.avgPrice = safeNum(newInv.avgPrice);

    if (tx.type === 'buy') {
      const totalCost = safeNum(tx.totalBS) || (safeNum(tx.amountUSDT) * safeNum(tx.rate));
      const currentTotalVal = newInv.usdt * newInv.avgPrice;
      const prevTotalVal = currentTotalVal - totalCost;
      const prevUSDT = newInv.usdt - safeNum(tx.amountUSDT);
      newInv.usdt = prevUSDT;
      newInv.ves += totalCost;
      newInv.avgPrice = prevUSDT > 0 ? prevTotalVal / prevUSDT : 0;
    } else if (tx.type === 'sell') {
      const totalUSDTBack = safeNum(tx.amountUSDT) + safeNum(tx.feeUSDT);
      newInv.usdt += totalUSDTBack;
      newInv.ves -= (safeNum(tx.totalBS) || (safeNum(tx.amountUSDT) * safeNum(tx.rate)));
    } else if (tx.type === 'swap') {
      const fee = safeNum(tx.feeUSDT);
      const currentTotalVal = newInv.usdt * newInv.avgPrice;
      const prevUSDT = newInv.usdt + fee;
      newInv.usdt = prevUSDT;
      newInv.avgPrice = prevUSDT > 0 ? currentTotalVal / prevUSDT : 0;
    } else if (tx.type === 'expense') {
      newInv.ves += safeNum(tx.amountBS);
    } else if (tx.type === 'capital') {
       if (tx.currency === 'VES') newInv.ves -= safeNum(tx.amount);
       else if (tx.currency === 'USDT') {
         const costWas = safeNum(tx.amount) * safeNum(tx.rate);
         const currentTotalVal = newInv.usdt * newInv.avgPrice;
         const prevTotalVal = currentTotalVal - costWas;
         const prevUSDT = newInv.usdt - safeNum(tx.amount);
         newInv.usdt = prevUSDT;
         newInv.avgPrice = prevUSDT > 0 ? prevTotalVal / prevUSDT : 0;
       }
    }

    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', tx.id));
    const invRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory');
    await setDoc(invRef, newInv);
  };

  const handleUpdateGoals = async (newGoals) => {
      if (user.role === 'guest') {
          setGoals(newGoals); 
          return;
      }
      setGoals(newGoals);
      const goalsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'goals');
      await setDoc(goalsRef, newGoals);
  };

  const handleResetApp = async () => {
    if (user.role === 'guest') return;
    if (!confirm("⚠️ PELIGRO: ¿Borrar TODA la base de datos y reiniciar en CERO?")) return;
    setLoading(true);
    try {
        const invRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory');
        await setDoc(invRef, { usdt: 0, ves: 0, avgPrice: 0 });
        const txCollection = collection(db, 'artifacts', appId, 'users', user.uid, 'transactions');
        const txSnapshot = await getDocs(txCollection);
        const txDeletePromises = txSnapshot.docs.map(doc => deleteDoc(doc.ref));
        const loansCollection = collection(db, 'artifacts', appId, 'users', user.uid, 'loans');
        const loansSnapshot = await getDocs(loansCollection);
        const loansDeletePromises = loansSnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all([...txDeletePromises, ...loansDeletePromises]);
        setTransactions([]); setLoans([]); setInventory({ usdt: 0, ves: 0, avgPrice: 0 });
        setEditingInventory(false); setLoading(false);
        alert("Reset completo.");
    } catch (e) { console.error(e); setLoading(false); }
  };

  const saveInventoryManual = async () => {
    if (user.role === 'guest') return;
    const newInv = { usdt: safeNum(tempInv.usdt), ves: safeNum(tempInv.ves), avgPrice: safeNum(tempInv.avgPrice) };
    setInventory(newInv);
    const invRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory');
    await setDoc(invRef, newInv);
    setEditingInventory(false);
  };

  const startEditing = () => { setTempInv(inventory); setEditingInventory(true); };
  
  const handleUpdateAvg = async (newVal) => {
    if (user.role === 'guest') return;
    const price = safeNum(newVal);
    if(price > 0) {
      const newInv = { ...inventory, avgPrice: price };
      setInventory(newInv);
      const invRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory');
      await setDoc(invRef, newInv);
    }
  };

  const handleGuestLogin = () => {
      setLoading(true);
      setTimeout(() => { setUser({ uid: 'guest', role: 'guest', displayName: 'Invitado' }); setView('calculator'); setLoading(false); }, 800);
  };

  const handleLogout = () => { if (user.role === 'guest') setUser(null); else signOut(auth); setView('dashboard'); };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center relative overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-64 h-64 bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-3xl shadow-2xl relative z-10 w-full max-w-sm">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/20">
                <Activity size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Control P2P</h1>
            <div className="flex justify-center mb-6"><span className="bg-blue-500/10 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-500/20 uppercase tracking-wider">Beta 4.2</span></div>
            <div className="space-y-3">
                <button onClick={() => signInWithPopup(auth, provider)} className="w-full bg-white text-slate-900 py-3 rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-slate-200 transition-all shadow-lg hover:-translate-y-0.5">
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="G" /> Iniciar con Google
                </button>
                <div className="relative py-2"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-700"></div></div><div className="relative flex justify-center text-xs"><span className="px-2 bg-slate-900/50 text-slate-500">o prueba el simulador</span></div></div>
                <button onClick={handleGuestLogin} className="w-full bg-slate-800 text-slate-300 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-slate-700 hover:text-white transition-all border border-slate-700"><User size={18} /> Entrar como Invitado</button>
            </div>
        </div>
      </div>
    );
  }

  if (loading) return <div className="h-screen bg-slate-950 flex items-center justify-center text-emerald-500 animate-pulse">Cargando Sistema...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24 max-w-md mx-auto relative">
      {view !== 'calculator' && (
        <div className="bg-gradient-to-b from-slate-900 to-slate-950 p-6 border-b border-slate-800">
            <div className="flex justify-between items-center mb-4">
            <div>
                <h2 className="text-xs text-slate-400 font-semibold tracking-wider uppercase flex items-center gap-2">
                    {user.role === 'guest' ? <><User size={12}/> Modo Invitado</> : 'Patrimonio Neto'}
                </h2>
                {user.role === 'guest' ? (
                    <p className="text-xl font-bold text-slate-500 mt-1">Simulación</p>
                ) : (
                    <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-white">$ {(safeNum(inventory.usdt) + (safeNum(inventory.ves) / (safeNum(inventory.avgPrice) || 1))).toFixed(2)}</span>
                    <span className="text-xs text-slate-500">USDT (Est.)</span>
                    </div>
                )}
            </div>
            <div className="flex gap-2">
                {user.role !== 'guest' && (
                    <button onClick={editingInventory ? () => setEditingInventory(false) : startEditing} className={`p-2 rounded-lg transition-colors ${editingInventory ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                        {editingInventory ? <X size={16}/> : <Edit2 size={16}/>}
                    </button>
                )}
                <button onClick={handleLogout} className="bg-slate-800 p-2 rounded-lg text-slate-400 hover:text-white"><LogOut size={16}/></button>
            </div>
            </div>

            {editingInventory && user.role !== 'guest' ? (
            <div className="bg-slate-800/50 p-4 rounded-xl border border-blue-500/30 mb-4 animate-in fade-in zoom-in-95">
                <p className="text-xs text-blue-400 font-bold mb-3 uppercase text-center flex items-center justify-center gap-2"><Edit2 size={12}/> Calibración Manual</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className="text-[10px] text-slate-400">Saldo USDT</label><input type="number" value={tempInv.usdt} onChange={e=>setTempInv({...tempInv, usdt: e.target.value})} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white text-sm"/></div>
                <div><label className="text-[10px] text-slate-400">Promedio</label><input type="number" value={tempInv.avgPrice} onChange={e=>setTempInv({...tempInv, avgPrice: e.target.value})} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white text-sm"/></div>
                <div className="col-span-2"><label className="text-[10px] text-slate-400">Liquidez VES</label><input type="number" value={tempInv.ves} onChange={e=>setTempInv({...tempInv, ves: e.target.value})} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white text-sm"/></div>
                </div>
                <div className="space-y-3">
                <button onClick={saveInventoryManual} className="w-full bg-blue-600 py-2 rounded-lg text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-blue-500"><Save size={14}/> Guardar Cambios</button>
                <button onClick={handleResetApp} className="w-full bg-red-500/10 border border-red-500/50 py-2 rounded-lg text-red-400 font-bold text-xs flex items-center justify-center gap-2 hover:bg-red-500 hover:text-white transition-colors"><AlertTriangle size={14}/> Restablecer Fábrica</button>
                </div>
            </div>
            ) : user.role !== 'guest' ? (
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800/50">
                <div className="flex items-center gap-2 mb-1 justify-between">
                    <div className="flex items-center gap-2"><Wallet size={14} className="text-emerald-400"/><span className="text-xs text-slate-400">Inventario USDT</span></div>
                    <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1 rounded">Avg: {safeNum(inventory.avgPrice).toFixed(2)}</span>
                </div>
                <p className="text-lg font-mono font-bold text-white">{safeNum(inventory.usdt).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</p>
                </div>
                <div className="bg-slate-900 p-3 rounded-xl border border-slate-800/50">
                <div className="flex items-center gap-2 mb-1"><Landmark size={14} className="text-blue-400"/><span className="text-xs text-slate-400">Liquidez VES</span></div>
                <p className="text-lg font-mono font-bold text-white">{safeNum(inventory.ves).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                </div>
            </div>
            ) : null}
        </div>
      )}

      <div className={view === 'calculator' ? 'p-0' : 'p-4'}>
        {view === 'dashboard' && <Dashboard transactions={transactions} inventory={inventory} onDelete={handleDeleteTransaction} isGuest={user.role === 'guest'} />}
        {view === 'trade' && <TradeForm onTrade={handleTrade} onCancel={() => setView('dashboard')} avgPrice={inventory.avgPrice} isGuest={user.role === 'guest'} />}
        {view === 'stats' && <StatsModule transactions={transactions} inventory={inventory} isGuest={user.role === 'guest'} goals={goals} onSaveGoals={handleUpdateGoals} />}
        {view === 'loans' && <LoansModule loans={loans} user={user} db={db} appId={appId} isGuest={user.role === 'guest'} />}
        {view === 'calculator' && <SimulatorModule />}
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur border-t border-slate-800 flex justify-around p-3 max-w-md mx-auto z-50">
        <NavButton icon={<TrendingUp/>} label="Operar" active={view === 'trade'} onClick={() => setView('trade')} />
        <NavButton icon={<History/>} label="Historial" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
        <NavButton icon={<PieChart/>} label="Stats" active={view === 'stats'} onClick={() => setView('stats')} />
        <NavButton icon={<Users/>} label="Deudas" active={view === 'loans'} onClick={() => setView('loans')} />
        <NavButton icon={<Calculator/>} label="Simulador" active={view === 'calculator'} onClick={() => setView('calculator')} highlight={true} />
      </div>
    </div>
  );
}

function StatsModule({ transactions, inventory, isGuest, goals, onSaveGoals }) {
  const [range, setRange] = useState('day'); 
  const [editingGoals, setEditingGoals] = useState(false);
  const [tempGoals, setTempGoals] = useState(goals);

  const handleSaveGoals = () => {
      onSaveGoals(tempGoals);
      setEditingGoals(false);
  };

  if (isGuest) {
      return (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center p-6 opacity-50">
              <BarChart3 size={48} className="text-slate-600 mb-4"/>
              <h3 className="text-xl font-bold text-slate-400">Estadísticas Desactivadas</h3>
              <p className="text-sm text-slate-600 mt-2">Inicia sesión con Google para ver tus métricas.</p>
          </div>
      );
  }

  const metrics = useMemo(() => {
    const now = new Date();
    const startTime = new Date();
    let targetAmount = 0;
    let label = 'Meta';

    if (range === 'day') {
        startTime.setHours(0,0,0,0);
        targetAmount = goals.daily;
        label = 'Meta Diaria';
    }
    if (range === 'week') {
      const day = now.getDay() || 7; 
      if (day !== 1) startTime.setHours(-24 * (day - 1)); 
      startTime.setHours(0,0,0,0);
      targetAmount = goals.daily * 7;
      label = 'Meta Semanal';
    }
    if (range === 'month') {
        startTime.setDate(1); 
        targetAmount = goals.monthly;
        label = 'Meta Mensual';
    }
    if (range === 'all') {
        startTime.setFullYear(2000); 
        targetAmount = goals.monthly * 12; // Aprox
        label = 'Meta Anual';
    }

    const filteredTxs = transactions.filter(t => {
      const time = t.createdAt ? t.createdAt.seconds * 1000 : Date.now();
      return time > startTime.getTime();
    });

    const totalVolumeUSDT = filteredTxs.reduce((acc, t) => {
        if (t.type === 'buy' || t.type === 'sell' || t.type === 'swap') {
            return acc + safeNum(t.amountUSDT);
        }
        return acc;
    }, 0);

    let startUSDT = safeNum(inventory.usdt);
    let startVES = safeNum(inventory.ves);
    let totalFeesPaid = 0;
    
    filteredTxs.forEach(tx => {
       if(tx.type === 'buy') {
          startUSDT -= safeNum(tx.amountUSDT);
          startVES += safeNum(tx.totalBS);
          if(tx.feeBS && tx.rate > 0) totalFeesPaid += (tx.feeBS / tx.rate);
       } else if (tx.type === 'sell') {
          startUSDT += (safeNum(tx.amountUSDT) + safeNum(tx.feeUSDT));
          startVES -= safeNum(tx.totalBS);
          if(tx.feeUSDT) totalFeesPaid += safeNum(tx.feeUSDT);
       } else if (tx.type === 'swap') {
          startUSDT += safeNum(tx.feeUSDT);
          if(tx.feeUSDT) totalFeesPaid += safeNum(tx.feeUSDT);
       } else if (tx.type === 'expense') {
          startVES += safeNum(tx.amountBS);
       } else if (tx.type === 'capital') {
          if(tx.currency === 'VES') startVES -= safeNum(tx.amount);
          else startUSDT -= safeNum(tx.amount);
       }
    });

    const valuationRate = safeNum(inventory.avgPrice) || 1;
    const currentEquity = safeNum(inventory.usdt) + (safeNum(inventory.ves) / valuationRate);
    const startEquity = startUSDT + (startVES / valuationRate);
    const deposits = filteredTxs.filter(t => t.type === 'capital').reduce((acc, t) => {
        const val = t.currency === 'USDT' ? safeNum(t.amount) : (safeNum(t.amount) / valuationRate);
        return acc + val;
    }, 0);

    const realGrowthUSDT = (currentEquity - startEquity) - deposits;
    
    const ROV = totalVolumeUSDT > 0 ? (realGrowthUSDT / totalVolumeUSDT) * 100 : 0;
    const avgTicket = filteredTxs.length > 0 ? totalVolumeUSDT / filteredTxs.length : 0;
    const progressPercent = targetAmount > 0 ? (realGrowthUSDT / targetAmount) * 100 : 0;

    const totalExpensesUSDT = filteredTxs.filter(t => t.type === 'expense').reduce((acc, t) => {
        return acc + (t.expenseUSDT || (safeNum(t.amountBS) / valuationRate));
    }, 0);

    const byCategory = filteredTxs.filter(t => t.type === 'expense').reduce((acc, curr) => {
      const cat = curr.category || 'Otros';
      const val = curr.expenseUSDT || (safeNum(curr.amountBS) / valuationRate);
      acc[cat] = (acc[cat] || 0) + val;
      return acc;
    }, {});

    return { 
        realGrowthUSDT, 
        totalExpensesUSDT, 
        byCategory, 
        totalVolumeUSDT, 
        totalFeesPaid,
        ROV,
        avgTicket,
        targetAmount,
        progressPercent,
        label,
        opsCount: filteredTxs.length
    };
  }, [transactions, inventory, range, goals]);

  if (editingGoals) {
      return (
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 animate-in fade-in zoom-in-95">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Target className="text-blue-500"/> Definir Objetivos</h3>
              <div className="space-y-4">
                  <div>
                      <label className="text-xs text-slate-400 font-bold uppercase mb-1 block">Meta Diaria (USDT)</label>
                      <input type="number" value={tempGoals.daily} onChange={e=>setTempGoals({...tempGoals, daily: parseFloat(e.target.value)})} className="w-full bg-slate-950 p-3 rounded-xl border border-slate-700 text-white font-bold text-lg"/>
                  </div>
                  <div>
                      <label className="text-xs text-slate-400 font-bold uppercase mb-1 block">Meta Mensual (USDT)</label>
                      <input type="number" value={tempGoals.monthly} onChange={e=>setTempGoals({...tempGoals, monthly: parseFloat(e.target.value)})} className="w-full bg-slate-950 p-3 rounded-xl border border-slate-700 text-white font-bold text-lg"/>
                  </div>
                  <div className="flex gap-3 pt-2">
                      <button onClick={()=>setEditingGoals(false)} className="flex-1 py-3 bg-slate-800 rounded-lg text-slate-400 font-bold text-sm">Cancelar</button>
                      <button onClick={handleSaveGoals} className="flex-1 py-3 bg-blue-600 rounded-lg text-white font-bold text-sm hover:bg-blue-500">Guardar Metas</button>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="space-y-6">
      <div className="flex bg-slate-800 p-1 rounded-lg justify-center">
         {['day', 'week', 'month', 'all'].map(r => (
             <button key={r} onClick={() => setRange(r)} className={`flex-1 py-1 text-xs font-bold rounded capitalize transition-colors ${range === r ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>
               {r === 'day' ? 'Hoy' : r === 'week' ? 'Semana' : r === 'month' ? 'Mes' : 'Todo'}
             </button>
         ))}
      </div>

      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 relative overflow-hidden">
         <div className="flex justify-between items-start mb-2 relative z-10">
             <div>
                 <p className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1"><Target size={12}/> {metrics.label}</p>
                 <h2 className="text-2xl font-bold text-white mt-1">
                     ${metrics.realGrowthUSDT.toFixed(2)} <span className="text-sm font-normal text-slate-500">/ ${metrics.targetAmount}</span>
                 </h2>
             </div>
             <button onClick={()=>setEditingGoals(true)} className="p-2 bg-slate-800 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition-all">
                 <Pencil size={14}/>
             </button>
         </div>
         
         <div className="relative h-3 bg-slate-950 rounded-full overflow-hidden mt-2 z-10 border border-slate-800">
             <div 
                className={`h-full transition-all duration-1000 ${metrics.progressPercent >= 100 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : metrics.progressPercent > 40 ? 'bg-blue-500' : 'bg-orange-500'}`} 
                style={{ width: `${Math.min(metrics.progressPercent, 100)}%` }}
             ></div>
         </div>
         
         <p className={`text-xs mt-2 font-bold text-right z-10 relative ${metrics.progressPercent >= 100 ? 'text-emerald-400' : 'text-slate-400'}`}>
             {metrics.progressPercent.toFixed(1)}% Completado {metrics.progressPercent >= 100 && '🎉'}
         </p>
         {metrics.progressPercent >= 100 && <div className="absolute inset-0 bg-emerald-500/5 z-0"></div>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 text-center">
            <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Volumen</p>
            <h2 className="text-xl font-black text-blue-400">
                ${metrics.totalVolumeUSDT.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </h2>
        </div>
        <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 text-center">
            <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Ticket Prom.</p>
            <h2 className="text-xl font-black text-white">
                ${metrics.avgTicket.toFixed(0)}
            </h2>
        </div>
      </div>

      <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex justify-around divide-x divide-slate-800">
          <div className="text-center px-2 w-1/2">
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-1 flex items-center justify-center gap-1"><Scale size={10}/> ROV Real</p>
              <p className={`text-lg font-bold ${metrics.ROV > 0.5 ? 'text-emerald-400' : 'text-yellow-400'}`}>{metrics.ROV.toFixed(2)}%</p>
          </div>
          <div className="text-center px-2 w-1/2">
              <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Fees Pagados</p>
              <p className="text-lg font-bold text-red-400">-${metrics.totalFeesPaid.toFixed(2)}</p>
          </div>
      </div>

      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2"><PieChart size={16}/> Gastos</h3>
            <span className="text-xs font-mono text-red-400 font-bold">Total: ${metrics.totalExpensesUSDT.toFixed(2)}</span>
        </div>
        
        <div className="space-y-4">
          {Object.keys(metrics.byCategory).length === 0 && <p className="text-center text-xs text-slate-600">Sin gastos registrados.</p>}
          {['Comida', 'Servicios', 'Ropa', 'Diezmo', 'Transporte', 'Salud', 'Otros'].map(catId => {
            const amount = metrics.byCategory[catId] || 0;
            const percent = metrics.totalExpensesUSDT > 0 ? (amount / metrics.totalExpensesUSDT) * 100 : 0;
            if (amount === 0) return null;
            
            let color = 'text-slate-400'; let bar = 'bg-slate-500';
            if(catId==='Comida') { color='text-orange-400'; bar='bg-orange-500'; }
            if(catId==='Servicios') { color='text-yellow-400'; bar='bg-yellow-500'; }
            if(catId==='Ropa') { color='text-pink-400'; bar='bg-pink-500'; }
            if(catId==='Diezmo') { color='text-red-400'; bar='bg-red-500'; }
            if(catId==='Transporte') { color='text-blue-400'; bar='bg-blue-500'; }
            if(catId==='Salud') { color='text-emerald-400'; bar='bg-emerald-500'; }

            return (
              <div key={catId}>
                <div className="flex justify-between text-xs mb-1">
                  <span className={`flex items-center gap-2 font-bold ${color}`}>
                    {catId}
                  </span>
                  <span className="text-slate-300">${amount.toFixed(2)}</span>
                </div>
                <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
                  <div className={`h-full ${bar}`} style={{ width: `${percent}%` }}></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Dashboard({ transactions, inventory, onDelete, isGuest }) {
  if (isGuest) return <div className="flex flex-col items-center justify-center h-[60vh] text-center p-6 opacity-50"><Lock size={48} className="text-slate-600 mb-4"/><h3 className="text-xl font-bold text-slate-400">Acceso Limitado</h3></div>;
  
  const todayMetrics = useMemo(() => {
    const startOfDay = new Date(); startOfDay.setHours(0,0,0,0); const startTime = startOfDay.getTime();
    const todays = transactions.filter(t => (t.createdAt ? t.createdAt.seconds * 1000 : Date.now()) > startTime);
    let startUSDT = safeNum(inventory.usdt); let startVES = safeNum(inventory.ves);
    const soldBS = todays.filter(t => t.type === 'sell').reduce((acc, t) => acc + safeNum(t.totalBS), 0);
    const spentBS = todays.filter(t => t.type === 'expense').reduce((acc, t) => acc + safeNum(t.amountBS), 0);
    todays.forEach(tx => {
       if(tx.type === 'buy') { startUSDT -= safeNum(tx.amountUSDT); startVES += safeNum(tx.totalBS); }
       else if (tx.type === 'sell') { startUSDT += (safeNum(tx.amountUSDT) + safeNum(tx.feeUSDT)); startVES -= safeNum(tx.totalBS); }
       else if (tx.type === 'swap') { startUSDT += safeNum(tx.feeUSDT); }
       else if (tx.type === 'expense') { startVES += safeNum(tx.amountBS); }
       else if (tx.type === 'capital') { if(tx.currency === 'VES') startVES -= safeNum(tx.amount); else startUSDT -= safeNum(tx.amount); }
    });
    const valuationRate = safeNum(inventory.avgPrice) || 1;
    const currentEquityUSDT = safeNum(inventory.usdt) + (safeNum(inventory.ves) / valuationRate);
    const startEquityUSDT = startUSDT + (startVES / valuationRate);
    const deposits = todays.filter(t => t.type === 'capital').reduce((acc, t) => { const val = t.currency === 'USDT' ? safeNum(t.amount) : (safeNum(t.amount) / valuationRate); return acc + val; }, 0);
    const realGrowth = (currentEquityUSDT - startEquityUSDT) - deposits;
    return { count: todays.length, realGrowth, soldBS, spentBS };
  }, [transactions, inventory]);

  return (
    <div className="space-y-4 pb-20">
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
        <div><p className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1"><Calendar size={10}/> Resumen Hoy</p><p className="text-xs text-slate-500 mt-1">Ventas: <span className="text-white font-mono">{todayMetrics.soldBS.toLocaleString()} Bs</span></p></div>
        <div className="text-right"><p className="text-[10px] text-slate-400 uppercase font-bold">Crecimiento Real</p><p className={`text-xl font-bold ${todayMetrics.realGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{todayMetrics.realGrowth >= 0 ? '+' : ''}{todayMetrics.realGrowth.toFixed(2)} USDT</p></div>
      </div>
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Historial</h3>
      {transactions.map(tx => (
          <div key={tx.id} className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex justify-between items-center group relative">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${
                tx.type === 'sell' ? 'bg-red-500/20 text-red-400' : 
                tx.type === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 
                tx.type === 'capital' ? 'bg-purple-500/20 text-purple-400' :
                tx.type === 'swap' ? 'bg-orange-500/20 text-orange-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {tx.type === 'sell' ? <ArrowUpRight size={18}/> : 
                 tx.type === 'buy' ? <ArrowDownLeft size={18}/> : 
                 tx.type === 'capital' ? <PlusCircle size={18}/> :
                 tx.type === 'swap' ? <RefreshCw size={18}/> :
                 <TrendingDown size={18}/>}
              </div>
              <div>
                <p className="font-bold text-sm text-slate-200">
                  {tx.type === 'expense' && tx.category ? tx.category :
                   tx.type === 'sell' ? 'Venta USDT' : 
                   tx.type === 'buy' ? 'Compra USDT' : 
                   tx.type === 'capital' ? 'Fondeo' :
                   tx.type === 'swap' ? 'Swap / Transfer' : 'Gasto'}
                </p>
                <div className="flex flex-col">
                  <p className="text-[10px] text-slate-500">
                    {tx.type === 'swap' ? `Fee: ${safeNum(tx.feeUSDT)} USDT` :
                     tx.type === 'capital' ? `${tx.currency}` :
                     tx.type === 'expense' ? (tx.description || 'Sin nota') :
                     `Tasa: ${safeNum(tx.rate)}`} 
                  </p>
                  {tx.type === 'sell' && tx.avgPriceAtMoment && (
                    <p className="text-[9px] text-slate-600 flex items-center gap-1">
                      <Info size={8}/> Base: {(tx.avgPriceAtMoment || 0).toFixed(2)}
                    </p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className={`font-mono font-bold ${tx.type === 'sell' ? 'text-emerald-400' : 'text-slate-200'}`}>
                  {tx.type === 'expense' ? `-Bs ${safeNum(tx.amountBS).toLocaleString()}` : 
                   tx.type === 'capital' ? (tx.currency === 'VES' ? `+Bs ${safeNum(tx.amount).toLocaleString()}` : `+$${safeNum(tx.amount)}`) :
                   tx.type === 'swap' ? `-$${safeNum(tx.feeUSDT)}` :
                   `$${safeNum(tx.amountUSDT).toFixed(2)}`}
                </p>
                {tx.type === 'sell' && (
                  <p className={`text-[10px] ${safeNum(tx.profitUSDT) > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    +{safeNum(tx.profitUSDT).toFixed(2)} (Est.)
                  </p>
                )}
              </div>
              <button onClick={() => onDelete(tx)} className="p-2 text-slate-700 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
            </div>
          </div>
      ))}
    </div>
  );
}

function TradeForm({ onTrade, onCancel, isGuest }) {
  const [mode, setMode] = useState('sell');
  const [exchange, setExchange] = useState('Binance');
  const [inputVal, setInputVal] = useState('');
  const [rate, setRate] = useState('');
  const [bankFee, setBankFee] = useState(false);
  const [exchangeFeeType, setExchangeFeeType] = useState('none');
  const [swapFee, setSwapFee] = useState('');
  const [capCurrency, setCapCurrency] = useState('VES');
  const [expenseCategory, setExpenseCategory] = useState('Comida');
  const [expenseNote, setExpenseNote] = useState('');

  const valInput = parseFloat(inputVal) || 0;
  const valRate = parseFloat(rate) || 0;

  let calcUSDT = 0;
  let calcBS = 0;
  let feeUSDT_Calculated = 0;
  let feeBS_Calculated = 0;

  if (mode === 'buy') {
    calcUSDT = valInput;
    calcBS = valInput * valRate;
    if (bankFee) {
        feeBS_Calculated = calcBS * 0.003;
        calcBS += feeBS_Calculated;
    }
  } else if (mode === 'sell') {
    calcBS = valInput;
    calcUSDT = valRate > 0 ? valInput / valRate : 0;
    if (exchangeFeeType === 'std') feeUSDT_Calculated = 0.06;
    else if (exchangeFeeType === 'merchant') feeUSDT_Calculated = calcUSDT * 0.002;
    else if (exchangeFeeType === 'airtm') feeUSDT_Calculated = calcUSDT * 0.0071;
  }

  const handleSubmit = () => {
    if (mode === 'expense') {
      onTrade({ type: 'expense', amountBS: valInput, category: expenseCategory, description: expenseNote });
      return;
    }
    if (mode === 'swap') {
      onTrade({ type: 'swap', amountUSDT: valInput, feeUSDT: parseFloat(swapFee) || 0, description: 'Swap / Transferencia' });
      return;
    }
    if (mode === 'capital') {
      onTrade({ type: 'capital', amount: valInput, currency: capCurrency, rate: capCurrency === 'USDT' ? valRate : 0, exchange: 'Fondeo' });
      return;
    }
    onTrade({ type: mode, amountUSDT: calcUSDT, totalBS: calcBS, rate: valRate, feeBS: feeBS_Calculated, feeUSDT: feeUSDT_Calculated, exchange });
  };

  const categories = [
    { id: 'Comida', icon: <Utensils size={16}/> },
    { id: 'Servicios', icon: <Zap size={16}/> },
    { id: 'Ropa', icon: <Shirt size={16}/> },
    { id: 'Diezmo', icon: <Heart size={16}/> },
    { id: 'Transporte', icon: <Car size={16}/> },
    { id: 'Salud', icon: <Cross size={16}/> },
    { id: 'Otros', icon: <HelpCircle size={16}/> },
  ];

  return (
    <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 animate-in fade-in slide-in-from-bottom-8">
      {isGuest && <div className="bg-yellow-500/10 text-yellow-500 text-xs p-2 rounded mb-4 text-center border border-yellow-500/20">Modo Invitado: Las operaciones no se guardarán.</div>}
      
      <div className="flex bg-slate-950 p-1 rounded-lg mb-6 overflow-x-auto no-scrollbar">
        {['buy', 'sell', 'swap', 'expense', 'capital'].map(m => (
          <button key={m} onClick={() => setMode(m)} className={`flex-1 py-2 px-3 text-[10px] font-bold uppercase rounded-md transition-colors whitespace-nowrap ${mode === m ? (m === 'buy' ? 'bg-emerald-600 text-white' : m === 'sell' ? 'bg-red-600 text-white' : m === 'swap' ? 'bg-orange-600 text-white' : m === 'capital' ? 'bg-purple-600 text-white' : 'bg-red-500 text-white') : 'text-slate-500 hover:bg-slate-800'}`}>
            {m === 'buy' ? 'Comprar' : m === 'sell' ? 'Vender' : m === 'swap' ? 'Swap' : m === 'capital' ? 'Fondeo' : 'Gasto'}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[10px] text-slate-400 uppercase font-bold">
            {mode === 'buy' ? 'Cantidad a Comprar (USDT)' :
             mode === 'sell' ? 'Total Bs Recibidos' :
             mode === 'swap' ? 'Monto a Mover (USDT)' :
             mode === 'expense' ? 'Monto Gasto (Bs)' :
             `Monto a Ingresar (${capCurrency})`}
          </label>
          <input type="number" step="0.00000001" value={inputVal} onChange={e => setInputVal(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none focus:border-blue-500 font-mono text-lg" placeholder="0.00"/>
        </div>

        {mode === 'expense' && (
          <div className="space-y-3">
            <label className="text-[10px] text-slate-400 uppercase font-bold">Categoría</label>
            <div className="grid grid-cols-3 gap-2">
               {categories.map(cat => (
                 <button key={cat.id} onClick={() => setExpenseCategory(cat.id)} className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-bold transition-all ${expenseCategory === cat.id ? 'bg-red-600 border-red-500 text-white' : 'bg-slate-950 border-slate-700 text-slate-500'}`}>
                   {cat.icon} {cat.id}
                 </button>
               ))}
            </div>
            <div>
              <label className="text-[10px] text-slate-400 uppercase font-bold">Nota (Opcional)</label>
              <input type="text" value={expenseNote} onChange={e => setExpenseNote(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none" placeholder="Ej: Pizza"/>
            </div>
          </div>
        )}

        {mode !== 'expense' && mode !== 'swap' && (
          <div>
            {mode === 'capital' && capCurrency === 'VES' ? null : (
              <>
                <label className="text-[10px] text-slate-400 uppercase font-bold">{mode === 'capital' ? 'Costo Base (Opcional)' : 'Tasa de Cambio'}</label>
                <input type="number" step="0.000001" value={rate} onChange={e => setRate(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none focus:border-blue-500" placeholder="0.00"/>
              </>
            )}
          </div>
        )}

        {mode === 'swap' && (
           <div>
             <label className="text-[10px] text-slate-400 uppercase font-bold">Comisión Pagada (USDT)</label>
             <input type="number" value={swapFee} onChange={e => setSwapFee(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none focus:border-orange-500" placeholder="Ej: 1.00"/>
           </div>
        )}

        {mode === 'capital' && (
          <div className="flex gap-2">
            <button onClick={() => setCapCurrency('VES')} className={`flex-1 py-2 text-xs border rounded ${capCurrency === 'VES' ? 'border-blue-500 text-blue-400 bg-blue-500/10' : 'border-slate-700 text-slate-500'}`}>Bolívares</button>
            <button onClick={() => setCapCurrency('USDT')} className={`flex-1 py-2 text-xs border rounded ${capCurrency === 'USDT' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' : 'border-slate-700 text-slate-500'}`}>USDT</button>
          </div>
        )}

        {(mode === 'buy' || mode === 'sell') && (
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
             <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
                {['Binance', 'BingX', 'Bitget', 'OKX', 'CoinEx', 'Telegram'].map(ex => (
                  <button key={ex} onClick={() => setExchange(ex)} className={`px-2 py-1 rounded border text-[10px] ${exchange === ex ? 'bg-indigo-600 border-indigo-500 text-white' : 'border-slate-700 text-slate-500'}`}>{ex}</button>
                ))}
             </div>
             {mode === 'buy' && (
               <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                 <input type="checkbox" checked={bankFee} onChange={e => setBankFee(e.target.checked)} className="accent-blue-500"/>
                 Comisión Bancaria (0.3%)
               </label>
             )}
             {mode === 'sell' && (
               <div className="flex flex-col gap-2">
                 <span className="text-[10px] text-slate-400 uppercase">Comisión Exchange</span>
                 <select value={exchangeFeeType} onChange={(e) => setExchangeFeeType(e.target.value)} className="bg-slate-900 text-white text-xs p-2 rounded border border-slate-700 outline-none">
                   <option value="none">Sin Comisión (0)</option>
                   <option value="std">Standard (0.06 USDT)</option>
                   <option value="merchant">Merchant (0.2%)</option>
                   <option value="airtm">AirTM (0.71%)</option>
                 </select>
               </div>
             )}
          </div>
        )}
      </div>

      <div className="flex gap-3 mt-6">
        <button onClick={onCancel} className="flex-1 py-3 bg-slate-800 rounded-lg text-slate-400 text-sm font-bold hover:bg-slate-700">Cancelar</button>
        <button onClick={handleSubmit} className={`flex-1 py-3 rounded-lg text-white font-bold text-sm shadow-lg ${mode === 'buy' ? 'bg-emerald-600 hover:bg-emerald-500' : mode === 'sell' ? 'bg-red-600 hover:bg-red-500' : mode === 'swap' ? 'bg-orange-600 hover:bg-orange-500' : mode === 'capital' ? 'bg-purple-600 hover:bg-purple-500' : 'bg-red-600 hover:bg-red-500'}`}>CONFIRMAR</button>
      </div>
    </div>
  );
}

function SimulatorModule() {
  const [tab, setTab] = useState('cycles'); 
  return (
    <div className="pb-20">
      <div className="bg-slate-900 p-2 sticky top-0 z-50 border-b border-slate-800">
        <div className="flex bg-slate-950 p-1 rounded-xl overflow-x-auto no-scrollbar gap-1">
            <button onClick={() => setTab('cycles')} className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${tab === 'cycles' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>Ciclos Pro</button>
            <button onClick={() => setTab('telegram')} className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${tab === 'telegram' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>Telegram P2P</button>
            <button onClick={() => setTab('simple')} className={`flex-1 py-2 px-3 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${tab === 'simple' ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>Brecha Rápida</button>
        </div>
      </div>
      {tab === 'cycles' && <CycleSimulator />}
      {tab === 'telegram' && <TelegramArbitrageCalc />}
      {tab === 'simple' && <SimpleGapCalculator />}
    </div>
  );
}

function TelegramArbitrageCalc() {
  const [adPrice, setAdPrice] = useState(900);
  const [tonUsdt, setTonUsdt] = useState(1.72);
  const [sellUsdt, setSellUsdt] = useState(533);

  const teleFee = 0.009; 
  const bankFee = 0.003; 

  // 1. Mismo Banco: Pagas Precio Anuncio, Recibes (1-0.9%) TON
  const effectivePriceBank = adPrice / (1 - teleFee);
  const impliedUsdtBank = effectivePriceBank / tonUsdt;
  const gapBank = impliedUsdtBank > 0 ? ((sellUsdt - impliedUsdtBank) / impliedUsdtBank) * 100 : 0;

  // 2. PagoMóvil: Pagas (Precio Anuncio + 0.3%), Recibes (1-0.9%) TON
  const effectivePricePM = (adPrice * (1 + bankFee)) / (1 - teleFee);
  const impliedUsdtPM = effectivePricePM / tonUsdt;
  const gapPM = impliedUsdtPM > 0 ? ((sellUsdt - impliedUsdtPM) / impliedUsdtPM) * 100 : 0;

  return (
    <div className="p-4 space-y-4">
       <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
           <h3 className="text-xs text-blue-400 font-bold uppercase mb-4 flex items-center gap-2"><MessageCircle size={14}/> Configuración Telegram</h3>
           <div className="space-y-4">
               <div><label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Precio Anuncio (Bs/TON)</label><input type="number" value={adPrice} onChange={e=>setAdPrice(parseFloat(e.target.value)||0)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-bold outline-none"/></div>
               <div className="grid grid-cols-2 gap-3">
                   <div><label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Tasa TON/USDT</label><input type="number" value={tonUsdt} onChange={e=>setTonUsdt(parseFloat(e.target.value)||0)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-bold outline-none"/></div>
                   <div><label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Venta USDT (Bs)</label><input type="number" value={sellUsdt} onChange={e=>setSellUsdt(parseFloat(e.target.value)||0)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-bold outline-none"/></div>
               </div>
           </div>
       </div>

       <div className="grid grid-cols-2 gap-3">
           {/* Card Banco */}
           <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
               <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Mismo Banco</p>
               <h2 className={`text-2xl font-bold ${gapBank > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{gapBank > 0 ? '+' : ''}{gapBank.toFixed(2)}%</h2>
               <div className="mt-2 pt-2 border-t border-slate-800">
                   <p className="text-[10px] text-slate-500">Costo Implícito</p>
                   <p className="text-sm font-mono text-white">{impliedUsdtBank.toFixed(2)} Bs/USDT</p>
               </div>
           </div>

           {/* Card PagoMóvil */}
           <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 relative overflow-hidden">
               <div className="absolute top-0 left-0 w-full h-1 bg-purple-500"></div>
               <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Pago Móvil</p>
               <h2 className={`text-2xl font-bold ${gapPM > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{gapPM > 0 ? '+' : ''}{gapPM.toFixed(2)}%</h2>
               <div className="mt-2 pt-2 border-t border-slate-800">
                   <p className="text-[10px] text-slate-500">Costo Implícito</p>
                   <p className="text-sm font-mono text-white">{impliedUsdtPM.toFixed(2)} Bs/USDT</p>
               </div>
           </div>
       </div>

       <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 text-xs text-slate-500">
           <p><strong>Nota:</strong> El cálculo asume 0.9% de fee de Maker en Telegram Wallet y 0.3% adicional para PagoMóvil sobre la base en Bs.</p>
           <p className="mt-1 text-slate-400">Precio Real por TON (PM): <span className="font-mono text-white">{effectivePricePM.toFixed(2)} Bs</span></p>
       </div>
    </div>
  );
}

function CycleSimulator() {
  const [initialCapital, setInitialCapital] = useState(500);
  const [sellRate, setSellRate] = useState(400);
  const [buyRate, setBuyRate] = useState(396);
  const [commission, setCommission] = useState(0.2);
  const [numCycles, setNumCycles] = useState(1);
  const [compound, setCompound] = useState(false);
  const [results, setResults] = useState({ profitUsdt: 0, profitPercentage: 0, totalVolume: 0, netBs: 0, netUsdtReturned: 0, sellFeeBs: 0, buyFeeUsdt: 0, totalFeesPaidUsdt: 0 });

  useEffect(() => {
    let currentCapital = initialCapital;
    let totalVolume = 0;
    let totalFeesPaidUsdt = 0;

    const singleGrossBs = initialCapital * sellRate;
    const singleSellFeeBs = singleGrossBs * (commission / 100);
    const singleNetBs = singleGrossBs - singleSellFeeBs;
    const singleGrossUsdt = singleNetBs / buyRate;
    const singleBuyFeeUsdt = singleGrossUsdt * (commission / 100);
    const singleNetUsdt = singleGrossUsdt - singleBuyFeeUsdt;

    for (let i = 0; i < numCycles; i++) {
        const grossBs = currentCapital * sellRate;
        const sellFeeBs = grossBs * (commission / 100);
        const netBs = grossBs - sellFeeBs;
        const grossUsdtReturned = netBs / buyRate;
        const buyFeeUsdt = grossUsdtReturned * (commission / 100);
        const netUsdtReturned = grossUsdtReturned - buyFeeUsdt;

        const volumeCycle = currentCapital + grossUsdtReturned;
        totalVolume += volumeCycle;

        const feeSellUsdtApprox = sellFeeBs / sellRate; 
        totalFeesPaidUsdt += (feeSellUsdtApprox + buyFeeUsdt);

        if (compound) currentCapital = netUsdtReturned;
        else currentCapital = initialCapital;
    }

    const totalProfit = compound 
        ? currentCapital - initialCapital 
        : (singleNetUsdt - initialCapital) * numCycles;

    const totalProfitPercentage = (totalProfit / initialCapital) * 100;

    setResults({
      profitUsdt: totalProfit,
      profitPercentage: totalProfitPercentage,
      totalVolume: totalVolume,
      netBs: singleNetBs,
      netUsdtReturned: singleNetUsdt,
      sellFeeBs: singleSellFeeBs,
      buyFeeUsdt: singleBuyFeeUsdt,
      totalFeesPaidUsdt: totalFeesPaidUsdt
    });
  }, [initialCapital, sellRate, buyRate, commission, numCycles, compound]);

  const formatBs = (val) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }).format(val);
  const formatUsdt = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val).replace('$', '');

  return (
    <div>
        <div className="bg-slate-900/95 backdrop-blur border-b border-slate-800 p-4 sticky top-[57px] z-40 shadow-lg">
            <div className="flex justify-between items-center">
                <div>
                   <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Ganancia Estimada</p>
                   <div className="flex items-baseline gap-2">
                      <h2 className={`text-2xl font-bold ${results.profitUsdt >= 0 ? 'text-white' : 'text-red-500'}`}>
                          {results.profitUsdt > 0 ? '+' : ''}{formatUsdt(results.profitUsdt)} <span className="text-sm font-normal text-slate-500">USDT</span>
                      </h2>
                      <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${results.profitUsdt >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                          {results.profitPercentage.toFixed(2)}%
                      </span>
                   </div>
                </div>
                <div className="text-right">
                   <p className="text-[10px] text-slate-500 uppercase font-bold">Spread</p>
                   <p className="text-lg font-bold text-blue-500">{((sellRate - buyRate) / sellRate * 100).toFixed(2)}%</p>
                </div>
            </div>
        </div>

        <div className="p-4 space-y-4">
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                <h3 className="text-xs text-slate-400 font-bold uppercase mb-3 flex items-center gap-2"><Settings size={12}/> Configuración</h3>
                <div className="mb-4"><label className="text-xs text-slate-500 font-bold block mb-1">Capital Inicial (USDT)</label><input type="number" value={initialCapital} onChange={e => setInitialCapital(parseFloat(e.target.value)||0)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-bold text-lg outline-none focus:border-blue-500"/></div>
                <div className="mb-4">
                    <div className="text-xs text-slate-500 font-bold block mb-2 flex justify-between items-center">
                        <span>Ciclos Repetidos</span>
                        <div className="flex items-center gap-2">
                            <span className={`text-[10px] uppercase font-bold ${compound ? 'text-purple-400' : 'text-slate-500'}`}>{compound ? 'Interés Compuesto' : 'Interés Simple'}</span>
                            <button onClick={() => setCompound(!compound)} className="text-slate-400 hover:text-white transition-colors">{compound ? <ToggleRight size={24} className="text-purple-500"/> : <ToggleLeft size={24}/>}</button>
                        </div>
                    </div>
                    <div className="flex items-center gap-3"><input type="range" min="1" max="20" value={numCycles} onChange={e => setNumCycles(parseInt(e.target.value))} className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"/><span className="text-blue-400 font-bold font-mono text-lg w-8 text-center">{numCycles}</span></div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                    <div><label className="text-[10px] text-red-500 font-bold uppercase block mb-1">Venta (Roja)</label><input type="number" value={sellRate} onChange={e => setSellRate(parseFloat(e.target.value)||0)} className="w-full bg-slate-950 border border-red-500/30 rounded-xl p-2 text-white font-mono outline-none focus:border-red-500"/></div>
                    <div><label className="text-[10px] text-emerald-500 font-bold uppercase block mb-1">Compra (Verde)</label><input type="number" value={buyRate} onChange={e => setBuyRate(parseFloat(e.target.value)||0)} className="w-full bg-slate-950 border border-emerald-500/30 rounded-xl p-2 text-white font-mono outline-none focus:border-emerald-500"/></div>
                </div>
                <div>
                    <label className="text-xs text-slate-500 font-bold block mb-2 flex justify-between"><span>Comisión Exchange (Maker/Taker)</span><span className="text-blue-400">{commission}%</span></label>
                    <input type="range" min="0" max="1" step="0.01" value={commission} onChange={e => setCommission(parseFloat(e.target.value))} className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                    <div className="flex justify-between mt-1 text-[10px] text-slate-600"><span onClick={()=>setCommission(0)} className="cursor-pointer hover:text-white">0%</span><span onClick={()=>setCommission(0.1)} className="cursor-pointer hover:text-white">0.1%</span><span onClick={()=>setCommission(0.2)} className="cursor-pointer hover:text-white">0.2%</span></div>
                </div>
            </div>

            <div className="space-y-3">
                 <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 relative overflow-hidden">
                     <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500"></div>
                     <div className="flex justify-between items-center mb-1"><span className="text-red-500 text-xs font-bold uppercase">1. Venta</span><span className="text-slate-500 text-[10px]">-{formatBs(results.sellFeeBs)} com.</span></div>
                     <div className="flex justify-between items-end"><div><p className="text-[10px] text-slate-500">Recibes Neto</p><p className="text-white font-mono font-bold">{formatBs(results.netBs)}</p></div><ArrowRight size={16} className="text-slate-600 mb-1"/></div>
                 </div>
                 <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 relative overflow-hidden">
                     <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500"></div>
                     <div className="flex justify-between items-center mb-1"><span className="text-emerald-500 text-xs font-bold uppercase">2. Compra</span><span className="text-slate-500 text-[10px]">-{formatUsdt(results.buyFeeUsdt)} com.</span></div>
                     <div><p className="text-[10px] text-slate-500">Obtienes Neto</p><p className="text-white font-mono font-bold">{formatUsdt(results.netUsdtReturned)} USDT</p></div>
                 </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mt-4">
               <h3 className="text-slate-800 font-semibold mb-4 flex items-center gap-2"><Activity size={18} className="text-blue-600" /> Detalles de la Operación</h3>
               <div className="space-y-3 text-sm text-slate-600">
                 <div className="flex justify-between border-b border-slate-100 pb-2"><span>Capital Inicial</span><span className="font-mono font-bold">{formatUsdt(initialCapital)} USDT</span></div>
                 <div className="flex justify-between border-b border-slate-100 pb-2"><span>Ciclos Seleccionados</span><span className="font-mono font-bold text-blue-600">{numCycles} {compound ? '(Compuesto)' : '(Simple)'}</span></div>
                 <div className="flex justify-between border-b border-slate-100 pb-2"><span>Volumen Total Generado</span><span className="font-mono font-bold text-emerald-600">{formatUsdt(results.totalVolume)} USDT</span></div>
                 <div className="flex justify-between border-b border-slate-100 pb-2"><span>Ganancia por Ciclo (Prom.)</span><span className="font-mono font-bold text-green-600">+{formatUsdt(results.profitUsdt / numCycles)} USDT</span></div>
                 <div className="flex justify-between pt-2"><span className="text-slate-400">Total Comisiones Pagadas (Est.)</span><span className="text-red-400 font-mono font-bold">~ {formatUsdt(results.totalFeesPaidUsdt)} USDT</span></div>
               </div>
            </div>
        </div>
    </div>
  );
}

function SimpleGapCalculator() {
  const [buy, setBuy] = useState('');
  const [sell, setSell] = useState('');
  const [amount, setAmount] = useState('100');
  const b = parseFloat(buy) || 0; const s = parseFloat(sell) || 0; const amt = parseFloat(amount) || 0;
  const gap = s - b; const percent = b > 0 ? (gap / b) * 100 : 0; const profit = s > 0 ? (gap * amt) / s : 0; 

  return (
    <div className="p-4 mt-4">
        <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl">
             <div className="text-center mb-6"><p className="text-xs text-slate-400 uppercase font-bold mb-2">Margen Bruto</p><h2 className={`text-4xl font-black ${percent > 1 ? 'text-emerald-400' : percent > 0 ? 'text-yellow-400' : 'text-red-400'}`}>{percent.toFixed(2)}%</h2><p className="text-sm text-slate-500 mt-2">Brecha simple sin comisiones</p></div>
             <div className="grid grid-cols-2 gap-4 mb-4">
                <div><label className="text-xs text-emerald-400 font-bold block mb-1">Compra</label><input type="number" value={buy} onChange={e=>setBuy(e.target.value)} className="w-full bg-slate-950 p-3 rounded-xl text-white border border-slate-700 outline-none font-mono"/></div>
                <div><label className="text-xs text-red-400 font-bold block mb-1">Venta</label><input type="number" value={sell} onChange={e=>setSell(e.target.value)} className="w-full bg-slate-950 p-3 rounded-xl text-white border border-slate-700 outline-none font-mono"/></div>
             </div>
             <div className="bg-slate-950 p-4 rounded-xl border border-slate-800"><label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Si invierto (USDT)...</label><div className="flex gap-2 items-center"><input type="number" value={amount} onChange={e=>setAmount(e.target.value)} className="w-24 bg-transparent border-b border-slate-700 text-white font-bold outline-none"/><span className="text-slate-400 text-sm">USDT</span><div className="ml-auto text-right"><p className="text-[10px] text-slate-500">Ganancia Est.</p><p className={`font-bold ${profit > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>+ {profit.toFixed(2)}</p></div></div></div>
        </div>
    </div>
  );
}

function LoansModule({ loans, user, db, appId, isGuest }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');

  if (isGuest) {
      return (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center p-6 opacity-50">
              <PiggyBank size={48} className="text-slate-600 mb-4"/>
              <h3 className="text-xl font-bold text-slate-400">Deudas Desactivadas</h3>
              <p className="text-sm text-slate-600 mt-2">No puedes gestionar préstamos en modo invitado.</p>
          </div>
      );
  }

  const addLoan = async () => {
    if(!name || !amount) return;
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'loans'), { debtor: name, amount: parseFloat(amount), currency, active: true, createdAt: serverTimestamp() });
    setName(''); setAmount('');
  };
  const settleLoan = async (id) => { if(confirm("¿Marcar como pagado?")) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'loans', id)); };
  return (
    <div className="space-y-4">
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
        <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2"><PiggyBank size={16}/> Nuevo Préstamo</h3>
        <div className="flex gap-2 mb-2">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="¿Quién?" className="flex-[2] bg-slate-950 p-2 rounded text-sm text-white border border-slate-700"/>
          <input value={amount} onChange={e=>setAmount(e.target.value)} type="number" placeholder="Monto" className="flex-1 bg-slate-950 p-2 rounded text-sm text-white border border-slate-700"/>
        </div>
        <div className="flex justify-between items-center">
          <select value={currency} onChange={e=>setCurrency(e.target.value)} className="bg-slate-950 text-white text-xs p-2 rounded border border-slate-700">
            <option value="USD">USD</option>
            <option value="VES">VES</option>
          </select>
          <button onClick={addLoan} className="bg-indigo-600 px-4 py-2 rounded text-xs font-bold text-white">Prestar</button>
        </div>
      </div>
      <div className="space-y-2">
        {loans.map(loan => (
          <div key={loan.id} className="flex justify-between items-center bg-slate-900/50 p-3 rounded-lg border border-slate-800">
            <div><p className="text-sm font-bold text-white">{loan.debtor}</p></div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-indigo-400">{loan.amount} {loan.currency}</span>
              <button onClick={() => settleLoan(loan.id)} className="text-emerald-500 text-xs border border-emerald-500/30 px-2 py-1 rounded">Cobrar</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NavButton({ icon, label, active, onClick, highlight }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${active ? (highlight ? 'text-blue-400 bg-blue-500/10' : 'text-emerald-400 bg-emerald-400/10') : 'text-slate-500'}`}>
      {React.cloneElement(icon, { size: 20 })}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}