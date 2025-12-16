import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken
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
  updateDoc
} from 'firebase/firestore';
import { 
  Plus, 
  Minus, 
  RefreshCcw, 
  Wallet, 
  TrendingUp, 
  History, 
  Trash2, 
  AlertCircle 
} from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE ---
// Tus credenciales reales:
const firebaseConfig = {
  apiKey: "AIzaSyCaa72nfDTjHn-VDRe2-IqjnlbXAqJkEu4",
  authDomain: "miwallet-p2p.firebaseapp.com",
  projectId: "miwallet-p2p",
  storageBucket: "miwallet-p2p.firebasestorage.app",
  messagingSenderId: "1028160097126",
  appId: "1:1028160097126:web:170715208170f367e616a7"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
// Usamos un ID fijo para tu app personal
const appId = 'mi-wallet-p2p-personal';

export default function P2PTracker() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [rate, setRate] = useState(0); // Tasa VES/USDT actual
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('dashboard'); // dashboard, add-expense, add-profit

  // Estados del Formulario
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('VES'); // VES o USDT
  const [manualRate, setManualRate] = useState(''); // Para actualizar la tasa global

  // Autenticación Anónima
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Error de autenticación:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  // Cargar Datos
  useEffect(() => {
    if (!user) return;

    // Cargar Transacciones
    const q = query(
      collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeTrans = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(data);
      setLoading(false);
    }, (error) => console.error("Error cargando transacciones:", error));

    // Cargar Configuración (Tasa guardada)
    const settingsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'settings');
    const unsubscribeSettings = onSnapshot(settingsRef, (snapshot) => {
      if (!snapshot.empty) {
        const settings = snapshot.docs[0].data();
        setRate(settings.currentRate || 0);
        if (!manualRate && settings.currentRate) setManualRate(settings.currentRate.toString());
      }
    }, (error) => console.error("Error cargando configuración:", error));

    return () => {
      unsubscribeTrans();
      unsubscribeSettings();
    };
  }, [user]);

  // Actualizar Tasa Global
  const updateGlobalRate = async () => {
    if (!user || !manualRate) return;
    const numRate = parseFloat(manualRate);
    if (isNaN(numRate) || numRate <= 0) return;

    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'settings', 'global_settings');
    
    // Intentar actualizar o crear si no existe
    try {
        await updateDoc(docRef, { currentRate: numRate });
    } catch (e) {
        const { setDoc } = await import('firebase/firestore');
        await setDoc(docRef, { currentRate: numRate });
    }
    
    setRate(numRate);
    alert("Tasa actualizada correctamente");
  };

  // Agregar Transacción
  const handleTransaction = async (type) => {
    if (!amount || !description) return;
    if (currency === 'VES' && (!rate || rate <= 0)) {
      alert("Por favor establece una tasa de cambio primero.");
      return;
    }

    const numAmount = parseFloat(amount);
    let finalAmountUSDT = 0;
    let finalRateUsed = rate;

    // Lógica de Bloqueo Histórico (Lo más importante para P2P)
    if (currency === 'USDT') {
      finalAmountUSDT = numAmount;
      finalRateUsed = null; 
    } else {
      finalAmountUSDT = numAmount / rate;
    }

    const newTx = {
      type, // 'expense' o 'profit'
      originalAmount: numAmount,
      originalCurrency: currency,
      amountUSDT: finalAmountUSDT,
      rateUsed: finalRateUsed,
      description,
      createdAt: serverTimestamp()
    };

    await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'transactions'), newTx);
    
    setAmount('');
    setDescription('');
    setView('dashboard');
  };

  const deleteTransaction = async (id) => {
    if(confirm("¿Borrar este registro?")) {
        await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'transactions', id));
    }
  };

  // Cálculos de Balance
  const stats = useMemo(() => {
    const today = new Date().toDateString();
    
    let totalProfit = 0;
    let totalSpent = 0;
    let todayProfit = 0;
    let todaySpent = 0;

    transactions.forEach(tx => {
      const txDate = tx.createdAt ? tx.createdAt.toDate().toDateString() : new Date().toDateString();
      const isToday = txDate === today;
      
      if (tx.type === 'profit') {
        totalProfit += tx.amountUSDT;
        if (isToday) todayProfit += tx.amountUSDT;
      } else {
        totalSpent += tx.amountUSDT;
        if (isToday) todaySpent += tx.amountUSDT;
      }
    });

    return { totalProfit, totalSpent, todayProfit, todaySpent, balance: totalProfit - totalSpent };
  }, [transactions]);

  if (loading) return <div className="flex items-center justify-center h-screen bg-slate-900 text-white">Cargando tu cartera...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-20 max-w-md mx-auto shadow-2xl overflow-hidden relative">
      
      {/* Header & Rate Setter */}
      <div className="bg-gradient-to-br from-indigo-900 to-slate-900 p-6 rounded-b-3xl shadow-lg border-b border-indigo-500/20">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <RefreshCcw size={20} className="text-emerald-400"/> Control P2P
            </h1>
            <p className="text-xs text-slate-400 mt-1">Gestión de capital en movimiento</p>
          </div>
          <div className="text-right">
             <label className="text-[10px] uppercase tracking-wider text-slate-400">Tasa del momento</label>
             <div className="flex items-center gap-2 bg-slate-800/50 p-1 rounded-lg border border-slate-700">
               <span className="pl-2 text-xs text-slate-400">Bs.</span>
               <input 
                 type="number" 
                 value={manualRate}
                 onChange={(e) => setManualRate(e.target.value)}
                 className="w-16 bg-transparent text-right font-mono font-bold text-emerald-400 outline-none text-sm"
                 placeholder="0.00"
               />
               <button onClick={updateGlobalRate} className="bg-indigo-600 hover:bg-indigo-500 p-1 rounded text-xs">OK</button>
             </div>
          </div>
        </div>

        {/* Big Balance Card */}
        <div className="bg-slate-800/60 backdrop-blur-md p-4 rounded-2xl border border-slate-700/50">
          <div className="text-center">
            <p className="text-slate-400 text-xs mb-1">Balance Neto (Ganancia - Gastos)</p>
            <h2 className={`text-3xl font-bold ${stats.balance >= 0 ? 'text-white' : 'text-red-400'}`}>
              {stats.balance >= 0 ? '+' : ''}{stats.balance.toFixed(2)} <span className="text-sm text-slate-500">USDT</span>
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-700/50">
            <div className="text-center">
              <p className="text-xs text-emerald-400 flex justify-center items-center gap-1"><TrendingUp size={12}/> Ganancia Hoy</p>
              <p className="font-mono font-bold text-lg">+{stats.todayProfit.toFixed(2)}</p>
            </div>
            <div className="text-center border-l border-slate-700/50">
              <p className="text-xs text-rose-400 flex justify-center items-center gap-1"><Wallet size={12}/> Gasto Hoy</p>
              <p className="font-mono font-bold text-lg">-{stats.todaySpent.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4">
        {view === 'dashboard' && (
          <>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-slate-300 flex items-center gap-2">
                <History size={16} /> Movimientos Recientes
              </h3>
              <span className="text-xs text-slate-500 bg-slate-900 px-2 py-1 rounded">
                Refleja valor USDT al momento
              </span>
            </div>

            <div className="space-y-3">
              {transactions.length === 0 ? (
                <div className="text-center py-10 text-slate-600">
                  <p>Sin movimientos aún.</p>
                  <p className="text-xs">Registra tus ganancias diarias o gastos del hogar.</p>
                </div>
              ) : (
                transactions.map((tx) => (
                  <div key={tx.id} className="bg-slate-900 p-3 rounded-xl border border-slate-800 flex justify-between items-center relative group">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${tx.type === 'profit' ? 'bg-emerald-900/30 text-emerald-400' : 'bg-rose-900/30 text-rose-400'}`}>
                        {tx.type === 'profit' ? <TrendingUp size={18} /> : <Wallet size={18} />}
                      </div>
                      <div>
                        <p className="font-medium text-sm text-slate-200">{tx.description}</p>
                        <p className="text-xs text-slate-500">
                          {tx.originalCurrency === 'VES' 
                            ? `Bs. ${tx.originalAmount.toLocaleString()} @ ${tx.rateUsed}` 
                            : 'Directo en USDT'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold font-mono ${tx.type === 'profit' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {tx.type === 'profit' ? '+' : '-'}{tx.amountUSDT.toFixed(2)}
                      </p>
                      <p className="text-[10px] text-slate-600">USDT</p>
                    </div>
                    <button 
                        onClick={() => deleteTransaction(tx.id)}
                        className="absolute right-0 top-0 bottom-0 px-4 bg-red-600/10 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm flex items-center"
                    >
                        <Trash2 size={16}/>
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* Add Transaction Forms */}
        {(view === 'add-expense' || view === 'add-profit') && (
          <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 animate-in fade-in slide-in-from-bottom-4">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              {view === 'add-profit' ? <TrendingUp className="text-emerald-400"/> : <Wallet className="text-rose-400"/>}
              {view === 'add-profit' ? 'Registrar Ganancia/Capital' : 'Registrar Gasto del Hogar'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Monto</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-indigo-500"
                  />
                  <select 
                    value={currency} 
                    onChange={(e) => setCurrency(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-lg px-3 text-sm outline-none"
                  >
                    <option value="VES">VES (Bs)</option>
                    <option value="USDT">USDT</option>
                  </select>
                </div>
              </div>

              {currency === 'VES' && (
                <div className="bg-indigo-900/20 p-2 rounded border border-indigo-500/20 text-xs text-indigo-300 flex items-center gap-2">
                  <AlertCircle size={12}/>
                  Se convertirá usando Tasa: <strong>{rate}</strong>
                </div>
              )}

              <div>
                <label className="block text-xs text-slate-400 mb-1">Concepto</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={view === 'add-profit' ? "Ej: Ganancia del día" : "Ej: Comida, Internet..."}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setView('dashboard')}
                  className="flex-1 py-3 rounded-lg text-slate-400 hover:bg-slate-800 transition-colors font-medium text-sm"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => handleTransaction(view === 'add-profit' ? 'profit' : 'expense')}
                  className={`flex-1 py-3 rounded-lg text-slate-950 font-bold transition-colors shadow-lg ${view === 'add-profit' ? 'bg-emerald-400 hover:bg-emerald-300' : 'bg-rose-400 hover:bg-rose-300'}`}
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Floating Action Bar */}
      {view === 'dashboard' && (
        <div className="fixed bottom-6 left-0 right-0 px-6 flex justify-center gap-4 max-w-md mx-auto pointer-events-none">
          <button 
            onClick={() => setView('add-expense')}
            className="pointer-events-auto flex items-center gap-2 bg-rose-500 hover:bg-rose-400 text-white px-6 py-4 rounded-full shadow-xl shadow-rose-900/30 transition-transform hover:scale-105 active:scale-95 font-bold"
          >
            <Minus size={20} strokeWidth={3} /> Gasto
          </button>
          <button 
            onClick={() => setView('add-profit')}
            className="pointer-events-auto flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 px-6 py-4 rounded-full shadow-xl shadow-emerald-900/30 transition-transform hover:scale-105 active:scale-95 font-bold"
          >
            <Plus size={20} strokeWidth={3} /> Ingreso
          </button>
        </div>
      )}

    </div>
  );
}