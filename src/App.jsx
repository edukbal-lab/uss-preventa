import * as XLSX from "xlsx";
import { useState, useEffect } from "react";

const API_CATALOG = [
  {"sku":"DS-2CD1021G0-I(2.8mm)","cat":"Cámaras IP","desc":"Cámara bala fija 2MP","usd":25.6},
  {"sku":"DS-2CD1023G2-I(2.8mm)","cat":"Cámaras IP","desc":"Cámara bala fija MD 2.0 2MP","usd":43.6},
  {"sku":"DS-2CD2023G2-IU(2.8mm)","cat":"Cámaras IP","desc":"Cámara bala AcuSense 2MP + mic","usd":56.0},
  {"sku":"DS-2CD2043G2-IU(2.8mm)","cat":"Cámaras IP","desc":"Cámara bala AcuSense 4MP + mic","usd":68.0},
  {"sku":"DS-2CD2083G2-IU(2.8mm)","cat":"Cámaras IP","desc":"Cámara bala AcuSense 8MP + mic","usd":95.0},
  {"sku":"DS-2CD2623G2-IZS","cat":"Cámaras IP","desc":"Cámara bullet VF 2.8-12mm AcuSense 2MP IR60m","usd":98.0},
  {"sku":"DS-2CD2T23G2-2I(4mm)","cat":"Cámaras IP","desc":"Cámara bala exterior AcuSense 2MP","usd":70.0},
  {"sku":"DS-7604NXI-K1/4P","cat":"Cámaras IP","desc":"NVR 4ch PoE AcuSense 1 SATA","usd":90.0},
  {"sku":"DS-7608NXI-K2/8P","cat":"Cámaras IP","desc":"NVR 8ch PoE AcuSense 2 SATA","usd":145.0},
  {"sku":"DS-7616NXI-K2","cat":"Cámaras IP","desc":"NVR 16ch AcuSense 2 SATA","usd":185.0},
  {"sku":"DS-7632NXI-K2","cat":"Cámaras IP","desc":"NVR 32ch AcuSense 2 SATA","usd":280.0},
  {"sku":"DS-3E1309P-EI","cat":"Cámaras IP","desc":"Switch PoE 8p Fast Ethernet","usd":65.0},
  {"sku":"DS-2CE10DF0T-F(2.8mm)","cat":"Cámaras Analógicas","desc":"Mini bala ColorVu 2MP","usd":19.2},
  {"sku":"DS-2CE12DF3T-LFS(2.8mm)","cat":"Cámaras Analógicas","desc":"Bala ColorVu 2MP luz híbrida","usd":38.0},
  {"sku":"DS-7108HUHI-K1(S)","cat":"Cámaras Analógicas","desc":"DVR 8ch 8MP 1 SATA","usd":98.0},
  {"sku":"DS-7116HUHI-K2(S)","cat":"Cámaras Analógicas","desc":"DVR 16ch 8MP 2 SATA","usd":175.0},
  {"sku":"DS-K1101M","cat":"Control de Acceso","desc":"Lector tarjetas Pro 1101","usd":17.7},
  {"sku":"DS-K1102AMK","cat":"Control de Acceso","desc":"Lector tarjetas + teclado","usd":27.8},
  {"sku":"DS-K1107AMK","cat":"Control de Acceso","desc":"Lector tarjetas + teclado","usd":26.4},
  {"sku":"DS-K1201AMF","cat":"Control de Acceso","desc":"Lector huellas dactilares","usd":68.0},
  {"sku":"DS-K1T671TM-3XF","cat":"Control de Acceso","desc":"Terminal reconocimiento facial","usd":285.0},
  {"sku":"DS-K2601T","cat":"Control de Acceso","desc":"Panel CA 1 puerta","usd":85.0},
  {"sku":"DS-K2602","cat":"Control de Acceso","desc":"Panel CA 2 puertas","usd":120.0},
  {"sku":"DS-K2604","cat":"Control de Acceso","desc":"Panel CA 4 puertas","usd":180.0},
  {"sku":"DS-K4T100-S1","cat":"Control de Acceso","desc":"Electroimán 280kg","usd":28.0},
  {"sku":"DS-PWA48-E-WB","cat":"Alarmas","desc":"Panel alarma AX PRO 48z WiFi","usd":119.1},
  {"sku":"DS-PHA48-EP","cat":"Alarmas","desc":"Panel alarma híbrido 48z","usd":95.0},
  {"sku":"DS-PK201B-WB","cat":"Alarmas","desc":"Teclado inalámbrico AX PRO","usd":26.9},
  {"sku":"DS-PS1-I-WB/BLUE","cat":"Alarmas","desc":"Sirena interior inalámbrica","usd":39.6},
  {"sku":"DS-PS1-E-WB/BLUE","cat":"Alarmas","desc":"Sirena exterior inalámbrica","usd":55.0},
  {"sku":"DS-PDMC-EG2-WB","cat":"Alarmas","desc":"Detector PIR inalámbrico","usd":32.0},
  {"sku":"DS-PDP15P-EG2-WB","cat":"Alarmas","desc":"Detector PIR cortina inalámbrico","usd":28.0},
  {"sku":"DS-PKF1-WB","cat":"Alarmas","desc":"Llavero inalámbrico AX PRO","usd":14.0},
  {"sku":"DS-PDBG8-EG2-WB","cat":"Alarmas","desc":"Detector rotura cristal inalámbrico","usd":33.1},
];

const PROJECTS = [
  {"r":"Logistica","n":"Cámaras perímetro en predio logístico 400m x lado, 3 naves","m":["DS-2CD2623G2-IZSx24","DS-7616NXI-K2x2","DS-3E1309P-EIx4"]},
  {"r":"Edificio","n":"CCTV + control de acceso para 2 edificios en consorcio","m":["DS-K1102AMKx6","DS-K2602x1","DS-2CD2023G2-IUx8","DS-7608NXI-K2x1"]},
  {"r":"Fabrica","n":"Fábrica 50m2: alarma + CCTV + CA para 30-40 empleados","m":["DS-PWA48-E-WBx1","DS-PK201B-WBx2","DS-PS1-I-WBx2","DS-7108HUHIx1"]},
  {"r":"Comercio","n":"Local comercial 200m2: CCTV + alarma, 2 accesos","m":["DS-2CD1021G0-Ix6","DS-7604NXI-K1x1","DS-PWA48-E-WBx1","DS-PDMC-EG2-WBx4"]},
  {"r":"Oficinas","n":"Empresa 80 empleados: CA en 3 accesos + CCTV piso completo","m":["DS-K2604x1","DS-K1102AMKx6","DS-2CD2023G2-IUx12","DS-7616NXI-K2x1"]},
  {"r":"Deposito","n":"Galpón 2000m2: perímetro CCTV + CA vehicular y peatonal","m":["DS-2CD2T23G2-2Ix8","DS-7608NXI-K2x1","DS-K2601Tx1"]},
  {"r":"Distribuidora","n":"Nave 800m2: CCTV completo + alarma perimetral","m":["DS-2CD1023G2-Ix10","DS-7608NXI-K2x1","DS-PWA48-E-WBx1","DS-PDMC-EG2-WBx6"]},
  {"r":"Restaurant","n":"3 locales gastronómicos 300m2: CCTV + alarma unificado","m":["DS-2CD1021G0-Ix6","DS-7604NXI-K1x1","DS-PWA48-E-WBx1"]},
];

const fmt = (n) => new Intl.NumberFormat("es-AR",{style:"currency",currency:"ARS",maximumFractionDigits:0}).format(n);
const fmtUSD = (n) => `USD ${Number(n).toFixed(0)}`;
const todayStr = () => { const d=new Date(); return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`; };

function calcAll({products,labor,tc,markup}){
  const hwUSD = products.reduce((s,p)=>s+p.qty*p.unit_usd,0);
  const hwARS = hwUSD*tc;
  const laborARS = labor.technicians*labor.days*260000;
  const cost = hwARS+laborARS;
  const factor = 1+markup/100;
  const total = cost*factor;
  const pagoInicial = total*0.3;
  const saldo = total*0.7;
  const cuota = saldo/6.5;
  return {hwUSD,hwARS,laborARS,cost,total,margin:total-cost,pagoInicial,saldo,cuota,penalidad:cuota*36};
}
function downloadBOM({products, labor, tc, markup, form, calc, qnum}) {
  const dateStr = new Date().toLocaleDateString("es-AR");

  const bomRows = products.map((p, i) => ({
    "Ítem":                   i + 1,
    "SKU / Código":           p.sku,
    "Descripción":            p.desc,
    "Categoría":              p.cat || "",
    "Cantidad":               p.qty,
    "Precio USD (Black)":     p.unit_usd,
    "Total USD":              +(p.qty * p.unit_usd).toFixed(2),
    "Precio ARS (s/IVA)":    Math.round(p.unit_usd * tc * (1 + markup / 100)),
    "Total ARS (s/IVA)":     Math.round(p.qty * p.unit_usd * tc * (1 + markup / 100)),
    "Proveedor sugerido":     "Hikvision / HDN",
    "Stock disponible":       "Consultar",
    "Alternativa":            "",
    "Cotización especial":    "",
    "Notas preventa":         p.reason || "",
  }));

  bomRows.push({
    "Ítem":                   products.length + 1,
    "SKU / Código":           "MO-USS",
    "Descripción":            `Mano de obra — ${labor.technicians} técnico(s) × ${labor.days} día(s)`,
    "Categoría":              "Servicio",
    "Cantidad":               1,
    "Precio USD (Black)":     "",
    "Total USD":              "",
    "Precio ARS (s/IVA)":    Math.round(calc.laborARS * (1 + markup / 100)),
    "Total ARS (s/IVA)":     Math.round(calc.laborARS * (1 + markup / 100)),
    "Proveedor sugerido":     "USS",
    "Stock disponible":       "Disponible",
    "Alternativa":            "",
    "Cotización especial":    "",
    "Notas preventa":         `$260.000/día por técnico`,
  });

  const resumen = [
    ["RESUMEN FINANCIERO — USS PREVENTA", ""],
    ["", ""],
    ["Cotización N°", qnum],
    ["Fecha", dateStr],
    ["Cliente", form.name || "—"],
    ["CUIT", form.cuit || "—"],
    ["Lugar de instalación", form.site || form.address || "—"],
    ["Vendedor", form.seller || "—"],
    ["Rubro", form.rubro],
    ["Soluciones", form.sols.join(", ")],
    ["", ""],
    ["─── COSTOS ───", ""],
    ["Hardware (USD)", +calc.hwUSD.toFixed(2)],
    ["Tipo de cambio ($/USD)", tc],
    ["Hardware (ARS)", Math.round(calc.hwARS)],
    ["Mano de obra (ARS)", Math.round(calc.laborARS)],
    ["Costo total (ARS)", Math.round(calc.cost)],
    ["Markup (%)", markup + "%"],
    ["", ""],
    ["─── MODELO 1-SHOT ───", ""],
    ["Total s/IVA", Math.round(calc.total)],
    ["IVA 21%", Math.round(calc.total * 0.21)],
    ["TOTAL CON IVA", Math.round(calc.total * 1.21)],
    ["", ""],
    ["─── MODELO COMODATO ───", ""],
    ["Pago inicial (30%)", Math.round(calc.pagoInicial)],
    ["Saldo a amortizar (70%)", Math.round(calc.saldo)],
    ["Cuota mensual s/IVA (÷6.5)", Math.round(calc.cuota)],
    ["Cuota mensual c/IVA", Math.round(calc.cuota * 1.21)],
    ["Penalidad rescisión (36 cuotas)", Math.round(calc.penalidad)],
    ["Plazo contrato", "60 meses + renovación automática anual"],
  ];

  const wb = XLSX.utils.book_new();
  const wsBOM = XLSX.utils.json_to_sheet(bomRows);
  wsBOM["!cols"] = [
    {wch:5},{wch:30},{wch:45},{wch:18},{wch:9},{wch:18},{wch:12},
    {wch:20},{wch:18},{wch:20},{wch:16},{wch:20},{wch:20},{wch:30}
  ];
  XLSX.utils.book_append_sheet(wb, wsBOM, "BOM — Materiales");

  const wsRes = XLSX.utils.aoa_to_sheet(resumen);
  wsRes["!cols"] = [{wch:35},{wch:40}];
  XLSX.utils.book_append_sheet(wb, wsRes, "Resumen Financiero");

  const filename = `BOM_USS_${(form.name||"Cliente").replace(/\s+/g,"_")}_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}



export default function App(){
  const [step,setStep]=useState(1);
  const [form,setForm]=useState({name:"",cuit:"",address:"",site:"",contact:"",seller:"",rubro:"Comercio",sols:["CCTV"],desc:"",infra:""});
  const [products,setProducts]=useState([]);
  const [labor,setLabor]=useState({technicians:1,days:1,justification:""});
  const [analysis,setAnalysis]=useState("");
  const [tc,setTc]=useState(1500);
  const [tcFetched,setTcFetched]=useState(false);
  const [markup,setMarkup]=useState(50);
  const [model,setModel]=useState("comodato");
  const [loading,setLoading]=useState(false);
  const [loadMsg,setLoadMsg]=useState("");
  const [err,setErr]=useState("");
  const [qnum]=useState(()=>`USS-${new Date().getFullYear()}-${String(Math.floor(Math.random()*9000)+1000)}`);

  useEffect(()=>{
    fetch("https://dolarapi.com/v1/dolares/blue")
      .then(r=>r.json()).then(d=>{setTc(d.venta);setTcFetched(true);}).catch(()=>{});
  },[]);

  const RUBROS=["Comercio","Edificio","Fábrica","Depósito","Logística","Oficinas","Restaurant","Distribuidora","Centro de salud","Otro"];
  const SOLS=["CCTV","Control de Acceso","Alarma","Detección de Incendio"];
  const toggleSol=(s)=>setForm(f=>({...f,sols:f.sols.includes(s)?f.sols.filter(x=>x!==s):[...f.sols,s]}));
  const upd=(k,v)=>setForm(f=>({...f,[k]:v}));

  async function generate(){
    if(form.desc.length<15){setErr("Describí la necesidad del cliente (mínimo 15 caracteres).");return;}
    setErr("");setLoading(true);setStep(2);
    const msgs=["Analizando requerimientos...","Buscando proyectos similares en USS...","Seleccionando equipamiento Hikvision...","Estimando mano de obra...","Armando propuesta..."];
    let mi=0; setLoadMsg(msgs[0]);
    const iv=setInterval(()=>{mi=(mi+1)%msgs.length;setLoadMsg(msgs[mi]);},1800);

    const similar=PROJECTS.filter(p=>p.r.toLowerCase().includes(form.rubro.toLowerCase().slice(0,5))).slice(0,3);
    const catFilter=API_CATALOG.filter(p=>
      (form.sols.includes("CCTV")&&(p.cat==="Cámaras IP"||p.cat==="Cámaras Analógicas"))||
      (form.sols.includes("Control de Acceso")&&p.cat==="Control de Acceso")||
      (form.sols.includes("Alarma")&&p.cat==="Alarmas")
    );

    try{
      // Llamamos a nuestra API route en Vercel — la API key nunca sale del servidor
      const res = await fetch("/api/chat", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1200,
          system:`Eres el asistente de preventa de USS Seguridad Electrónica, integrador B2B argentino. Seleccioná equipamiento Hikvision del catálogo y estimá mano de obra. Respondé SOLO con JSON válido sin markdown:\n{"analysis":"2-3 oraciones","products":[{"sku":"","desc":"","qty":1,"unit_usd":0,"reason":""}],"labor":{"technicians":1,"days":1,"justification":""}}`,
          messages:[{role:"user",content:`Cliente: ${form.name||"Sin nombre"}\nRubro: ${form.rubro}\nInstalación: ${form.site||form.address||"No especificado"}\nSoluciones: ${form.sols.join(", ")}\nNecesidad: ${form.desc}\nInfraestructura: ${form.infra||"No especificada"}\n\nCATÁLOGO DISPONIBLE:\n${JSON.stringify(catFilter)}\n\nPROYECTOS SIMILARES GANADOS (referencia):\n${JSON.stringify(similar)}`}]
        })
      });
      const data=await res.json();
      const txt=data.content?.map(c=>c.text||"").join("").trim().replace(/```json|```/g,"").trim();
      const parsed=JSON.parse(txt);
      clearInterval(iv);
      setAnalysis(parsed.analysis||"");
      setProducts(parsed.products||[]);
      setLabor(parsed.labor||{technicians:1,days:1,justification:""});
      setLoading(false);setStep(3);
    }catch(e){
      clearInterval(iv);
      setErr("Error al conectar con el agente. Verificá la API key en Vercel.");
      setLoading(false);setStep(1);
    }
  }

  const calc=products.length>0?calcAll({products,labor,tc,markup}):null;

  const C={bg:"#0d1520",surface:"#111c2a",border:"#1e2d3f",text:"#e8ecf0",muted:"#4a6077",accent:"#e8500a",accentDim:"#2a1208",label:"#7a9ab5"};
  const s={
    page:{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'DM Sans','Segoe UI',sans-serif"},
    hdr:{background:"#0a1018",borderBottom:`2px solid ${C.accent}`,padding:"12px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"},
    stepsBar:{display:"flex",background:"#111c2a",borderBottom:`1px solid ${C.border}`},
    stepLbl:(a,d)=>({flex:1,padding:"10px 4px",textAlign:"center",fontSize:"11px",fontWeight:"700",letterSpacing:"0.05em",textTransform:"uppercase",color:d?C.accent:a?"#fff":C.muted,background:a?"#162033":"transparent",borderBottom:a?`2px solid ${C.accent}`:"2px solid transparent",border:"none",cursor:"default"}),
    main:{maxWidth:"860px",margin:"0 auto",padding:"24px 16px"},
    card:{background:C.surface,borderRadius:"10px",border:`1px solid ${C.border}`,padding:"20px",marginBottom:"16px"},
    lbl:{display:"block",fontSize:"11px",fontWeight:"700",color:C.label,marginBottom:"5px",letterSpacing:"0.07em",textTransform:"uppercase"},
    inp:{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"9px 12px",color:C.text,fontSize:"14px",outline:"none",boxSizing:"border-box"},
    ta:{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"9px 12px",color:C.text,fontSize:"14px",outline:"none",resize:"vertical",boxSizing:"border-box",minHeight:"85px"},
    sel:{width:"100%",background:C.bg,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"9px 12px",color:C.text,fontSize:"14px",outline:"none"},
    btn:{background:C.accent,color:"#fff",border:"none",borderRadius:"7px",padding:"11px 24px",fontSize:"14px",fontWeight:"700",cursor:"pointer"},
    btnSec:{background:"#162033",color:C.muted,border:`1px solid ${C.border}`,borderRadius:"7px",padding:"9px 18px",fontSize:"13px",fontWeight:"600",cursor:"pointer"},
    chip:(a)=>({padding:"6px 13px",borderRadius:"20px",fontSize:"12px",fontWeight:"600",cursor:"pointer",border:a?`1px solid ${C.accent}`:`1px solid ${C.border}`,background:a?C.accentDim:C.bg,color:a?C.accent:C.muted,margin:"3px",display:"inline-block"}),
    g2:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px"},
    secTitle:{fontSize:"12px",fontWeight:"700",color:C.accent,letterSpacing:"0.09em",textTransform:"uppercase",marginBottom:"14px",paddingBottom:"8px",borderBottom:`1px solid ${C.border}`},
    row:{display:"flex",justifyContent:"space-between",padding:"7px 0",borderBottom:`1px solid ${C.bg}`,fontSize:"13px"},
    bigN:{fontSize:"22px",fontWeight:"800",color:C.accent,display:"block"},
    smallN:{fontSize:"11px",color:C.label,letterSpacing:"0.05em",textTransform:"uppercase",marginTop:"2px"},
    toggle:(a)=>({flex:1,padding:"9px",textAlign:"center",borderRadius:"6px",fontSize:"13px",fontWeight:"600",cursor:"pointer",background:a?C.accent:"transparent",color:a?"#fff":C.muted,border:"none"}),
  };

  return(
    <div style={s.page}>
      <div style={s.hdr}>
        <div>
          <div style={{fontSize:"16px",fontWeight:"800",letterSpacing:"0.05em"}}>USS</div>
          <div style={{fontSize:"10px",color:C.accent,letterSpacing:"0.12em",textTransform:"uppercase"}}>Agente de Preventa</div>
        </div>
        <div style={{fontSize:"12px",color:C.muted}}>
          💵 Dólar Blue: <span style={{color:C.accent,fontWeight:"700"}}>${tc.toLocaleString("es-AR")}</span>
          {!tcFetched&&<span style={{fontSize:"11px",color:C.muted,marginLeft:"6px"}}>(manual)</span>}
        </div>
      </div>

      <div style={s.stepsBar}>
        {["1 Datos","2 Generando","3 Revisar","4 Cotización"].map((l,i)=>(
          <button key={i} style={s.stepLbl(step===i+1,step>i+1)}>{l}</button>
        ))}
      </div>

      <div style={s.main}>

        {step===1&&<>
          {err&&<div style={{background:"#200a0a",border:"1px solid #804040",borderRadius:"8px",padding:"12px",marginBottom:"14px",color:"#f08080",fontSize:"13px"}}>{err}</div>}
          <div style={s.card}>
            <div style={s.secTitle}>Datos del cliente</div>
            <div style={s.g2}>
              <div><label style={s.lbl}>Cliente / Razón Social</label><input style={s.inp} value={form.name} onChange={e=>upd("name",e.target.value)} placeholder="Nombre del cliente"/></div>
              <div><label style={s.lbl}>CUIT</label><input style={s.inp} value={form.cuit} onChange={e=>upd("cuit",e.target.value)} placeholder="XX-XXXXXXXX-X"/></div>
              <div><label style={s.lbl}>Domicilio comercial</label><input style={s.inp} value={form.address} onChange={e=>upd("address",e.target.value)} placeholder="Dirección"/></div>
              <div><label style={s.lbl}>Lugar de instalación</label><input style={s.inp} value={form.site} onChange={e=>upd("site",e.target.value)} placeholder="Si difiere del domicilio"/></div>
              <div><label style={s.lbl}>Contacto</label><input style={s.inp} value={form.contact} onChange={e=>upd("contact",e.target.value)} placeholder="Nombre y cargo"/></div>
              <div><label style={s.lbl}>Vendedor USS</label><input style={s.inp} value={form.seller} onChange={e=>upd("seller",e.target.value)} placeholder="Tu nombre"/></div>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.secTitle}>Requerimiento</div>
            <div style={s.g2}>
              <div>
                <label style={s.lbl}>Rubro</label>
                <select style={s.sel} value={form.rubro} onChange={e=>upd("rubro",e.target.value)}>
                  {RUBROS.map(r=><option key={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={s.lbl}>Soluciones</label>
                <div style={{marginTop:"2px"}}>{SOLS.map(so=><span key={so} style={s.chip(form.sols.includes(so))} onClick={()=>toggleSol(so)}>{so}</span>)}</div>
              </div>
            </div>
            <div style={{marginTop:"12px"}}>
              <label style={s.lbl}>Descripción de la necesidad *</label>
              <textarea style={s.ta} value={form.desc} onChange={e=>upd("desc",e.target.value)} placeholder="Describí lo que necesita el cliente. Ej: Galpón de 2000m², monitoreo perimetral 24/7, 3 accesos vehiculares, tienen internet de fibra..."/>
            </div>
            <div style={{marginTop:"10px"}}>
              <label style={s.lbl}>Infraestructura (opcional)</label>
              <textarea style={{...s.ta,minHeight:"55px"}} value={form.infra} onChange={e=>upd("infra",e.target.value)} placeholder="Internet, cableado existente, dimensiones, pisos..."/>
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <button style={{...s.btn,opacity:form.desc.length<15?0.45:1}} onClick={generate} disabled={form.desc.length<15}>
              Generar propuesta →
            </button>
          </div>
        </>}

        {step===2&&<div style={{textAlign:"center",padding:"70px 20px"}}>
          <div style={{fontSize:"36px",marginBottom:"18px",display:"inline-block",animation:"spin 1.8s linear infinite"}}>⚙</div>
          <div style={{fontSize:"16px",fontWeight:"600",marginBottom:"8px"}}>{loadMsg}</div>
          <div style={{fontSize:"13px",color:C.muted}}>El agente está consultando catálogo y proyectos históricos de USS...</div>
          <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
        </div>}

        {step===3&&calc&&<>
          {analysis&&<div style={{...s.card,background:"#0c1f0e",borderColor:"#1a3d1a"}}>
            <div style={{fontSize:"11px",fontWeight:"700",color:"#4a9050",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:"7px"}}>✓ Análisis del agente</div>
            <div style={{fontSize:"13px",color:"#98c898",lineHeight:"1.65"}}>{analysis}</div>
          </div>}

          <div style={s.card}>
            <div style={s.secTitle}>Equipamiento sugerido — editable</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}>
              <thead><tr style={{borderBottom:`1px solid ${C.border}`}}>
                {["SKU / Producto","Cant.","USD unit.","USD total",""].map(h=><th key={h} style={{padding:"7px 6px",textAlign:h==="Cant."||h.includes("USD")?"center":"left",color:C.muted,fontSize:"10px",letterSpacing:"0.06em",textTransform:"uppercase"}}>{h}</th>)}
              </tr></thead>
              <tbody>{products.map((p,i)=>(
                <tr key={i} style={{borderBottom:`1px solid ${C.bg}`}}>
                  <td style={{padding:"8px 6px"}}>
                    <div style={{fontWeight:"600"}}>{p.sku}</div>
                    <div style={{color:C.muted,fontSize:"11px",marginTop:"2px"}}>{p.desc}</div>
                  </td>
                  <td style={{textAlign:"center"}}>
                    <input type="number" min="1" value={p.qty} style={{...s.inp,width:"55px",textAlign:"center",padding:"5px 6px"}}
                      onChange={e=>setProducts(ps=>ps.map((x,j)=>j===i?{...x,qty:parseInt(e.target.value)||1}:x))}/>
                  </td>
                  <td style={{textAlign:"center",color:C.muted}}>{fmtUSD(p.unit_usd)}</td>
                  <td style={{textAlign:"center",fontWeight:"700"}}>{fmtUSD(p.qty*p.unit_usd)}</td>
                  <td style={{textAlign:"center"}}><button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:"16px"}} onClick={()=>setProducts(ps=>ps.filter((_,j)=>j!==i))}>×</button></td>
                </tr>
              ))}</tbody>
            </table>
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:"10px",marginTop:"10px",fontSize:"13px",color:C.muted}}>
              {products.length} productos · Hardware: <strong style={{color:C.text}}>{fmtUSD(calc.hwUSD)}</strong> → {fmt(calc.hwARS)}
            </div>
          </div>

          <div style={s.g2}>
            <div style={s.card}>
              <div style={s.secTitle}>Mano de obra</div>
              <div style={s.g2}>
                <div><label style={s.lbl}>Técnicos</label><input type="number" min="1" style={s.inp} value={labor.technicians} onChange={e=>setLabor(l=>({...l,technicians:parseInt(e.target.value)||1}))}/></div>
                <div><label style={s.lbl}>Días</label><input type="number" min="1" style={s.inp} value={labor.days} onChange={e=>setLabor(l=>({...l,days:parseInt(e.target.value)||1}))}/></div>
              </div>
              {labor.justification&&<div style={{fontSize:"11px",color:C.muted,marginTop:"9px",fontStyle:"italic"}}>{labor.justification}</div>}
              <div style={{marginTop:"9px",fontSize:"13px",color:C.muted}}>Total MO: <strong style={{color:C.text}}>{fmt(calc.laborARS)}</strong></div>
            </div>
            <div style={s.card}>
              <div style={s.secTitle}>Variables</div>
              <div style={{marginBottom:"12px"}}>
                <label style={s.lbl}>TC ($/USD) {tcFetched?"· Blue venta":""}</label>
                <input type="number" style={s.inp} value={tc} onChange={e=>setTc(parseFloat(e.target.value)||1500)}/>
              </div>
              <div><label style={s.lbl}>Markup (%)</label><input type="number" style={s.inp} value={markup} onChange={e=>setMarkup(parseInt(e.target.value)||0)}/></div>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.secTitle}>Resumen financiero</div>
            <div style={{marginBottom:"16px"}}>
              {[
                [`Hardware (${fmtUSD(calc.hwUSD)} × $${tc.toLocaleString("es-AR")})`,fmt(calc.hwARS)],
                [`Mano de obra (${labor.technicians}t × ${labor.days}d × $260.000)`,fmt(calc.laborARS)],
                ["Costo total",fmt(calc.cost)],
              ].map(([k,v],i)=><div key={i} style={{...s.row,fontWeight:i===2?"700":"400"}}><span style={{color:i<2?C.muted:C.text}}>{k}</span><span>{v}</span></div>)}
            </div>
            <div style={s.g2}>
              <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:"8px",padding:"16px",textAlign:"center"}}>
                <div style={{fontSize:"11px",color:C.muted,textTransform:"uppercase",letterSpacing:"0.07em"}}>1-Shot</div>
                <span style={s.bigN}>{fmt(calc.total)}</span>
                <div style={s.smallN}>Pago único s/IVA · Markup {markup}%</div>
                <div style={{fontSize:"12px",color:C.muted,marginTop:"7px"}}>Con IVA 21%: {fmt(calc.total*1.21)}</div>
              </div>
              <div style={{background:"#1a0d06",border:`1px solid ${C.accent}`,borderRadius:"8px",padding:"16px",textAlign:"center"}}>
                <div style={{fontSize:"11px",color:C.accent,textTransform:"uppercase",letterSpacing:"0.07em"}}>Comodato</div>
                <span style={{...s.bigN,fontSize:"18px"}}>{fmt(calc.pagoInicial)}</span>
                <div style={s.smallN}>Pago inicial (30%)</div>
                <span style={{...s.bigN,marginTop:"8px"}}>{fmt(calc.cuota)}/mes</span>
                <div style={s.smallN}>Cuota mensual s/IVA</div>
                <div style={{fontSize:"11px",color:C.muted,marginTop:"6px"}}>Con IVA: {fmt(calc.cuota*1.21)}/mes · Penalidad: {fmt(calc.penalidad)}</div>
              </div>
            </div>
          </div>

          <div style={s.card}>
            <div style={s.secTitle}>Modelo para la cotización</div>
            <div style={{display:"flex",background:C.bg,borderRadius:"8px",padding:"3px",marginBottom:"16px"}}>
              <button style={s.toggle(model==="oneshot")} onClick={()=>setModel("oneshot")}>1-Shot — Venta directa</button>
              <button style={s.toggle(model==="comodato")} onClick={()=>setModel("comodato")}>Comodato — Abono mensual</button>
            </div>
            <div style={{display:"flex",gap:"10px",justifyContent:"flex-end",flexWrap:"wrap"}}>
              <button style={s.btnSec} onClick={()=>setStep(1)}>← Editar</button>
              <button style={{...s.btnSec,color:"#4a9050",borderColor:"#1a3d1a",background:"#0c1f0e"}} onClick={()=>downloadBOM({products,labor,tc,markup,form,calc,qnum})}>📊 Descargar BOM</button>
              <button style={s.btn} onClick={()=>setStep(4)}>Ver cotización →</button>
            </div>
          </div>
        </>}

        {step===4&&calc&&<>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"14px"}}>
            <button style={s.btnSec} onClick={()=>setStep(3)}>← Volver</button>
            <button style={s.btn} onClick={()=>window.print()}>🖨 Imprimir / Guardar PDF</button>
          </div>

          <div style={{background:"#fff",color:"#111",borderRadius:"10px",padding:"30px",fontSize:"13px",lineHeight:"1.65"}}>
            <table style={{width:"100%",borderCollapse:"collapse",marginBottom:"20px"}}><tbody><tr>
              <td style={{background:"#111",color:"#fff",padding:"14px",borderRadius:"6px 0 0 6px",width:"55%"}}>
                <div style={{fontSize:"15px",fontWeight:"700"}}>USS Servicios Unidos de Seguridad S.A.</div>
                <div style={{fontSize:"11px",color:"#aaa",marginTop:"3px"}}>www.uss.com.ar · Tel. 4011-3000</div>
                <div style={{fontSize:"11px",color:"#e8500a",fontStyle:"italic"}}>Seguridad Electrónica Empresarial</div>
              </td>
              <td style={{background:"#f5f5f5",padding:"14px",borderRadius:"0 6px 6px 0",textAlign:"right",fontSize:"12px"}}>
                <div><strong>N° Cotización:</strong> {qnum}</div>
                <div><strong>Fecha:</strong> {todayStr()}</div>
                <div><strong>Validez:</strong> 30 días</div>
                <div><strong>Vendedor:</strong> {form.seller||"—"}</div>
              </td>
            </tr></tbody></table>

            <div style={{fontSize:"17px",fontWeight:"700",textAlign:"center",borderBottom:"2px solid #e8500a",paddingBottom:"10px",marginBottom:"16px"}}>COTIZACIÓN</div>

            <div style={{fontWeight:"700",fontSize:"11px",letterSpacing:"0.06em",textTransform:"uppercase",color:"#555",marginBottom:"8px"}}>Datos del Cliente</div>
            <table style={{width:"100%",borderCollapse:"collapse",marginBottom:"18px",fontSize:"12px"}}><tbody>
              {[["Cliente",form.name||"—"],["CUIT",form.cuit||"—"],["Dirección",form.address||"—"],["Instalación",form.site||form.address||"—"],["Contacto",form.contact||"—"]].map(([k,v])=>(
                <tr key={k} style={{borderBottom:"1px solid #eee"}}>
                  <td style={{padding:"6px 10px",fontWeight:"600",background:"#f9f9f9",width:"130px"}}>{k}</td>
                  <td style={{padding:"6px 10px"}}>{v}</td>
                </tr>
              ))}
            </tbody></table>

            <div style={{fontWeight:"700",fontSize:"11px",letterSpacing:"0.06em",textTransform:"uppercase",color:"#555",marginBottom:"8px"}}>Detalle de Equipamiento</div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px",marginBottom:"18px"}}>
              <thead style={{background:"#111",color:"#fff"}}>
                <tr>{["Ítem","Descripción","Modelo","Cant.","P.Unit ARS","Subtotal ARS"].map(h=><th key={h} style={{padding:"8px",textAlign:"left",fontWeight:"600"}}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {products.map((p,i)=>{const ua=p.unit_usd*tc*(1+markup/100);return(
                  <tr key={i} style={{borderBottom:"1px solid #eee",background:i%2===0?"#fff":"#fafafa"}}>
                    <td style={{padding:"7px 8px"}}>{i+1}</td>
                    <td style={{padding:"7px 8px"}}>{p.desc}</td>
                    <td style={{padding:"7px 8px",fontSize:"11px",color:"#666"}}>{p.sku}</td>
                    <td style={{padding:"7px 8px",textAlign:"center"}}>{p.qty}</td>
                    <td style={{padding:"7px 8px",textAlign:"right"}}>{fmt(ua)}</td>
                    <td style={{padding:"7px 8px",textAlign:"right",fontWeight:"700"}}>{fmt(ua*p.qty)}</td>
                  </tr>
                );})}
                <tr style={{background:"#fff8f5",borderBottom:"1px solid #eee"}}>
                  <td style={{padding:"7px 8px"}}>{products.length+1}</td>
                  <td style={{padding:"7px 8px"}}>Instalación ({labor.technicians} téc. × {labor.days} días)</td>
                  <td style={{padding:"7px 8px",fontSize:"11px",color:"#666"}}>Mano de obra USS</td>
                  <td style={{padding:"7px 8px",textAlign:"center"}}>1</td>
                  <td style={{padding:"7px 8px",textAlign:"right"}}>{fmt(calc.laborARS*(1+markup/100))}</td>
                  <td style={{padding:"7px 8px",textAlign:"right",fontWeight:"700"}}>{fmt(calc.laborARS*(1+markup/100))}</td>
                </tr>
              </tbody>
            </table>

            <table style={{width:"100%",borderCollapse:"collapse",marginBottom:"18px",background:"#f9f9f9",borderRadius:"8px",fontSize:"13px"}}><tbody>
              {model==="comodato"?<>
                <tr style={{borderBottom:"1px solid #ddd"}}><td style={{padding:"9px 12px"}}>Cargo inicial de instalación</td><td style={{padding:"9px 12px",textAlign:"right",fontWeight:"700",fontSize:"15px"}}>{fmt(calc.pagoInicial)}</td></tr>
                <tr style={{borderBottom:"1px solid #ddd"}}><td style={{padding:"9px 12px"}}>Abono mensual s/IVA</td><td style={{padding:"9px 12px",textAlign:"right",fontWeight:"700"}}>{fmt(calc.cuota)}</td></tr>
                <tr style={{borderBottom:"1px solid #ddd"}}><td style={{padding:"9px 12px"}}>IVA (21%)</td><td style={{padding:"9px 12px",textAlign:"right"}}>{fmt(calc.cuota*0.21)}</td></tr>
                <tr style={{background:"#111",color:"#fff"}}><td style={{padding:"10px 12px",fontWeight:"700",borderRadius:"0 0 0 6px"}}>ABONO MENSUAL TOTAL</td><td style={{padding:"10px 12px",textAlign:"right",fontWeight:"800",fontSize:"17px",color:"#e8500a",borderRadius:"0 0 6px 0"}}>{fmt(calc.cuota*1.21)}</td></tr>
              </>:<>
                <tr style={{borderBottom:"1px solid #ddd"}}><td style={{padding:"9px 12px"}}>Subtotal s/IVA</td><td style={{padding:"9px 12px",textAlign:"right",fontWeight:"700"}}>{fmt(calc.total)}</td></tr>
                <tr style={{borderBottom:"1px solid #ddd"}}><td style={{padding:"9px 12px"}}>IVA (21%)</td><td style={{padding:"9px 12px",textAlign:"right"}}>{fmt(calc.total*0.21)}</td></tr>
                <tr style={{background:"#111",color:"#fff"}}><td style={{padding:"10px 12px",fontWeight:"700",borderRadius:"0 0 0 6px"}}>TOTAL</td><td style={{padding:"10px 12px",textAlign:"right",fontWeight:"800",fontSize:"17px",color:"#e8500a",borderRadius:"0 0 6px 0"}}>{fmt(calc.total*1.21)}</td></tr>
              </>}
            </tbody></table>

            <div style={{borderTop:"2px solid #e8500a",paddingTop:"14px",fontSize:"12px",color:"#333"}}>
              <div style={{fontWeight:"700",textTransform:"uppercase",fontSize:"11px",letterSpacing:"0.06em",marginBottom:"10px"}}>Condiciones Particulares</div>
              <p style={{marginBottom:"8px"}}><strong>1. Servicio:</strong> {form.sols.join(" / ")} · Rubro: {form.rubro}</p>
              <p style={{marginBottom:"8px"}}><strong>2. Equipamiento:</strong> {model==="comodato"?"Provisto en comodato, permanece propiedad de USS durante toda la vigencia.":"Vendido al cliente. Garantía según fabricante."}</p>
              {model==="comodato"&&<p style={{marginBottom:"8px"}}><strong>3. Plazo y rescisión:</strong> Contrato de <strong>60 meses</strong> con renovación automática anual. Rescisión anticipada: penalidad de <strong>36 abonos</strong> vigentes.</p>}
              <p style={{marginBottom:"8px"}}><strong>{model==="comodato"?"4":"3"}. Ajuste:</strong> Mensual por IPC (INDEC). USS notifica con 30 días de anticipación.</p>
              <p><strong>{model==="comodato"?"5":"4"}. Pago:</strong> Débito automático / forma acordada. IVA facturado por separado.</p>
            </div>

            <table style={{width:"100%",marginTop:"28px",borderTop:"1px solid #ddd"}}><tbody><tr>
              <td style={{paddingTop:"12px",fontSize:"12px",color:"#666"}}>
                Firma y aclaración del Cliente
                <div style={{borderTop:"1px solid #999",marginTop:"38px",width:"180px",paddingTop:"4px"}}>Firma / Fecha</div>
              </td>
              <td style={{textAlign:"right",verticalAlign:"bottom",fontSize:"10px",color:"#aaa"}}>USS Seguridad · Cotización · Pág. 1</td>
            </tr></tbody></table>
          </div>
          <style>{`@media print{body{background:#fff!important}}`}</style>
        </>}
      </div>
    </div>
  );
}
