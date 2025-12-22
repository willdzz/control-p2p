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
  Info
} from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE (MANUAL PARA ESTABILIDAD) ---
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

// --- UTILIDAD DE SEGURIDAD (ANTI-CRASH) ---
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
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para edición manual
  const [editingInventory, setEditingInventory] = useState(false);
  const [tempInv, setTempInv] = useState({ usdt: '', ves: '', avgPrice: '' });

  const appId = 'p2p-v2-production';

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Fetching
  useEffect(() => {
    if (!user) return;
    
    // Timeout de seguridad
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
      setLoading(false);
      clearTimeout(safetyTimeout);
    }, (err) => {
        console.error("Inv Error", err);
        setLoading(false);
    });

    const qLoans = query(collection(db, 'artifacts', appId, 'users', user.uid, 'loans'), orderBy('createdAt', 'desc'));
    const unsubLoans = onSnapshot(qLoans, (snap) => {
      setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Loans Error", err));

    return () => { unsubTx(); unsubInv(); unsubLoans(); clearTimeout(safetyTimeout); };
  }, [user]);

  // --- LÓGICA DE NEGOCIO ---
  const handleTrade = async (data) => {
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
      // Calculamos profit contable solo para registro
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
      // Dolarizar gasto para estadísticas
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

    // Guardar referencia histórica del costo base
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

  // Reset Total (Deep Clean)
  const handleResetApp = async () => {
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
        
        setTransactions([]);
        setLoans([]);
        setInventory({ usdt: 0, ves: 0, avgPrice: 0 });
        setEditingInventory(false);
        setLoading(false);
        alert("Aplicación restablecida de fábrica correctamente.");
    } catch (e) {
        console.error(e);
        alert("Hubo un error al limpiar: " + e.message);
        setLoading(false);
    }
  };

  const saveInventoryManual = async () => {
    const newInv = {
      usdt: safeNum(tempInv.usdt),
      ves: safeNum(tempInv.ves),
      avgPrice: safeNum(tempInv.avgPrice)
    };
    setInventory(newInv);
    const invRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory');
    await setDoc(invRef, newInv);
    setEditingInventory(false);
  };

  const startEditing = () => {
    setTempInv({
      usdt: inventory.usdt,
      ves: inventory.ves,
      avgPrice: inventory.avgPrice
    });
    setEditingInventory(true);
  };

  const handleUpdateAvg = async (newVal) => {
    const price = safeNum(newVal);
    if(price > 0) {
      const newInv = { ...inventory, avgPrice: price };
      setInventory(newInv);
      const invRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory');
      await setDoc(invRef, newInv);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-emerald-500/10 p-4 rounded-full mb-6 ring-2 ring-emerald-500/50">
          <ArrowRightLeft size={48} className="text-emerald-400" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">P2P Trader Pro</h1>
        <p className="text-slate-400 mb-8 max-w-xs">Terminal V3.7.1 - Stats Pro</p>
        <button 
          onClick={() => signInWithPopup(auth, provider)}
          className="bg-white text-slate-900 px-8 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-200 transition-colors"
        >
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="G" />
          Iniciar con Google
        </button>
      </div>
    );
  }

  if (loading) return <div className="h-screen bg-slate-950 flex items-center justify-center text-emerald-500">Cargando datos...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-24 max-w-md mx-auto relative">
      
      {/* HEADER */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 p-6 border-b border-slate-800">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Patrimonio Neto</h2>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">
                $ {(safeNum(inventory.usdt) + (safeNum(inventory.ves) / (safeNum(inventory.avgPrice) || 1))).toFixed(2)}
              </span>
              <span className="text-xs text-slate-500">USDT (Est.)</span>
            </div>
          </div>
          <div className="flex gap-2">
             <button 
               onClick={editingInventory ? () => setEditingInventory(false) : startEditing} 
               className={`p-2 rounded-lg transition-colors ${editingInventory ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
             >
               {editingInventory ? <X size={16}/> : <Edit2 size={16}/>}
             </button>
             <button onClick={() => signOut(auth)} className="bg-slate-800 p-2 rounded-lg text-slate-400 hover:text-white"><LogOut size={16}/></button>
          </div>
        </div>

        {/* MODO EDICIÓN MANUAL */}
        {editingInventory ? (
          <div className="bg-slate-800/50 p-4 rounded-xl border border-blue-500/30 mb-4 animate-in fade-in zoom-in-95">
            <p className="text-xs text-blue-400 font-bold mb-3 uppercase text-center flex items-center justify-center gap-2">
              <Edit2 size={12}/> Calibración Manual
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[10px] text-slate-400">Saldo USDT</label>
                <input type="number" value={tempInv.usdt} onChange={e=>setTempInv({...tempInv, usdt: e.target.value})} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white text-sm"/>
              </div>
              <div>
                <label className="text-[10px] text-slate-400">Promedio</label>
                <input type="number" value={tempInv.avgPrice} onChange={e=>setTempInv({...tempInv, avgPrice: e.target.value})} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white text-sm"/>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-slate-400">Liquidez VES</label>
                <input type="number" value={tempInv.ves} onChange={e=>setTempInv({...tempInv, ves: e.target.value})} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white text-sm"/>
              </div>
            </div>
            
            <div className="space-y-3">
              <button onClick={saveInventoryManual} className="w-full bg-blue-600 py-2 rounded-lg text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-blue-500">
                <Save size={14}/> Guardar Cambios
              </button>
              
              <button onClick={handleResetApp} className="w-full bg-red-500/10 border border-red-500/50 py-2 rounded-lg text-red-400 font-bold text-xs flex items-center justify-center gap-2 hover:bg-red-500 hover:text-white transition-colors">
                <AlertTriangle size={14}/> Restablecer Fábrica (Borrar Todo)
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800/50">
              <div className="flex items-center gap-2 mb-1 justify-between">
                <div className="flex items-center gap-2">
                  <Wallet size={14} className="text-emerald-400"/>
                  <span className="text-xs text-slate-400">Inventario USDT</span>
                </div>
                {/* Visualizador de Precio Promedio Rapido */}
                <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1 rounded">Avg: {safeNum(inventory.avgPrice).toFixed(2)}</span>
              </div>
              <p className="text-lg font-mono font-bold text-white">{safeNum(inventory.usdt).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</p>
              
              {editingInventory ? (
                 <input 
                   autoFocus
                   type="number" 
                   className="w-full bg-slate-950 text-xs p-1 rounded border border-slate-600 text-white"
                   defaultValue={inventory.avgPrice}
                   onBlur={(e) => handleUpdateAvg(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && handleUpdateAvg(e.currentTarget.value)}
                 />
              ) : null}
            </div>
            
            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800/50">
              <div className="flex items-center gap-2 mb-1">
                <Landmark size={14} className="text-blue-400"/>
                <span className="text-xs text-slate-400">Liquidez VES</span>
              </div>
              <p className="text-lg font-mono font-bold text-white">{safeNum(inventory.ves).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>
        )}
      </div>

      {/* BODY */}
      <div className="p-4">
        {view === 'dashboard' && <Dashboard transactions={transactions} inventory={inventory} onDelete={handleDeleteTransaction} />}
        {view === 'trade' && <TradeForm onTrade={handleTrade} onCancel={() => setView('dashboard')} avgPrice={inventory.avgPrice} />}
        {view === 'stats' && <StatsModule transactions={transactions} inventory={inventory} />}
        {view === 'loans' && <LoansModule loans={loans} user={user} db={db} appId={appId} />}
        {view === 'calculator' && <ArbitrageCalc />}
      </div>

      {/* NAV */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur border-t border-slate-800 flex justify-around p-3 max-w-md mx-auto z-50">
        <NavButton icon={<TrendingUp/>} label="Operar" active={view === 'trade'} onClick={() => setView('trade')} />
        <NavButton icon={<History/>} label="Historial" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
        <NavButton icon={<PieChart/>} label="Stats" active={view === 'stats'} onClick={() => setView('stats')} />
        <NavButton icon={<Users/>} label="Deudas" active={view === 'loans'} onClick={() => setView('loans')} />
        <NavButton icon={<Calculator/>} label="Calc" active={view === 'calculator'} onClick={() => setView('calculator')} />
      </div>
    </div>
  );
}

// --- MÓDULOS DE INTERFAZ ---

function Dashboard({ transactions, inventory, onDelete }) {
  // LÓGICA V3.7: Crecimiento Real (Time Travel)
  const todayMetrics = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);
    const startTime = startOfDay.getTime();

    // 1. Filtrar txs de hoy (incluyendo pendientes)
    const todays = transactions.filter(t => {
      const time = t.createdAt ? t.createdAt.seconds * 1000 : Date.now();
      return time > startTime;
    });

    // 2. Reconstruir Patrimonio al inicio del día
    let startUSDT = safeNum(inventory.usdt);
    let startVES = safeNum(inventory.ves);
    
    todays.forEach(tx => {
       if(tx.type === 'buy') {
          startUSDT -= safeNum(tx.amountUSDT);
          startVES += safeNum(tx.totalBS);
       } else if (tx.type === 'sell') {
          startUSDT += (safeNum(tx.amountUSDT) + safeNum(tx.feeUSDT));
          startVES -= safeNum(tx.totalBS);
       } else if (tx.type === 'swap') {
          startUSDT += safeNum(tx.feeUSDT);
       } else if (tx.type === 'expense') {
          startVES += safeNum(tx.amountBS);
       } else if (tx.type === 'capital') {
          if(tx.currency === 'VES') startVES -= safeNum(tx.amount);
          else startUSDT -= safeNum(tx.amount);
       }
    });

    // Valorar Equity
    const valuationRate = safeNum(inventory.avgPrice) || 1;
    const currentEquityUSDT = safeNum(inventory.usdt) + (safeNum(inventory.ves) / valuationRate);
    const startEquityUSDT = startUSDT + (startVES / valuationRate);
    
    // Descontar inyecciones
    const capitalInjectionsUSDT = todays.filter(t => t.type === 'capital').reduce((acc, t) => {
        const val = t.currency === 'USDT' ? safeNum(t.amount) : (safeNum(t.amount) / valuationRate);
        return acc + val;
    }, 0);

    const realGrowth = (currentEquityUSDT - startEquityUSDT) - capitalInjectionsUSDT;

    return { 
        count: todays.length, 
        realGrowth 
    };
  }, [transactions, inventory]);

  return (
    <div className="space-y-4 pb-20">
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
        <div>
          <p className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1"><Calendar size={10}/> Resumen Hoy</p>
          <p className="text-xs text-slate-500 mt-1">Operaciones: <span className="text-white font-mono">{todayMetrics.count}</span></p>
        </div>
        <div className="text-right">
           <p className="text-[10px] text-slate-400 uppercase font-bold">Crecimiento Real</p>
           <p className={`text-xl font-bold ${todayMetrics.realGrowth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
             {todayMetrics.realGrowth >= 0 ? '+' : ''}{todayMetrics.realGrowth.toFixed(2)} USDT
           </p>
        </div>
      </div>

      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Historial</h3>
      {transactions.length === 0 ? (
        <p className="text-slate-600 text-center py-10">Sin movimientos.</p>
      ) : (
        transactions.map(tx => (
          <div key={tx.id} className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex justify-between items-center group relative">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${
                tx.type === 'sell' ? 'bg-emerald-500/20 text-emerald-400' : 
                tx.type === 'buy' ? 'bg-blue-500/20 text-blue-400' : 
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
                <p className="text-[10px] text-slate-500">
                  {tx.type === 'swap' ? `Fee: ${safeNum(tx.feeUSDT)} USDT` :
                   tx.type === 'capital' ? `${tx.currency}` :
                   tx.type === 'expense' ? (tx.description || 'Sin nota') :
                   `@ ${safeNum(tx.rate)}`}
                </p>
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
                {/* Profit contable como referencia visual (aunque el real es el Growth) */}
                {tx.type === 'sell' && (
                  <p className={`text-[10px] ${safeNum(tx.profitUSDT) > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {safeNum(tx.profitUSDT).toFixed(2)} (Contable)
                  </p>
                )}
              </div>
              <button onClick={() => onDelete(tx)} className="p-2 text-slate-700 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// --- MÓDULO DE ESTADÍSTICAS PRO ---
function StatsModule({ transactions, inventory }) {
  const [range, setRange] = useState('day'); 

  const metrics = useMemo(() => {
    const now = new Date();
    const startTime = new Date();
    if (range === 'day') startTime.setHours(0,0,0,0);
    if (range === 'month') startTime.setDate(1); 
    if (range === 'all') startTime.setFullYear(2000); 

    const filteredTxs = transactions.filter(t => {
      const time = t.createdAt ? t.createdAt.seconds * 1000 : Date.now();
      return time > startTime.getTime();
    });

    // Replay Logic
    let startUSDT = safeNum(inventory.usdt);
    let startVES = safeNum(inventory.ves);
    
    filteredTxs.forEach(tx => {
       if(tx.type === 'buy') {
          startUSDT -= safeNum(tx.amountUSDT);
          startVES += safeNum(tx.totalBS);
       } else if (tx.type === 'sell') {
          startUSDT += (safeNum(tx.amountUSDT) + safeNum(tx.feeUSDT));
          startVES -= safeNum(tx.totalBS);
       } else if (tx.type === 'swap') {
          startUSDT += safeNum(tx.feeUSDT);
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

    const totalExpensesUSDT = filteredTxs.filter(t => t.type === 'expense').reduce((acc, t) => {
        return acc + (t.expenseUSDT || (safeNum(t.amountBS) / valuationRate));
    }, 0);

    const byCategory = filteredTxs.filter(t => t.type === 'expense').reduce((acc, curr) => {
      const cat = curr.category || 'Otros';
      const val = curr.expenseUSDT || (safeNum(curr.amountBS) / valuationRate);
      acc[cat] = (acc[cat] || 0) + val;
      return acc;
    }, {});

    return { realGrowthUSDT, totalExpensesUSDT, byCategory };
  }, [transactions, inventory, range]);

  const categories = [
    { id: 'Comida', icon: <Utensils size={16}/>, color: 'text-orange-400', bar: 'bg-orange-500' },
    { id: 'Servicios', icon: <Zap size={16}/>, color: 'text-yellow-400', bar: 'bg-yellow-500' },
    { id: 'Ropa', icon: <Shirt size={16}/>, color: 'text-pink-400', bar: 'bg-pink-500' },
    { id: 'Diezmo', icon: <Heart size={16}/>, color: 'text-red-400', bar: 'bg-red-500' },
    { id: 'Transporte', icon: <Car size={16}/>, color: 'text-blue-400', bar: 'bg-blue-500' },
    { id: 'Salud', icon: <Cross size={16}/>, color: 'text-emerald-400', bar: 'bg-emerald-500' },
    { id: 'Otros', icon: <HelpCircle size={16}/>, color: 'text-slate-400', bar: 'bg-slate-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex bg-slate-800 p-1 rounded-lg justify-center">
         {['day', 'month', 'all'].map(r => (
             <button key={r} onClick={() => setRange(r)} className={`flex-1 py-1 text-xs font-bold rounded capitalize transition-colors ${range === r ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>
               {r === 'day' ? 'Hoy' : r === 'month' ? 'Mes' : 'Todo'}
             </button>
         ))}
      </div>

      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 text-center">
        <p className="text-xs text-slate-400 uppercase font-bold mb-2">Crecimiento Neto (Profit Real)</p>
        <h2 className={`text-4xl font-black ${metrics.realGrowthUSDT >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {metrics.realGrowthUSDT >= 0 ? '+' : ''}{metrics.realGrowthUSDT.toFixed(2)} <span className="text-sm text-slate-500">USDT</span>
        </h2>
        <p className="text-[10px] text-slate-500 mt-2">Base: Inventario + Caja</p>
      </div>

      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2"><PieChart size={16}/> Gastos (USDT)</h3>
            <span className="text-xs font-mono text-red-400 font-bold">Total: ${metrics.totalExpensesUSDT.toFixed(2)}</span>
        </div>
        
        <div className="space-y-4">
          {categories.map(cat => {
            const amount = metrics.byCategory[cat.id] || 0;
            const percent = metrics.totalExpensesUSDT > 0 ? (amount / metrics.totalExpensesUSDT) * 100 : 0;
            if (amount === 0) return null;
            return (
              <div key={cat.id}>
                <div className="flex justify-between text-xs mb-1">
                  <span className={`flex items-center gap-2 font-bold ${cat.color}`}>
                    {cat.icon} {cat.id}
                  </span>
                  <span className="text-slate-300">${amount.toFixed(2)}</span>
                </div>
                <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
                  <div className={`h-full ${cat.bar}`} style={{ width: `${percent}%` }}></div>
                </div>
              </div>
            );
          })}
          {metrics.totalExpensesUSDT === 0 && <p className="text-center text-xs text-slate-600">Sin gastos en este periodo.</p>}
        </div>
      </div>
    </div>
  );
}

function TradeForm({ onTrade, onCancel, avgPrice }) {
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
      <div className="flex bg-slate-950 p-1 rounded-lg mb-6 overflow-x-auto no-scrollbar">
        {['buy', 'sell', 'swap', 'expense', 'capital'].map(m => (
          <button key={m} onClick={() => setMode(m)} className={`flex-1 py-2 px-3 text-[10px] font-bold uppercase rounded-md transition-colors whitespace-nowrap ${mode === m ? (m === 'buy' ? 'bg-blue-600 text-white' : m === 'sell' ? 'bg-emerald-600 text-white' : m === 'swap' ? 'bg-orange-600 text-white' : m === 'capital' ? 'bg-purple-600 text-white' : 'bg-red-600 text-white') : 'text-slate-500 hover:bg-slate-800'}`}>
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
        <button onClick={handleSubmit} className={`flex-1 py-3 rounded-lg text-white font-bold text-sm shadow-lg ${mode === 'buy' ? 'bg-blue-600 hover:bg-blue-500' : mode === 'sell' ? 'bg-emerald-600 hover:bg-emerald-500' : mode === 'swap' ? 'bg-orange-600 hover:bg-orange-500' : mode === 'capital' ? 'bg-purple-600 hover:bg-purple-500' : 'bg-red-600 hover:bg-red-500'}`}>CONFIRMAR</button>
      </div>
    </div>
  );
}

function LoansModule({ loans, user, db, appId }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
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

function ArbitrageCalc() {
  const [buy, setBuy] = useState('');
  const [sell, setSell] = useState('');
  const [amount, setAmount] = useState('100');
  const gap = parseFloat(sell) - parseFloat(buy);
  const profit = (gap * parseFloat(amount)) / parseFloat(sell);
  const percent = parseFloat(buy) > 0 ? ((parseFloat(sell) - parseFloat(buy)) / parseFloat(buy)) * 100 : 0;
  return (
    <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800">
      <h3 className="text-lg font-bold text-white mb-4 flex gap-2"><Calculator/> Calculadora Rápida</h3>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div><label className="text-xs text-blue-400">Compra</label><input type="number" value={buy} onChange={e=>setBuy(e.target.value)} className="w-full bg-slate-950 p-3 rounded text-white border border-slate-700"/></div>
        <div><label className="text-xs text-emerald-400">Venta</label><input type="number" value={sell} onChange={e=>setSell(e.target.value)} className="w-full bg-slate-950 p-3 rounded text-white border border-slate-700"/></div>
      </div>
      <div className="bg-slate-950 p-4 rounded-xl text-center">
        <h2 className={`text-3xl font-bold ${percent > 1 ? 'text-emerald-400' : 'text-yellow-400'}`}>{percent.toFixed(2)}%</h2>
        <p className="text-sm text-slate-300 mt-1">+ {profit.toFixed(2)} USDT</p>
      </div>
    </div>
  );
}

function NavButton({ icon, label, active, onClick }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${active ? 'text-emerald-400 bg-emerald-400/10' : 'text-slate-500'}`}>
      {React.cloneElement(icon, { size: 20 })}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}