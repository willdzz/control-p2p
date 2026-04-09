import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, deleteDoc, doc, setDoc, getDocs 
} from 'firebase/firestore';
import { 
  Wallet, TrendingUp, TrendingDown, History, Users, LogOut, Calculator, Landmark, PiggyBank, 
  ArrowUpRight, ArrowDownLeft, PlusCircle, Trash2, RefreshCw, Edit2, Calendar, PieChart, 
  Utensils, Zap, Shirt, Heart, Car, HelpCircle, Cross, Save, X, AlertTriangle, Info, 
  Activity, User, RefreshCcw, Settings, BarChart3, ArrowRight, Lock, ToggleLeft, ToggleRight, 
  Target, Pencil, Scale, MessageCircle, Loader2, CheckCircle2, ChevronDown, ChevronUp, DollarSign,
  Store, ShoppingBag, Gamepad2, ChevronLeft, ChevronRight, CornerRightUp, CornerLeftDown, CalendarDays
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

// --- UTILIDAD DE SEGURIDAD Y FECHAS ---
const safeNum = (val) => {
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
};

const getLocalDateString = (dateObj) => {
  const d = dateObj || new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().split('T')[0];
};

// --- COMPONENTE PRINCIPAL ---
export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('cierres'); 
  const [transactions, setTransactions] = useState([]);
  const [snapshots, setSnapshots] = useState([]); 
  const [inventory, setInventory] = useState({ usdt: 0, ves: 0, avgPrice: 0 });
  const [goals, setGoals] = useState({ daily: 30, monthly: 600 });
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [editingInventory, setEditingInventory] = useState(false);
  const [tempInv, setTempInv] = useState({ usdt: '', ves: '', avgPrice: '' });

  const appId = 'p2p-v2-production';

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) setUser({ ...u, role: 'owner' });
      else if (user?.role !== 'guest') setUser(null); 
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role === 'guest') { setLoading(false); return; }

    const safetyTimeout = setTimeout(() => setLoading(false), 5000);

    // Quitamos el orderBy simple de Firebase para manejar el orden compuesto en el frontend (V4.8)
    const qTx = query(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'));
    const unsubTx = onSnapshot(qTx, (snap) => setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    const qSnap = query(collection(db, 'artifacts', appId, 'users', user.uid, 'snapshots'));
    const unsubSnap = onSnapshot(qSnap, (snap) => setSnapshots(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory');
    const unsubInv = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setInventory({ usdt: safeNum(data.usdt), ves: safeNum(data.ves), avgPrice: safeNum(data.avgPrice) });
      } else {
        setInventory({ usdt: 0, ves: 0, avgPrice: 0 });
      }
    });

    const goalsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'goals');
    const unsubGoals = onSnapshot(goalsRef, (snap) => { if (snap.exists()) setGoals(snap.data()); });

    const qLoans = query(collection(db, 'artifacts', appId, 'users', user.uid, 'loans'), orderBy('createdAt', 'desc'));
    const unsubLoans = onSnapshot(qLoans, (snap) => setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

    setLoading(false);
    clearTimeout(safetyTimeout);

    return () => { unsubTx(); unsubSnap(); unsubInv(); unsubGoals(); unsubLoans(); clearTimeout(safetyTimeout); };
  }, [user]);

  const handleTrade = async (data) => {
    if (user.role === 'guest') { alert("🔒 Modo Invitado: No se pueden guardar operaciones."); return; }
    let newInv = { ...inventory };
    newInv.usdt = safeNum(newInv.usdt); newInv.ves = safeNum(newInv.ves); newInv.avgPrice = safeNum(newInv.avgPrice);

    if (data.type === 'buy') {
      const totalCostOld = newInv.usdt * newInv.avgPrice;
      const costNew = safeNum(data.totalBS); 
      const totalUSDT = newInv.usdt + safeNum(data.amountUSDT); 
      newInv.avgPrice = totalUSDT > 0 ? (totalCostOld + costNew) / totalUSDT : 0;
      newInv.usdt = totalUSDT; newInv.ves -= costNew;
    } else if (data.type === 'sell') {
      const revenueVES = safeNum(data.totalBS); 
      const costOfSold = safeNum(data.amountUSDT) * newInv.avgPrice;
      data.profitUSDT = safeNum(data.rate) > 0 ? (revenueVES - costOfSold) / safeNum(data.rate) : 0;
      newInv.usdt -= (safeNum(data.amountUSDT) + safeNum(data.feeUSDT)); newInv.ves += revenueVES;
    } else if (data.type === 'expense') {
      if (data.currency === 'USDT') {
        newInv.usdt -= safeNum(data.amountUSDT);
        data.expenseUSDT = safeNum(data.amountUSDT);
      } else {
        newInv.ves -= safeNum(data.amountBS);
        const currentRate = safeNum(data.rate) > 0 ? safeNum(data.rate) : newInv.avgPrice;
        data.expenseUSDT = currentRate > 0 ? safeNum(data.amountBS) / currentRate : 0;
      }
    } else if (data.type === 'capital') {
      if (data.currency === 'VES') newInv.ves += safeNum(data.amount);
      else if (data.currency === 'USDT') {
        const totalCostOld = newInv.usdt * newInv.avgPrice;
        const costNew = safeNum(data.amount) * safeNum(data.rate); 
        const totalUSDT = newInv.usdt + safeNum(data.amount);
        newInv.avgPrice = totalUSDT > 0 ? (totalCostOld + costNew) / totalUSDT : 0;
        newInv.usdt = totalUSDT;
      }
    } else if (data.type === 'loan_out') {
      if (data.currency === 'USDT') newInv.usdt -= safeNum(data.amountUSDT);
      else newInv.ves -= safeNum(data.amountVES);
    } else if (data.type === 'loan_in') {
      newInv.ves += safeNum(data.amountVES);
    }
    
    data.avgPriceAtMoment = newInv.avgPrice;
    data.dateStr = data.dateStr || getLocalDateString(); // V4.8: Respeta la fecha provista o usa hoy

    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), { ...data, createdAt: serverTimestamp() });
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory'), newInv);
  };

  const handleSaveSnapshot = async (snapData) => {
      if (user.role === 'guest') return;
      try {
          const newInv = { usdt: snapData.totalUsdt, ves: snapData.totalVes, avgPrice: snapData.avgPrice };
          await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory'), newInv);
          await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'snapshots'), { ...snapData, createdAt: serverTimestamp() });
          alert("✅ Cierre registrado exitosamente.");
      } catch (error) {
          console.error("Error completo: ", error);
          alert("❌ Error al guardar en Firebase: " + error.message);
      }
  };

  const handleDeleteTransaction = async (tx) => {
    if (user.role === 'guest') return;
    if(!confirm("¿Borrar esta transacción y revertir los saldos?")) return;
    let newInv = { ...inventory };
    newInv.usdt = safeNum(newInv.usdt); newInv.ves = safeNum(newInv.ves); newInv.avgPrice = safeNum(newInv.avgPrice);

    if (tx.type === 'buy') {
      const totalCost = safeNum(tx.totalBS) || (safeNum(tx.amountUSDT) * safeNum(tx.rate));
      const currentTotalVal = newInv.usdt * newInv.avgPrice;
      const prevUSDT = newInv.usdt - safeNum(tx.amountUSDT);
      newInv.usdt = prevUSDT; newInv.ves += totalCost;
      newInv.avgPrice = prevUSDT > 0 ? (currentTotalVal - totalCost) / prevUSDT : 0;
    } else if (tx.type === 'sell') {
      newInv.usdt += (safeNum(tx.amountUSDT) + safeNum(tx.feeUSDT));
      newInv.ves -= (safeNum(tx.totalBS) || (safeNum(tx.amountUSDT) * safeNum(tx.rate)));
    } else if (tx.type === 'expense') {
      if (tx.currency === 'USDT' || tx.amountUSDT > 0) {
        newInv.usdt += safeNum(tx.amountUSDT);
      } else {
        newInv.ves += safeNum(tx.amountBS);
      }
    } else if (tx.type === 'capital') {
       if (tx.currency === 'VES') newInv.ves -= safeNum(tx.amount);
       else if (tx.currency === 'USDT') {
         const costWas = safeNum(tx.amount) * safeNum(tx.rate);
         const currentTotalVal = newInv.usdt * newInv.avgPrice;
         const prevUSDT = newInv.usdt - safeNum(tx.amount);
         newInv.usdt = prevUSDT;
         newInv.avgPrice = prevUSDT > 0 ? (currentTotalVal - costWas) / prevUSDT : 0;
       }
    } else if (tx.type === 'loan_out') {
       if (tx.currency === 'USDT') newInv.usdt += safeNum(tx.amountUSDT);
       else newInv.ves += safeNum(tx.amountVES);
    } else if (tx.type === 'loan_in') {
       newInv.ves -= safeNum(tx.amountVES);
    }
    
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', tx.id));
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory'), newInv);
  };

  const handleUpdateGoals = async (newGoals) => {
      if (user.role === 'guest') { setGoals(newGoals); return; }
      setGoals(newGoals);
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'goals'), newGoals);
  };

  const handleResetApp = async () => {
    if (user.role === 'guest') return;
    if (!confirm("⚠️ PELIGRO: ¿Borrar TODA la base de datos y reiniciar en CERO?")) return;
    setLoading(true);
    try {
        await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory'), { usdt: 0, ves: 0, avgPrice: 0 });
        const cols = ['transactions', 'loans', 'snapshots'];
        for (const c of cols) {
            const snap = await getDocs(collection(db, 'artifacts', appId, 'users', user.uid, c));
            await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
        }
        setTransactions([]); setLoans([]); setSnapshots([]); setInventory({ usdt: 0, ves: 0, avgPrice: 0 });
        setEditingInventory(false); setLoading(false);
        alert("Reset completo.");
    } catch (e) { console.error(e); setLoading(false); }
  };

  const saveInventoryManual = async () => {
    if (user.role === 'guest') return;
    const newInv = { usdt: safeNum(tempInv.usdt), ves: safeNum(tempInv.ves), avgPrice: safeNum(tempInv.avgPrice) };
    setInventory(newInv);
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory'), newInv);
    setEditingInventory(false);
  };

  const handleGuestLogin = () => {
      setLoading(true);
      setTimeout(() => { setUser({ uid: 'guest', role: 'guest', displayName: 'Invitado' }); setView('simulator'); setLoading(false); }, 800);
  };

  const handleLogout = () => { if (user.role === 'guest') setUser(null); else signOut(auth); setView('cierres'); };

  // CÁLCULO DE LA TRINIDAD CONTABLE
  const deferredCapital = useMemo(() => loans.reduce((acc, l) => acc + safeNum(l.amountUsd), 0), [loans]);
  const operativeEquity = (safeNum(inventory.usdt) + (safeNum(inventory.ves) / (safeNum(inventory.avgPrice) || 1)));
  const globalEquity = operativeEquity + deferredCapital;

  // --- LOGIN SCREEN ---
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
            <div className="flex justify-center mb-6"><span className="bg-blue-500/10 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded border border-blue-500/20 uppercase tracking-wider">V4.8 Fix & Fechas</span></div>
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
      {view !== 'simulator' && (
        <div className="bg-gradient-to-b from-slate-900 to-slate-950 p-6 border-b border-slate-800">
            <div className="flex justify-between items-start mb-4">
                <h2 className="text-xs text-slate-400 font-semibold tracking-wider uppercase flex items-center gap-2">
                    {user.role === 'guest' ? <><User size={12}/> Modo Invitado</> : 'Balance General'}
                </h2>
                <div className="flex gap-2">
                    {user.role !== 'guest' && (
                        <button onClick={editingInventory ? () => setEditingInventory(false) : () => {setTempInv(inventory); setEditingInventory(true);}} className={`p-2 rounded-lg transition-colors ${editingInventory ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
                            {editingInventory ? <X size={16}/> : <Edit2 size={16}/>}
                        </button>
                    )}
                    <button onClick={handleLogout} className="bg-slate-800 p-2 rounded-lg text-slate-400 hover:text-white"><LogOut size={16}/></button>
                </div>
            </div>

            {user.role === 'guest' ? (
                <p className="text-xl font-bold text-slate-500 mt-1">Simulación Activa</p>
            ) : (
                <div className="grid grid-cols-3 gap-2 w-full animate-in fade-in slide-in-from-top-2">
                    <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800 flex flex-col justify-center">
                        <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">Caja Operativa</p>
                        <p className="text-sm font-bold text-white">${operativeEquity.toFixed(2)}</p>
                    </div>
                    <div className="bg-pink-900/10 p-3 rounded-xl border border-pink-900/30 flex flex-col justify-center">
                        <p className="text-[9px] text-pink-500/80 uppercase font-bold mb-1">Por Cobrar</p>
                        <p className="text-sm font-bold text-pink-400">${deferredCapital.toFixed(2)}</p>
                    </div>
                    <div className="bg-emerald-900/10 p-3 rounded-xl border border-emerald-900/30 flex flex-col justify-center">
                        <p className="text-[9px] text-emerald-500/80 uppercase font-bold mb-1">Patrim. Global</p>
                        <p className="text-sm font-bold text-emerald-400">${globalEquity.toFixed(2)}</p>
                    </div>
                </div>
            )}

            {editingInventory && user.role !== 'guest' ? (
            <div className="bg-slate-800/50 p-4 rounded-xl border border-blue-500/30 mt-4 animate-in fade-in zoom-in-95">
                <p className="text-xs text-blue-400 font-bold mb-3 uppercase text-center flex items-center justify-center gap-2"><Edit2 size={12}/> Ajuste Manual de Emergencia</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                <div><label className="text-[10px] text-slate-400">Total USDT</label><input type="number" value={tempInv.usdt} onChange={e=>setTempInv({...tempInv, usdt: e.target.value})} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white text-sm"/></div>
                <div><label className="text-[10px] text-slate-400">Tasa Ref.</label><input type="number" value={tempInv.avgPrice} onChange={e=>setTempInv({...tempInv, avgPrice: e.target.value})} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white text-sm"/></div>
                <div className="col-span-2"><label className="text-[10px] text-slate-400">Total Bolívares (VES)</label><input type="number" value={tempInv.ves} onChange={e=>setTempInv({...tempInv, ves: e.target.value})} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white text-sm"/></div>
                </div>
                <div className="space-y-3">
                <button onClick={saveInventoryManual} className="w-full bg-blue-600 py-2 rounded-lg text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-blue-500"><Save size={14}/> Forzar Guardado</button>
                <button onClick={handleResetApp} className="w-full bg-red-500/10 border border-red-500/50 py-2 rounded-lg text-red-400 font-bold text-xs flex items-center justify-center gap-2 hover:bg-red-500 hover:text-white transition-colors"><AlertTriangle size={14}/> Restablecer App a Cero</button>
                </div>
            </div>
            ) : null}
        </div>
      )}

      {/* RUTAS DEL BODY */}
      <div className={view === 'simulator' ? 'p-0' : 'p-4'}>
        {view === 'cierres' && <CierresModule transactions={transactions} snapshots={snapshots} inventory={inventory} onSaveSnapshot={handleSaveSnapshot} onTrade={handleTrade} onDeleteTx={handleDeleteTransaction} isGuest={user.role === 'guest'} />}
        {view === 'graficas' && <GraficasModule transactions={transactions} snapshots={snapshots} inventory={inventory} goals={goals} onSaveGoals={handleUpdateGoals} isGuest={user.role === 'guest'} />}
        {view === 'deudas' && <LoansModule loans={loans} user={user} db={db} appId={appId} isGuest={user.role === 'guest'} onTrade={handleTrade} />}
        {view === 'simulator' && <SimulatorModule />}
      </div>

      {/* NAV INFERIOR */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur border-t border-slate-800 flex justify-around p-3 max-w-md mx-auto z-50">
        <NavButton icon={<Save/>} label="Cierres" active={view === 'cierres'} onClick={() => setView('cierres')} />
        <NavButton icon={<BarChart3/>} label="Gráficas" active={view === 'graficas'} onClick={() => setView('graficas')} />
        <NavButton icon={<Users/>} label="Deudas" active={view === 'deudas'} onClick={() => setView('deudas')} />
        <NavButton icon={<Calculator/>} label="Simulador" active={view === 'simulator'} onClick={() => setView('simulator')} highlight={true} />
      </div>
    </div>
  );
}

// --- MÓDULO 1: CIERRES MACRO Y GASTOS ---
function CierresModule({ transactions, snapshots, inventory, onSaveSnapshot, onTrade, onDeleteTx, isGuest }) {
  const [subTab, setSubTab] = useState('cierre'); 
  const [snapUsdt, setSnapUsdt] = useState(inventory.usdt);
  const [snapVes, setSnapVes] = useState(inventory.ves);
  const [snapRate, setSnapRate] = useState(inventory.avgPrice || 40);
  const [snapDate, setSnapDate] = useState(getLocalDateString());
  const [snapNote, setSnapNote] = useState('');
  const [visibleItems, setVisibleItems] = useState(15); 

  useEffect(() => { setSnapUsdt(inventory.usdt); setSnapVes(inventory.ves); setSnapRate(inventory.avgPrice || 40); }, [inventory]);

  const submitSnapshot = () => {
      const totalEq = safeNum(snapUsdt) + (safeNum(snapVes) / safeNum(snapRate));
      onSaveSnapshot({ date: snapDate, totalUsdt: safeNum(snapUsdt), totalVes: safeNum(snapVes), avgPrice: safeNum(snapRate), netEquityUsdt: totalEq, note: snapNote });
      setSnapNote('');
  };

  if (isGuest) return <div className="flex flex-col items-center justify-center h-[60vh] text-center p-6 opacity-50"><Lock size={48} className="text-slate-600 mb-4"/><h3 className="text-xl font-bold text-slate-400">Modo Operativo Bloqueado</h3></div>;

  return (
    <div className="space-y-4 pb-20">
       <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
           <button onClick={()=>setSubTab('cierre')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${subTab==='cierre'?'bg-blue-600 text-white':'text-slate-500'}`}>Cierre Diario</button>
           <button onClick={()=>setSubTab('gasto')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${subTab==='gasto'?'bg-red-600 text-white':'text-slate-500'}`}>Operaciones</button>
       </div>

       {subTab === 'cierre' && (
           <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 animate-in fade-in zoom-in-95">
               <h3 className="text-xs text-blue-400 font-bold uppercase mb-4 flex items-center gap-2"><Save size={14}/> Registrar Caja Operativa</h3>
               <div className="space-y-4">
                   <div><label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Fecha del Cierre</label><input type="date" value={snapDate} onChange={e=>setSnapDate(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none focus:border-blue-500 text-sm [color-scheme:dark]"/></div>
                   <div className="grid grid-cols-2 gap-3">
                       <div><label className="text-[10px] text-emerald-500 font-bold uppercase mb-1 block">Total Binance (USDT)</label><input type="number" step="0.01" value={snapUsdt} onChange={e=>setSnapUsdt(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-emerald-500/30 outline-none font-mono text-lg"/></div>
                       <div><label className="text-[10px] text-blue-400 font-bold uppercase mb-1 block">Total Bancos (VES)</label><input type="number" step="0.01" value={snapVes} onChange={e=>setSnapVes(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-blue-500/30 outline-none font-mono text-lg"/></div>
                   </div>
                   <div><label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block flex justify-between"><span>Tasa de Valoración (VES/USDT)</span><span>={((safeNum(snapUsdt) + safeNum(snapVes)/safeNum(snapRate)) || 0).toFixed(2)}$</span></label><input type="number" step="0.01" value={snapRate} onChange={e=>setSnapRate(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none font-mono"/></div>
                   <div><label className="text-[10px] text-slate-400 uppercase font-bold mb-1 block">Nota (Opcional)</label><input type="text" value={snapNote} onChange={e=>setSnapNote(e.target.value)} placeholder="Ej: Cierre viernes noche" className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none text-sm"/></div>
                   <button onClick={submitSnapshot} className="w-full py-3 bg-blue-600 rounded-lg text-white font-bold text-sm shadow-lg hover:bg-blue-500">Guardar Cierre</button>
               </div>
           </div>
       )}
       {subTab === 'gasto' && <TradeForm onTrade={onTrade} onCancel={() => setSubTab('cierre')} isGuest={isGuest} />}

       <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mt-6">Historial Operativo</h3>
       <div className="space-y-3">
           {(() => {
               // V4.8: Ordenamiento compuesto inteligente. Primero por Fecha Contable (dateStr), luego por momento de guardado.
               const mixed = [ 
                   ...snapshots.map(s => ({ ...s, isSnap: true })), 
                   ...transactions.map(t => ({ ...t, isSnap: false })) 
               ].sort((a, b) => {
                   const dateA = a.dateStr || a.date || "1970-01-01";
                   const dateB = b.dateStr || b.date || "1970-01-01";
                   if (dateA !== dateB) return new Date(dateB) - new Date(dateA);
                   const timeA = a.createdAt?.seconds || 0;
                   const timeB = b.createdAt?.seconds || 0;
                   return timeB - timeA;
               });
               
               const visibleHistory = mixed.slice(0, visibleItems);
               const hasMoreHistory = visibleHistory.length < mixed.length;

               const formatDateHeader = (dateString) => {
                   if (!dateString) return 'Desconocido';
                   const d = new Date(dateString + 'T12:00:00'); // Evita saltos de zona horaria
                   const today = new Date();
                   const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
                   if (d.toDateString() === today.toDateString()) return 'Hoy';
                   if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
                   return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
               };

               if (mixed.length === 0) return <p className="text-slate-600 text-center py-6">Sin registros.</p>;
               
               let lastDateHeader = null;

               return (
                   <>
                       {visibleHistory.map(item => {
                           const semanticDate = item.dateStr || item.date;
                           const dateHeader = formatDateHeader(semanticDate);
                           const showHeader = dateHeader !== lastDateHeader;
                           lastDateHeader = dateHeader;

                           return (
                               <React.Fragment key={`${item.isSnap ? 'snap' : 'tx'}-${item.id}`}>
                                   {showHeader && (
                                       <div className="flex items-center gap-3 mt-6 mb-2">
                                           <div className="h-px bg-slate-800 flex-1"></div>
                                           <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{dateHeader}</span>
                                           <div className="h-px bg-slate-800 flex-1"></div>
                                       </div>
                                   )}
                                   
                                   {item.isSnap ? (
                                       <div className="bg-slate-800/40 p-3 rounded-xl border border-blue-500/20 flex justify-between items-center">
                                           <div className="flex items-center gap-3"><div className="p-2 rounded-full bg-blue-500/20 text-blue-400"><Save size={16}/></div><div><p className="font-bold text-sm text-blue-100">Cierre Operativo</p><p className="text-[10px] text-slate-400">{item.date} {item.note ? `- ${item.note}` : ''}</p></div></div>
                                           <div className="text-right"><p className="font-mono font-bold text-emerald-400">${safeNum(item.netEquityUsdt).toFixed(2)}</p><p className="text-[10px] text-slate-500">Caja Actual</p></div>
                                       </div>
                                   ) : (
                                       <div className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex justify-between items-center group relative">
                                         <div className="flex items-center gap-3">
                                           <div className={`p-2 rounded-full ${
                                             item.type === 'sell' ? 'bg-red-500/20 text-red-400' : 
                                             item.type === 'buy' ? 'bg-emerald-500/20 text-emerald-400' : 
                                             item.type === 'capital' ? 'bg-purple-500/20 text-purple-400' : 
                                             item.type === 'expense' ? 'bg-red-500/20 text-red-400' : 
                                             item.type === 'loan_out' ? 'bg-pink-500/20 text-pink-400' :
                                             item.type === 'loan_in' ? 'bg-emerald-500/20 text-emerald-400' :
                                             'bg-orange-500/20 text-orange-400'}`}>
                                             {item.type === 'sell' ? <ArrowUpRight size={16}/> : 
                                              item.type === 'buy' ? <ArrowDownLeft size={16}/> : 
                                              item.type === 'capital' ? <PlusCircle size={16}/> : 
                                              item.type === 'expense' ? <TrendingDown size={16}/> : 
                                              item.type === 'loan_out' ? <CornerRightUp size={16}/> :
                                              item.type === 'loan_in' ? <CornerLeftDown size={16}/> :
                                              <RefreshCw size={16}/>}
                                           </div>
                                           <div>
                                             <p className="font-bold text-sm text-slate-200">
                                                {item.type === 'expense' && item.category ? item.category : 
                                                 item.type === 'sell' ? 'Venta USDT' : 
                                                 item.type === 'buy' ? 'Compra USDT' : 
                                                 item.type === 'capital' ? 'Fondeo' : 
                                                 item.type === 'loan_out' ? `Préstamo a ${item.debtor}` :
                                                 item.type === 'loan_in' ? `Cobro a ${item.debtor}` :
                                                 item.type === 'swap' ? 'Swap' : 'Gasto'}
                                             </p>
                                             <p className="text-[10px] text-slate-500">
                                                 {item.type === 'expense' ? `${item.description || 'Sin nota'} ${item.currency === 'VES' && item.rate ? `(Tasa: ${item.rate})` : ''}` : 
                                                  item.type === 'loan_in' ? `Ganancia cambiaria: +$${safeNum(item.devaluationProfit).toFixed(2)}` :
                                                  `Tasa: ${safeNum(item.rate)}`}
                                             </p>
                                           </div>
                                         </div>
                                         <div className="flex items-center gap-3">
                                           <div className="text-right">
                                               <p className={`font-mono font-bold ${item.type === 'expense' || item.type === 'loan_out' ? 'text-red-400' : 'text-slate-200'}`}>
                                                  {item.type === 'expense' ? (item.currency === 'USDT' ? `-$${safeNum(item.amountUSDT).toFixed(2)}` : `-Bs ${safeNum(item.amountBS).toLocaleString()}`) : 
                                                   item.type === 'loan_out' ? (item.currency === 'USDT' ? `-$${safeNum(item.amountUSDT).toFixed(2)}` : `-Bs ${safeNum(item.amountVES).toLocaleString()}`) : 
                                                   item.type === 'loan_in' ? `+Bs ${safeNum(item.amountVES).toLocaleString()}` :
                                                   item.type === 'capital' ? `+$${safeNum(item.amount)}` : 
                                                   `$${safeNum(item.amountUSDT).toFixed(2)}`}
                                               </p>
                                           </div>
                                           <button onClick={() => onDeleteTx(item)} className="p-2 text-slate-700 hover:text-red-500"><Trash2 size={14} /></button>
                                         </div>
                                       </div>
                                   )}
                               </React.Fragment>
                           );
                       })}
                       
                       <div className="pt-6 pb-2 text-center">
                           {hasMoreHistory ? (
                               <button onClick={() => setVisibleItems(prev => prev + 15)} className="text-xs font-bold text-slate-300 bg-slate-800 px-5 py-2.5 rounded-full border border-slate-700 hover:bg-blue-600 hover:text-white hover:border-blue-500 transition-all shadow-lg flex items-center justify-center gap-2 mx-auto">
                                   Ver más movimientos <ChevronDown size={14}/>
                               </button>
                           ) : (
                               <p className="text-[10px] text-slate-500 italic">Has llegado al inicio de tus registros.</p>
                           )}
                       </div>
                   </>
               );
           })()}
       </div>
    </div>
  );
}

// --- MÓDULO 2: GRÁFICAS Y ANALÍTICA HISTÓRICA (V4.8) ---
function GraficasModule({ transactions, snapshots, inventory, goals, onSaveGoals, isGuest }) {
  const [viewMonth, setViewMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); 
  const [editingGoals, setEditingGoals] = useState(false);
  const [tempGoals, setTempGoals] = useState(goals);
  
  if (isGuest) return <div className="flex justify-center p-10"><Lock className="text-slate-600"/></div>;

  const prevMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1));
  const nextMonth = () => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1));
  
  const now = new Date();
  const isCurrentMonth = viewMonth.getFullYear() === now.getFullYear() && viewMonth.getMonth() === now.getMonth();
  const monthName = viewMonth.toLocaleString('es-ES', { month: 'long', year: 'numeric' });

  const monthData = useMemo(() => {
      const year = viewMonth.getFullYear();
      const month = viewMonth.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0); 
      const daysInMonth = lastDay.getDate();

      const activeDays = isCurrentMonth ? now.getDate() : daysInMonth;
      const days = [];
      
      const prePeriodSnaps = snapshots.filter(s => new Date(s.date) < firstDay).sort((a,b) => new Date(b.date) - new Date(a.date));
      const firstMonthSnaps = snapshots.filter(s => {
          const d = new Date(s.date); return d >= firstDay && d <= lastDay;
      }).sort((a,b) => new Date(a.date) - new Date(b.date));

      let startingCapital = prePeriodSnaps.length > 0 ? prePeriodSnaps[0].netEquityUsdt : (firstMonthSnaps.length > 0 ? firstMonthSnaps[0].netEquityUsdt : 0);
      let endingCapital = startingCapital;
      
      let currentEquity = startingCapital;
      let totalPeriodProfit = 0;
      let totalPeriodExpenses = 0;
      let totalDeposits = 0;
      let totalLoansOut = 0;

      const monthExpenses = transactions.filter(t => {
          const d = new Date(t.dateStr); return d >= firstDay && d <= lastDay && t.type === 'expense';
      });
      const byCategory = monthExpenses.reduce((acc, curr) => {
         const cat = curr.category || 'Otros';
         const val = curr.expenseUSDT || (safeNum(curr.amountBS) / 40);
         acc[cat] = (acc[cat] || 0) + val;
         return acc;
      }, {});

      for (let i = 0; i < activeDays; i++) {
          const d = new Date(year, month, i + 1);
          const dateStr = getLocalDateString(d);

          const daySnaps = snapshots.filter(s => s.date === dateStr);
          let endOfDayEquity = currentEquity;
          if (daySnaps.length > 0) {
              endOfDayEquity = daySnaps.sort((a,b)=>b.time - a.time)[0].netEquityUsdt;
              endingCapital = endOfDayEquity; 
          }

          const dayExpenses = transactions.filter(t => t.type === 'expense' && t.dateStr === dateStr);
          const sumExpenses = dayExpenses.reduce((acc, t) => acc + (t.expenseUSDT || safeNum(t.amountBS)/40), 0);
          totalPeriodExpenses += sumExpenses;

          const dayDeposits = transactions.filter(t => t.type === 'capital' && t.dateStr === dateStr);
          const sumDeposits = dayDeposits.reduce((acc, t) => acc + (t.currency === 'USDT' ? safeNum(t.amount) : safeNum(t.amount)/40), 0);
          totalDeposits += sumDeposits;

          const dayLoansOut = transactions.filter(t => t.type === 'loan_out' && t.dateStr === dateStr).reduce((acc, t) => acc + safeNum(t.amountUSDT), 0);
          const dayLoansInPrincipal = transactions.filter(t => t.type === 'loan_in' && t.dateStr === dateStr).reduce((acc, t) => acc + safeNum(t.amountUSDT), 0);
          totalLoansOut += dayLoansOut;

          let dailyProfit = 0;
          if (daySnaps.length > 0) {
             dailyProfit = (endOfDayEquity - currentEquity) + sumExpenses + dayLoansOut - sumDeposits - dayLoansInPrincipal;
             currentEquity = endOfDayEquity; 
          } else {
             currentEquity = currentEquity - sumExpenses - dayLoansOut + sumDeposits + dayLoansInPrincipal;
             dailyProfit = 0; 
          }

          totalPeriodProfit += dailyProfit;
          days.push({ label: d.getDate(), dateStr, profit: dailyProfit, expense: sumExpenses });
      }

      const netGrowth = totalPeriodProfit - totalPeriodExpenses; 

      return { days, startingCapital, endingCapital, totalPeriodProfit, totalPeriodExpenses, netGrowth, byCategory, daysInMonth, totalDeposits, totalLoansOut };
  }, [snapshots, transactions, viewMonth, isCurrentMonth]);

  const macroTrend = useMemo(() => {
      const byMonth = {};
      snapshots.forEach(s => {
          const prefix = s.date.substring(0, 7); 
          if (!byMonth[prefix] || new Date(s.date) > new Date(byMonth[prefix].date)) {
              byMonth[prefix] = s;
          }
      });
      return Object.values(byMonth)
          .sort((a, b) => new Date(a.date) - new Date(b.date))
          .slice(-6)
          .map(s => ({
              monthLabel: new Date(s.date + 'T00:00:00').toLocaleString('es-ES', { month: 'short' }),
              equity: s.netEquityUsdt
          }));
  }, [snapshots]);

  // V4.8 FIX CSS: Calculamos el máximo absoluto (positivo o negativo) para que la barra nunca desborde
  const maxProfitVal = Math.max(...monthData.days.map(d => d.profit), 10);
  const minProfitVal = Math.min(...monthData.days.map(d => d.profit), -10);
  const maxAbsoluteProfit = Math.max(maxProfitVal, Math.abs(minProfitVal));
  
  const maxMacroEquity = Math.max(...macroTrend.map(m => m.equity), 100);

  const targetAmount = goals.monthly;
  const progressPercent = targetAmount > 0 ? (monthData.totalPeriodProfit / targetAmount) * 100 : 0;

  return (
      <div className="space-y-6 pb-20 animate-in fade-in">
          
          <div className="flex justify-between items-center bg-slate-900 p-2 rounded-xl border border-slate-800">
              <button onClick={prevMonth} className="p-2 text-slate-400 hover:text-white bg-slate-950 rounded-lg"><ChevronLeft size={18}/></button>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">{monthName}</h2>
              <button onClick={nextMonth} disabled={isCurrentMonth} className={`p-2 rounded-lg ${isCurrentMonth ? 'text-slate-800' : 'text-slate-400 hover:text-white bg-slate-950'}`}><ChevronRight size={18}/></button>
          </div>

          <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-5 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10"><Landmark size={64}/></div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">Desglose Contable • {monthName}</h3>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Caja Operativa Inic.</p>
                      <p className="font-mono text-slate-300">${monthData.startingCapital.toFixed(2)}</p>
                  </div>
                  <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Caja Operativa Final</p>
                      <p className="font-mono font-bold text-white">${monthData.endingCapital.toFixed(2)}</p>
                  </div>
              </div>

              <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-xs">Rendimiento P2P (Operativo)</span>
                      <span className="text-emerald-400 font-mono font-bold text-sm">+{monthData.totalPeriodProfit.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-xs">Total Fugas / Gastos</span>
                      <span className="text-red-400 font-mono font-bold text-sm">-{monthData.totalPeriodExpenses.toFixed(2)}</span>
                  </div>
                  
                  <div className="border-t border-slate-800 pt-2 flex justify-between items-center">
                      <span className="text-slate-400 text-[10px] uppercase">Fondeos (Inyectados)</span>
                      <span className="text-blue-400 font-mono text-xs">+{monthData.totalDeposits.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                      <span className="text-slate-400 text-[10px] uppercase" title="Dinero que prestaste este mes">Volumen Prestado (Histórico)</span>
                      <span className="text-pink-400 font-mono text-xs">-{monthData.totalLoansOut.toFixed(2)}</span>
                  </div>

                  <div className="border-t border-slate-800 pt-3 flex justify-between items-center">
                      <span className="text-xs font-bold text-white uppercase">Crecimiento Real (Neta)</span>
                      <span className={`font-mono font-black text-lg ${monthData.netGrowth >= 0 ? 'text-blue-400' : 'text-red-500'}`}>
                          {monthData.netGrowth > 0 ? '+' : ''}{monthData.netGrowth.toFixed(2)}
                      </span>
                  </div>
              </div>
          </div>

          {isCurrentMonth && (
              editingGoals ? (
                 <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                     <h3 className="text-sm font-bold text-white mb-4"><Target size={14} className="inline mr-2"/> Metas Financieras</h3>
                     <div className="space-y-3">
                         <label className="text-xs text-slate-400">Meta Mensual (USDT)</label>
                         <input type="number" value={tempGoals.monthly} onChange={e=>setTempGoals({...tempGoals, monthly: parseFloat(e.target.value)})} className="w-full bg-slate-950 p-3 rounded text-white"/>
                         <label className="text-xs text-slate-400">Meta Diaria Aprox (USDT)</label>
                         <input type="number" value={tempGoals.daily} onChange={e=>setTempGoals({...tempGoals, daily: parseFloat(e.target.value)})} className="w-full bg-slate-950 p-3 rounded text-white"/>
                         <div className="flex gap-2 pt-2"><button onClick={()=>setEditingGoals(false)} className="flex-1 py-2 bg-slate-800 text-slate-300 rounded">Cancelar</button><button onClick={()=>{onSaveGoals(tempGoals); setEditingGoals(false)}} className="flex-1 py-2 bg-blue-600 text-white rounded">Guardar</button></div>
                     </div>
                 </div>
              ) : (
                 <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 relative overflow-hidden shadow-lg">
                     <div className="flex justify-between items-start mb-2 relative z-10">
                         <div>
                             <p className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1"><Target size={12}/> Meta Mensual Activa</p>
                             <h2 className="text-2xl font-bold text-white mt-1">${monthData.totalPeriodProfit.toFixed(2)} <span className="text-sm font-normal text-slate-500">/ ${targetAmount}</span></h2>
                         </div>
                         <button onClick={()=>setEditingGoals(true)} className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white"><Pencil size={14}/></button>
                     </div>
                     <div className="relative h-3 bg-slate-950 rounded-full overflow-hidden mt-2 z-10 border border-slate-800">
                         <div className={`h-full transition-all duration-1000 ${progressPercent >= 100 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-blue-500'}`} style={{ width: `${Math.min(progressPercent, 100)}%` }}></div>
                     </div>
                 </div>
              )
          )}

          <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
              <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xs font-bold text-emerald-400 uppercase">Rendimiento Diario</h3>
              </div>
              <div className="h-40 flex items-end justify-between gap-0.5 border-b border-slate-800 pb-2 relative">
                  <div className="absolute w-full border-t border-slate-800/50 bottom-0 left-0"></div>
                  {monthData.days.map((d, i) => (
                      <div key={i} className="flex-1 flex flex-col justify-end items-center group relative h-full">
                          <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-slate-800 text-xs text-white p-1 rounded whitespace-nowrap z-20 pointer-events-none transition-opacity">Dia {d.label}: ${d.profit.toFixed(1)}</div>
                          {d.profit > 0 && <div className="w-full bg-emerald-500/80 rounded-t-sm hover:bg-emerald-400 transition-colors" style={{ height: `${(d.profit / maxAbsoluteProfit) * 100}%`, minHeight: '4px' }}></div>}
                          {d.profit < 0 && <div className="w-full bg-red-500/80 rounded-b-sm absolute top-full mt-0.5" style={{ height: `${(Math.abs(d.profit) / maxAbsoluteProfit) * 100}%`, minHeight: '4px' }}></div>}
                          {(d.label % 5 === 0 || d.label === 1) && <span className="text-[8px] text-slate-600 mt-1 absolute top-full pt-1">{d.label}</span>}
                      </div>
                  ))}
              </div>
              <div className="mt-6 flex justify-between items-center">
                  <p className="text-[10px] text-slate-500">Promedio: ${(monthData.totalPeriodProfit / monthData.days.length).toFixed(1)} / día activo</p>
              </div>
          </div>

          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2"><PieChart size={16}/> Distribución Gastos</h3>
                <span className="text-xs font-mono text-red-400 font-bold">-${monthData.totalPeriodExpenses.toFixed(2)}</span>
            </div>
            <div className="space-y-4">
              {Object.keys(monthData.byCategory).length === 0 && <p className="text-center text-xs text-slate-600">Sin fugas registradas en {monthName}.</p>}
              {['Comida', 'Bodega', 'Servicios', 'Compras', 'Ropa', 'Ocio', 'Transporte', 'Diezmo', 'Otros'].map(catId => {
                const amount = monthData.byCategory[catId] || 0;
                const percent = monthData.totalPeriodExpenses > 0 ? (amount / monthData.totalPeriodExpenses) * 100 : 0;
                if (amount === 0) return null;
                
                let color = 'text-slate-400'; let bar = 'bg-slate-500';
                if(catId==='Comida') { color='text-orange-400'; bar='bg-orange-500'; }
                if(catId==='Bodega') { color='text-amber-400'; bar='bg-amber-500'; }
                if(catId==='Servicios') { color='text-yellow-400'; bar='bg-yellow-500'; }
                if(catId==='Compras') { color='text-emerald-400'; bar='bg-emerald-500'; }
                if(catId==='Ropa') { color='text-pink-400'; bar='bg-pink-500'; }
                if(catId==='Ocio') { color='text-red-400'; bar='bg-red-500'; }
                if(catId==='Transporte') { color='text-blue-400'; bar='bg-blue-500'; }
                if(catId==='Diezmo') { color='text-indigo-400'; bar='bg-indigo-500'; }
                if(catId==='Otros') { color='text-slate-400'; bar='bg-slate-500'; }

                return (
                  <div key={catId}>
                    <div className="flex justify-between text-xs mb-1"><span className={`flex items-center gap-2 font-bold ${color}`}>{catId}</span><span className="text-slate-300 font-mono">${amount.toFixed(2)}</span></div>
                    <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden"><div className={`h-full ${bar}`} style={{ width: `${percent}%` }}></div></div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 mt-8">
              <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-4 flex items-center gap-2"><TrendingUp size={14}/> Evolución Patrimonial</h3>
              {macroTrend.length < 2 ? (
                  <p className="text-xs text-slate-500 text-center py-4">Se necesitan al menos 2 meses de registros para ver la evolución macro.</p>
              ) : (
                  <div className="h-32 flex items-end justify-between gap-2 pt-4 relative">
                      {macroTrend.map((m, i) => (
                          <div key={i} className="flex-1 flex flex-col justify-end items-center group relative h-full">
                              <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 bg-blue-900 text-xs text-white p-1 rounded whitespace-nowrap z-20 transition-opacity">
                                  ${m.equity.toFixed(0)}
                              </div>
                              <div className="w-full bg-blue-500/30 border-t-2 border-blue-400 rounded-t-sm hover:bg-blue-500/50 transition-colors" style={{ height: `${(m.equity / maxMacroEquity) * 100}%`, minHeight: '10px' }}></div>
                              <span className="text-[10px] text-slate-400 font-bold mt-2 uppercase">{m.monthLabel}</span>
                          </div>
                      ))}
                  </div>
              )}
          </div>
      </div>
  );
}

// --- MÓDULO 3: DEUDAS (AUTOMATIZADO V4.7) ---
function LoansModule({ loans, user, db, appId, isGuest, onTrade }) {
  const [name, setName] = useState(''); 
  const [currency, setCurrency] = useState('VES');
  const [amount, setAmount] = useState(''); 
  const [rateP2P, setRateP2P] = useState(''); 
  
  const [settleId, setSettleId] = useState(null); 
  const [settleVes, setSettleVes] = useState('');
  const [settleRate, setSettleRate] = useState('');

  if (isGuest) return <div className="text-center p-10 text-slate-500">Deudas desactivadas</div>;

  const addLoan = async () => {
    if(!name || !amount || !rateP2P) return;
    const valAmount = parseFloat(amount);
    const valRate = parseFloat(rateP2P);
    
    // Cálculo inteligente para extraer capital
    const amountUsd = currency === 'USDT' ? valAmount : valAmount / valRate;
    const amountVes = currency === 'VES' ? valAmount : valAmount * valRate;

    // 1. Debitar del Saldo Operativo
    await onTrade({ 
        type: 'loan_out', 
        debtor: name, 
        currency: currency, 
        amountUSDT: amountUsd, 
        amountVES: amountVes, 
        rate: valRate 
    });

    // 2. Registrar la cuenta por cobrar
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'loans'), { 
        debtor: name, 
        amountUsd: amountUsd, 
        initialRate: valRate, 
        initialVes: amountVes, 
        active: true, 
        createdAt: serverTimestamp() 
    });
    setName(''); setAmount(''); setRateP2P('');
  };

  const handleSettle = async () => {
      if(!settleRate || !settleVes) return;
      const valVes = parseFloat(settleVes);
      const valRate = parseFloat(settleRate);
      const receivedUsd = valVes / valRate;
      
      const loanToSettle = loans.find(l => l.id === settleId);
      const profit = receivedUsd - loanToSettle.amountUsd;

      // 1. Ingresar el capital + ganancia al Saldo Operativo
      await onTrade({ 
          type: 'loan_in', 
          debtor: loanToSettle.debtor, 
          amountVES: valVes, 
          amountUSDT: loanToSettle.amountUsd, 
          devaluationProfit: profit, 
          rate: valRate 
      });

      // 2. Eliminar la cuenta por cobrar
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'loans', settleId));
      setSettleId(null); setSettleRate(''); setSettleVes('');
  };

  return (
    <div className="space-y-4 pb-20 animate-in fade-in">
      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-lg">
        <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2"><PiggyBank size={16} className="text-pink-400"/> Otorgar Préstamo</h3>
        <div className="space-y-3">
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre del Deudor" className="w-full bg-slate-950 p-3 rounded-xl text-sm text-white border border-slate-700 outline-none focus:border-pink-500"/>
          
          <div className="flex bg-slate-950 p-1 rounded-lg">
              <button onClick={() => setCurrency('VES')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded ${currency === 'VES' ? 'bg-slate-800 text-white' : 'text-slate-600'}`}>En Bolívares</button>
              <button onClick={() => setCurrency('USDT')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded ${currency === 'USDT' ? 'bg-slate-800 text-emerald-400' : 'text-slate-600'}`}>En USDT</button>
          </div>

          <div className="grid grid-cols-2 gap-3">
              <div>
                  <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Monto a Prestar</label>
                  <input value={amount} onChange={e=>setAmount(e.target.value)} type="number" placeholder="Ej: 100" className="w-full bg-slate-950 p-3 rounded-xl text-sm text-white border border-slate-700 outline-none focus:border-pink-500"/>
              </div>
              <div>
                  <label className="text-[10px] text-slate-500 font-bold uppercase mb-1 block">Tasa USDT Actual</label>
                  <input value={rateP2P} onChange={e=>setRateP2P(e.target.value)} type="number" placeholder="Ej: 40.5" className="w-full bg-slate-950 p-3 rounded-xl text-sm text-white border border-slate-700 outline-none focus:border-pink-500"/>
              </div>
          </div>
          
          {amount && rateP2P && (
              <div className="bg-pink-900/10 p-3 rounded-lg text-xs text-pink-200 border border-pink-900/30 text-center">
                  Bloquearás: <span className="font-mono font-bold text-pink-400">{currency === 'USDT' ? amount : (parseFloat(amount)/parseFloat(rateP2P)).toFixed(2)} USDT</span> de tu Saldo Operativo.
              </div>
          )}

          <button onClick={addLoan} className="w-full bg-pink-600 hover:bg-pink-500 py-3 rounded-xl text-sm font-bold text-white shadow-lg transition-colors mt-2 flex justify-center items-center gap-2"><CornerRightUp size={16}/> Debitar y Prestar</button>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider pl-1">Capital Diferido (Por Cobrar)</h3>
        {loans.length === 0 && <p className="text-center text-slate-600 text-sm py-4">Nadie te debe dinero actualmente.</p>}
        {loans.map(loan => (
          <div key={loan.id} className="bg-slate-900 p-4 rounded-xl border border-slate-800 relative overflow-hidden group">
            {settleId === loan.id ? (
                <div className="animate-in fade-in slide-in-from-right-4">
                    <p className="text-xs text-emerald-400 font-bold mb-2">Liquidar Deuda de {loan.debtor}</p>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                        <input type="number" value={settleVes} onChange={e=>setSettleVes(e.target.value)} placeholder="Bs Recibidos" className="bg-slate-950 p-2 rounded text-white border border-emerald-500/30 text-sm outline-none"/>
                        <input type="number" value={settleRate} onChange={e=>setSettleRate(e.target.value)} placeholder="Tasa USDT Hoy" className="bg-slate-950 p-2 rounded text-white border border-emerald-500/30 text-sm outline-none"/>
                    </div>
                    
                    {settleVes && settleRate && (
                        <p className="text-[10px] text-slate-400 mt-2 mb-3 bg-slate-950 p-2 rounded border border-slate-800">
                            Recuperas <span className="text-white font-mono font-bold">{(parseFloat(settleVes)/parseFloat(settleRate)).toFixed(2)} USDT</span>. 
                            (Ganancia generada: <span className="text-emerald-400 font-bold">+${((parseFloat(settleVes)/parseFloat(settleRate)) - loan.amountUsd).toFixed(2)}</span>)
                        </p>
                    )}

                    <div className="flex gap-2">
                        <button onClick={()=>setSettleId(null)} className="flex-1 bg-slate-800 py-2 rounded text-slate-300 text-sm">Cancelar</button>
                        <button onClick={handleSettle} className="flex-1 bg-emerald-600 hover:bg-emerald-500 py-2 rounded text-white font-bold text-sm flex justify-center items-center gap-1"><CornerLeftDown size={14}/> Cobrar</button>
                    </div>
                </div>
            ) : (
                <div className="flex justify-between items-center">
                    <div>
                        <p className="text-sm font-bold text-white flex items-center gap-2"><User size={14} className="text-slate-500"/> {loan.debtor}</p>
                        <p className="text-[10px] text-slate-500 mt-1">Salió a Tasa: {loan.initialRate}</p>
                    </div>
                    <div className="text-right">
                        <span className="font-mono text-lg font-black text-pink-400 block">${safeNum(loan.amountUsd).toFixed(2)}</span>
                        <button onClick={() => setSettleId(loan.id)} className="text-[10px] bg-slate-800 text-slate-300 px-3 py-1 rounded-full mt-1 border border-slate-700 hover:bg-emerald-600 hover:text-white transition-colors">
                            Recibir Pago
                        </button>
                    </div>
                </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Simuladores
function SimulatorModule() {
  const [tab, setTab] = useState('cycles'); 
  return (
    <div className="pb-20">
      <div className="bg-slate-900 p-2 sticky top-0 z-50 border-b border-slate-800">
        <div className="flex bg-slate-950 p-1 rounded-xl overflow-x-auto no-scrollbar gap-1">
            <button onClick={() => setTab('cycles')} className={`flex-1 py-2 px-3 text-[10px] font-bold uppercase rounded-lg whitespace-nowrap transition-colors ${tab === 'cycles' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500'}`}>Ciclos</button>
            <button onClick={() => setTab('telegram')} className={`flex-1 py-2 px-3 text-[10px] font-bold uppercase rounded-lg whitespace-nowrap transition-colors ${tab === 'telegram' ? 'bg-slate-800 text-blue-400 shadow-sm' : 'text-slate-500'}`}>Tele-P2P</button>
            <button onClick={() => setTab('simple')} className={`flex-1 py-2 px-3 text-[10px] font-bold uppercase rounded-lg whitespace-nowrap transition-colors ${tab === 'simple' ? 'bg-slate-800 text-emerald-400 shadow-sm' : 'text-slate-500'}`}>Brecha</button>
        </div>
      </div>
      {tab === 'cycles' && <CycleSimulator />}
      {tab === 'telegram' && <TelegramArbitrageCalc />}
      {tab === 'simple' && <SimpleGapCalculator />}
    </div>
  );
}

function TelegramArbitrageCalc() {
  const [adPrice, setAdPrice] = useState(900); const [tonUsdt, setTonUsdt] = useState(1.72); const [sellUsdt, setSellUsdt] = useState(533); const [isLoadingPrice, setIsLoadingPrice] = useState(false);
  const bankFeePM = 0.003; 

  const fetchTonPrice = async () => {
      setIsLoadingPrice(true);
      try {
          const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd');
          const data = await response.json();
          if (data && data['the-open-network'] && data['the-open-network'].usd) { setTonUsdt(data['the-open-network'].usd); }
      } catch (error) { alert("Error de conexión"); } finally { setIsLoadingPrice(false); }
  };

  const effectivePriceBank = adPrice; const impliedUsdtBank = effectivePriceBank / tonUsdt; const gapBank = impliedUsdtBank > 0 ? ((sellUsdt - impliedUsdtBank) / impliedUsdtBank) * 100 : 0;
  const effectivePricePM = adPrice * (1 + bankFeePM); const impliedUsdtPM = effectivePricePM / tonUsdt; const gapPM = impliedUsdtPM > 0 ? ((sellUsdt - impliedUsdtPM) / impliedUsdtPM) * 100 : 0;

  return (
    <div className="p-4 space-y-4 animate-in fade-in">
       <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
           <h3 className="text-xs text-blue-400 font-bold uppercase mb-4 flex items-center gap-2"><MessageCircle size={14}/> Compra Implícita USDT (Vía TON)</h3>
           <div className="space-y-4">
               <div><label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Precio Anuncio (Bs por 1 TON)</label><input type="number" value={adPrice} onChange={e=>setAdPrice(parseFloat(e.target.value)||0)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-bold outline-none"/></div>
               <div className="grid grid-cols-2 gap-3">
                   <div><label className="text-[10px] text-slate-500 font-bold uppercase block mb-1 flex justify-between items-center"><span>Ref. TON/USDT</span><button onClick={fetchTonPrice} disabled={isLoadingPrice} className="text-blue-400 hover:text-white transition-colors bg-blue-500/10 p-1 rounded">{isLoadingPrice ? <Loader2 size={12} className="animate-spin"/> : <RefreshCw size={12}/>}</button></label><input type="number" step="0.01" value={tonUsdt} onChange={e=>setTonUsdt(parseFloat(e.target.value)||0)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-bold outline-none"/></div>
                   <div><label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Venta Final USDT (Bs)</label><input type="number" value={sellUsdt} onChange={e=>setSellUsdt(parseFloat(e.target.value)||0)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-bold outline-none"/></div>
               </div>
           </div>
       </div>
       <div className="grid grid-cols-2 gap-3">
           <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 relative overflow-hidden"><div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div><p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Mismo Banco</p><h2 className={`text-2xl font-bold ${gapBank > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{gapBank > 0 ? '+' : ''}{gapBank.toFixed(2)}%</h2><div className="mt-2 pt-2 border-t border-slate-800"><p className="text-[10px] text-slate-500">Costo Real</p><p className="text-sm font-mono text-white">{impliedUsdtBank.toFixed(2)}</p></div></div>
           <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 relative overflow-hidden"><div className="absolute top-0 left-0 w-full h-1 bg-purple-500"></div><p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Pago Móvil</p><h2 className={`text-2xl font-bold ${gapPM > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{gapPM > 0 ? '+' : ''}{gapPM.toFixed(2)}%</h2><div className="mt-2 pt-2 border-t border-slate-800"><p className="text-[10px] text-slate-500">Costo Real</p><p className="text-sm font-mono text-white">{impliedUsdtPM.toFixed(2)}</p></div></div>
       </div>
    </div>
  );
}

function CycleSimulator() {
  const [initialCapital, setInitialCapital] = useState(500); const [sellRate, setSellRate] = useState(40); const [buyRate, setBuyRate] = useState(39.5); const [commission, setCommission] = useState(0.2); const [numCycles, setNumCycles] = useState(1); const [compound, setCompound] = useState(false); const [results, setResults] = useState({ profitUsdt: 0, profitPercentage: 0, totalVolume: 0, netBs: 0, netUsdtReturned: 0, sellFeeBs: 0, buyFeeUsdt: 0, totalFeesPaidUsdt: 0 });
  useEffect(() => {
    let currentCapital = initialCapital; let totalVolume = 0; let totalFeesPaidUsdt = 0;
    const singleGrossBs = initialCapital * sellRate; const singleSellFeeBs = singleGrossBs * (commission / 100); const singleNetBs = singleGrossBs - singleSellFeeBs; const singleGrossUsdt = singleNetBs / buyRate; const singleBuyFeeUsdt = singleGrossUsdt * (commission / 100); const singleNetUsdt = singleGrossUsdt - singleBuyFeeUsdt;
    for (let i = 0; i < numCycles; i++) {
        const grossBs = currentCapital * sellRate; const sellFeeBs = grossBs * (commission / 100); const netBs = grossBs - sellFeeBs; const grossUsdtReturned = netBs / buyRate; const buyFeeUsdt = grossUsdtReturned * (commission / 100); const netUsdtReturned = grossUsdtReturned - buyFeeUsdt;
        totalVolume += (currentCapital + grossUsdtReturned); totalFeesPaidUsdt += ((sellFeeBs / sellRate) + buyFeeUsdt);
        if (compound) currentCapital = netUsdtReturned; else currentCapital = initialCapital;
    }
    const totalProfit = compound ? currentCapital - initialCapital : (singleNetUsdt - initialCapital) * numCycles;
    setResults({ profitUsdt: totalProfit, profitPercentage: (totalProfit / initialCapital) * 100, totalVolume, netBs: singleNetBs, netUsdtReturned: singleNetUsdt, sellFeeBs: singleSellFeeBs, buyFeeUsdt: singleBuyFeeUsdt, totalFeesPaidUsdt });
  }, [initialCapital, sellRate, buyRate, commission, numCycles, compound]);
  const formatUsdt = (val) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  return (
    <div className="animate-in fade-in">
        <div className="bg-slate-900/95 backdrop-blur border-b border-slate-800 p-4 sticky top-[57px] z-40 shadow-lg"><div className="flex justify-between items-center"><div><p className="text-[10px] text-slate-500 uppercase font-bold">Ganancia Estimada</p><div className="flex items-baseline gap-2"><h2 className={`text-2xl font-bold ${results.profitUsdt >= 0 ? 'text-white' : 'text-red-500'}`}>{results.profitUsdt > 0 ? '+' : ''}{formatUsdt(results.profitUsdt)} <span className="text-sm font-normal text-slate-500">USDT</span></h2><span className={`text-xs font-bold px-1.5 py-0.5 rounded ${results.profitUsdt >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{results.profitPercentage.toFixed(2)}%</span></div></div><div className="text-right"><p className="text-[10px] text-slate-500 uppercase font-bold">Spread</p><p className="text-lg font-bold text-blue-500">{((sellRate - buyRate) / sellRate * 100).toFixed(2)}%</p></div></div></div>
        <div className="p-4 space-y-4"><div className="bg-slate-900 p-4 rounded-2xl border border-slate-800"><div className="mb-4"><label className="text-xs text-slate-500 font-bold block mb-1">Capital Inicial (USDT)</label><input type="number" value={initialCapital} onChange={e => setInitialCapital(parseFloat(e.target.value)||0)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white font-bold text-lg"/></div><div className="mb-4"><div className="text-xs text-slate-500 font-bold block mb-2 flex justify-between items-center"><span>Ciclos Repetidos</span><div className="flex items-center gap-2"><span className={`text-[10px] uppercase font-bold ${compound ? 'text-purple-400' : 'text-slate-500'}`}>{compound ? 'Compuesto' : 'Simple'}</span><div onClick={() => setCompound(!compound)} className="cursor-pointer text-slate-400 hover:text-white transition-colors">{compound ? <ToggleRight size={24} className="text-purple-500"/> : <ToggleLeft size={24}/>}</div></div></div><div className="flex items-center gap-3"><input type="range" min="1" max="20" value={numCycles} onChange={e => setNumCycles(parseInt(e.target.value))} className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"/><span className="text-blue-400 font-bold font-mono text-lg w-8 text-center">{numCycles}</span></div></div><div className="grid grid-cols-2 gap-3 mb-4"><div><label className="text-[10px] text-red-500 font-bold uppercase block mb-1">Venta (Roja)</label><input type="number" value={sellRate} onChange={e => setSellRate(parseFloat(e.target.value)||0)} className="w-full bg-slate-950 border border-red-500/30 rounded-xl p-2 text-white font-mono outline-none"/></div><div><label className="text-[10px] text-emerald-500 font-bold uppercase block mb-1">Compra (Verde)</label><input type="number" value={buyRate} onChange={e => setBuyRate(parseFloat(e.target.value)||0)} className="w-full bg-slate-950 border border-emerald-500/30 rounded-xl p-2 text-white font-mono outline-none"/></div></div><div><label className="text-xs text-slate-500 font-bold block mb-2 flex justify-between"><span>Comisión Exchange</span><span className="text-blue-400">{commission}%</span></label><input type="range" min="0" max="1" step="0.01" value={commission} onChange={e => setCommission(parseFloat(e.target.value))} className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"/></div></div></div>
    </div>
  );
}

function SimpleGapCalculator() {
  const [buy, setBuy] = useState(''); const [sell, setSell] = useState(''); const [amount, setAmount] = useState('100');
  const gap = parseFloat(sell) - parseFloat(buy); const percent = parseFloat(buy) > 0 ? (gap / parseFloat(buy)) * 100 : 0; const profit = parseFloat(sell) > 0 ? (gap * parseFloat(amount)) / parseFloat(sell) : 0; 
  return (
    <div className="p-4 mt-4 animate-in fade-in"><div className="bg-slate-900 p-6 rounded-3xl border border-slate-800 shadow-xl"><div className="text-center mb-6"><p className="text-xs text-slate-400 uppercase font-bold mb-2">Margen Bruto</p><h2 className={`text-4xl font-black ${percent > 1 ? 'text-emerald-400' : percent > 0 ? 'text-yellow-400' : 'text-red-400'}`}>{percent.toFixed(2)}%</h2></div><div className="grid grid-cols-2 gap-4 mb-4"><div><label className="text-xs text-emerald-400 font-bold block mb-1">Compra</label><input type="number" value={buy} onChange={e=>setBuy(e.target.value)} className="w-full bg-slate-950 p-3 rounded-xl text-white border border-slate-700 outline-none font-mono"/></div><div><label className="text-xs text-red-400 font-bold block mb-1">Venta</label><input type="number" value={sell} onChange={e=>setSell(e.target.value)} className="w-full bg-slate-950 p-3 rounded-xl text-white border border-slate-700 outline-none font-mono"/></div></div><div className="bg-slate-950 p-4 rounded-xl border border-slate-800"><label className="text-[10px] text-slate-500 uppercase font-bold mb-1 block">Inversión (USDT)</label><div className="flex gap-2 items-center"><input type="number" value={amount} onChange={e=>setAmount(e.target.value)} className="w-24 bg-transparent border-b border-slate-700 text-white font-bold outline-none"/><span className="text-slate-400 text-sm">USDT</span><div className="ml-auto text-right"><p className="text-[10px] text-slate-500">Ganancia</p><p className={`font-bold ${profit > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>+ {profit.toFixed(2)}</p></div></div></div></div></div>
  );
}

function TradeForm({ onTrade, onCancel, forcedMode, isGuest }) {
  const [mode, setMode] = useState(forcedMode || 'buy'); 
  const [inputVal, setInputVal] = useState(''); 
  const [rate, setRate] = useState(''); 
  const [expenseCategory, setExpenseCategory] = useState('Comida'); 
  const [expenseNote, setExpenseNote] = useState(''); 
  const [expenseCurrency, setExpenseCurrency] = useState('VES');
  
  // V4.8: La Máquina del Tiempo (Selector de Fecha)
  const [tradeDate, setTradeDate] = useState(getLocalDateString()); 

  const valInput = parseFloat(inputVal) || 0; const valRate = parseFloat(rate) || 0;
  let calcUSDT = 0; let calcBS = 0; let feeUSDT_Calculated = 0;
  
  if (mode === 'buy') { calcUSDT = valInput; calcBS = valInput * valRate; } else if (mode === 'sell') { calcBS = valInput; calcUSDT = valRate > 0 ? valInput / valRate : 0; }
  
  const handleSubmit = () => {
    if (mode === 'expense') { return onTrade({ type: 'expense', currency: expenseCurrency, amountBS: expenseCurrency === 'VES' ? valInput : 0, amountUSDT: expenseCurrency === 'USDT' ? valInput : 0, rate: expenseCurrency === 'VES' ? valRate : 0, category: expenseCategory, description: expenseNote, dateStr: tradeDate }); }
    if (mode === 'capital') return onTrade({ type: 'capital', amount: valInput, currency: 'USDT', rate: valRate, dateStr: tradeDate });
    onTrade({ type: mode, amountUSDT: calcUSDT, totalBS: calcBS, rate: valRate, feeUSDT: feeUSDT_Calculated, dateStr: tradeDate });
  };

  const categories = [{ id: 'Comida', icon: <Utensils size={16}/>, bg: 'bg-orange-600', border: 'border-orange-500' }, { id: 'Bodega', icon: <Store size={16}/>, bg: 'bg-amber-600', border: 'border-amber-500' }, { id: 'Servicios', icon: <Zap size={16}/>, bg: 'bg-yellow-600', border: 'border-yellow-500' }, { id: 'Compras', icon: <ShoppingBag size={16}/>, bg: 'bg-emerald-600', border: 'border-emerald-500' }, { id: 'Ropa', icon: <Shirt size={16}/>, bg: 'bg-pink-600', border: 'border-pink-500' }, { id: 'Ocio', icon: <Gamepad2 size={16}/>, bg: 'bg-red-600', border: 'border-red-500' }, { id: 'Transporte', icon: <Car size={16}/>, bg: 'bg-blue-600', border: 'border-blue-500' }, { id: 'Diezmo', icon: <Heart size={16}/>, bg: 'bg-indigo-600', border: 'border-indigo-500' }, { id: 'Otros', icon: <HelpCircle size={16}/>, bg: 'bg-slate-600', border: 'border-slate-500' }];
  
  return (
    <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 animate-in fade-in slide-in-from-bottom-8">
      {!forcedMode && (<div className="flex bg-slate-950 p-1 rounded-lg mb-6 gap-1">{['buy', 'sell', 'capital'].map(m => (<button key={m} onClick={() => setMode(m)} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-md transition-colors ${mode === m ? 'bg-slate-800 text-white' : 'text-slate-500'}`}>{m === 'buy' ? 'Comprar' : m === 'sell' ? 'Vender' : 'Fondeo'}</button>))}</div>)}
      
      {mode === 'expense' ? (
        <div className="space-y-4">
            <div className="flex bg-slate-950 p-1 rounded-lg"><button onClick={() => setExpenseCurrency('VES')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded ${expenseCurrency === 'VES' ? 'bg-slate-800 text-white' : 'text-slate-600'}`}>En Bolívares</button><button onClick={() => setExpenseCurrency('USDT')} className={`flex-1 py-2 text-[10px] font-bold uppercase rounded ${expenseCurrency === 'USDT' ? 'bg-slate-800 text-emerald-400' : 'text-slate-600'}`}>En USDT</button></div>
            <div className="flex gap-2">
                <div className="flex-1"><label className="text-[10px] text-slate-400 uppercase font-bold">{expenseCurrency === 'VES' ? 'Monto (Bs)' : 'Monto (USDT)'}</label><input type="number" step="0.01" value={inputVal} onChange={e => setInputVal(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none font-mono text-lg"/></div>
                {expenseCurrency === 'VES' && (<div className="flex-1"><label className="text-[10px] text-slate-400 uppercase font-bold">Tasa Manual (Opcional)</label><input type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} placeholder="Ej: 40.5" className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none font-mono text-lg"/></div>)}
            </div>
            <div className="grid grid-cols-3 gap-2">{categories.map(cat => (<button key={cat.id} onClick={() => setExpenseCategory(cat.id)} className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-bold transition-all ${expenseCategory === cat.id ? `${cat.bg} ${cat.border} text-white shadow-md` : `bg-slate-950 border-slate-700 text-slate-500`}`}>{cat.icon} {cat.id}</button>))}</div>
            <input type="text" value={expenseNote} onChange={e => setExpenseNote(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none" placeholder="Nota / Detalle"/>
        </div>
      ) : (
        <div className="space-y-4"><div><label className="text-[10px] text-slate-400 uppercase font-bold">{mode === 'buy' ? 'USDT a Comprar' : mode === 'sell' ? 'Bs Recibidos' : 'Monto (USDT)'}</label><input type="number" step="0.01" value={inputVal} onChange={e => setInputVal(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none font-mono text-lg"/></div><div><label className="text-[10px] text-slate-400 uppercase font-bold">Tasa Referencia</label><input type="number" step="0.01" value={rate} onChange={e => setRate(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none"/></div></div>
      )}

      {/* V4.8 Control de Fecha (Aparece en todos los modos) */}
      <div className="mt-4 pt-4 border-t border-slate-800">
          <label className="text-[10px] text-slate-400 uppercase font-bold mb-1 flex items-center gap-1"><CalendarDays size={12}/> Fecha Contable</label>
          <input type="date" value={tradeDate} onChange={e => setTradeDate(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none focus:border-blue-500 text-sm [color-scheme:dark]"/>
      </div>

      <div className="flex gap-3 mt-6"><button onClick={onCancel} className="flex-1 py-3 bg-slate-800 rounded-lg text-slate-400 font-bold">Cancelar</button><button onClick={handleSubmit} className="flex-1 py-3 bg-blue-600 rounded-lg text-white font-bold shadow-lg">Guardar</button></div>
    </div>
  );
}

function NavButton({ icon, label, active, onClick, highlight }) {
  return (<button onClick={onClick} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${active ? (highlight ? 'text-blue-400 bg-blue-500/10' : 'text-emerald-400 bg-emerald-400/10') : 'text-slate-500'}`}>{React.cloneElement(icon, { size: 20 })}<span className="text-[10px] font-medium">{label}</span></button>);
}