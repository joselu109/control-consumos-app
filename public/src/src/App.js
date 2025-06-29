import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query } from 'firebase/firestore';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// --- Helper: OBTENER CONFIGURACIÓN Y VARIABLES DE ENTORNO ---
// Estas variables son proporcionadas por el entorno de ejecución
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-consumo-app';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;


// --- COMPONENTES DE LA INTERFAZ DE USUARIO (Estilo shadcn/ui) ---
// Estos son componentes React simplificados que imitan la apariencia y funcionalidad
// de librerías como shadcn/ui para mantener el código autocontenido y con buen aspecto.

const Card = ({ children, className = '' }) => (
    <div className={`bg-gray-800 border border-gray-700 rounded-xl shadow-lg text-white ${className}`}>
        {children}
    </div>
);

const CardHeader = ({ children, className = '' }) => <div className={`p-6 border-b border-gray-700 ${className}`}>{children}</div>;
const CardContent = ({ children, className = '' }) => <div className={`p-6 ${className}`}>{children}</div>;
const CardTitle = ({ children, className = '' }) => <h3 className={`text-2xl font-bold tracking-tight ${className}`}>{children}</h3>;
const CardDescription = ({ children, className = '' }) => <p className={`text-sm text-gray-400 ${className}`}>{children}</p>;

const Button = ({ children, onClick, className = '', variant = 'primary' }) => {
    const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 disabled:pointer-events-none';
    const variantClasses = {
        primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
        secondary: 'bg-gray-700 text-gray-200 hover:bg-gray-600 focus:ring-gray-500',
        ghost: 'hover:bg-gray-700 hover:text-white',
    };
    return (
        <button onClick={onClick} className={`${baseClasses} ${variantClasses[variant]} ${className}`}>
            {children}
        </button>
    );
};

const Input = ({ className = '', ...props }) => (
    <input
        className={`flex h-10 w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${className}`}
        {...props}
    />
);

const Label = ({ children, htmlFor, className = '' }) => <label htmlFor={htmlFor} className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}>{children}</label>;

const Table = ({ children, className = '' }) => <div className={`w-full overflow-auto ${className}`}><table className="w-full caption-bottom text-sm">{children}</table></div>;
const TableHeader = ({ children, className = '' }) => <thead className={`[&_tr]:border-b [&_tr]:border-gray-700 ${className}`}>{children}</thead>;
const TableBody = ({ children, className = '' }) => <tbody className={`[&_tr:last-child]:border-0 ${className}`}>{children}</tbody>;
const TableRow = ({ children, className = '' }) => <tr className={`border-b border-gray-700 transition-colors hover:bg-gray-800/50 ${className}`}>{children}</tr>;
const TableHead = ({ children, className = '' }) => <th className={`h-12 px-4 text-left align-middle font-medium text-gray-400 ${className}`}>{children}</th>;
const TableCell = ({ children, className = '' }) => <td className={`p-4 align-middle ${className}`}>{children}</td>;


// --- HOOKS DE FIREBASE PARA GESTIONAR DATOS ---

// Hook para inicializar y gestionar la autenticación de Firebase
function useFirebaseAuth() {
    const [auth, setAuth] = useState(null);
    const [db, setDb] = useState(null);
    const [user, setUser] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    useEffect(() => {
        if (Object.keys(firebaseConfig).length === 0) {
            console.error("Firebase config is missing!");
            return;
        }
        
        const app = initializeApp(firebaseConfig);
        const authInstance = getAuth(app);
        const dbInstance = getFirestore(app);

        setAuth(authInstance);
        setDb(dbInstance);

        const unsubscribe = onAuthStateChanged(authInstance, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
            } else if (initialAuthToken) {
                try {
                    await signInWithCustomToken(authInstance, initialAuthToken);
                } catch (error) {
                    console.error("Error signing in with custom token:", error);
                    await signInAnonymously(authInstance);
                }
            } else {
                await signInAnonymously(authInstance);
            }
            setIsAuthReady(true);
        });

        return () => unsubscribe();
    }, []);

    return { auth, db, user, isAuthReady };
}


// --- COMPONENTES PRINCIPALES DE LA APLICACIÓN ---

// 1. Dashboard principal con gráficos de resumen
function Dashboard({ womackData, bodymakerData, onNavigate }) {
    const womackChartData = useMemo(() => {
        const aggregatedData = {};
        const sortedData = [...womackData].sort((a, b) => new Date(a.date) - new Date(b.date));
        
        sortedData.forEach(d => {
            const dateKey = new Date(d.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
            if (!aggregatedData[dateKey]) {
                aggregatedData[dateKey] = { name: dateKey, 'Agua L1': 0, 'Agua L2': 0, 'Aceite L1': 0, 'Aceite L2': 0 };
            }
            if (d.line === 1) {
                aggregatedData[dateKey]['Agua L1'] += d.waterConsumption;
                aggregatedData[dateKey]['Aceite L1'] += d.oilConsumptionTotal;
            } else if (d.line === 2) {
                aggregatedData[dateKey]['Agua L2'] += d.waterConsumption;
                aggregatedData[dateKey]['Aceite L2'] += d.oilConsumptionTotal;
            }
        });

        return Object.values(aggregatedData).slice(-7);
    }, [womackData]);

    const bodymakerChartData = useMemo(() => {
        const latestWeekData = {};
        bodymakerData.forEach(d => {
            const line = d.line;
            if (!latestWeekData[line] || new Date(d.weekStartDate) > new Date(latestWeekData[line].weekStartDate)) {
                latestWeekData[line] = d;
            }
        });
        
        const line1Data = latestWeekData[1]?.readings || [];
        const line2Data = latestWeekData[2]?.readings || [];
        const allMachines = [...new Set([...line1Data.map(r => r.machineId), ...line2Data.map(r => r.machineId)])].sort((a, b) => a - b);

        return allMachines.map(machineId => ({
            name: `BM ${machineId}`,
            'Consumo L1': line1Data.find(r => r.machineId === machineId)?.consumption || 0,
            'Consumo L2': line2Data.find(r => r.machineId === machineId)?.consumption || 0,
        }));
    }, [bodymakerData]);

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white">Panel de Control General</h2>
                    <p className="text-gray-400">Resumen de consumos recientes.</p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={() => onNavigate('womack')}>Control Womack</Button>
                    <Button onClick={() => onNavigate('bodymaker')}>Control Bodymaker</Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Consumo Diario Womack (Últimos 7 Días)</CardTitle>
                        <CardDescription>Visualización del consumo de agua y aceite total.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <LineChart data={womackChartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#4A5568" />
                                <XAxis dataKey="name" stroke="#A0AEC0" />
                                <YAxis stroke="#A0AEC0" />
                                <Tooltip contentStyle={{ backgroundColor: '#1A202C', border: '1px solid #4A5568' }} />
                                <Legend />
                                <Line type="monotone" dataKey="Agua L1" stroke="#38B2AC" activeDot={{ r: 8 }} />
                                <Line type="monotone" dataKey="Agua L2" stroke="#63B3ED" activeDot={{ r: 8 }} />
                                <Line type="monotone" dataKey="Aceite L1" stroke="#F6E05E" activeDot={{ r: 8 }} />
                                <Line type="monotone" dataKey="Aceite L2" stroke="#F56565" activeDot={{ r: 8 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Consumo Semanal Bodymakers (Última Semana)</CardTitle>
                        <CardDescription>Comparativa de consumo de aceite por máquina.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={bodymakerChartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#4A5568" />
                                <XAxis dataKey="name" stroke="#A0AEC0" />
                                <YAxis stroke="#A0AEC0" />
                                <Tooltip contentStyle={{ backgroundColor: '#1A202C', border: '1px solid #4A5568' }} />
                                <Legend />
                                <Bar dataKey="Consumo L1" fill="#4299E1" />
                                <Bar dataKey="Consumo L2" fill="#ED8936" />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

// 2. Componente para el control de los Womack
function WomackControl({ db, data, onBack }) {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [line, setLine] = useState(1);
    const [water, setWater] = useState('');
    const [oilTotal, setOilTotal] = useState('');
    const [oilPartial, setOilPartial] = useState('');
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!date || !line || !water || !oilTotal || !oilPartial) {
            setMessage('Error: Todos los campos son obligatorios.');
            setTimeout(() => setMessage(''), 3000);
            return;
        }
        setIsLoading(true);
        try {
            const womackCollection = collection(db, `artifacts/${appId}/public/data/womackEntries`);
            await addDoc(womackCollection, {
                date,
                line: Number(line),
                waterConsumption: Number(water),
                oilConsumptionTotal: Number(oilTotal),
                oilConsumptionPartial: Number(oilPartial),
                createdAt: new Date().toISOString(),
            });
            setMessage('¡Registro guardado con éxito!');
            // Limpiar formulario
            setWater('');
            setOilTotal('');
            setOilPartial('');
        } catch (error) {
            console.error("Error al guardar el registro:", error);
            setMessage('Error al guardar. Inténtalo de nuevo.');
        } finally {
            setIsLoading(false);
            setTimeout(() => setMessage(''), 3000);
        }
    };
    
    const filteredData = useMemo(() => {
        return [...data]
          .filter(d => d.line === line)
          .sort((a,b) => new Date(b.date) - new Date(a.date))
          .slice(0, 10);
    }, [data, line]);

    return (
        <div className="space-y-8">
            <Button onClick={onBack} variant="secondary">← Volver al Panel</Button>
            <Card>
                <CardHeader>
                    <CardTitle>Control Diario de Womack</CardTitle>
                    <CardDescription>Introduce los consumos diarios de agua y aceite.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="space-y-2">
                            <Label htmlFor="date">Fecha</Label>
                            <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="line">Línea</Label>
                             <select id="line" value={line} onChange={e => setLine(Number(e.target.value))} className="flex h-10 w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                <option value={1}>Línea 1</option>
                                <option value={2}>Línea 2</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="water">Consumo Agua</Label>
                            <Input id="water" type="number" placeholder="Ej: 150" value={water} onChange={e => setWater(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="oilTotal">Consumo Aceite Total</Label>
                            <Input id="oilTotal" type="number" placeholder="Ej: 50" value={oilTotal} onChange={e => setOilTotal(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="oilPartial">Consumo Aceite Parcial</Label>
                            <Input id="oilPartial" type="number" placeholder="Ej: 25" value={oilPartial} onChange={e => setOilPartial(e.target.value)} />
                        </div>
                        <div className="md:col-span-2 lg:col-span-1 flex items-end">
                            <Button type="submit" className="w-full h-10" disabled={isLoading}>{isLoading ? 'Guardando...' : 'Guardar Registro'}</Button>
                        </div>
                    </form>
                    {message && <p className={`mt-4 text-center text-sm ${message.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>{message}</p>}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Historial Reciente (Línea {line})</CardTitle>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Agua</TableHead>
                                <TableHead>Aceite Total</TableHead>
                                <TableHead>Aceite Parcial</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredData.map(d => (
                                <TableRow key={d.id}>
                                    <TableCell>{new Date(d.date+'T00:00:00').toLocaleDateString('es-ES', {timeZone: 'UTC'})}</TableCell>
                                    <TableCell>{d.waterConsumption}</TableCell>
                                    <TableCell>{d.oilConsumptionTotal}</TableCell>
                                    <TableCell>{d.oilConsumptionPartial}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

// 3. Componente para el control de las Bodymakers
function BodymakerControl({ db, data, onBack }) {
    const getMonday = (d) => {
        d = new Date(d);
        const day = d.getDay(),
            diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        return new Date(d.setDate(diff));
    };

    const [week, setWeek] = useState(getMonday(new Date()).toISOString().split('T')[0]);
    const [line, setLine] = useState(1);
    const [message, setMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    const machines = useMemo(() => (line === 1 ? Array.from({ length: 8 }, (_, i) => 11 + i) : Array.from({ length: 8 }, (_, i) => 21 + i)), [line]);
    
    const [consumptions, setConsumptions] = useState(
        machines.reduce((acc, machineId) => ({ ...acc, [machineId]: '' }), {})
    );

    useEffect(() => {
        setConsumptions(machines.reduce((acc, machineId) => ({ ...acc, [machineId]: '' }), {}));
    }, [line, machines]);


    const handleConsumptionChange = (machineId, value) => {
        setConsumptions(prev => ({ ...prev, [machineId]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const readings = Object.entries(consumptions)
            .map(([machineId, consumption]) => ({
                machineId: Number(machineId),
                consumption: Number(consumption)
            }))
            .filter(r => r.consumption > 0);

        if (!week || readings.length === 0) {
            setMessage('Error: Debes seleccionar una semana e introducir al menos un consumo.');
            setTimeout(() => setMessage(''), 3000);
            return;
        }
        setIsLoading(true);
        try {
            const bodymakerCollection = collection(db, `artifacts/${appId}/public/data/bodymakerEntries`);
            await addDoc(bodymakerCollection, {
                weekStartDate: week,
                line: Number(line),
                readings: readings,
                createdAt: new Date().toISOString(),
            });
            setMessage('¡Registros semanales guardados con éxito!');
            setConsumptions(machines.reduce((acc, machineId) => ({ ...acc, [machineId]: '' }), {}));
        } catch (error) {
            console.error("Error al guardar registros:", error);
            setMessage('Error al guardar. Inténtalo de nuevo.');
        } finally {
            setIsLoading(false);
            setTimeout(() => setMessage(''), 3000);
        }
    };

    const filteredData = useMemo(() => {
        return [...data]
          .filter(d => d.line === line)
          .sort((a,b) => new Date(b.weekStartDate) - new Date(a.weekStartDate))
          .slice(0, 5);
    }, [data, line]);

    return (
        <div className="space-y-8">
            <Button onClick={onBack} variant="secondary">← Volver al Panel</Button>
            <Card>
                <CardHeader>
                    <CardTitle>Control Semanal de Bodymakers</CardTitle>
                    <CardDescription>Introduce los consumos de aceite para cada máquina de la línea.</CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="space-y-2 flex-1">
                                <Label htmlFor="week">Inicio de Semana (Lunes)</Label>
                                <Input id="week" type="date" value={week} onChange={e => setWeek(getMonday(e.target.value).toISOString().split('T')[0])} />
                            </div>
                            <div className="space-y-2 flex-1">
                                <Label htmlFor="line">Línea</Label>
                                <select id="line" value={line} onChange={e => setLine(Number(e.target.value))} className="flex h-10 w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500">
                                    <option value={1}>Línea 1 (BM 11-18)</option>
                                    <option value={2}>Línea 2 (BM 21-28)</option>
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4">
                            {machines.map(machineId => (
                                <div key={machineId} className="space-y-2">
                                    <Label htmlFor={`bm-${machineId}`}>BM {machineId}</Label>
                                    <Input
                                        id={`bm-${machineId}`}
                                        type="number"
                                        placeholder="Litros"
                                        value={consumptions[machineId] || ''}
                                        onChange={(e) => handleConsumptionChange(machineId, e.target.value)}
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-end">
                            <Button type="submit" className="w-full md:w-auto h-10 px-8" disabled={isLoading}>{isLoading ? 'Guardando...' : 'Guardar Semana'}</Button>
                        </div>
                    </form>
                    {message && <p className={`mt-4 text-center text-sm ${message.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>{message}</p>}
                </CardContent>
            </Card>

             <Card>
                <CardHeader>
                    <CardTitle>Historial Semanal Reciente (Línea {line})</CardTitle>
                </CardHeader>
                <CardContent>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Semana de</TableHead>
                                {machines.map(id => <TableHead key={id}>BM {id}</TableHead>)}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredData.map(d => (
                                <TableRow key={d.id}>
                                    <TableCell>{new Date(d.weekStartDate+'T00:00:00').toLocaleDateString('es-ES', {timeZone: 'UTC'})}</TableCell>
                                    {machines.map(machineId => {
                                        const reading = d.readings.find(r => r.machineId === machineId);
                                        return <TableCell key={machineId}>{reading ? reading.consumption : '–'}</TableCell>
                                    })}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}

// Componente principal que renderiza toda la aplicación
export default function App() {
    const { db, user, isAuthReady } = useFirebaseAuth();
    const [view, setView] = useState('dashboard');
    const [womackData, setWomackData] = useState([]);
    const [bodymakerData, setBodymakerData] = useState([]);
    const [loading, setLoading] = useState(true);

    // Efecto para cargar los datos de Womack desde Firestore en tiempo real
    useEffect(() => {
        if (!isAuthReady || !db) return;

        const womackCollection = collection(db, `artifacts/${appId}/public/data/womackEntries`);
        const q = query(womackCollection);
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setWomackData(data);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching Womack data:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [isAuthReady, db]);

    // Efecto para cargar los datos de Bodymaker desde Firestore en tiempo real
    useEffect(() => {
        if (!isAuthReady || !db) return;
        
        const bodymakerCollection = collection(db, `artifacts/${appId}/public/data/bodymakerEntries`);
        const q = query(bodymakerCollection);
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setBodymakerData(data);
        }, (error) => {
            console.error("Error fetching Bodymaker data:", error);
        });

        return () => unsubscribe();
    }, [isAuthReady, db]);

    const renderView = () => {
        if (loading || !isAuthReady) {
            return <div className="flex justify-center items-center h-screen"><div className="text-center text-white text-xl">Cargando datos...</div></div>
        }
        
        switch (view) {
            case 'womack':
                return <WomackControl db={db} data={womackData} onBack={() => setView('dashboard')} />;
            case 'bodymaker':
                return <BodymakerControl db={db} data={bodymakerData} onBack={() => setView('dashboard')} />;
            case 'dashboard':
            default:
                return <Dashboard womackData={womackData} bodymakerData={bodymakerData} onNavigate={setView} />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white font-sans p-4 sm:p-6 lg:p-8">
            <header className="mb-8">
                <div className="max-w-7xl mx-auto">
                    <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400 h-8 w-8 sm:h-10 sm:w-10"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>
                        <span className="truncate">Control de consumo de agua y aceites Frontend</span>
                    </h1>
                    {user && <p className="text-xs text-gray-500 mt-1">ID de Sesión: {user.uid}</p>}
                </div>
            </header>
            <main className="max-w-7xl mx-auto">
                {renderView()}
            </main>
        </div>
    );
}
