import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line,
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Cell, Legend
} from "recharts";
import {
  AlertTriangle, ChevronRight, ChevronLeft, CheckCircle, BarChart3,
  Home, FileText, Bell, Zap, Shield, EyeOff, Eye, RefreshCw, Download
} from "lucide-react";
import { db } from "./firebase.js";
import { collection, addDoc, onSnapshot, deleteDoc, getDocs } from "firebase/firestore";

const LOJAS   = ["CTC", "LOJA", "CD"];
const TIPOS   = ["Pedido de demissão","Desligamento pela empresa","Término de contrato","Experiência","Acordo","Outros"];
const MOTIVOS = ["Salário incompatível","Benefícios insatisfatórios","Falta de crescimento","Problemas com liderança","Clima da equipe","Sobrecarga de trabalho","Escala ou horário","Nova proposta recebida","Mudança pessoal/familiar","Saúde emocional","Cultura da empresa","Falta de reconhecimento","Outro"];
const RATINGS = ["Relacionamento c/ Gestor","Clima da equipe","Comunicação","Oportunidade de crescimento","Reconhecimento","Equilíbrio vida/trabalho","Treinamentos","Remuneração","Benefícios","Organização da operação"];
const GESTOR_Q = ["Dava feedback frequente","Tratava equipe com respeito","Reconhecia bons resultados","Sabia ouvir a equipe","Era acessível","Era coerente nas decisões","Desenvolvia pessoas","Tinha boa comunicação","Sabia resolver conflitos","Demonstrava preparo para liderar"];
const RC   = {1:"#EF4444",2:"#F97316",3:"#F59E0B",4:"#84CC16",5:"#22C55E"};
const RLBL = ["","Muito ruim","Ruim","Regular","Bom","Ótimo"];
const INP  = "w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all";

const genId = () => Math.random().toString(36).substr(2,9);
const avg   = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;

function genSamples() {
  const now = Date.now();
  return Array.from({length:30},(_,i)=>{
    const loja = LOJAS[Math.floor(Math.random()*LOJAS.length)];
    const risk = loja==="CD"?0.7:loja==="CTC"?1.3:1;
    const ratings={}, gestorAv={};
    RATINGS.forEach((_,j)  =>{ ratings[j]  = Math.max(1,Math.min(5,Math.round(2.5*risk+(Math.random()-0.5)*2))); });
    GESTOR_Q.forEach((_,j) =>{ const v=Math.random(); gestorAv[j]=v>0.55?"Sim":v>0.3?"Parcialmente":"Não"; });
    return { id:genId(), timestamp:now-Math.floor(Math.random()*150)*86400000,
      anonimo:Math.random()>0.5, nome:"Colaborador "+(i+1), loja, setor:"Setor "+(i%5+1),
      tipo:TIPOS[Math.floor(Math.random()*3)], motivo:MOTIVOS[Math.floor(Math.random()*MOTIVOS.length)],
      ratings, gestorAv,
      voltaria:Math.random()>0.5?"Sim":Math.random()>0.5?"Talvez":"Não",
      recomendaria:Math.random()>0.5?"Sim":Math.random()>0.5?"Talvez":"Não"};
  });
}

function calcStats(responses) {
  if (!responses.length) return null;
  const n = responses.length;
  const voluntary   = responses.filter(r=>r.tipo==="Pedido de demissão").length;
  const involuntary = responses.filter(r=>r.tipo==="Desligamento pela empresa").length;
  const avgRatings = RATINGS.map((label,i)=>{
    const vals = responses.map(r=>r.ratings?.[i]).filter(v=>v>0);
    return { name:label.length>18?label.slice(0,16)+"…":label, fullName:label,
      value:vals.length?parseFloat((vals.reduce((a,b)=>a+b)/vals.length).toFixed(2)):0 };
  });
  const overallAvg = parseFloat(avg(avgRatings.map(r=>r.value).filter(v=>v>0)).toFixed(2));
  const motivoCount={};
  responses.forEach(r=>{ if(r.motivo) motivoCount[r.motivo]=(motivoCount[r.motivo]||0)+1; });
  const motivoData = Object.entries(motivoCount).sort((a,b)=>b[1]-a[1]).slice(0,6)
    .map(([name,value])=>({name:name.length>20?name.slice(0,18)+"…":name,value}));
  const storeMap={};
  responses.forEach(r=>{
    const l=r.loja||"N/A";
    if(!storeMap[l]) storeMap[l]={count:0,ratings:[],voluntary:0};
    storeMap[l].count++;
    if(r.ratings) storeMap[l].ratings.push(...Object.values(r.ratings).filter(v=>v>0));
    if(r.tipo==="Pedido de demissão") storeMap[l].voluntary++;
  });
  const storeRanking = Object.entries(storeMap).map(([name,d])=>{
    const ar=d.ratings.length?parseFloat(avg(d.ratings).toFixed(2)):0;
    return {name,total:d.count,avgRating:ar,voluntary:d.voluntary,
      risk:ar===0?"—":ar<2.5?"CRÍTICO":ar<3.5?"ATENÇÃO":"BOM"};
  }).sort((a,b)=>b.total-a.total);
  const gestorData = GESTOR_Q.map((q,i)=>{
    const ans=responses.map(r=>r.gestorAv?.[i]).filter(Boolean);
    return {name:q.length>20?q.slice(0,18)+"…":q,fullName:q,
      pct:ans.length?Math.round(ans.filter(a=>a==="Sim").length/ans.length*100):0,total:ans.length};
  });
  const monthMap={};
  responses.forEach(r=>{
    const d=new Date(r.timestamp);
    const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    if(!monthMap[k]) monthMap[k]={month:k,count:0,rv:[]};
    monthMap[k].count++;
    if(r.ratings) monthMap[k].rv.push(...Object.values(r.ratings).filter(v=>v>0));
  });
  const monthlyTrend = Object.values(monthMap).sort((a,b)=>a.month.localeCompare(b.month)).slice(-6)
    .map(m=>({month:m.month,desligamentos:m.count,satisfacao:parseFloat(avg(m.rv).toFixed(2))}));
  const alerts=[];
  avgRatings.forEach(r=>{
    if(r.value>0&&r.value<2.5) alerts.push({type:"critical",msg:`${r.fullName}: nota crítica ${r.value}/5`});
    else if(r.value>0&&r.value<3) alerts.push({type:"warning",msg:`${r.fullName}: abaixo da média (${r.value}/5)`});
  });
  storeRanking.forEach(s=>{ if(s.risk==="CRÍTICO") alerts.push({type:"critical",msg:`${s.name} — clima crítico (${s.avgRating}/5)`}); });
  if(voluntary>n*0.6) alerts.push({type:"warning",msg:`Alta taxa de pedidos de demissão: ${Math.round(voluntary/n*100)}%`});
  gestorData.forEach(g=>{ if(g.total>=3&&g.pct<40) alerts.push({type:"critical",msg:`Liderança: apenas ${g.pct}% aprovam "${g.fullName.toLowerCase()}"`}); });
  const voltaria    = responses.filter(r=>r.voltaria==="Sim").length;
  const recomendaria= responses.filter(r=>r.recomendaria==="Sim").length;
  return {n,voluntary,involuntary,overallAvg,avgRatings,motivoData,storeRanking,gestorData,monthlyTrend,alerts,
    voltariaPct:Math.round(voltaria/n*100), recomendariaPct:Math.round(recomendaria/n*100)};
}

function exportToCSV(responses) {
  const header = ["ID","Data","Anônimo","Nome","Setor","Loja","Cargo","Gestor","Tipo","Tipo (Outros)","Motivo","Motivo (Outros)",
    ...RATINGS.map(r=>`Nota: ${r}`),"Média Notas",
    ...GESTOR_Q.map(q=>`Gestor: ${q}`),"Voltaria","Recomendaria",
    "Ab: Retenção","Ab: Melhor Ponto","Ab: Principal Problema","Ab: Comentários"];
  const rows = responses.map(r=>{
    const notas = RATINGS.map((_,i)=>r.ratings?.[i]||"");
    const mediaNotas = notas.filter(v=>v>0).length?(notas.filter(v=>v>0).reduce((a,b)=>a+b)/notas.filter(v=>v>0).length).toFixed(2):"";
    return [r.id,new Date(r.timestamp).toLocaleDateString("pt-BR"),r.anonimo?"Sim":"Não",
      r.nome||"",r.setor||"",r.loja||"",r.cargo||"",r.gestorNome||"",
      r.tipo||"",r.tipoOutros||"",r.motivo||"",r.motivoOutros||"",
      ...notas,mediaNotas,...GESTOR_Q.map((_,i)=>r.gestorAv?.[i]||""),
      r.voltaria||"",r.recomendaria||"",
      r.abertas?.ab1||"",r.abertas?.ab2||"",r.abertas?.ab3||"",r.abertas?.ab4||""];
  });
  const csv=[header,...rows].map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=`Desligamentos_Constance_${new Date().toISOString().slice(0,10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

const EMPTY_FD = {
  nome:"",setor:"",loja:"",cargo:"",gestorNome:"",dtAdm:"",dtDesl:"",
  tipo:"",tipoOutros:"",motivo:"",motivoOutros:"",
  ratings:{},gestorAv:{},ab1:"",ab2:"",ab3:"",ab4:"",voltaria:"",recomendaria:""
};

export default function HRSystem() {
  const [view,setView]             = useState("home");
  const [responses,setResponses]   = useState([]);
  const [loading,setLoading]       = useState(true);
  const [step,setStep]             = useState(0);
  const [anonimo,setAnonimo]       = useState(false);
  const [fd,setFd]                 = useState(EMPTY_FD);
  const [dashTab,setDashTab]       = useState("exec");
  const [actionPlan,setActionPlan] = useState("");
  const [loadingAI,setLoadingAI]   = useState(false);
  const [alertsOpen,setAlertsOpen] = useState(false);
  const [expandedStore,setExpandedStore] = useState(null);
  const [dbError,setDbError]       = useState(false);
  const [submitError,setSubmitError] = useState("");
  const [submitting,setSubmitting] = useState(false);
  const [stepError,setStepError]   = useState("");
  const [dashAuth,setDashAuth]     = useState(false);
  const [dashPwd,setDashPwd]       = useState("");
  const [dashPwdError,setDashPwdError] = useState("");
  const [showQR,setShowQR]         = useState(false);
  const SITE_URL = "https://constance-rh.vercel.app";
  const DASH_PASSWORD = "constance2025";

  useEffect(()=>{
    const unsub = onSnapshot(collection(db,"responses"),
      snap=>{ setResponses(snap.docs.map(d=>({...d.data(),_docId:d.id}))); setLoading(false); },
      err =>{ console.error(err); setDbError(true); setLoading(false); }
    );
    return ()=>unsub();
  },[]);

  const up  = (k,v) => setFd(p=>({...p,[k]:v}));
  const upR = (i,v) => setFd(p=>({...p,ratings:{...p.ratings,[i]:v}}));
  const upG = (i,v) => setFd(p=>({...p,gestorAv:{...p.gestorAv,[i]:v}}));


  const validateStep = (s) => {
    setStepError("");
    if(s===0){
      if(!anonimo && !fd.nome.trim()) return "Preencha seu nome completo.";
      if(!fd.setor.trim()) return "Preencha o Setor / Unidade CD / Nome da Loja.";
      if(!fd.loja) return "Selecione a Unidade.";
      if(!fd.cargo.trim()) return "Preencha seu cargo.";
      if(!fd.gestorNome.trim()) return "Preencha o nome do gestor.";
    }
    if(s===1){
      if(!fd.tipo) return "Selecione o tipo de desligamento.";
      if(fd.tipo==="Outros" && !fd.tipoOutros.trim()) return "Especifique o tipo de desligamento.";
      if(!fd.motivo) return "Selecione o motivo principal.";
      if(fd.motivo==="Outro" && !fd.motivoOutros.trim()) return "Especifique o motivo.";
    }
    if(s===2){
      const missing = RATINGS.filter((_,i)=>!fd.ratings[i]);
      if(missing.length>0) return `Avalie todos os ${RATINGS.length} aspectos antes de avançar.`;
    }
    if(s===3){
      const missing = GESTOR_Q.filter((_,i)=>!fd.gestorAv[i]);
      if(missing.length>0) return `Responda todas as ${GESTOR_Q.length} perguntas sobre o gestor.`;
    }
    // Etapa 4 (Suas Opiniões) é opcional
    if(s===5){
      if(!fd.voltaria) return "Responda se voltaria a trabalhar na empresa.";
      if(!fd.recomendaria) return "Responda se recomendaria a empresa.";
    }
    return "";
  };

  const handleSubmit = async()=>{
    setSubmitting(true);
    setSubmitError("");
    try {
      const data = {
        id:genId(), timestamp:Date.now(), anonimo,
        nome:anonimo?"Anônimo":fd.nome,
        setor:fd.setor, loja:fd.loja, cargo:fd.cargo, gestorNome:fd.gestorNome,
        dtAdm:fd.dtAdm, dtDesl:fd.dtDesl,
        tipo:fd.tipo, tipoOutros:fd.tipoOutros,
        motivo:fd.motivo, motivoOutros:fd.motivoOutros,
        ratings:fd.ratings, gestorAv:fd.gestorAv,
        voltaria:fd.voltaria, recomendaria:fd.recomendaria,
        abertas:{ab1:fd.ab1,ab2:fd.ab2,ab3:fd.ab3,ab4:fd.ab4}
      };
      const timeout = new Promise((_,reject)=>setTimeout(()=>reject(new Error("timeout")),10000));
      await Promise.race([addDoc(collection(db,"responses"),data), timeout]);
      setView("thanks");
    } catch(e){
      console.error("Erro ao enviar:",e);
      if(e.message==="timeout"){
        setSubmitError("Tempo esgotado. Verifique sua conexão com a internet e tente novamente.");
      } else {
        setSubmitError(`Erro ao enviar: ${e.message}. Verifique sua conexão e tente novamente.`);
      }
    }
    setSubmitting(false);
  };

  const loadSamples  = async()=>{ await Promise.all(genSamples().map(x=>addDoc(collection(db,"responses"),x))); };
  const clearAllData = async()=>{ if(!confirm("Apagar TODOS os dados?")) return; const snap=await getDocs(collection(db,"responses")); await Promise.all(snap.docs.map(d=>deleteDoc(d.ref))); };

  const generateActionPlan = async()=>{
    if(!stats) return;
    setLoadingAI(true);
    try {
      const criticals=stats.avgRatings.filter(r=>r.value>0&&r.value<3).map(r=>`${r.fullName} (${r.value}/5)`).join(", ")||"nenhuma";
      const r=await fetch("/api/generate-plan",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:
          `Especialista em RH. Dados:\n- Total: ${stats.n}\n- Voluntários: ${Math.round(stats.voluntary/stats.n*100)}%\n- Satisfação: ${stats.overallAvg}/5\n- Críticos: ${criticals}\n- Top motivos: ${stats.motivoData.slice(0,3).map(m=>m.name).join(", ")}\n- Voltaria: ${stats.voltariaPct}%\n\nPlano executivo:\n**AÇÕES IMEDIATAS (30d)** — 3 ações\n**MÉDIO PRAZO (60-90d)** — 3 ações\n**KPIs** — 4 indicadores\n**URGENTE** — 1 ponto crítico`
        }]})});
      const d=await r.json();
      setActionPlan(d.content?.map(c=>c.text||"").join("")||"Erro ao gerar.");
    } catch(e){ setActionPlan("Erro ao conectar. Verifique a ANTHROPIC_API_KEY."); }
    setLoadingAI(false);
  };

  const stats = responses.length>0 ? calcStats(responses) : null;
  const STEPS = 7;

  if(loading) return(
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center"><div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3"/><div className="text-slate-400 text-sm">Conectando ao banco de dados...</div></div>
    </div>
  );
  if(dbError) return(
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="text-center max-w-sm"><AlertTriangle size={40} className="text-red-400 mx-auto mb-4"/><h2 className="text-white font-bold mb-2">Erro de conexão</h2><p className="text-slate-400 text-sm">Verifique as variáveis de ambiente do Firebase no Vercel.</p></div>
    </div>
  );

  // ── HOME ──
  if(view==="home") return(
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{background:"linear-gradient(160deg,#070E1C 0%,#1B2A4A 60%,#070E1C 100%)"}}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-1.5 border border-amber-400/30 bg-amber-400/10 text-amber-300 text-xs font-bold px-3 py-1 rounded-full mb-5 tracking-widest uppercase"><Zap size={10}/> RH Digital · Constance</div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight leading-tight">Sistema de<br/>Desligamentos</h1>
          <p className="text-slate-500 text-sm">Formulários + Dashboard executivo em tempo real</p>
        </div>
        <div className="space-y-3 mb-10">
          <button onClick={()=>{setView("form");setStep(0);setFd(EMPTY_FD);setAnonimo(false);setSubmitError("");}}
            className="w-full py-4 px-5 rounded-2xl font-bold text-slate-900 flex items-center justify-between transition-all hover:scale-105"
            style={{background:"linear-gradient(135deg,#F59E0B,#D97706)"}}>
            <div className="flex items-center gap-3"><FileText size={20}/>
              <div className="text-left"><div className="text-base">Responder Formulário</div><div className="text-xs font-normal opacity-70">Entrevista de desligamento</div></div>
            </div><ChevronRight size={18}/>
          </button>
          <button onClick={()=>setView("dashlogin")}
            className="w-full py-4 px-5 rounded-2xl font-bold text-white flex items-center justify-between border border-white/15 hover:bg-white/10 transition-colors">
            <div className="flex items-center gap-3"><BarChart3 size={20}/>
              <div className="text-left"><div className="text-base">Dashboard RH</div><div className="text-xs font-normal text-slate-400">Acesso exclusivo RH</div></div>
            </div><ChevronRight size={18}/>
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          {[[Shield,"Seguro","Dados protegidos"],[Eye,"Tempo real","Dashboard ao vivo"],[Zap,"IA integrada","Plano automático"]].map(([Icon,l,s])=>(
            <div key={l}><Icon size={16} className="mx-auto mb-1.5 text-amber-400/60"/><div className="text-xs font-medium text-slate-400">{l}</div><div className="text-xs text-slate-600">{s}</div></div>
          ))}
        </div>
        <div className="mt-6 border border-white/10 rounded-2xl p-4 text-center">
          <div className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wide">Link para colaboradores</div>
          <div className="bg-white/5 rounded-xl px-3 py-2 text-xs text-amber-300 font-mono mb-3 break-all">{SITE_URL}</div>
          <button onClick={()=>setShowQR(!showQR)} className="text-xs text-slate-400 hover:text-white underline transition-colors">
            {showQR?"Ocultar QR Code":"Ver QR Code para celular"}
          </button>
          {showQR&&(
            <div className="mt-3 flex justify-center">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(SITE_URL)}`} alt="QR Code" className="rounded-xl border-4 border-white"/>
            </div>
          )}
        </div>
        {responses.length>0&&<div className="mt-4 text-center text-xs text-slate-700">{responses.length} resposta{responses.length>1?"s":""} registrada{responses.length>1?"s":""}</div>}
      </div>
    </div>
  );

  // ── LOGIN DASHBOARD ──
  if(view==="dashlogin") return(
    <div className="min-h-screen flex items-center justify-center p-6" style={{background:"linear-gradient(160deg,#070E1C,#1B2A4A,#070E1C)"}}>
      <div className="w-full max-w-xs">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{background:"linear-gradient(135deg,#1B2A4A,#2E5C8A)"}}><Shield size={28} className="text-amber-400"/></div>
          <h2 className="text-2xl font-bold text-white mb-1">Acesso RH</h2>
          <p className="text-slate-500 text-sm">Digite a senha para acessar o dashboard</p>
        </div>
        <div className="space-y-3">
          <input type="password" className="w-full border border-white/20 bg-white/5 rounded-xl px-4 py-3 text-white text-sm outline-none focus:ring-2 focus:ring-amber-400 placeholder-slate-500"
            placeholder="Senha do RH" value={dashPwd}
            onChange={e=>{setDashPwd(e.target.value);setDashPwdError("");}}
            onKeyDown={e=>{if(e.key==="Enter"){if(dashPwd===DASH_PASSWORD){setDashAuth(true);setView("dashboard");setDashPwd("");}else{setDashPwdError("Senha incorreta.");}}}
          }/>
          {dashPwdError&&<div className="text-red-400 text-xs text-center">{dashPwdError}</div>}
          <button onClick={()=>{if(dashPwd===DASH_PASSWORD){setDashAuth(true);setView("dashboard");setDashPwd("");}else{setDashPwdError("Senha incorreta.");}}}
            className="w-full py-3 rounded-xl font-bold text-slate-900 hover:opacity-90 transition-opacity"
            style={{background:"linear-gradient(135deg,#F59E0B,#D97706)"}}>
            Entrar no Dashboard
          </button>
          <button onClick={()=>{setView("home");setDashPwd("");setDashPwdError("");}} className="w-full py-2 text-slate-500 text-sm hover:text-white transition-colors">Voltar</button>
        </div>
      </div>
    </div>
  );

  // ── FORMULÁRIO ──
  if(view==="form"){
    const lbl = "text-xs font-bold text-slate-500 block mb-1 uppercase tracking-wide";
    const steps=[
      // 0 Identificação
      <div key={0} className="space-y-4">
        <div><h2 className="text-xl font-bold text-slate-800 mb-1">Identificação</h2><p className="text-slate-500 text-sm">Suas informações ficam protegidas pelo RH.</p></div>
        <div className="flex items-center gap-3 bg-blue-50 p-3.5 rounded-xl border border-blue-100">
          <button onClick={()=>setAnonimo(a=>!a)} className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${anonimo?"bg-blue-600":"bg-gray-300"}`}>
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${anonimo?"left-6":"left-1"}`}/>
          </button>
          <div>
            <div className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">{anonimo?<><EyeOff size={13}/> Resposta anônima</>:<><Eye size={13}/> Resposta identificada</>}</div>
            <div className="text-xs text-slate-500">Ative para não vincular sua identidade</div>
          </div>
        </div>
        {!anonimo&&(
          <div>
            <label className={lbl}>Nome completo</label>
            <input className={INP} value={fd.nome} onChange={e=>up("nome",e.target.value)} placeholder="Seu nome completo"/>
          </div>
        )}
        <div>
          <label className={lbl}>Setor / Unidade CD / Nome da Loja</label>
          <input className={INP} value={fd.setor} onChange={e=>up("setor",e.target.value)} placeholder="Ex: Vendas, Operações, Caixa..."/>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Cargo</label>
            <input className={INP} value={fd.cargo} onChange={e=>up("cargo",e.target.value)} placeholder="Seu cargo"/>
          </div>
          <div>
            <label className={lbl}>Gestor direto</label>
            <input className={INP} value={fd.gestorNome} onChange={e=>up("gestorNome",e.target.value)} placeholder="Nome do gestor"/>
          </div>
        </div>
        <div>
          <label className={lbl}>Unidade</label>
          <select className={INP+" bg-white"} value={fd.loja} onChange={e=>up("loja",e.target.value)}>
            <option value="">Selecione</option>
            {LOJAS.map(l=><option key={l}>{l}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Data de admissão</label>
            <input type="date" className={INP} value={fd.dtAdm} onChange={e=>up("dtAdm",e.target.value)}/>
          </div>
          <div>
            <label className={lbl}>Data desligamento</label>
            <input type="date" className={INP} value={fd.dtDesl} onChange={e=>up("dtDesl",e.target.value)}/>
          </div>
        </div>
      </div>,

      // 1 Tipo e Motivo
      <div key={1} className="space-y-5">
        <div><h2 className="text-xl font-bold text-slate-800 mb-1">Tipo e Motivo</h2><p className="text-slate-500 text-sm">Selecione o que melhor descreve sua situação.</p></div>
        <div>
          <label className={lbl}>Tipo de desligamento</label>
          <div className="grid gap-2">
            {TIPOS.map(t=>(
              <button key={t} onClick={()=>up("tipo",t)}
                className={`text-left px-4 py-2.5 rounded-xl border-2 text-sm transition-all ${fd.tipo===t?"border-blue-600 bg-blue-50 text-blue-700 font-semibold":"border-slate-200 text-slate-700 hover:border-blue-200"}`}>
                {t}
              </button>
            ))}
          </div>
          {fd.tipo==="Outros"&&(
            <div className="mt-2">
              <label className={lbl}>Especifique o tipo</label>
              <input className={INP} value={fd.tipoOutros} onChange={e=>up("tipoOutros",e.target.value)} placeholder="Descreva o tipo de desligamento..."/>
            </div>
          )}
        </div>
        <div>
          <label className={lbl}>Motivo principal da saída</label>
          <div className="grid gap-2">
            {MOTIVOS.map(m=>(
              <button key={m} onClick={()=>up("motivo",m)}
                className={`text-left px-4 py-2.5 rounded-xl border-2 text-sm transition-all ${fd.motivo===m?"border-amber-500 bg-amber-50 text-amber-700 font-semibold":"border-slate-200 text-slate-700 hover:border-amber-200"}`}>
                {m}
              </button>
            ))}
          </div>
          {fd.motivo==="Outro"&&(
            <div className="mt-2">
              <label className={lbl}>Especifique o motivo</label>
              <input className={INP} value={fd.motivoOutros} onChange={e=>up("motivoOutros",e.target.value)} placeholder="Descreva o motivo..."/>
            </div>
          )}
        </div>
      </div>,

      // 2 Avaliações 1-5
      <div key={2} className="space-y-4">
        <div><h2 className="text-xl font-bold text-slate-800 mb-1">Avaliação da Experiência</h2><p className="text-slate-500 text-sm">Avalie de <b>1</b> (muito ruim) a <b>5</b> (ótimo).</p></div>
        <div className="space-y-2.5">{RATINGS.map((label,i)=>(
          <div key={i} className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
            <div className="text-sm font-medium text-slate-700 mb-2.5">{label}</div>
            <div className="flex items-center gap-2">
              {[1,2,3,4,5].map(v=>(
                <button key={v} onClick={()=>upR(i,v)}
                  className={`w-9 h-9 rounded-full text-sm font-bold transition-all ${fd.ratings[i]===v?"text-white scale-110 shadow-md":"bg-white border-2 border-slate-200 text-slate-500 hover:border-slate-400"}`}
                  style={fd.ratings[i]===v?{backgroundColor:RC[v],borderColor:RC[v]}:{}}>{v}</button>
              ))}
              {fd.ratings[i]&&<span className="text-xs ml-1 font-semibold" style={{color:RC[fd.ratings[i]]}}>{RLBL[fd.ratings[i]]}</span>}
            </div>
          </div>
        ))}</div>
      </div>,

      // 3 Gestor
      <div key={3} className="space-y-4">
        <div><h2 className="text-xl font-bold text-slate-800 mb-1">Avaliação do Gestor</h2><p className="text-slate-500 text-sm">Como você avalia seu gestor direto?</p></div>
        <div className="space-y-2.5">{GESTOR_Q.map((q,i)=>(
          <div key={i} className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
            <div className="text-sm font-medium text-slate-700 mb-2.5">{q}?</div>
            <div className="flex gap-2">{["Sim","Parcialmente","Não"].map(v=>(
              <button key={v} onClick={()=>upG(i,v)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold border-2 transition-all ${fd.gestorAv[i]===v?v==="Sim"?"bg-green-500 text-white border-green-500":v==="Não"?"bg-red-500 text-white border-red-500":"bg-amber-400 text-white border-amber-400":"border-slate-200 text-slate-600 hover:border-slate-300"}`}>{v}</button>
            ))}</div>
          </div>
        ))}</div>
      </div>,

      // 4 Abertas
      <div key={4} className="space-y-4">
        <div><h2 className="text-xl font-bold text-slate-800 mb-1">Suas Opiniões</h2><p className="text-slate-500 text-sm">Suas palavras são as mais valiosas para nós.</p></div>
        {[{label:"O que poderia ter sido feito para você permanecer?",k:"ab1",ph:"Conte o que faria diferença..."},
          {label:"Qual foi o melhor ponto da empresa?",k:"ab2",ph:"O que você mais gostou..."},
          {label:"Qual o principal problema que encontrou?",k:"ab3",ph:"Seja direto e honesto..."},
          {label:"Comentários adicionais ou sugestões:",k:"ab4",ph:"Qualquer outro ponto..."}
        ].map(({label,k,ph})=>(
          <div key={k}>
            <label className="text-xs font-bold text-slate-600 block mb-1.5">{label}</label>
            <textarea className={INP+" resize-none min-h-20"} placeholder={ph} value={fd[k]} onChange={e=>up(k,e.target.value)}/>
          </div>
        ))}
      </div>,

      // 5 Perspectiva
      <div key={5} className="space-y-5">
        <div><h2 className="text-xl font-bold text-slate-800 mb-1">Perspectiva Final</h2><p className="text-slate-500 text-sm">Sua visão nos ajuda a crescer.</p></div>
        {[{label:"Você voltaria a trabalhar nesta empresa?",k:"voltaria"},{label:"Você recomendaria a empresa como empregadora?",k:"recomendaria"}].map(({label,k})=>(
          <div key={k} className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
            <div className="text-sm font-semibold text-slate-800 mb-3">{label}</div>
            <div className="flex gap-2">{["Sim","Talvez","Não"].map(o=>(
              <button key={o} onClick={()=>up(k,o)}
                className={`flex-1 py-3 rounded-xl font-bold text-sm border-2 transition-all ${fd[k]===o?o==="Sim"?"bg-green-500 text-white border-green-500":o==="Não"?"bg-red-500 text-white border-red-500":"bg-amber-400 text-white border-amber-400":"border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}>{o}</button>
            ))}</div>
          </div>
        ))}
      </div>,

      // 6 Confirmação
      <div key={6} className="space-y-4">
        <div className="text-center py-2">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle size={32} className="text-green-600"/></div>
          <h2 className="text-2xl font-bold text-slate-800 mb-1">Tudo certo!</h2>
          <p className="text-slate-500 text-sm">Revise e envie sua resposta.</p>
        </div>
        <div className="bg-slate-50 rounded-2xl p-4 space-y-2.5 border border-slate-100">
          {[["Identificação",anonimo?"Anônimo":fd.nome||"—"],["Setor",fd.setor||"—"],["Unidade",fd.loja||"—"],["Tipo",fd.tipo+(fd.tipoOutros?" — "+fd.tipoOutros:"")||"—"],["Motivo",fd.motivo+(fd.motivoOutros?" — "+fd.motivoOutros:"")||"—"],["Avaliações 1-5",`${Object.keys(fd.ratings).length}/10`],["Avaliação gestor",`${Object.keys(fd.gestorAv).length}/10`]].map(([l,v])=>(
            <div key={l} className="flex justify-between text-sm"><span className="text-slate-500">{l}</span><span className="font-semibold text-slate-800 max-w-44 truncate text-right">{v}</span></div>
          ))}
        </div>
        {submitError&&<div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 text-center">{submitError}</div>}
        <button onClick={handleSubmit} disabled={submitting}
          className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60 shadow-lg transition-all"
          style={{background:"linear-gradient(135deg,#1B2A4A,#2E5C8A)"}}>
          {submitting?<><RefreshCw size={18} className="animate-spin"/> Enviando...</>:<><CheckCircle size={18}/> Enviar Formulário</>}
        </button>
      </div>
    ];

    return(
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <div className="sticky top-0 z-10" style={{background:"linear-gradient(135deg,#1B2A4A,#2E5C8A)"}}>
          <div className="px-4 py-3 flex items-center gap-3">
            <button onClick={()=>setView("home")} className="text-white/60 hover:text-white"><Home size={17}/></button>
            <div><div className="text-white font-bold text-sm">Entrevista de Desligamento</div><div className="text-white/50 text-xs">Constance · RH</div></div>
          </div>
          <div className="px-4 pb-3">
            <div className="flex gap-1 mb-1.5">{Array.from({length:STEPS}).map((_,i)=>(
              <div key={i} className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden"><div className="h-full rounded-full bg-amber-400 transition-all" style={{width:i<step?"100%":i===step?"40%":"0%"}}/></div>
            ))}</div>
            <div className="text-white/50 text-xs">Etapa {step+1} de {STEPS}</div>
          </div>
        </div>
        <div className="flex-1 overflow-auto px-4 py-6"><div className="max-w-lg mx-auto">{steps[step]}</div></div>
        <div className="bg-white border-t border-slate-200 px-4 py-4 sticky bottom-0">
          {stepError&&<div className="max-w-lg mx-auto mb-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-600 text-center font-medium">{stepError}</div>}
        <div className="max-w-lg mx-auto flex gap-3">
            {step>0&&<button onClick={()=>{setStepError("");setStep(s=>s-1);}} className="flex-1 py-3 rounded-xl border-2 border-slate-200 text-slate-700 font-semibold flex items-center justify-center gap-1.5 hover:border-slate-300"><ChevronLeft size={16}/> Voltar</button>}
            {step<STEPS-1&&<button onClick={()=>{const err=validateStep(step);if(err){setStepError(err);}else{setStepError("");setStep(s=>s+1);}}} className="flex-1 py-3 rounded-xl font-bold text-white flex items-center justify-center gap-1.5 hover:opacity-90" style={{background:"linear-gradient(135deg,#1B2A4A,#2E5C8A)"}}>Avançar <ChevronRight size={16}/></button>}
          </div>
        </div>
      </div>
    );
  }

  // ── OBRIGADO ──
  if(view==="thanks") return(
    <div className="min-h-screen flex items-center justify-center p-6" style={{background:"linear-gradient(160deg,#070E1C,#1B2A4A,#070E1C)"}}>
      <div className="text-center max-w-xs">
        <div className="w-20 h-20 border-2 border-green-500 rounded-full flex items-center justify-center mx-auto mb-6" style={{background:"rgba(34,197,94,0.1)"}}><CheckCircle size={38} className="text-green-400"/></div>
        <h1 className="text-2xl font-bold text-white mb-2">Obrigado!</h1>
        <p className="text-slate-400 mb-1.5 text-sm">Resposta registrada com sucesso.</p>
        <p className="text-slate-600 text-xs mb-8">Sua contribuição é fundamental para melhorarmos o ambiente de trabalho.</p>
        <button onClick={()=>setView("home")} className="w-full py-3 rounded-xl text-white border border-white/20 font-semibold hover:bg-white/10 text-sm">Voltar ao início</button>
      </div>
    </div>
  );

  // ── DASHBOARD ──
  if(view==="dashboard"){
    const criticals=stats?.alerts.filter(a=>a.type==="critical")||[];
    const warnings =stats?.alerts.filter(a=>a.type==="warning")||[];
    return(
      <div className="min-h-screen bg-slate-100">
        <div className="sticky top-0 z-20" style={{background:"linear-gradient(135deg,#1B2A4A,#2E5C8A)"}}>
          <div className="px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={()=>setView("home")} className="text-white/60 hover:text-white"><Home size={17}/></button>
              <div><div className="text-white font-bold text-sm">Dashboard RH</div><div className="text-white/50 text-xs">Constance · Desligamentos</div></div>
            </div>
            <div className="flex items-center gap-1.5">
              {stats&&<button onClick={()=>exportToCSV(responses)} className="text-amber-300 hover:text-amber-200 p-1.5" title="Exportar CSV"><Download size={17}/></button>}
              {stats&&(criticals.length+warnings.length)>0&&(
                <button onClick={()=>setAlertsOpen(!alertsOpen)} className="relative text-white p-1.5">
                  <Bell size={18}/><span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center font-bold">{criticals.length+warnings.length}</span>
                </button>
              )}
            </div>
          </div>
          <div className="flex px-3 gap-1 pb-2 overflow-x-auto">
            {[["exec","Executivo"],["stores","Por Loja"],["gestor","Liderança"],["actions","Plano de Ação"]].map(([id,lbl])=>(
              <button key={id} onClick={()=>setDashTab(id)} className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${dashTab===id?"bg-amber-400 text-slate-900":"text-white/65 hover:text-white"}`}>{lbl}</button>
            ))}
          </div>
        </div>
        {alertsOpen&&stats&&(
          <div className="bg-red-50 border-b border-red-200 px-4 py-3">
            {criticals.map((a,i)=><div key={i} className="flex items-start gap-2 text-xs text-red-700 py-0.5"><AlertTriangle size={11} className="mt-0.5 flex-shrink-0 text-red-500"/>{a.msg}</div>)}
            {warnings.map((a,i) =><div key={i} className="flex items-start gap-2 text-xs text-amber-700 py-0.5"><AlertTriangle size={11} className="mt-0.5 flex-shrink-0 text-amber-500"/>{a.msg}</div>)}
          </div>
        )}
        <div className="p-4 max-w-2xl mx-auto">
          {!stats&&(
            <div className="text-center py-20">
              <BarChart3 size={52} className="text-slate-300 mx-auto mb-4"/>
              <h3 className="text-slate-600 font-bold mb-1">Nenhuma resposta ainda</h3>
              <p className="text-slate-400 text-sm mb-6">Carregue dados de exemplo para testar o dashboard</p>
              <button onClick={loadSamples} className="bg-blue-900 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-800 text-sm flex items-center gap-2 mx-auto"><RefreshCw size={14}/> Carregar dados de exemplo</button>
            </div>
          )}
          {stats&&dashTab==="exec"&&(
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[{label:"Total Desligamentos",val:stats.n,sub:"respostas registradas",color:"#1B2A4A"},
                  {label:"Satisfação Média",val:`${stats.overallAvg}/5`,sub:"escala 1–5",color:stats.overallAvg<3?"#EF4444":stats.overallAvg<3.5?"#F59E0B":"#22C55E"},
                  {label:"Voltariam",val:`${stats.voltariaPct}%`,sub:"dos respondentes",color:"#2E5C8A"},
                  {label:"Voluntários",val:`${Math.round(stats.voluntary/stats.n*100)}%`,sub:`${stats.voluntary} pedidos de demissão`,color:"#E8A020"}
                ].map(({label,val,sub,color})=>(
                  <div key={label} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                    <div className="text-xs text-slate-500 font-medium mb-2">{label}</div>
                    <div className="text-2xl font-bold mb-0.5" style={{color}}>{val}</div>
                    <div className="text-xs text-slate-400">{sub}</div>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 text-sm mb-3">Composição dos Desligamentos</h3>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[{label:"Voluntários",val:stats.voluntary,color:"#2E5C8A"},{label:"Empresa",val:stats.involuntary,color:"#E8A020"},{label:"Outros",val:stats.n-stats.voluntary-stats.involuntary,color:"#94A3B8"}].map(({label,val,color})=>(
                    <div key={label} className="rounded-xl py-3 px-2 border border-slate-100" style={{background:color+"12"}}>
                      <div className="text-xl font-bold" style={{color}}>{val}</div>
                      <div className="text-xs text-slate-500">{label}</div>
                      <div className="text-xs font-bold" style={{color}}>{Math.round(val/stats.n*100)}%</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 text-sm mb-3">Avaliação por Aspecto</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={stats.avgRatings} layout="vertical" margin={{left:10,right:35}}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false}/>
                    <XAxis type="number" domain={[0,5]} tickCount={6} tick={{fontSize:10}}/>
                    <YAxis type="category" dataKey="name" tick={{fontSize:8.5}} width={95}/>
                    <Tooltip formatter={v=>[`${v}/5`,"Média"]}/>
                    <Bar dataKey="value" radius={[0,4,4,0]}>{stats.avgRatings.map((e,i)=><Cell key={i} fill={e.value<2.5?"#EF4444":e.value<3.5?"#F59E0B":"#22C55E"}/>)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 text-sm mb-3">Top Motivos de Saída</h3>
                <ResponsiveContainer width="100%" height={185}>
                  <BarChart data={stats.motivoData} margin={{bottom:32,right:10}}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                    <XAxis dataKey="name" tick={{fontSize:8}} angle={-30} textAnchor="end" interval={0}/>
                    <YAxis tick={{fontSize:10}}/>
                    <Tooltip/>
                    <Bar dataKey="value" fill="#1B2A4A" radius={[4,4,0,0]} name="Ocorrências"/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {stats.monthlyTrend.length>1&&(
                <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                  <h3 className="font-bold text-slate-800 text-sm mb-3">Tendência Mensal</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={stats.monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3"/>
                      <XAxis dataKey="month" tick={{fontSize:9}}/>
                      <YAxis yAxisId="l" tick={{fontSize:9}}/>
                      <YAxis yAxisId="r" orientation="right" domain={[0,5]} tick={{fontSize:9}}/>
                      <Tooltip/><Legend wrapperStyle={{fontSize:"11px"}}/>
                      <Line yAxisId="l" type="monotone" dataKey="desligamentos" stroke="#1B2A4A" strokeWidth={2} dot={{r:3}} name="Desligamentos"/>
                      <Line yAxisId="r" type="monotone" dataKey="satisfacao" stroke="#22C55E" strokeWidth={2} dot={{r:3}} name="Satisfação"/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 text-sm mb-3">Administração</h3>
                <div className="flex flex-wrap gap-2 items-center">
                  <button onClick={()=>exportToCSV(responses)} className="bg-green-50 text-green-700 text-xs font-bold px-3 py-2 rounded-lg hover:bg-green-100 flex items-center gap-1.5"><Download size={11}/> Exportar Excel/CSV</button>
                  <button onClick={loadSamples} className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-2 rounded-lg hover:bg-blue-100 flex items-center gap-1.5"><RefreshCw size={11}/> + Dados exemplo</button>
                  <button onClick={clearAllData} className="bg-red-50 text-red-600 text-xs font-bold px-3 py-2 rounded-lg hover:bg-red-100">Limpar tudo</button>
                  <span className="text-xs text-slate-400">{responses.length} registros</span>
                </div>
              </div>
            </div>
          )}
          {stats&&dashTab==="stores"&&(
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 text-sm mb-4">Ranking por Unidade</h3>
                <div className="space-y-2.5">{stats.storeRanking.map((s,idx)=>(
                  <div key={s.name} onClick={()=>setExpandedStore(expandedStore===s.name?null:s.name)} className="border border-slate-100 rounded-xl p-3 cursor-pointer hover:border-blue-200 hover:bg-blue-50/20 transition-all">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600">{idx+1}</div><span className="font-semibold text-sm text-slate-800">{s.name}</span></div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.risk==="CRÍTICO"?"bg-red-100 text-red-600":s.risk==="ATENÇÃO"?"bg-amber-100 text-amber-700":s.risk==="BOM"?"bg-green-100 text-green-700":"bg-gray-100 text-gray-500"}`}>{s.risk}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div><div className="text-lg font-bold text-slate-800">{s.total}</div><div className="text-xs text-slate-400">Desl.</div></div>
                      <div><div className={`text-lg font-bold ${s.avgRating<3?"text-red-500":s.avgRating<4?"text-amber-500":"text-green-500"}`}>{s.avgRating||"—"}</div><div className="text-xs text-slate-400">Nota</div></div>
                      <div><div className="text-lg font-bold text-blue-700">{s.voluntary}</div><div className="text-xs text-slate-400">Voluntários</div></div>
                    </div>
                    {expandedStore===s.name&&(
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                        <div className="bg-slate-50 rounded-lg p-2 text-center"><div className="text-xs text-slate-500 mb-0.5">% Voluntário</div><div className="font-bold text-blue-700">{s.total>0?Math.round(s.voluntary/s.total*100):0}%</div></div>
                        <div className="bg-slate-50 rounded-lg p-2 text-center"><div className="text-xs text-slate-500 mb-0.5">Risco</div><div className={`font-bold text-sm ${s.risk==="CRÍTICO"?"text-red-600":s.risk==="ATENÇÃO"?"text-amber-600":"text-green-600"}`}>{s.risk}</div></div>
                      </div>
                    )}
                  </div>
                ))}</div>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 text-sm mb-3">Satisfação por Unidade</h3>
                <ResponsiveContainer width="100%" height={185}>
                  <BarChart data={stats.storeRanking.filter(s=>s.avgRating>0)} margin={{bottom:36}}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                    <XAxis dataKey="name" tick={{fontSize:10}} interval={0}/>
                    <YAxis domain={[0,5]} tick={{fontSize:10}}/>
                    <Tooltip formatter={v=>[`${v}/5`,"Nota"]}/>
                    <Bar dataKey="avgRating" radius={[4,4,0,0]} name="Satisfação">{stats.storeRanking.map((s,i)=><Cell key={i} fill={s.avgRating<2.5?"#EF4444":s.avgRating<3.5?"#F59E0B":"#22C55E"}/>)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          {stats&&dashTab==="gestor"&&(
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 text-sm mb-1">Análise da Liderança</h3>
                <p className="text-slate-400 text-xs mb-4">% de respostas "Sim" por aspecto</p>
                <div className="space-y-2.5">{stats.gestorData.sort((a,b)=>a.pct-b.pct).map(item=>(
                  <div key={item.fullName}>
                    <div className="flex justify-between text-xs mb-1"><span className="text-slate-600 truncate pr-2">{item.fullName}</span><span className={`font-bold flex-shrink-0 ${item.pct<40?"text-red-600":item.pct<65?"text-amber-600":"text-green-600"}`}>{item.pct}%</span></div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{width:`${item.pct}%`,background:item.pct<40?"#EF4444":item.pct<65?"#F59E0B":"#22C55E"}}/></div>
                  </div>
                ))}</div>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 text-sm mb-3">Radar da Liderança</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={stats.gestorData.map(g=>({subject:g.name,pct:g.pct}))}>
                    <PolarGrid/><PolarAngleAxis dataKey="subject" tick={{fontSize:8}}/>
                    <PolarRadiusAxis domain={[0,100]} tick={{fontSize:8}}/>
                    <Radar name="%" dataKey="pct" stroke="#2E5C8A" fill="#2E5C8A" fillOpacity={0.3}/>
                  </RadarChart>
                </ResponsiveContainer>
              </div>
              {stats.gestorData.filter(g=>g.pct<40&&g.total>=3).length>0&&(
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                  <div className="font-bold text-red-700 text-sm flex items-center gap-2 mb-2"><AlertTriangle size={13}/> Pontos Críticos</div>
                  {stats.gestorData.filter(g=>g.pct<40&&g.total>=3).map(g=><div key={g.fullName} className="text-xs text-red-600 py-0.5">• {g.fullName}: {g.pct}% ({g.total} respostas)</div>)}
                </div>
              )}
            </div>
          )}
          {dashTab==="actions"&&(
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:"#1B2A4A"}}><Zap size={18} className="text-amber-400"/></div>
                  <div><h3 className="font-bold text-slate-800 text-sm">Plano de Ação com IA</h3><p className="text-slate-400 text-xs">Gerado automaticamente com base nos dados</p></div>
                </div>
                {!stats?<div className="text-center py-8 text-slate-400 text-sm">Adicione respostas primeiro.</div>:(
                  <>
                    <button onClick={generateActionPlan} disabled={loadingAI} className="w-full py-3 rounded-xl font-bold text-white flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-60 mb-4" style={{background:"linear-gradient(135deg,#1B2A4A,#2E5C8A)"}}>
                      {loadingAI?<><RefreshCw size={15} className="animate-spin"/> Gerando...</>:<><Zap size={15}/> Gerar Plano com IA</>}
                    </button>
                    {actionPlan&&<div className="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed border border-slate-200">{actionPlan}</div>}
                    {!actionPlan&&!loadingAI&&stats.alerts.length>0&&(
                      <div><div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Alertas identificados</div>
                        <div className="space-y-2">{stats.alerts.map((a,i)=>(
                          <div key={i} className={`flex items-start gap-2 p-3 rounded-xl text-xs ${a.type==="critical"?"bg-red-50 text-red-700 border border-red-200":"bg-amber-50 text-amber-700 border border-amber-200"}`}>
                            <AlertTriangle size={11} className="mt-0.5 flex-shrink-0"/>{a.msg}
                          </div>
                        ))}</div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
