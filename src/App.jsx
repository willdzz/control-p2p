import React, { useState, useEffect } from 'react';
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
  setDoc
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
  Trash2
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

    const qTx = query(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), orderBy('createdAt', 'desc'));
    const unsubTx = onSnapshot(qTx, (snap) => {
      setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory');
    const unsubInv = onSnapshot(docRef, (snap) => {
      if (snap.exists()) setInventory(snap.data());
      else setInventory({ usdt: 0, ves: 0, avgPrice: 0 });
      setLoading(false);
    });

    const qLoans = query(collection(db, 'artifacts', appId, 'users', user.uid, 'loans'), orderBy('createdAt', 'desc'));
    const unsubLoans = onSnapshot(qLoans, (snap) => {
      setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => { unsubTx(); unsubInv(); unsubLoans(); };
  }, [user]);

  // --- LÓGICA DE NEGOCIO ---
  const appId = 'p2p-v2-production';

  const handleTrade = async (data) => {
    let newInv = { ...inventory };
    let profit = 0;

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

  // --- NUEVA LÓGICA V2.3: Eliminar Transacción y Revertir Saldo ---
  const handleDeleteTransaction = async (tx) => {
    if(!confirm("¿Borrar esta transacción y revertir los saldos?")) return;

    let newInv = { ...inventory };

    // Lógica inversa
    if (tx.type === 'buy') {
      // Revertir Compra: Devuelve Bs, Resta USDT
      const costWas = (tx.amountUSDT * tx.rate) + (tx.feeBS || 0);
      const usdtWasAdded = tx.amountUSDT - (tx.feeUSDT || 0);

      // Revertir Promedio (Aproximación matemática inversa)
      const currentTotalValue = newInv.usdt * newInv.avgPrice;
      const previousTotalValue = currentTotalValue - costWas;
      const previousUSDT = newInv.usdt - usdtWasAdded;

      newInv.usdt = previousUSDT;
      newInv.ves += costWas;
      newInv.avgPrice = previousUSDT > 0 ? previousTotalValue / previousUSDT : 0;

    } else if (tx.type === 'sell') {
      // Revertir Venta: Devuelve USDT, Resta Bs (Avg Price no cambia en venta)
      const revenueWas = (tx.amountUSDT * tx.rate) - (tx.feeBS || 0);
      const usdtWasDeduced = tx.amountUSDT + (tx.feeUSDT || 0);

      newInv.usdt += usdtWasDeduced;
      newInv.ves -= revenueWas;

    } else if (tx.type === 'expense') {
      // Revertir Gasto: Devuelve Bs
      newInv.ves += tx.amountBS;

    } else if (tx.type === 'capital') {
       if (tx.currency === 'VES') {
         newInv.ves -= tx.amount;
       } else if (tx.currency === 'USDT') {
         const costWas = tx.amount * (tx.rate || 0);
         const currentTotalValue = newInv.usdt * newInv.avgPrice;
         const previousTotalValue = currentTotalValue - costWas;
         const previousUSDT = newInv.usdt - tx.amount;

         newInv.usdt = previousUSDT;
         newInv.avgPrice = previousUSDT > 0 ? previousTotalValue / previousUSDT : 0;
       }
    }

    // 1. Eliminar doc
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', tx.id));

    // 2. Actualizar inventario
    const invRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'inventory');
    await setDoc(invRef, newInv);
  };


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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-20 max-w-md mx-auto relative">
      
      {/* HEADER */}
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
        {view === 'dashboard' && <Dashboard transactions={transactions} onDelete={handleDeleteTransaction} />}
        {view === 'trade' && <TradeForm onTrade={handleTrade} onCancel={() => setView('dashboard')} avgPrice={inventory.avgPrice} />}
        {view === 'loans' && <LoansModule loans={loans} user={user} db={db} appId={'p2p-v2-production'} />}
        {view === 'calculator' && <ArbitrageCalc />}
      </div>

      {/* NAV */}
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

function Dashboard({ transactions, onDelete }) {
  return (
    <div className="space-y-4 pb-20">
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Actividad Reciente</h3>
      {transactions.length === 0 ? (
        <p className="text-slate-600 text-center py-10">Sin movimientos. ¡Hora de fondear!</p>
      ) : (
        transactions.map(tx => (
          <div key={tx.id} className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex justify-between items-center group relative">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${
                tx.type === 'sell' ? 'bg-emerald-500/20 text-emerald-400' : 
                tx.type === 'buy' ? 'bg-blue-500/20 text-blue-400' : 
                tx.type === 'capital' ? 'bg-purple-500/20 text-purple-400' :
                'bg-red-500/20 text-red-400'
              }`}>
                {tx.type === 'sell' ? <ArrowUpRight size={18}/> : 
                 tx.type === 'buy' ? <ArrowDownLeft size={18}/> : 
                 tx.type === 'capital' ? <PlusCircle size={18}/> :
                 <TrendingDown size={18}/>}
              </div>
              <div>
                <p className="font-bold text-sm text-slate-200">
                  {tx.type === 'sell' ? 'Venta USDT' : 
                   tx.type === 'buy' ? 'Compra USDT' : 
                   tx.type === 'capital' ? 'Fondeo de Capital' :
                   tx.description || 'Gasto'}
                </p>
                <p className="text-xs text-slate-500">
                  {tx.type === 'capital' ? `${tx.currency} • Ingreso` :
                   tx.type !== 'expense' ? `@ ${tx.rate} • ${tx.exchange}` : 'Gasto Personal'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className={`font-mono font-bold ${tx.type === 'sell' ? 'text-emerald-400' : 'text-slate-200'}`}>
                  {tx.type === 'expense' ? `-Bs ${tx.amountBS}` : 
                   tx.type === 'capital' ? (tx.currency === 'VES' ? `+Bs ${tx.amount}` : `+$${tx.amount}`) :
                   `$${tx.amountUSDT}`}
                </p>
                {tx.profitUSDT && (
                  <p className={`text-[10px] ${tx.profitUSDT > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    PnL: {tx.profitUSDT > 0 ? '+' : ''}{tx.profitUSDT.toFixed(2)}
                  </p>
                )}
              </div>
              {/* Botón de borrar (V2.3) */}
              <button 
                onClick={() => onDelete(tx)}
                className="p-2 text-slate-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                title="Borrar y revertir"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function TradeForm({ onTrade, onCancel, avgPrice }) {
  const [mode, setMode] = useState('sell'); // sell, buy, expense, capital
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [bankFee, setBankFee] = useState(false);
  const [binanceFee, setBinanceFee] = useState(false);
  const [exchange, setExchange] = useState('Binance');
  const [currency, setCurrency] = useState('VES'); // Para modo capital

  const valAmount = parseFloat(amount) || 0;
  const valRate = parseFloat(rate) || 0;
  
  // Costo Total BS
  let totalBS = valAmount * valRate;
  if (bankFee) totalBS = mode === 'buy' ? totalBS * 1.003 : totalBS * 0.997;

  // Costo Total USDT
  let totalUSDT = valAmount;
  if (binanceFee) totalUSDT = mode === 'buy' ? totalUSDT - 0.06 : totalUSDT + 0.06;

  // Ganancia Estimada
  const estProfit = mode === 'sell' ? (totalBS - (valAmount * avgPrice)) / valRate : 0;

  const handleSubmit = () => {
    if (mode === 'expense') {
      onTrade({ type: 'expense', amountBS: parseFloat(amount), description: rate });
      return;
    }
    if (mode === 'capital') {
      onTrade({ 
        type: 'capital', 
        amount: parseFloat(amount), 
        currency, 
        rate: currency === 'USDT' ? parseFloat(rate) : 0, // Rate solo importa para USDT (costo base)
        exchange: 'Fondeo'
      });
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
      <div className="flex bg-slate-950 p-1 rounded-lg mb-6 overflow-x-auto">
        <button onClick={() => setMode('buy')} className={`flex-1 py-2 px-2 text-[10px] font-bold rounded-md transition-colors ${mode === 'buy' ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>COMPRA</button>
        <button onClick={() => setMode('sell')} className={`flex-1 py-2 px-2 text-[10px] font-bold rounded-md transition-colors ${mode === 'sell' ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>VENTA</button>
        <button onClick={() => setMode('expense')} className={`flex-1 py-2 px-2 text-[10px] font-bold rounded-md transition-colors ${mode === 'expense' ? 'bg-red-600 text-white' : 'text-slate-500'}`}>GASTO</button>
        <button onClick={() => setMode('capital')} className={`flex-1 py-2 px-2 text-[10px] font-bold rounded-md transition-colors ${mode === 'capital' ? 'bg-purple-600 text-white' : 'text-slate-500'}`}>FONDEAR</button>
      </div>

      {mode === 'capital' ? (
        <div className="space-y-4 mb-6">
          <div className="flex gap-2 mb-2">
            <button onClick={() => setCurrency('VES')} className={`flex-1 py-2 rounded border text-xs font-bold ${currency === 'VES' ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'border-slate-700 text-slate-500'}`}>Bs (Liquidez)</button>
            <button onClick={() => setCurrency('USDT')} className={`flex-1 py-2 rounded border text-xs font-bold ${currency === 'USDT' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-slate-700 text-slate-500'}`}>USDT (Inventario)</button>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 uppercase">Monto a Ingresar ({currency})</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none focus:border-purple-500" placeholder="0.00"/>
          </div>

          {currency === 'USDT' && (
             <div>
               <label className="text-[10px] text-slate-400 uppercase">Costo Base / Promedio (Bs/USDT)</label>
               <input type="number" value={rate} onChange={e => setRate(e.target.value)} className="w-full bg-slate-950 p-3 rounded-lg text-white border border-slate-700 outline-none focus:border-purple-500" placeholder="Ej: 45.50 (Opcional, para cuidar promedio)"/>
               <p className="text-[10px] text-slate-500 mt-1">* Si dejas esto en 0, bajará tu precio promedio.</p>
             </div>
          )}
        </div>
      ) : mode !== 'expense' ? (
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

          <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
            <Chip active={exchange === 'Binance'} onClick={() => setExchange('Binance')}>Binance</Chip>
            <Chip active={exchange === 'BingX'} onClick={() => setExchange('BingX')}>BingX</Chip>
            <Chip active={exchange === 'Bitget'} onClick={() => setExchange('Bitget')}>Bitget</Chip>
            <Chip active={exchange === 'OKX'} onClick={() => setExchange('OKX')}>OKX</Chip>
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
        <button onClick={handleSubmit} className={`flex-1 py-3 rounded-lg text-slate-900 font-bold text-sm ${mode === 'buy' ? 'bg-blue-500' : mode === 'sell' ? 'bg-emerald-500' : mode === 'capital' ? 'bg-purple-600' : 'bg-red-500'}`}>
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
    if(confirm("¿Marcar como pagado?")) {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'loans', id));
    }
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
            <option value="USD">USD (Fijo)</option>
            <option value="VES">VES (Bs)</option>
          </select>
          <button onClick={addLoan} className="bg-indigo-600 px-4 py-2 rounded text-xs font-bold text-white">Prestar</button>
        </div>
      </div>

      <div className="space-y-2">
        {loans.map(loan => (
          <div key={loan.id} className="flex justify-between items-center bg-slate-900/50 p-3 rounded-lg border border-slate-800">
            <div>
              <p className="text-sm font-bold text-white">{loan.debtor}</p>
              <p className="text-xs text-slate-500">{new Date(loan.createdAt?.seconds * 1000).toLocaleDateString()}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-indigo-400">{loan.amount} {loan.currency}</span>
              <button onClick={() => settleLoan(loan.id)} className="text-emerald-500 text-xs border border-emerald-500/30 px-2 py-1 rounded hover:bg-emerald-500/10">Cobrar</button>
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
        <div>
           <label className="text-xs text-blue-400">Precio Compra</label>
           <input type="number" value={buy} onChange={e=>setBuy(e.target.value)} className="w-full bg-slate-950 p-3 rounded text-white border border-slate-700"/>
        </div>
        <div>
           <label className="text-xs text-emerald-400">Precio Venta</label>
           <input type="number" value={sell} onChange={e=>setSell(e.target.value)} className="w-full bg-slate-950 p-3 rounded text-white border border-slate-700"/>
        </div>
      </div>
      <div className="mb-6">
        <label className="text-xs text-slate-400">Capital (USDT)</label>
        <input type="number" value={amount} onChange={e=>setAmount(e.target.value)} className="w-full bg-slate-950 p-3 rounded text-white border border-slate-700"/>
      </div>
      
      <div className="bg-slate-950 p-4 rounded-xl text-center">
        <p className="text-xs text-slate-500 mb-1">Rentabilidad Estimada</p>
        <h2 className={`text-3xl font-bold ${percent > 1 ? 'text-emerald-400' : percent > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
          {percent.toFixed(2)}%
        </h2>
        <p className="text-sm text-slate-300 mt-1">
          + {profit.toFixed(2)} USDT
        </p>
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

function Chip({ children, active, onClick }) {
  return (
    <button onClick={onClick} className={`px-3 py-1 rounded-full text-[10px] font-bold whitespace-nowrap border transition-all ${active ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400'}`}>
      {children}
    </button>
  );
}