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
  where,
  Timestamp
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
  ShoppingBag,
  Utensils,
  Zap,
  Shirt,
  Heart,
  Car,
  HelpCircle,
  Cross,
  Save,
  X,
  AlertTriangle
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

  // Constante Global
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

    const qTx = query(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), orderBy('createdAt', 'desc'));
    const unsubTx = onSnapshot(qTx, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory');
    const unsubInv = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setInventory({
          usdt: parseFloat(data.usdt) || 0,
          ves: parseFloat(data.ves) || 0,
          avgPrice: parseFloat(data.avgPrice) || 0
        });
      } else {
        setInventory({ usdt: 0, ves: 0, avgPrice: 0 });
      }
      setLoading(false);
    });

    const qLoans = query(collection(db, 'artifacts', appId, 'users', user.uid, 'loans'), orderBy('createdAt', 'desc'));
    const unsubLoans = onSnapshot(qLoans, (snap) => {
      setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubTx(); unsubInv(); unsubLoans(); };
  }, [user]);

  // --- LÓGICA DE NEGOCIO ---

  const handleTrade = async (data) => {
    let newInv = { 
      usdt: parseFloat(inventory.usdt) || 0,
      ves: parseFloat(inventory.ves) || 0,
      avgPrice: parseFloat(inventory.avgPrice) || 0
    };
    let profit = 0;

    if (data.type === 'buy') {
      const totalCostOld = newInv.usdt * newInv.avgPrice;
      const costNew = data.totalBS; 
      
      const totalUSDT = newInv.usdt + data.amountUSDT; 
      const totalCost = totalCostOld + costNew;
      
      newInv.avgPrice = totalUSDT > 0 ? totalCost / totalUSDT : 0;
      newInv.usdt = totalUSDT;
      newInv.ves -= costNew;

    } else if (data.type === 'sell') {
      const revenueVES = data.totalBS; 
      const costOfSold = data.amountUSDT * newInv.avgPrice;
      
      profit = revenueVES - costOfSold;
      data.profitUSDT = data.rate > 0 ? profit / data.rate : 0;

      newInv.usdt -= (data.amountUSDT + (data.feeUSDT || 0));
      newInv.ves += revenueVES;
    
    } else if (data.type === 'swap') {
      const fee = data.feeUSDT || 0;
      const totalCost = newInv.usdt * newInv.avgPrice;
      const newTotalUSDT = newInv.usdt - fee;

      newInv.usdt = newTotalUSDT;
      newInv.avgPrice = newTotalUSDT > 0 ? totalCost / newTotalUSDT : 0;

    } else if (data.type === 'expense') {
      newInv.ves -= data.amountBS;

    } else if (data.type === 'capital') {
      if (data.currency === 'VES') {
        newInv.ves += data.amount;
      } else if (data.currency === 'USDT') {
        const totalCostOld = newInv.usdt * newInv.avgPrice;
        const costNew = data.amount * (data.rate || 0); 
        const totalUSDT = newInv.usdt + data.amount;
        const totalCost = totalCostOld + costNew;
        
        newInv.avgPrice = totalUSDT > 0 ? totalCost / totalUSDT : 0;
        newInv.usdt = totalUSDT;
      }
    }

    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), {
      ...data,
      avgPriceAtMoment: inventory.avgPrice,
      createdAt: serverTimestamp()
    });

    const invRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory');
    await setDoc(invRef, newInv);
    setView('dashboard');
  };

  const handleDeleteTransaction = async (tx) => {
    if(!confirm("¿Borrar transacción y revertir saldos?")) return;
    
    let newInv = { 
      usdt: parseFloat(inventory.usdt) || 0,
      ves: parseFloat(inventory.ves) || 0,
      avgPrice: parseFloat(inventory.avgPrice) || 0
    };

    if (tx.type === 'buy') {
      const totalCost = tx.totalBS; 
      const currentTotalVal = newInv.usdt * newInv.avgPrice;
      const prevTotalVal = currentTotalVal - totalCost;
      const prevUSDT = newInv.usdt - tx.amountUSDT;

      newInv.usdt = prevUSDT;
      newInv.ves += totalCost;
      newInv.avgPrice = prevUSDT > 0 ? prevTotalVal / prevUSDT : 0;

    } else if (tx.type === 'sell') {
      const totalUSDTBack = tx.amountUSDT + (tx.feeUSDT || 0);
      newInv.usdt += totalUSDTBack;
      newInv.ves -= tx.totalBS;

    } else if (tx.type === 'swap') {
      const fee = tx.feeUSDT || 0;
      const currentTotalVal = newInv.usdt * newInv.avgPrice;
      const prevUSDT = newInv.usdt + fee;
      newInv.usdt = prevUSDT;
      newInv.avgPrice = prevUSDT > 0 ? currentTotalVal / prevUSDT : 0;

    } else if (tx.type === 'expense') {
      newInv.ves += tx.amountBS;

    } else if (tx.type === 'capital') {
       if (tx.currency === 'VES') newInv.ves -= tx.amount;
       else if (tx.currency === 'USDT') {
         const costWas = tx.amount * (tx.rate || 0);
         const currentTotalVal = newInv.usdt * newInv.avgPrice;
         const prevTotalVal = currentTotalVal - costWas;
         const prevUSDT = newInv.usdt - tx.amount;
         newInv.usdt = prevUSDT;
         newInv.avgPrice = prevUSDT > 0 ? prevTotalVal / prevUSDT : 0;
       }
    }

    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', tx.id));
    const invRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory');
    await setDoc(invRef, newInv);
  };

  const saveInventoryManual = async () => {
    const newInv = {
      usdt: parseFloat(tempInv.usdt) || 0,
      ves: parseFloat(tempInv.ves) || 0,
      avgPrice: parseFloat(tempInv.avgPrice) || 0
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
    const price = parseFloat(newVal);
    if(price > 0) {
      const newInv = { ...inventory, avgPrice: price };
      setInventory(newInv);
      const invRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory');
      await setDoc(invRef, newInv);
      setEditingAvg(false);
    }
  };

  // --- V2.7: FUNCIÓN DE RESET TOTAL ---
  const handleResetApp = async () => {
    if (!confirm("⚠️ PELIGRO: ¿Estás seguro de que quieres BORRAR TODA LA INFORMACIÓN?\n\nSe eliminarán todas las transacciones, deudas y se pondrán los saldos en CERO.\n\nEsta acción no se puede deshacer.")) return;

    setLoading(true);

    // 1. Resetear Inventario
    const invRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory');
    await setDoc(invRef, { usdt: 0, ves: 0, avgPrice: 0 });

    // 2. Borrar Transacciones (Local y Remoto)
    // Nota: Firestore requiere borrar documento por documento si no es desde Admin SDK
    const deleteTxPromises = transactions.map(tx => 
      deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', tx.id))
    );

    // 3. Borrar Préstamos
    const deleteLoanPromises = loans.map(l => 
      deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'loans', l.id))
    );

    await Promise.all([...deleteTxPromises, ...deleteLoanPromises]);
    
    // Resetear estados locales para feedback inmediato
    setTransactions([]);
    setLoans([]);
    setInventory({ usdt: 0, ves: 0, avgPrice: 0 });
    setEditingInventory(false);
    setLoading(false);
    alert("Aplicación restablecida de fábrica correctamente.");
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-emerald-500/10 p-4 rounded-full mb-6 ring-2 ring-emerald-500/50">
          <ArrowRightLeft size={48} className="text-emerald-400" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">P2P Trader Pro</h1>
        <p className="text-slate-400 mb-8 max-w-xs">Terminal V2.7 - Gestión Total.</p>
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
                $ {((inventory.usdt || 0) + ((inventory.ves || 0) / (inventory.avgPrice || 1))).toFixed(2)}
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

        {/* MODO EDICIÓN / RESET */}
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
              
              {/* BOTÓN DE RESET TOTAL V2.7 */}
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
                <button onClick={() => setEditingAvg(!editingAvg)} className="text-xs text-slate-600 hover:text-white"><Edit2 size={12}/></button>
              </div>
              <p className="text-lg font-mono font-bold text-white">{(inventory.usdt || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}</p>
              
              {editingAvg ? (
                 <input 
                   autoFocus
                   type="number" 
                   className="w-full bg-slate-950 text-xs p-1 rounded border border-slate-600 text-white"
                   defaultValue={inventory.avgPrice}
                   onBlur={(e) => handleUpdateAvg(e.target.value)}
                   onKeyDown={(e) => e.key === 'Enter' && handleUpdateAvg(e.currentTarget.value)}
                 />
              ) : (
                 <p className="text-[10px] text-slate-500">Costo Prom: <span className="text-emerald-400">{(inventory.avgPrice || 0).toFixed(4)}</span></p>
              )}
            </div>
            
            <div className="bg-slate-900 p-3 rounded-xl border border-slate-800/50">
              <div className="flex items-center gap-2 mb-1">
                <Landmark size={14} className="text-blue-400"/>
                <span className="text-xs text-slate-400">Liquidez VES</span>
              </div>
              <p className="text-lg font-mono font-bold text-white">{(inventory.ves || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
              <p className="text-[10px] text-slate-500">Bs Disponibles</p>
            </div>
          </div>
        )}
      </div>

      {/* BODY */}
      <div className="p-4">
        {view === 'dashboard' && <Dashboard transactions={transactions} onDelete={handleDeleteTransaction} />}
        {view === 'trade' && <TradeForm onTrade={handleTrade} onCancel={() => setView('dashboard')} avgPrice={inventory.avgPrice} />}
        {view === 'stats' && <StatsModule transactions={transactions} />}
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

function Dashboard({ transactions, onDelete }) {
  const todayStats = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);
    const todays = transactions.filter(t => t.createdAt?.seconds * 1000 > startOfDay.getTime());
    const sold = todays.filter(t => t.type === 'sell').reduce((acc, curr) => acc + curr.totalBS, 0);
    const profit = todays.filter(t => t.type === 'sell').reduce((acc, curr) => acc + (curr.profitUSDT || 0), 0);
    const spent = todays.filter(t => t.type === 'expense').reduce((acc, curr) => acc + curr.amountBS, 0);
    return { count: todays.length, sold, profit, spent };
  }, [transactions]);

  return (
    <div className="space-y-4">
      {/* Resumen Diario */}
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
        <div>
          <p className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1"><Calendar size={10}/> Resumen Hoy</p>
          <p className="text-xs text-slate-500 mt-1">Ventas: <span className="text-white font-mono">{todayStats.sold.toLocaleString()} Bs</span></p>
          <p className="text-xs text-slate-500">Gastos: <span className="text-red-400 font-mono">{todayStats.spent.toLocaleString()} Bs</span></p>
        </div>
        <div className="text-right">
           <p className="text-[10px] text-slate-400 uppercase font-bold">Profit Est.</p>
           <p className={`text-xl font-bold ${todayStats.profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
             {todayStats.profit >= 0 ? '+' : ''}{todayStats.profit.toFixed(2)}
           </p>
           <p className="text-[10px] text-slate-600">{todayStats.count} Ops.</p>
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
                  {tx.type === 'swap' ? `Fee: ${tx.feeUSDT} USDT` :
                   tx.type === 'capital' ? `${tx.currency}` :
                   tx.type === 'expense' ? (tx.description || 'Sin nota') :
                   `@ ${tx.rate} • ${tx.exchange}`}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className={`font-mono font-bold ${tx.type === 'sell' ? 'text-emerald-400' : 'text-slate-200'}`}>
                  {tx.type === 'expense' ? `-Bs ${tx.amountBS.toLocaleString()}` : 
                   tx.type === 'capital' ? (tx.currency === 'VES' ? `+Bs ${tx.amount.toLocaleString()}` : `+$${tx.amount}`) :
                   tx.type === 'swap' ? `-$${tx.feeUSDT}` :
                   `$${tx.amountUSDT.toFixed(2)}`}
                </p>
              </div>
              <button onClick={() => onDelete(tx)} className="p-2 text-slate-700 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function StatsModule({ transactions }) {
  const stats = useMemo(() => {
    // 1. Filtrar solo gastos
    const expenses = transactions.filter(t => t.type === 'expense');
    const totalSpent = expenses.reduce((acc, curr) => acc + curr.amountBS, 0);

    // 2. Agrupar por categoría
    const byCategory = expenses.reduce((acc, curr) => {
      const cat = curr.category || 'Otros';
      acc[cat] = (acc[cat] || 0) + curr.amountBS;
      return acc;
    }, {});

    // 3. Profit Total Histórico
    const totalProfitUSDT = transactions.filter(t => t.type === 'sell').reduce((acc, curr) => acc + (curr.profitUSDT || 0), 0);
    
    // Estimado Profit en Bs (Usando tasa promedio de ventas reciente o referencial)
    const sells = transactions.filter(t => t.type === 'sell');
    const avgSellRate = sells.length > 0 ? (sells.reduce((acc, t) => acc + t.rate, 0) / sells.length) : 0;
    const totalProfitBS = totalProfitUSDT * avgSellRate;

    return { totalSpent, byCategory, totalProfitBS, totalProfitUSDT };
  }, [transactions]);

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
      {/* Tarjeta VS */}
      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2"><ArrowRightLeft size={16}/> Profit vs Gastos</h3>
        
        <div className="flex items-end gap-2 mb-2 h-24">
           {/* Barra Profit */}
           <div className="flex-1 flex flex-col justify-end items-center gap-1 group">
             <span className="text-[10px] text-emerald-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
               ${stats.totalProfitUSDT.toFixed(0)}
             </span>
             <div 
               className="w-full bg-emerald-500/20 border border-emerald-500/50 rounded-t-lg transition-all hover:bg-emerald-500/30"
               style={{ height: `${Math.min(100, (stats.totalProfitBS / (stats.totalProfitBS + stats.totalSpent)) * 100)}%` }}
             ></div>
             <p className="text-[10px] text-emerald-500 font-bold">GANADO</p>
           </div>
           
           {/* Barra Gastos */}
           <div className="flex-1 flex flex-col justify-end items-center gap-1 group">
             <span className="text-[10px] text-red-400 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
               Bs {stats.totalSpent.toLocaleString()}
             </span>
             <div 
               className="w-full bg-red-500/20 border border-red-500/50 rounded-t-lg transition-all hover:bg-red-500/30"
               style={{ height: `${Math.min(100, (stats.totalSpent / (stats.totalProfitBS + stats.totalSpent)) * 100)}%` }}
             ></div>
             <p className="text-[10px] text-red-500 font-bold">GASTADO</p>
           </div>
        </div>
        <p className="text-center text-[10px] text-slate-500">Comparativa histórica global</p>
      </div>

      {/* Desglose por Categoría */}
      <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <h3 className="text-sm font-bold text-slate-300 mb-4 flex items-center gap-2"><PieChart size={16}/> Distribución de Gastos</h3>
        
        <div className="space-y-4">
          {categories.map(cat => {
            const amount = stats.byCategory[cat.id] || 0;
            const percent = stats.totalSpent > 0 ? (amount / stats.totalSpent) * 100 : 0;
            
            if (amount === 0) return null;

            return (
              <div key={cat.id}>
                <div className="flex justify-between text-xs mb-1">
                  <span className={`flex items-center gap-2 font-bold ${cat.color}`}>
                    {cat.icon} {cat.id}
                  </span>
                  <span className="text-slate-300">{amount.toLocaleString()} Bs</span>
                </div>
                <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
                  <div className={`h-full ${cat.bar}`} style={{ width: `${percent}%` }}></div>
                </div>
              </div>
            );
          })}
          {stats.totalSpent === 0 && <p className="text-center text-xs text-slate-600">Aún no hay gastos registrados.</p>}
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
      onTrade({ 
        type: 'expense', 
        amountBS: valInput, 
        category: expenseCategory,
        description: expenseNote 
      });
      return;
    }
    if (mode === 'swap') {
      onTrade({ type: 'swap', amountUSDT: valInput, feeUSDT: parseFloat(swapFee) || 0, description: 'Swap / Transferencia' });
      return;
    }
    if (mode === 'capital') {
      onTrade({ 
        type: 'capital', 
        amount: valInput, 
        currency: capCurrency, 
        rate: capCurrency === 'USDT' ? valRate : 0, 
        exchange: 'Fondeo'
      });
      return;
    }
    onTrade({
      type: mode,
      amountUSDT: calcUSDT,
      totalBS: calcBS,
      rate: valRate,
      feeBS: feeBS_Calculated,
      feeUSDT: feeUSDT_Calculated,
      exchange
    });
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
      
      {/* Selector de Modo */}
      <div className="flex bg-slate-950 p-1 rounded-lg mb-6 overflow-x-auto no-scrollbar">
        {['buy', 'sell', 'swap', 'expense', 'capital'].map(m => (
          <button 
            key={m}
            onClick={() => setMode(m)} 
            className={`flex-1 py-2 px-3 text-[10px] font-bold uppercase rounded-md transition-colors whitespace-nowrap ${
              mode === m 
                ? (m === 'buy' ? 'bg-blue-600 text-white' : 
                   m === 'sell' ? 'bg-emerald-600 text-white' : 
                   m === 'swap' ? 'bg-orange-600 text-white' :
                   m === 'capital' ? 'bg-purple-600 text-white' : 'bg-red-600 text-white')
                : 'text-slate-500 hover:bg-slate-800'
            }`}
          >
            {m === 'buy' ? 'Comprar' : m === 'sell' ? 'Vender' : m === 'swap' ? 'Swap' : m === 'capital' ? 'Fondeo' : 'Gasto'}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        
        {/* INPUT PRINCIPAL */}
        <div>
          <label className="text-[10px] text-slate-400 uppercase font-bold">
            {mode === 'buy' ? 'Cantidad a Comprar (USDT)' :
             mode === 'sell' ? 'Total Bs Recibidos' :
             mode === 'swap' ? 'Monto a Mover (USDT)' :
             mode === 'expense' ? 'Monto Gasto (Bs)' :
             `Monto a Ingresar (${capCurrency})`}
          </label>
          <input 
            type="number" 
            step="0.00000001"
            value={inputVal} 
            onChange={e => setInputVal(e.target.value)} 
            className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none focus:border-blue-500 font-mono text-lg" 
            placeholder="0.00"
          />
        </div>

        {/* SELECTOR DE CATEGORÍAS (SOLO MODO GASTO) */}
        {mode === 'expense' && (
          <div className="space-y-3">
            <label className="text-[10px] text-slate-400 uppercase font-bold">Categoría</label>
            <div className="grid grid-cols-3 gap-2">
               {categories.map(cat => (
                 <button 
                   key={cat.id} 
                   onClick={() => setExpenseCategory(cat.id)}
                   className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-bold transition-all ${
                     expenseCategory === cat.id ? 'bg-red-600 border-red-500 text-white' : 'bg-slate-950 border-slate-700 text-slate-500'
                   }`}
                 >
                   {cat.icon}
                   {cat.id}
                 </button>
               ))}
            </div>
            <div>
              <label className="text-[10px] text-slate-400 uppercase font-bold">Nota (Opcional)</label>
              <input type="text" value={expenseNote} onChange={e => setExpenseNote(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none" placeholder="Ej: Pizza"/>
            </div>
          </div>
        )}

        {/* TASA (NO EN GASTO NI SWAP) */}
        {mode !== 'expense' && mode !== 'swap' && (
          <div>
            {mode === 'capital' && capCurrency === 'VES' ? null : (
              <>
                <label className="text-[10px] text-slate-400 uppercase font-bold">
                   {mode === 'capital' ? 'Costo Base (Opcional)' : 'Tasa de Cambio'}
                </label>
                <input 
                  type="number" 
                  step="0.000001"
                  value={rate} 
                  onChange={e => setRate(e.target.value)} 
                  className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none focus:border-blue-500" 
                  placeholder="0.00"
                />
              </>
            )}
          </div>
        )}

        {/* SWAP EXTRAS */}
        {mode === 'swap' && (
           <div>
             <label className="text-[10px] text-slate-400 uppercase font-bold">Comisión Pagada (USDT)</label>
             <input type="number" value={swapFee} onChange={e => setSwapFee(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none focus:border-orange-500" placeholder="Ej: 1.00"/>
           </div>
        )}

        {/* CAPITAL EXTRAS */}
        {mode === 'capital' && (
          <div className="flex gap-2">
            <button onClick={() => setCapCurrency('VES')} className={`flex-1 py-2 text-xs border rounded ${capCurrency === 'VES' ? 'border-blue-500 text-blue-400 bg-blue-500/10' : 'border-slate-700 text-slate-500'}`}>Bolívares</button>
            <button onClick={() => setCapCurrency('USDT')} className={`flex-1 py-2 text-xs border rounded ${capCurrency === 'USDT' ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10' : 'border-slate-700 text-slate-500'}`}>USDT</button>
          </div>
        )}

        {/* FEES PARA TRADE */}
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
                 <select 
                   value={exchangeFeeType} 
                   onChange={(e) => setExchangeFeeType(e.target.value)}
                   className="bg-slate-900 text-white text-xs p-2 rounded border border-slate-700 outline-none"
                 >
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
        <button onClick={handleSubmit} className={`flex-1 py-3 rounded-lg text-white font-bold text-sm shadow-lg ${
          mode === 'buy' ? 'bg-blue-600 hover:bg-blue-500' : 
          mode === 'sell' ? 'bg-emerald-600 hover:bg-emerald-500' : 
          mode === 'swap' ? 'bg-orange-600 hover:bg-orange-500' :
          mode === 'capital' ? 'bg-purple-600 hover:bg-purple-500' : 
          'bg-red-600 hover:bg-red-500'
        }`}>
          CONFIRMAR
        </button>
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
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'loans'), {
      debtor: name,
      amount: parseFloat(amount),
      currency,
      active: true,
      createdAt: serverTimestamp()
    });
    setName(''); setAmount('');
  };

  const settleLoan = async (id) => {
    if(confirm("¿Marcar como pagado?")) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'loans', id));
  };

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