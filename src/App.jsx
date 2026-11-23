// ... existing code ...
// Constante de Versión para visualización
const APP_VERSION = "V4.17 Dynamics";

// --- COMPONENTE PRINCIPAL ---
// ... existing code ...
// --- MÓDULO 4: PRESUPUESTOS PERSONALES ---
function PresupuestosModule({ user, db, appId, buckets, budgetDetails, transactions, isGuest, onTrade, onDeleteTx, inventory }) {
  const [distributeAmount, setDistributeAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [editingBuckets, setEditingBuckets] = useState(false);
  const [tempBuckets, setTempBuckets] = useState({ diezmo: 0, sostenimiento: 0, proyectos: 0, patrimonio: 0, reserva: 0 });
  const [activeCard, setActiveCard] = useState(null);

  // Estados para transferencia entre cubetas (V4.17)
  const [transferringBuckets, setTransferringBuckets] = useState(false);
  const [transferFrom, setTransferFrom] = useState('patrimonio');
  const [transferTo, setTransferTo] = useState('sostenimiento');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferFeedback, setTransferFeedback] = useState(null);
  
  // Estados para nuevos items
  const [newItemName, setNewItemName] = useState('');
  const [newItemTarget, setNewItemTarget] = useState('');
  const [fundAmount, setFundAmount] = useState('');

  const updateDetails = async (newDetails) => {
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'budgets', 'details'), newDetails);
  };

  // Lógica de transferencia interna entre cubetas (sin afectar Caja P2P)
  const handleTransferBuckets = async () => {
    setTransferFeedback(null);
    const amt = parseFloat(transferAmount);

    if (!amt || amt <= 0) {
      setTransferFeedback({ type: 'error', text: 'Ingresa un monto válido mayor a 0.' });
      return;
    }
    if (transferFrom === transferTo) {
      setTransferFeedback({ type: 'error', text: 'La cubeta de origen y destino deben ser distintas.' });
      return;
    }

    setIsProcessing(true);
    try {
      const newBuckets = {
        ...buckets,
        [transferFrom]: safeNum(buckets[transferFrom]) - amt,
        [transferTo]: safeNum(buckets[transferTo]) + amt
      };

      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'budgets', 'buckets'), newBuckets);
      setTransferAmount('');
      setTransferFeedback({ type: 'success', text: `Se transfirieron $${amt.toFixed(2)} correctamente.` });
    } catch (error) {
      console.error("Error al transferir entre cubetas:", error);
      setTransferFeedback({ type: 'error', text: 'Error al guardar la transferencia: ' + error.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDistribute = async () => {
// ... existing code ...
      <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider pl-1 mt-6 flex justify-between items-center">
          Mis Cubetas Personales
          <div className="flex gap-2">
              <button
                onClick={() => {
                  setTransferringBuckets(!transferringBuckets);
                  setEditingBuckets(false);
                  setTransferFeedback(null);
                }}
                title="Transferir entre cubetas"
                className={`p-2 transition-colors ${transferringBuckets ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white bg-slate-800'} rounded-lg`}
              >
                  {transferringBuckets ? <X size={14}/> : <ArrowRightLeft size={14}/>}
              </button>
              <button
                onClick={() => {
                  setTempBuckets(buckets);
                  setEditingBuckets(!editingBuckets);
                  setTransferringBuckets(false);
                }}
                title="Ajuste manual"
                className={`p-2 transition-colors ${editingBuckets ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:text-white bg-slate-800'} rounded-lg`}
              >
                  {editingBuckets ? <X size={14}/> : <Edit2 size={14}/>}
              </button>
          </div>
      </h3>

      {transferringBuckets && (
          <div className="bg-slate-800/50 p-4 rounded-xl border border-emerald-500/30 mb-4 animate-in fade-in zoom-in-95 space-y-3">
              <p className="text-xs text-emerald-400 font-bold uppercase text-center flex items-center justify-center gap-2">
                  <ArrowRightLeft size={12}/> Mover Saldo entre Cubetas
              </p>
              <div className="grid grid-cols-2 gap-3">
                  <div>
                      <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Desde (Origen)</label>
                      <select value={transferFrom} onChange={e=>setTransferFrom(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white text-xs outline-none">
                          <option value="sostenimiento">Sostenimiento (${safeNum(buckets.sostenimiento).toFixed(2)})</option>
                          <option value="proyectos">Proyectos (${safeNum(buckets.proyectos).toFixed(2)})</option>
                          <option value="patrimonio">Patrimonio (${safeNum(buckets.patrimonio).toFixed(2)})</option>
                          <option value="diezmo">Diezmo (${safeNum(buckets.diezmo).toFixed(2)})</option>
                          <option value="reserva">Reserva (${safeNum(buckets.reserva).toFixed(2)})</option>
                      </select>
                  </div>
                  <div>
                      <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Hacia (Destino)</label>
                      <select value={transferTo} onChange={e=>setTransferTo(e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white text-xs outline-none">
                          <option value="sostenimiento">Sostenimiento (${safeNum(buckets.sostenimiento).toFixed(2)})</option>
                          <option value="proyectos">Proyectos (${safeNum(buckets.proyectos).toFixed(2)})</option>
                          <option value="patrimonio">Patrimonio (${safeNum(buckets.patrimonio).toFixed(2)})</option>
                          <option value="diezmo">Diezmo (${safeNum(buckets.diezmo).toFixed(2)})</option>
                          <option value="reserva">Reserva (${safeNum(buckets.reserva).toFixed(2)})</option>
                      </select>
                  </div>
              </div>
              <div>
                  <label className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Monto a Transferir (USDT)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ej: 50"
                    value={transferAmount}
                    onChange={e=>setTransferAmount(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-white text-sm font-mono outline-none focus:border-emerald-500"
                  />
              </div>
              {transferFeedback && (
                  <p className={`text-[11px] font-medium text-center p-2 rounded-lg ${transferFeedback.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                      {transferFeedback.text}
                  </p>
              )}
              <button
                onClick={handleTransferBuckets}
                disabled={isProcessing}
                className="w-full bg-emerald-600 py-2 rounded-lg text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-emerald-500 disabled:opacity-50"
              >
                  {isProcessing ? <Loader2 size={14} className="animate-spin"/> : <ArrowRightLeft size={14}/>} Ejecutar Transferencia
              </button>
          </div>
      )}

      {editingBuckets && (
// ... existing code ...
            {mode === 'expense' && (
                <>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-700">
                    <label className="text-[10px] text-slate-400 uppercase font-bold mb-2 block">Fondo de Origen (¿De dónde sale?)</label>
                    <select value={sourceBucket} onChange={e=>setSourceBucket(e.target.value)} className="w-full bg-slate-900 p-2 rounded text-white text-xs border border-slate-600 outline-none">
                        <option value="sostenimiento">🛡️ Sostenimiento Fijo (Mercado/Alquiler/Salidas)</option>
                        <option value="proyectos">✈️ Proyectos / Viajes / Compras grandes</option>
                        <option value="patrimonio">📈 Patrimonio / Inversiones</option>
                        <option value="diezmo">❤️ Diezmo y Ofrendas</option>
                        <option value="reserva">⚠️ Fondo de Reserva (Emergencias)</option>
                        <option value="p2p">💼 Caja Operativa P2P (Afecta Ganancia P2P)</option>
                    </select>
                </div>
// ... existing code ...