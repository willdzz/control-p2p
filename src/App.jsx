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
  updateDoc,
  setDoc,
  getDoc
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
  AlertTriangle,
  Landmark,
  PiggyBank,
  ArrowUpRight,
  ArrowDownLeft
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
export default function P2PTraderPro() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('dashboard'); // dashboard, trade, loans, calculator
  const [transactions, setTransactions] = useState([]);
  const [inventory, setInventory] = useState({ usdt: 0, ves: 0, avgPrice: 0 });
  const [loans, setLoans] = useState([]);
  const [loading, setLoading] = useState(true);

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

    const appId = 'p2p-v2-production'; 

    // 1. Cargar Transacciones
    const qTx = query(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), orderBy('createdAt', 'desc'));
    const unsubTx = onSnapshot(qTx, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 2. Cargar Inventario
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory');
    const unsubInv = onSnapshot(docRef, (snap) => {
      if (snap.exists()) setInventory(snap.data());
      else setInventory({ usdt: 0, ves: 0, avgPrice: 0 }); 
      setLoading(false);
    });

    // 3. Cargar Préstamos
    const qLoans = query(collection(db, 'artifacts', appId, 'users', user.uid, 'loans'), orderBy('createdAt', 'desc'));
    const unsubLoans = onSnapshot(qLoans, (snap) => {
      setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubTx(); unsubInv(); unsubLoans(); };
  }, [user]);

  // --- LÓGICA DE NEGOCIO ---

  const handleTrade = async (data) => {
    const appId = 'p2p-v2-production';
    
    let newInv = { ...inventory };
    let profit = 0;

    // 1. Calcular Efecto en Inventario (Promedio Ponderado)
    if (data.type === 'buy') {
      const totalCostOld = newInv.usdt * newInv.avgPrice;
      const costNew = (data.amountUSDT * data.rate) + (data.feeBS || 0); 
      
      const totalUSDT = newInv.usdt + data.amountUSDT - (data.feeUSDT || 0);
      const totalCost = totalCostOld + costNew;
      
      newInv.avgPrice = totalUSDT > 0 ? totalCost / totalUSDT : 0;
      newInv.usdt = totalUSDT;
      newInv.ves -= costNew;

    } else if (data.type === 'sell') {
      const revenueVES = (data.amountUSDT * data.rate) - (data.feeBS || 0);
      const costOfSold = data.amountUSDT * newInv.avgPrice; 
      
      profit = revenueVES - costOfSold; 
      data.profitUSDT = data.rate > 0 ? profit / data.rate : 0;

      newInv.usdt -= data.amountUSDT + (data.feeUSDT || 0);
      newInv.ves += revenueVES;
    
    } else if (data.type === 'expense') {
      newInv.ves -= data.amountBS;
    }

    // 2. Guardar Transacción
    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), {
      ...data,
      avgPriceAtMoment: inventory.avgPrice,
      createdAt: serverTimestamp()
    });

    // 3. Actualizar Inventario Global
    const invRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory');
    await setDoc(invRef, newInv);
    
    setView('dashboard');
  };

  // --- LOGIN ---
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-emerald-500/10 p-4 rounded-full mb-6 ring-2 ring-emerald-500/50">
          <ArrowRightLeft size={48} className="text-emerald-400" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">P2P Trader Pro</h1>
        <p className="text-slate-400 mb-8 max-w-xs">Tu terminal táctica de arbitraje. Control de inventario, promedio ponderado y deudas.</p>
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

  // --- PANTALLAS ---

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-20 max-w-md mx-auto relative">
      
      {/* HEADER: Monitor de Posición */}
      <div className="bg-gradient-to-b from-slate-900 to-slate-950 p-6 border-b border-slate-800">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xs text-slate-400 font-semibold tracking-wider uppercase">Patrimonio Neto</h2>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-white">
                $ {(inventory.usdt + (inventory.ves / (inventory.avgPrice || 1))).toFixed(2)}
              </span>
              <span className="text-xs text-slate-500">USDT (Est.)</span>
            </div>
          </div>
          <button onClick={() => signOut(auth)} className="bg-slate-800 p-2 rounded-lg text-slate-400 hover:text-white"><LogOut size={16}/></button>
        </div>

        {/* Breakdown de Activos */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-900 p-3 rounded-xl border border-slate-800/50">
            <div className="flex items-center gap-2 mb-1">
              <Wallet size={14} className="text-emerald-400"/>
              <span className="text-xs text-slate-400">Inventario USDT</span>
            </div>
            <p className="text-lg font-mono font-bold text-white">{inventory.usdt.toFixed(2)}</p>
            <p className="text-[10px] text-slate-500">Costo Prom: <span className="text-emerald-400">{inventory.avgPrice.toFixed(2)}</span></p>
          </div>
          
          <div className="bg-slate-900 p-3 rounded-xl border border-slate-800/50">
            <div className="flex items-center gap-2 mb-1">
              <Landmark size={14} className="text-blue-400"/>
              <span className="text-xs text-slate-400">Liquidez VES</span>
            </div>
            <p className="text-lg font-mono font-bold text-white">{inventory.ves.toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">Bs Disponibles</p>
          </div>
        </div>
      </div>

      {/* BODY */}
      <div className="p-4">
        {view === 'dashboard' && <Dashboard transactions={transactions} />}
        {view === 'trade' && <TradeForm onTrade={handleTrade} onCancel={() => setView('dashboard')} avgPrice={inventory.avgPrice} />}
        {view === 'loans' && <LoansModule loans={loans} user={user} db={db} appId={'p2p-v2-production'} />}
        {view === 'calculator' && <ArbitrageCalc />}
      </div>

      {/* NAVIGATION BAR */}
      <div className="fixed bottom-0 left-0 right-0 bg-slate-900/90 backdrop-blur border-t border-slate-800 flex justify-around p-3 max-w-md mx-auto">
        <NavButton icon={<TrendingUp/>} label="Operar" active={view === 'trade'} onClick={() => setView('trade')} />
        <NavButton icon={<History/>} label="Historial" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
        <NavButton icon={<Users/>} label="Deudas" active={view === 'loans'} onClick={() => setView('loans')} />
        <NavButton icon={<Calculator/>} label="Calc" active={view === 'calculator'} onClick={() => setView('calculator')} />
      </div>
    </div>
  );
}

// --- SUB-COMPONENTES ---

function Dashboard({ transactions }) {
  return (
    <div className="space-y-4 pb-20">
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Actividad Reciente</h3>
      {transactions.length === 0 ? (
        <p className="text-slate-600 text-center py-10">Sin movimientos. ¡Hora de operar!</p>
      ) : (
        transactions.map(tx => (
          <div key={tx.id} className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${tx.type === 'sell' ? 'bg-emerald-500/20 text-emerald-400' : tx.type === 'buy' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}`}>
                {tx.type === 'sell' ? <ArrowUpRight size={18}/> : tx.type === 'buy' ? <ArrowDownLeft size={18}/> : <TrendingDown size={18}/>}
              </div>
              <div>
                <p className="font-bold text-sm text-slate-200">
                  {tx.type === 'sell' ? 'Venta USDT' : tx.type === 'buy' ? 'Compra USDT' : tx.description || 'Gasto'}
                </p>
                <p className="text-xs text-slate-500">
                  {tx.type !== 'expense' ? `@ ${tx.rate} • ${tx.exchange}` : 'Gasto Personal'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-mono font-bold ${tx.type === 'sell' ? 'text-emerald-400' : 'text-slate-200'}`}>
                {tx.type === 'expense' ? `-Bs ${tx.amountBS}` : `$${tx.amountUSDT}`}
              </p>
              {tx.profitUSDT && (
                <p className={`text-[10px] ${tx.profitUSDT > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  PnL: {tx.profitUSDT > 0 ? '+' : ''}{tx.profitUSDT.toFixed(2)}
                </p>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function TradeForm({ onTrade, onCancel, avgPrice }) {
  const [mode, setMode] = useState('sell'); // sell (Venta), buy (Compra), expense (Gasto)
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [bankFee, setBankFee] = useState(false); // 0.3%
  const [binanceFee, setBinanceFee] = useState(false); // 0.06 USDT
  const [exchange, setExchange] = useState('Binance');

  // Cálculos predictivos
  const valAmount = parseFloat(amount) || 0;
  const valRate = parseFloat(rate) || 0;
  
  // Costo Total BS
  let totalBS = valAmount * valRate;
  if (bankFee) totalBS = mode === 'buy' ? totalBS * 1.003 : totalBS * 0.997; // Si compro pago más, si vendo recibo menos

  // Costo Total USDT
  let totalUSDT = valAmount;
  if (binanceFee) totalUSDT = mode === 'buy' ? totalUSDT - 0.06 : totalUSDT + 0.06;

  // Ganancia Estimada (Solo para Ventas)
  const estProfit = mode === 'sell' ? (totalBS - (valAmount * avgPrice)) / valRate : 0;

  const handleSubmit = () => {
    if (mode === 'expense') {
      onTrade({ type: 'expense', amountBS: parseFloat(amount), description: rate }); // Reusamos campo rate como descripcion
      return;
    }
    onTrade({
      type: mode,
      amountUSDT: valAmount,
      rate: valRate,
      feeBS: bankFee ? (valAmount * valRate * 0.003) : 0,
      feeUSDT: binanceFee ? 0.06 : 0,
      exchange,
      bank: bankFee ? 'Interbancario' : 'Directo'
    });
  };

  return (
    <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 animate-in fade-in slide-in-from-bottom-8">
      {/* Tabs */}
      <div className="flex bg-slate-950 p-1 rounded-lg mb-6">
        <button onClick={() => setMode('buy')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${mode === 'buy' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>COMPRAR</button>
        <button onClick={() => setMode('sell')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${mode === 'sell' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>VENDER</button>
        <button onClick={() => setMode('expense')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${mode === 'expense' ? 'bg-red-600 text-white' : 'text-slate-500'}`}>GASTAR</button>
      </div>

      {mode !== 'expense' ? (
        <>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-[10px] text-slate-400 uppercase">USDT</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none focus:border-blue-500" placeholder="0.00"/>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 uppercase">Tasa</label>
              <input type="number" value={rate} onChange={e => setRate(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none focus:border-blue-500" placeholder="0.00"/>
            </div>
          </div>

          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            <Chip active={exchange === 'Binance'} onClick={() => setExchange('Binance')}>Binance</Chip>
            <Chip active={exchange === 'OKX'} onClick={() => setExchange('OKX')}>OKX</Chip>
            <Chip active={exchange === 'BingX'} onClick={() => setExchange('BingX')}>BingX</Chip>
            <Chip active={exchange === 'Bitget'} onClick={() => setExchange('Bitget')}>Bitget</Chip>
            <Chip active={exchange === 'CoinEx'} onClick={() => setExchange('CoinEx')}>CoinEx</Chip>
            <Chip active={exchange === 'Telegram'} onClick={() => setExchange('Telegram')}>Telegram</Chip>
          </div>

          <div className="flex gap-4 mb-6">
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={bankFee} onChange={e => setBankFee(e.target.checked)} className="accent-blue-500"/>
              Comisión Banco (0.3%)
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={binanceFee} onChange={e => setBinanceFee(e.target.checked)} className="accent-yellow-500"/>
              Fee Binance (0.06)
            </label>
          </div>

          {/* PREVIEW BOX */}
          <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 mb-6">
             <div className="flex justify-between text-xs mb-1">
               <span className="text-slate-400">{mode === 'buy' ? 'Pagarás:' : 'Recibirás:'}</span>
               <span className="text-white font-mono">{totalBS.toLocaleString()} Bs</span>
             </div>
             {mode === 'sell' && (
                <div className="flex justify-between text-xs pt-2 border-t border-slate-800">
                  <span className="text-slate-400">Ganancia Estimada:</span>
                  <span className={`font-bold ${estProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {estProfit >= 0 ? '+' : ''}{estProfit.toFixed(2)} USDT
                  </span>
                </div>
             )}
          </div>
        </>
      ) : (
        <div className="space-y-4 mb-6">
          <div>
              <label className="text-[10px] text-slate-400 uppercase">Monto en Bs</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700" placeholder="0.00"/>
          </div>
          <div>
              <label className="text-[10px] text-slate-400 uppercase">Concepto</label>
              <input type="text" value={rate} onChange={e => setRate(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700" placeholder="Ej: Comida, Transporte..."/>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-3 bg-slate-800 rounded-lg text-slate-400 text-sm font-bold">Cancelar</button>
        <button onClick={handleSubmit} className={`flex-1 py-3 rounded-lg text-slate-900 font-bold text-sm ${mode === 'buy' ? 'bg-blue-500' : mode === 'sell' ? 'bg-emerald-500' : 'bg-red-500'}`}>
          CONFIRMAR
        </button>
      </div>
    </div>
  );
}

function LoansModule({ loans, user, db, appId }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD'); // USD o VES

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
    if(confirm("¿Marcar como pagado?")) {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'loans', id));
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 p-4 rounded-xl border border