import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, addDoc, collection, onSnapshot, query, deleteDoc, serverTimestamp, orderBy, updateDoc } from 'firebase/firestore';
import { ArrowUpCircle, ArrowDownCircle, Trash2, Target, Plus, X, List, Calendar, ChevronLeft, ChevronRight, Edit } from 'lucide-react';

// --- Firebase Configuration ---
// This configuration is provided by the environment.
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Main App Component ---
export default function App() {
    const [auth, setAuth] = useState(null);
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    const [goal, setGoal] = useState(null);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- Firebase Initialization and Authentication ---
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            setAuth(authInstance);
            setDb(dbInstance);

            const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    try {
                        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                            await signInWithCustomToken(authInstance, __initial_auth_token);
                        } else {
                            await signInAnonymously(authInstance);
                        }
                    } catch (error) {
                        console.error("Authentication failed:", error);
                    }
                }
                setIsAuthReady(true);
            });
            return () => unsubscribe();
        } catch (error) {
            console.error("Firebase initialization failed:", error);
            setIsAuthReady(true);
        }
    }, []);

    // --- Data Fetching from Firestore ---
    useEffect(() => {
        if (!isAuthReady || !db || !userId) {
            if (isAuthReady) setLoading(false);
            return;
        };

        setLoading(true);
        
        // Adapt Firestore path based on the environment
        const basePath = typeof __app_id !== 'undefined' ? `artifacts/${appId}/users` : 'users';

        const goalRef = doc(db, basePath, userId, 'goals', 'main');
        const transactionsCol = collection(db, basePath, userId, 'transactions');
        const q = query(transactionsCol, orderBy('date', 'desc'));

        const unsubscribeGoal = onSnapshot(goalRef, (docSnap) => {
            if (docSnap.exists()) {
                setGoal({ id: docSnap.id, ...docSnap.data() });
            } else {
                setGoal(null);
            }
            // Defer setting loading to false until transactions are also loaded
        }, (error) => {
            console.error("Error fetching goal:", error);
            setLoading(false);
        });

        const unsubscribeTransactions = onSnapshot(q, (snapshot) => {
            const trans = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setTransactions(trans);
            setLoading(false); // Now we can stop loading
        }, (error) => {
            console.error("Error fetching transactions:", error);
            setLoading(false);
        });

        return () => {
            unsubscribeGoal();
            unsubscribeTransactions();
        };
    }, [isAuthReady, db, userId]);

    // --- Memoized Calculations ---
    const currentBalance = useMemo(() => {
        return transactions.reduce((acc, t) => acc + t.amount, 0);
    }, [transactions]);

    const progress = useMemo(() => {
        if (!goal || !goal.targetAmount) return 0;
        return Math.max(0, Math.min(100, (currentBalance / goal.targetAmount) * 100));
    }, [currentBalance, goal]);

    // --- Handlers ---
    const handleSetGoal = async (name, targetAmount) => {
        if (!db || !userId) return;
        const basePath = typeof __app_id !== 'undefined' ? `artifacts/${appId}/users` : 'users';
        const goalRef = doc(db, basePath, userId, 'goals', 'main');
        try {
            await setDoc(goalRef, { name, targetAmount: Number(targetAmount), createdAt: serverTimestamp() });
        } catch (error) { console.error("Failed to set goal:", error); }
    };

    const handleUpdateGoal = async (name, targetAmount) => {
        if (!db || !userId) return;
        const basePath = typeof __app_id !== 'undefined' ? `artifacts/${appId}/users` : 'users';
        const goalRef = doc(db, basePath, userId, 'goals', 'main');
        try {
            await updateDoc(goalRef, { name, targetAmount: Number(targetAmount) });
        } catch (error) { console.error("Failed to update goal:", error); }
    };

    const handleAddTransaction = async (transaction) => {
        if (!db || !userId) return;
        const basePath = typeof __app_id !== 'undefined' ? `artifacts/${appId}/users` : 'users';
        const transactionsCol = collection(db, basePath, userId, 'transactions');
        try {
            await addDoc(transactionsCol, { ...transaction, date: serverTimestamp() });
        } catch (error) { console.error("Failed to add transaction:", error); }
    };

    const handleUpdateTransaction = async (id, updatedData) => {
        if (!db || !userId) return;
        const basePath = typeof __app_id !== 'undefined' ? `artifacts/${appId}/users` : 'users';
        const transactionRef = doc(db, basePath, userId, 'transactions', id);
        try {
            await updateDoc(transactionRef, updatedData);
        } catch (error) { console.error("Failed to update transaction:", error); }
    };
    
    const handleDeleteTransaction = async (id) => {
        if (!db || !userId) return;
        const basePath = typeof __app_id !== 'undefined' ? `artifacts/${appId}/users` : 'users';
        const transactionRef = doc(db, basePath, userId, 'transactions', id);
        try {
            await deleteDoc(transactionRef);
        } catch (error) {
            console.error("Failed to delete transaction:", error);
        }
    };

    // --- Render Logic ---
    if (!isAuthReady || loading) return <LoadingSpinner />;

    return (
        <div className="bg-gray-900 text-gray-100 min-h-screen font-sans antialiased">
            <div className="container mx-auto p-4 md:p-8 max-w-4xl">
                <Header userId={userId} />
                {goal ? (
                    <Dashboard
                        goal={goal}
                        currentBalance={currentBalance}
                        progress={progress}
                        transactions={transactions}
                        onAddTransaction={handleAddTransaction}
                        onDeleteTransaction={handleDeleteTransaction}
                        onUpdateGoal={handleUpdateGoal}
                        onUpdateTransaction={handleUpdateTransaction}
                    />
                ) : (
                    <GoalSetter onSetGoal={handleSetGoal} />
                )}
            </div>
            <Footer />
        </div>
    );
}

// --- Sub-components ---

const LoadingSpinner = () => (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-emerald-500"></div>
    </div>
);

const Header = ({ userId }) => (
    <header className="mb-8">
        <h1 className="text-4xl md:text-5xl font-bold text-white text-center tracking-tight">Goalden</h1>
        <p className="text-center text-emerald-400 mt-2">目標達成をアシスト</p>
        {userId && <p className="text-center text-xs text-gray-500 mt-4">UserID: {userId}</p>}
    </header>
);

const GoalSetter = ({ onSetGoal }) => {
    const [name, setName] = useState('');
    const [targetAmount, setTargetAmount] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (name && targetAmount > 0 && !isSubmitting) {
            setIsSubmitting(true);
            await onSetGoal(name, targetAmount);
            // The component will unmount once the goal is set and detected by the listener,
            // so we don't strictly need to set isSubmitting back to false.
        }
    };

    return (
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl animate-fade-in-up">
            <div className="text-center">
                <Target className="mx-auto h-12 w-12 text-emerald-400" />
                <h2 className="mt-4 text-2xl font-bold text-white">最初の目標を設定しましょう</h2>
                <p className="mt-2 text-gray-400">何を達成したいですか？</p>
            </div>
            <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                <div>
                    <label htmlFor="goalName" className="text-sm font-medium text-gray-300">目標名</label>
                    <input id="goalName" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例：沖縄旅行" className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" required disabled={isSubmitting} />
                </div>
                <div>
                    <label htmlFor="targetAmount" className="text-sm font-medium text-gray-300">目標金額</label>
                    <div className="mt-1 relative rounded-md shadow-sm">
                        <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center"><span className="text-gray-400 sm:text-sm">¥</span></div>
                        <input id="targetAmount" type="number" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} placeholder="100000" className="block w-full bg-gray-700 border border-gray-600 rounded-md py-3 px-4 pl-7 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" required min="1" disabled={isSubmitting} />
                    </div>
                </div>
                <button type="submit" className="w-full flex justify-center py-3 px-4 border border-transparent rounded-full shadow-lg text-lg font-bold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-gray-800 transition-all transform hover:scale-105 disabled:bg-emerald-800 disabled:cursor-not-allowed" disabled={isSubmitting}>
                    {isSubmitting ? '設定中...' : '目標を設定する'}
                </button>
            </form>
        </div>
    );
};

const Dashboard = ({ goal, currentBalance, progress, transactions, onAddTransaction, onDeleteTransaction, onUpdateGoal, onUpdateTransaction }) => {
    const [showTransactionForm, setShowTransactionForm] = useState(false);
    const [view, setView] = useState('list');
    const [selectedDate, setSelectedDate] = useState(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isGoalEditorOpen, setIsGoalEditorOpen] = useState(false);
    const [transactionToEdit, setTransactionToEdit] = useState(null);

    const handleDateClick = useCallback((date) => {
        const dateKey = date.toISOString().split('T')[0];
        const transactionsOnDate = transactions.filter(t => t.date && new Date(t.date.seconds * 1000).toISOString().split('T')[0] === dateKey);
        if(transactionsOnDate.length > 0) {
            setSelectedDate(date);
            setIsDetailModalOpen(true);
        }
    }, [transactions]);

    const handleAddAndClose = (transaction) => {
        onAddTransaction(transaction);
        setShowTransactionForm(false);
    };

    const handleUpdateAndClose = (id, updatedData) => {
        onUpdateTransaction(id, updatedData);
        setTransactionToEdit(null);
    };

    const openTransactionEditor = (transaction) => {
        setTransactionToEdit(transaction);
        setIsDetailModalOpen(false); // Close detail modal if open
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="bg-gray-800 p-4 md:p-6 rounded-2xl shadow-lg">
                <button onClick={() => setShowTransactionForm(!showTransactionForm)} className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-bold py-4 px-8 rounded-xl shadow-lg hover:shadow-xl transition-all transform hover:scale-105 text-lg">
                    {showTransactionForm ? <X size={24}/> : <Plus size={24} />}
                    {showTransactionForm ? 'フォームを閉じる' : '収支を記録する'}
                </button>
                {showTransactionForm && <div className="mt-6 animate-fade-in-down"><TransactionForm onAddTransaction={handleAddAndClose} /></div>}
            </div>

            <ProgressCard goal={goal} currentBalance={currentBalance} progress={progress} onEditClick={() => setIsGoalEditorOpen(true)} />
            
            <div className="bg-gray-800 p-4 md:p-6 rounded-2xl shadow-lg">
                <ViewSwitcher view={view} setView={setView} />
                {view === 'list' ? (
                    <TransactionList transactions={transactions} onDeleteTransaction={onDeleteTransaction} onEditTransaction={openTransactionEditor} />
                ) : (
                    <CalendarView transactions={transactions} onDateClick={handleDateClick} />
                )}
            </div>

            {isGoalEditorOpen && <GoalEditorModal goal={goal} onUpdateGoal={onUpdateGoal} onClose={() => setIsGoalEditorOpen(false)} />}
            {transactionToEdit && <TransactionEditorModal transaction={transactionToEdit} onUpdateTransaction={handleUpdateAndClose} onClose={() => setTransactionToEdit(null)} />}
            {isDetailModalOpen && selectedDate && <TransactionDetailModal date={selectedDate} transactions={transactions} onClose={() => setIsDetailModalOpen(false)} onDeleteTransaction={onDeleteTransaction} onEditTransaction={openTransactionEditor} />}
        </div>
    );
};

const ProgressCard = ({ goal, currentBalance, progress, onEditClick }) => {
    const remaining = goal.targetAmount - currentBalance;

    return (
        <div className="bg-gray-800 rounded-2xl shadow-2xl p-6 md:p-8 w-full">
            <div className="flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-2xl md:text-3xl font-bold text-white truncate" title={goal.name}>{goal.name}</h2>
                        <button onClick={onEditClick} className="text-gray-400 hover:text-white transition-colors flex-shrink-0"><Edit size={20} /></button>
                    </div>
                    <p className="text-lg text-emerald-400 mt-1">目標金額: {new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(goal.targetAmount)}</p>
                </div>
                <div className="text-right flex-shrink-0 pl-4">
                    <span className="text-4xl md:text-5xl font-bold text-white drop-shadow-lg">{Math.round(progress)}%</span>
                    <p className="text-gray-400">達成率</p>
                </div>
            </div>
            
            <div className="w-full bg-gray-700 rounded-full h-4 mt-6">
                <div className="bg-emerald-500 h-4 rounded-full" style={{ width: `${progress}%`, transition: 'width 0.5s ease-out' }}></div>
            </div>

            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
                <div className="bg-gray-700/50 p-4 rounded-lg">
                    <p className="text-sm text-gray-400">現在の貯金額</p>
                    <p className="text-2xl font-semibold text-white">{new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(currentBalance)}</p>
                </div>
                <div className="bg-gray-700/50 p-4 rounded-lg">
                    <p className="text-sm text-gray-400">残り金額</p>
                    <p className="text-2xl font-semibold text-white">{new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(Math.max(0, remaining))}</p>
                </div>
            </div>
        </div>
    );
};

const GoalEditorModal = ({ goal, onUpdateGoal, onClose }) => {
    const [name, setName] = useState(goal.name);
    const [targetAmount, setTargetAmount] = useState(goal.targetAmount);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (name && targetAmount > 0) {
            onUpdateGoal(name, targetAmount);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 w-full max-w-md m-4 animate-fade-in-up" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-bold text-white">目標を編集</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="editGoalName" className="text-sm font-medium text-gray-300">目標名</label>
                        <input id="editGoalName" type="text" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" required />
                    </div>
                    <div>
                        <label htmlFor="editTargetAmount" className="text-sm font-medium text-gray-300">目標金額</label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                            <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center"><span className="text-gray-400 sm:text-sm">¥</span></div>
                            <input id="editTargetAmount" type="number" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} className="block w-full bg-gray-700 border border-gray-600 rounded-md py-3 px-4 pl-7 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" required min="1" />
                        </div>
                    </div>
                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={onClose} className="py-2 px-6 rounded-full text-white bg-gray-600 hover:bg-gray-500 transition-colors">キャンセル</button>
                        <button type="submit" className="py-2 px-6 rounded-full text-white bg-emerald-600 hover:bg-emerald-700 transition-colors font-semibold">保存する</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const TransactionForm = ({ onAddTransaction }) => {
    const [type, setType] = useState('income');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!amount || !description) return;
        const finalAmount = type === 'income' ? parseFloat(amount) : -parseFloat(amount);
        onAddTransaction({ type, amount: finalAmount, description });
        setAmount('');
        setDescription('');
    };

    return (
        <div className="bg-gray-800 rounded-2xl">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <button type="button" onClick={() => setType('income')} className={`p-3 rounded-lg text-center font-semibold transition-colors ${type === 'income' ? 'bg-green-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}><ArrowUpCircle className="inline-block mr-2" />収入</button>
                    <button type="button" onClick={() => setType('expense')} className={`p-3 rounded-lg text-center font-semibold transition-colors ${type === 'expense' ? 'bg-red-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}><ArrowDownCircle className="inline-block mr-2" />支出</button>
                </div>
                <div>
                    <label htmlFor="description" className="sr-only">内容</label>
                    <input id="description" type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="内容 (例: 給料, ランチ代)" className="w-full bg-gray-700 border border-gray-600 rounded-md py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" required />
                </div>
                <div>
                    <label htmlFor="amount" className="sr-only">金額</label>
                    <div className="relative">
                        <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center"><span className="text-gray-400 sm:text-sm">¥</span></div>
                        <input id="amount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="金額" className="w-full bg-gray-700 border border-gray-600 rounded-md py-3 px-4 pl-7 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" required min="0" />
                    </div>
                </div>
                <button type="submit" className="w-full py-3 px-4 border border-transparent rounded-full shadow-lg text-lg font-bold text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 focus:ring-offset-gray-800 transition-transform transform hover:scale-105">記録する</button>
            </form>
        </div>
    );
};

const TransactionEditorModal = ({ transaction, onUpdateTransaction, onClose }) => {
    const [type, setType] = useState(transaction.amount > 0 ? 'income' : 'expense');
    const [amount, setAmount] = useState(Math.abs(transaction.amount));
    const [description, setDescription] = useState(transaction.description);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!amount || !description) return;
        const finalAmount = type === 'income' ? parseFloat(amount) : -parseFloat(amount);
        onUpdateTransaction(transaction.id, { description, amount: finalAmount, type });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 w-full max-w-md m-4 animate-fade-in-up" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-bold text-white">記録を編集</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X /></button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <button type="button" onClick={() => setType('income')} className={`p-3 rounded-lg text-center font-semibold transition-colors ${type === 'income' ? 'bg-green-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}><ArrowUpCircle className="inline-block mr-2" />収入</button>
                        <button type="button" onClick={() => setType('expense')} className={`p-3 rounded-lg text-center font-semibold transition-colors ${type === 'expense' ? 'bg-red-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}><ArrowDownCircle className="inline-block mr-2" />支出</button>
                    </div>
                    <div>
                        <label htmlFor="editDescription" className="text-sm font-medium text-gray-300">内容</label>
                        <input id="editDescription" type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full bg-gray-700 border border-gray-600 rounded-md py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" required />
                    </div>
                    <div>
                        <label htmlFor="editAmount" className="text-sm font-medium text-gray-300">金額</label>
                        <div className="relative mt-1">
                            <div className="pointer-events-none absolute inset-y-0 left-0 pl-3 flex items-center"><span className="text-gray-400 sm:text-sm">¥</span></div>
                            <input id="editAmount" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded-md py-3 px-4 pl-7 text-white focus:outline-none focus:ring-2 focus:ring-emerald-500" required min="0" />
                        </div>
                    </div>
                    <div className="flex justify-end gap-4 pt-4">
                        <button type="button" onClick={onClose} className="py-2 px-6 rounded-full text-white bg-gray-600 hover:bg-gray-500 transition-colors">キャンセル</button>
                        <button type="submit" className="py-2 px-6 rounded-full text-white bg-emerald-600 hover:bg-emerald-700 transition-colors font-semibold">保存する</button>
                    </div>
                </form>
            </div>
        </div>
    );
};


const TransactionList = ({ transactions, onDeleteTransaction, onEditTransaction }) => {
    if (transactions.length === 0) {
        return <div className="text-center py-12 animate-fade-in"><p className="text-gray-400">まだ取引履歴がありません。</p><p className="text-gray-500 mt-2">最初の収支を記録してみましょう！</p></div>;
    }
    return (
        <div className="animate-fade-in">
            <h3 className="text-xl font-bold mb-4 px-2">最近の記録</h3>
            <ul className="space-y-3">
                {transactions.map(t => (
                    <li key={t.id} className="flex items-center justify-between bg-gray-700/50 p-3 rounded-lg hover:bg-gray-700 transition-colors group">
                        <div className="flex items-center gap-4">
                            {t.amount > 0 ? <ArrowUpCircle className="text-green-400 flex-shrink-0" size={24} /> : <ArrowDownCircle className="text-red-400 flex-shrink-0" size={24} />}
                            <div>
                                <p className="font-semibold text-white">{t.description}</p>
                                <p className="text-sm text-gray-400">{t.date ? new Date(t.date.seconds * 1000).toLocaleDateString('ja-JP') : '日付不明'}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <p className={`font-bold text-lg ${t.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>{new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(t.amount)}</p>
                            <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => onEditTransaction(t)} className="text-gray-400 hover:text-emerald-400 p-2"><Edit size={16} /></button>
                                <button onClick={() => onDeleteTransaction(t.id)} className="text-gray-400 hover:text-red-500 p-2"><Trash2 size={16} /></button>
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

const TransactionDetailModal = ({ date, transactions, onClose, onDeleteTransaction, onEditTransaction }) => {
    const dateKey = date.toISOString().split('T')[0];
    const dailyTransactions = useMemo(() => {
        return transactions.filter(t => t.date && new Date(t.date.seconds * 1000).toISOString().split('T')[0] === dateKey).sort((a, b) => b.date.seconds - a.date.seconds);
    }, [date, transactions]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
            <div className="bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-lg m-4 animate-fade-in-up" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-white">{new Date(date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })} の収支</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white"><X /></button>
                </div>
                {dailyTransactions.length > 0 ? (
                    <ul className="space-y-3 max-h-96 overflow-y-auto pr-2">
                        {dailyTransactions.map(t => (
                            <li key={t.id} className="flex items-center justify-between bg-gray-700/50 p-3 rounded-lg group">
                                <div className="flex items-center gap-4">
                                    {t.amount > 0 ? <ArrowUpCircle className="text-green-400 flex-shrink-0" size={24} /> : <ArrowDownCircle className="text-red-400 flex-shrink-0" size={24} />}
                                    <div><p className="font-semibold text-white">{t.description}</p></div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <p className={`font-bold text-lg ${t.amount > 0 ? 'text-green-400' : 'text-red-400'}`}>{new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(t.amount)}</p>
                                    <div className="flex opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => onEditTransaction(t)} className="text-gray-400 hover:text-emerald-400 p-2"><Edit size={16} /></button>
                                        <button onClick={() => onDeleteTransaction(t.id)} className="text-gray-400 hover:text-red-500 p-2"><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-gray-400 text-center py-4">この日の取引はありません。</p>
                )}
            </div>
        </div>
    );
};

const ViewSwitcher = ({ view, setView }) => (
    <div className="flex justify-center mb-6">
        <div className="bg-gray-700 p-1 rounded-full flex items-center">
            <button onClick={() => setView('list')} className={`px-4 py-2 text-sm font-semibold rounded-full transition-colors ${view === 'list' ? 'bg-emerald-500 text-white' : 'text-gray-300 hover:bg-gray-600'}`}><List className="inline-block mr-2" size={16} />リスト</button>
            <button onClick={() => setView('calendar')} className={`px-4 py-2 text-sm font-semibold rounded-full transition-colors ${view === 'calendar' ? 'bg-emerald-500 text-white' : 'text-gray-300 hover:bg-gray-600'}`}><Calendar className="inline-block mr-2" size={16} />カレンダー</button>
        </div>
    </div>
);

const CalendarView = ({ transactions, onDateClick }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const dailyData = useMemo(() => {
        const data = {};
        transactions.forEach(t => {
            if (t.date && t.date.seconds) {
                const dateKey = new Date(t.date.seconds * 1000).toISOString().split('T')[0];
                if (!data[dateKey]) data[dateKey] = { income: 0, expense: 0 };
                if (t.amount > 0) data[dateKey].income += t.amount; else data[dateKey].expense += t.amount;
            }
        });
        return data;
    }, [transactions]);

    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const startDay = startOfMonth.getDay();
    const daysInMonth = endOfMonth.getDate();
    const calendarDays = [];
    for (let i = 0; i < startDay; i++) calendarDays.push(<div key={`empty-start-${i}`} className="border-r border-b border-gray-700"></div>);
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        const dateKey = date.toISOString().split('T')[0];
        const dataForDay = dailyData[dateKey];
        const isToday = new Date().toISOString().split('T')[0] === dateKey;
        calendarDays.push(
            <div key={day} onClick={() => onDateClick(date)} className={`p-2 border-r border-b border-gray-700 flex flex-col justify-between h-24 md:h-32 transition-colors ${dataForDay ? 'cursor-pointer hover:bg-gray-600/50' : ''}`}>
                <div><span className={`font-bold ${isToday ? 'text-emerald-400' : 'text-white'}`}>{day}</span></div>
                {dataForDay && <div className="text-xs text-right">{dataForDay.income > 0 && <p className="text-green-400 truncate">+ {dataForDay.income.toLocaleString()}</p>}{dataForDay.expense < 0 && <p className="text-red-400 truncate">{dataForDay.expense.toLocaleString()}</p>}</div>}
            </div>
        );
    }
    const remainingCells = (7 - (calendarDays.length % 7)) % 7;
    for (let i = 0; i < remainingCells; i++) calendarDays.push(<div key={`empty-end-${i}`} className="border-r border-b border-gray-700"></div>);
    const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

    return (
        <div className="animate-fade-in">
            <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className="p-2 rounded-full hover:bg-gray-700"><ChevronLeft /></button>
                <h3 className="text-lg font-bold">{currentDate.getFullYear()}年 {currentDate.getMonth() + 1}月</h3>
                <button onClick={nextMonth} className="p-2 rounded-full hover:bg-gray-700"><ChevronRight /></button>
            </div>
            <div className="grid grid-cols-7 border-t border-l border-gray-700">
                {weekdays.map(day => <div key={day} className="text-center font-semibold text-sm py-2 border-r border-b border-gray-700 text-emerald-400">{day}</div>)}
                {calendarDays}
            </div>
        </div>
    );
};

const Footer = () => (
    <footer className="text-center py-6 mt-8">
        <p className="text-sm text-gray-500">&copy; {new Date().getFullYear()} Goalden. All rights reserved.</p>
    </footer>
);

const style = document.createElement('style');
style.textContent = `
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes fade-in-up { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fade-in-down { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
  .animate-fade-in { animation: fade-in 0.5s ease-out forwards; }
  .animate-fade-in-up { animation: fade-in-up 0.5s ease-out forwards; }
  .animate-fade-in-down { animation: fade-in-down 0.5s ease-out forwards; }
`;
document.head.appendChild(style);
