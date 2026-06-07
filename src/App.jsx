import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabaseClient";
import emailjs from '@emailjs/browser';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────
const GRUPOS   = ["1A","1B","1C","1D","2A","2B","2C","2D","3A","3B","3C","3D"];
const GRADOS   = ["1","2","3"];
const LETRAS   = ["A","B","C","D"];
const PERIODOS = ["Trimestre 1","Trimestre 2","Trimestre 3"];
const MATERIAS_DEFAULT = [
  "Matemáticas","Español","Ciencias Naturales","Historia",
  "Geografía","Inglés","Educación Física","Arte","Informàtica","Formación Cívica"
];
const DOCENTE_PASSWORD = "docente2025";
const COLOR = {
  indigo:"#4f46e5", emerald:"#059669", amber:"#d97706",
  rose:"#e11d48",   sky:"#0284c7",     violet:"#7c3aed",
  teal:"#0f766e",   orange:"#ea580c",
};

// ── Bitácora Escolar — opciones
const SITUACIONES = [
  "Agresión Verbal",
  "Vocabulario Inapropiado",
  "Daño al Material",
  "Agresión Física",
  "Incumplimiento de Tareas/Trabajos",
  "Desacato al Docente",
  "Conducta Agresiva",
  "Accidente Escolar",
  "Otros",
];
const ACCIONES_POSIBLES = [
  "Diálogo con el Estudiante",
  "Carta Compromiso",
  "Plática con Tutor",
  "Acompañamiento del Director",
];

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────────────────────
const colorNota = n => parseFloat(n) >= 8 ? "#059669" : parseFloat(n) >= 6 ? "#d97706" : "#dc2626";

function parsearTexto(texto) {
  return texto
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 2);
}

async function leerArchivo(file) {
  return new Promise((resolve) => {
    const ext = file.name.split(".").pop().toLowerCase();
    const reader = new FileReader();
    if (["txt","csv"].includes(ext)) {
      reader.onload = e => resolve(e.target.result);
      reader.readAsText(file, "utf-8");
    } else if (ext === "docx") {
      reader.onload = e => {
        try {
          const ab = e.target.result;
          const decoder = new TextDecoder("utf-8");
          const text = decoder.decode(new Uint8Array(ab));
          const matches = [...text.matchAll(/<w:t[^>]*>([^<]+)<\/w:t>/g)];
          const names = matches.map(m => m[1].trim()).filter(n => n.length > 2);
          resolve(names.join("\n"));
        } catch { resolve(""); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = e => {
        try {
          const arr = new Uint8Array(e.target.result);
          let text = "";
          for (let i = 0; i < arr.length; i++) {
            const c = arr[i];
            if (c >= 32 && c < 127) text += String.fromCharCode(c);
            else if (c === 10 || c === 13) text += "\n";
          }
          const lines = text.split("\n")
            .map(l => l.replace(/[^\w\s\u00C0-\u024F]/g,"").trim())
            .filter(l => l.split(/\s+/).length >= 2 && l.length > 4);
          resolve(lines.join("\n"));
        } catch { resolve(""); }
      };
      reader.readAsArrayBuffer(file);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILIDADES DE CALENDARIO
// ─────────────────────────────────────────────────────────────────────────────

// Genera un link directo a Google Calendar con los datos del evento
function googleCalendarLink(titulo, fecha, notas = "") {
  // fecha formato "YYYY-MM-DD" → "YYYYMMDD"
  const d = fecha.replace(/-/g, "");
  const params = new URLSearchParams({
    action:  "TEMPLATE",
    text:    titulo,
    dates:   `${d}/${d}`,
    details: notas || "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Genera y descarga un archivo .ics (Apple Calendar, Samsung, Outlook, etc.)
function descargarICS(titulo, fecha, notas = "") {
  const d = fecha.replace(/-/g, "");
  const uid = `${Date.now()}@sistemaescolar`;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SistemaEscolar//Ing.Everardo//ES",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART;VALUE=DATE:${d}`,
    `DTEND;VALUE=DATE:${d}`,
    `SUMMARY:${titulo}`,
    `DESCRIPTION:${(notas || "").replace(/\n/g, "\\n")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url;
  a.download = `${titulo.replace(/\s+/g, "_")}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTES UI
// ─────────────────────────────────────────────────────────────────────────────
const Badge = ({ text, color = "#4f46e5" }) => (
  <span style={{
    background: color+"18", color, border:`1px solid ${color}40`,
    borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:700, letterSpacing:0.5,
  }}>{text}</span>
);

const Card = ({ children, style={} }) => (
  <div style={{
    background:"#fff", borderRadius:16,
    boxShadow:"0 1px 3px rgba(0,0,0,0.07),0 8px 24px rgba(0,0,0,0.05)",
    padding:24, marginBottom:20, ...style,
  }}>{children}</div>
);

const SectionTitle = ({ icon, title, subtitle, color="#4f46e5" }) => (
  <div style={{ marginBottom:18 }}>
    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
      <span style={{
        width:36, height:36, borderRadius:10, background:color+"15",
        display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0,
      }}>{icon}</span>
      <div>
        <div style={{ fontWeight:800, fontSize:17, color:"#111" }}>{title}</div>
        {subtitle && <div style={{ fontSize:12, color:"#9ca3af", marginTop:1 }}>{subtitle}</div>}
      </div>
    </div>
  </div>
);

const Input = ({ label, ...props }) => (
  <div style={{ marginBottom:14 }}>
    {label && <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#374151", marginBottom:5, letterSpacing:0.4 }}>{label}</label>}
    <input {...props} style={{
      width:"100%", padding:"10px 14px", borderRadius:10,
      border:"1.5px solid #e5e7eb", fontSize:14, outline:"none",
      transition:"border-color 0.2s", background:"#fafafa", boxSizing:"border-box",
      ...props.style,
    }}
    onFocus={e=>e.target.style.borderColor="#4f46e5"}
    onBlur={e=>e.target.style.borderColor="#e5e7eb"}
    />
  </div>
);

const Select = ({ label, options, value, onChange, placeholder }) => (
  <div style={{ marginBottom:14 }}>
    {label && <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#374151", marginBottom:5, letterSpacing:0.4 }}>{label}</label>}
    <select value={value} onChange={onChange} style={{
      width:"100%", padding:"10px 14px", borderRadius:10,
      border:"1.5px solid #e5e7eb", fontSize:14, outline:"none",
      background:"#fafafa", color:"#111", boxSizing:"border-box",
      appearance:"none", cursor:"pointer",
    }}>
      <option value="">{placeholder||"Seleccionar…"}</option>
      {options.map(o=>(
        <option key={o.value??o} value={o.value??o}>{o.label??o}</option>
      ))}
    </select>
  </div>
);

const Btn = ({ children, color="#4f46e5", outline, small, full, onClick, type="button", disabled }) => (
  <button type={type} onClick={onClick} disabled={disabled} style={{
    padding: small?"7px 16px":"11px 20px",
    borderRadius:10, fontWeight:700, fontSize:small?12:14,
    cursor:disabled?"not-allowed":"pointer", transition:"all 0.15s",
    width:full?"100%":undefined, letterSpacing:0.3,
    border:outline?`2px solid ${color}`:"none",
    background:outline?"transparent":color,
    color:outline?color:"#fff",
    opacity:disabled?0.5:1,
  }}
  onMouseEnter={e=>{ if(!disabled) e.currentTarget.style.filter="brightness(1.1)"; }}
  onMouseLeave={e=>{ e.currentTarget.style.filter="none"; }}
  >{children}</button>
);

const EmptyState = ({ icon, msg }) => (
  <div style={{ textAlign:"center", padding:"28px 0", color:"#9ca3af" }}>
    <div style={{ fontSize:34, marginBottom:8 }}>{icon}</div>
    <div style={{ fontSize:13 }}>{msg}</div>
  </div>
);

const Alert = ({ type, msg }) => {
  const styles = {
    success:{ bg:"#f0fdf4", color:"#15803d", border:"#86efac" },
    error:  { bg:"#fef2f2", color:"#dc2626", border:"#fca5a5" },
    info:   { bg:"#eff6ff", color:"#1d4ed8", border:"#93c5fd" },
    warning:{ bg:"#fffbeb", color:"#b45309", border:"#fcd34d" },
  };
  const s = styles[type]||styles.info;
  return (
    <div style={{
      background:s.bg, color:s.color, border:`1px solid ${s.border}`,
      borderRadius:10, padding:"9px 14px", fontSize:13, marginBottom:14, fontWeight:600,
    }}>{msg}</div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// PORTAL SELECTOR
// ─────────────────────────────────────────────────────────────────────────────
function PortalSelector({ onSelect }) {
  return (
    <div style={{
      minHeight:"100vh",
      background:"linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)",
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:24, fontFamily:"'Segoe UI',sans-serif",
    }}>
      <div style={{ textAlign:"center", marginBottom:48 }}>
        <div style={{
          width:76, height:76, borderRadius:22,
          background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:38, margin:"0 auto 18px", boxShadow:"0 0 50px #6366f170",
        }}>🏫</div>
        <div style={{ color:"#a5b4fc", fontSize:12, letterSpacing:4, marginBottom:6, fontWeight:700 }}>
          ESC. TEC.
        </div>
        <h1 style={{ color:"#fff", margin:0, fontSize:26, fontWeight:900, letterSpacing:-0.5, lineHeight:1.1 }}>
          Sistema Escolar
        </h1>
        <p style={{ color:"#64748b", margin:"8px 0 0", fontSize:13 }}>Gestión educativa centralizada</p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, maxWidth:560, width:"100%" }}>
        <button onClick={()=>onSelect("docente")} style={{
          background:"linear-gradient(135deg,#4f46e5,#6d28d9)", border:"none",
          borderRadius:20, padding:"32px 24px", cursor:"pointer", textAlign:"center",
          transition:"transform 0.2s,box-shadow 0.2s", boxShadow:"0 4px 20px #4f46e540",
        }}
        onMouseEnter={e=>{ e.currentTarget.style.transform="translateY(-5px)"; e.currentTarget.style.boxShadow="0 16px 36px #4f46e560"; }}
        onMouseLeave={e=>{ e.currentTarget.style.transform="translateY(0)"; e.currentTarget.style.boxShadow="0 4px 20px #4f46e540"; }}
        >
          <div style={{ fontSize:46, marginBottom:12 }}>👨‍🏫</div>
          <div style={{ color:"#fff", fontWeight:800, fontSize:18, marginBottom:6 }}>Portal Docente</div>
          <div style={{ color:"#c4b5fd", fontSize:12, lineHeight:1.5 }}>Alumnos · Eventos · Calificaciones</div>
        </button>

        {/* FIX: Texto corregido de "Antigos Alumnos" a "Portal de Alumnos" */}
        <button onClick={()=>onSelect("alumno")} style={{
          background:"linear-gradient(135deg,#059669,#0d9488)", border:"none",
          borderRadius:20, padding:"32px 24px", cursor:"pointer", textAlign:"center",
          transition:"transform 0.2s,box-shadow 0.2s", boxShadow:"0 4px 20px #05966940",
        }}
        onMouseEnter={e=>{ e.currentTarget.style.transform="translateY(-5px)"; e.currentTarget.style.boxShadow="0 16px 36px #05966960"; }}
        onMouseLeave={e=>{ e.currentTarget.style.transform="translateY(0)"; e.currentTarget.style.boxShadow="0 4px 20px #05966940"; }}
        >
          <div style={{ fontSize:46, marginBottom:12 }}>👨‍🎓</div>
          <div style={{ color:"#fff", fontWeight:800, fontSize:18, marginBottom:6 }}>Portal de Alumnos</div>
          <div style={{ color:"#a7f3d0", fontSize:12, lineHeight:1.5 }}>Mis notas · Mi perfil</div>
        </button>
      </div>

      <p style={{ color:"#334155", fontSize:12, marginTop:40 }}>
        Ing. Everardo &nbsp;·&nbsp; Ciclo Escolar 2025–2026
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN DOCENTE
// ─────────────────────────────────────────────────────────────────────────────
function LoginDocente({ onLogin, onBack }) {
  const [pass, setPass] = useState("");
  const [err,  setErr]  = useState("");
  const [vis,  setVis]  = useState(false);

  const handleLogin = (e) => {
    e.preventDefault();
    if (pass === DOCENTE_PASSWORD) onLogin();
    else { setErr("Contraseña incorrecta. Intenta de nuevo."); setPass(""); }
  };

  return (
    <div style={{
      minHeight:"100vh",
      background:"linear-gradient(135deg,#ede9fe,#ddd6fe,#c4b5fd)",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:24, fontFamily:"'Segoe UI',sans-serif",
    }}>
      <div style={{ background:"#fff", borderRadius:24, padding:36, width:"100%", maxWidth:400, boxShadow:"0 20px 60px rgba(0,0,0,0.14)" }}>
        <div style={{ textAlign:"center", marginBottom:30 }}>
          <div style={{
            width:64, height:64, borderRadius:18,
            background:"linear-gradient(135deg,#4f46e5,#7c3aed)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:30, margin:"0 auto 14px", boxShadow:"0 6px 20px #4f46e540",
          }}>👨‍🏫</div>
          <h2 style={{ margin:0, fontWeight:900, color:"#111", fontSize:22 }}>Acceso Docente</h2>
          <p style={{ color:"#6b7280", fontSize:13, marginTop:4 }}>Ingresa tu contraseña para continuar</p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom:14 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#374151", marginBottom:5 }}>Contraseña</label>
            <div style={{ position:"relative" }}>
              <input
                type={vis?"text":"password"}
                placeholder="••••••••"
                value={pass}
                onChange={e=>setPass(e.target.value)}
                autoFocus
                style={{
                  width:"100%", padding:"11px 44px 11px 14px", borderRadius:10,
                  border:"1.5px solid #e5e7eb", fontSize:15, outline:"none",
                  background:"#fafafa", boxSizing:"border-box",
                }}
                onFocus={e=>e.target.style.borderColor="#4f46e5"}
                onBlur={e=>e.target.style.borderColor="#e5e7eb"}
              />
              <button type="button" onClick={()=>setVis(!vis)} style={{
                position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                background:"none", border:"none", cursor:"pointer", fontSize:16, color:"#9ca3af",
              }}>{vis?"🙈":"👁️"}</button>
            </div>
          </div>
          {err && <Alert type="error" msg={err} />}
          <Btn full type="submit" color="#4f46e5">Ingresar al Panel</Btn>
        </form>

        <div style={{ textAlign:"center", marginTop:16 }}>
          <button onClick={onBack} style={{ background:"none", border:"none", color:"#9ca3af", fontSize:13, cursor:"pointer" }}>← Volver al inicio</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN ALUMNO
// ─────────────────────────────────────────────────────────────────────────────
function LoginAlumno({ onLogin, onBack }) {
  const [busq,    setBusq]    = useState("");
  const [pin,     setPin]     = useState("");
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!busq.trim()||!pin) { setErr("Ingresa tu nombre y PIN."); return; }
    setLoading(true); setErr("");
    const { data } = await supabase.from("alumnos")
      .select("*").ilike("nombre",`%${busq.trim()}%`).eq("pin",pin).limit(1);
    setLoading(false);
    if (data&&data.length>0) onLogin(data[0]);
    else setErr("Nombre o PIN incorrecto.");
  };

  return (
    <div style={{
      minHeight:"100vh",
      background:"linear-gradient(135deg,#ecfdf5,#d1fae5,#a7f3d0)",
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:24, fontFamily:"'Segoe UI',sans-serif",
    }}>
      <div style={{ background:"#fff", borderRadius:24, padding:36, width:"100%", maxWidth:400, boxShadow:"0 20px 60px rgba(0,0,0,0.12)" }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ fontSize:52, marginBottom:8 }}>👨‍🎓</div>
          {/* FIX: Título corregido */}
          <h2 style={{ margin:0, fontWeight:900, color:"#111", fontSize:22 }}>Portal de Alumnos</h2>
          <p style={{ color:"#6b7280", fontSize:13, marginTop:4 }}>Ingresa tu nombre y PIN</p>
        </div>
        <form onSubmit={handleLogin}>
          <Input label="Nombre completo" type="text" placeholder="Tu nombre" value={busq} onChange={e=>setBusq(e.target.value)} />
          <Input label="PIN (4 dígitos)" type="password" placeholder="••••" maxLength={4} value={pin} onChange={e=>setPin(e.target.value)} />
          {err && <Alert type="error" msg={err} />}
          <Btn full type="submit" color="#059669" disabled={loading}>{loading?"Verificando…":"Entrar"}</Btn>
        </form>
        <div style={{ textAlign:"center", marginTop:14 }}>
          <button onClick={onBack} style={{ background:"none", border:"none", color:"#9ca3af", fontSize:13, cursor:"pointer" }}>← Volver al inicio</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PORTAL ALUMNO
// ─────────────────────────────────────────────────────────────────────────────
function PortalAlumno({ alumno, onLogout }) {
  const [tab,            setTab]            = useState("notas");
  const [calificaciones, setCalificaciones] = useState([]);

  useEffect(()=>{
    const cargar = async () => {
      const { data:cal } = await supabase.from("Calificaciones")
        .select("*").eq("grupo", alumno.grupo);
      if (cal) setCalificaciones(cal);
    };
    cargar();
  },[alumno]);

  const promedio = calificaciones.length
    ? (calificaciones.reduce((s,c)=>s+parseFloat(c.nota||0),0)/calificaciones.length).toFixed(1)
    : "—";

  const mejor = calificaciones.length
    ? calificaciones.reduce((best,c)=>parseFloat(c.nota)>parseFloat(best.nota)?c:best, calificaciones[0])
    : null;

  const TABS = [
    { id:"notas",  icon:"📊", label:"Mis Notas" },
    { id:"perfil", icon:"👤", label:"Mi Perfil"  },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#f0fdf4", fontFamily:"'Segoe UI',sans-serif" }}>
      <div style={{ background:"linear-gradient(135deg,#059669,#0d9488)", padding:"22px 24px 66px" }}>
        <div style={{ maxWidth:680, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <p style={{ color:"#a7f3d0", fontSize:11, margin:0, letterSpacing:2, fontWeight:700 }}>BIENVENIDO</p>
            <h1 style={{ color:"#fff", margin:"4px 0 6px", fontSize:22, fontWeight:900 }}>{alumno.nombre}</h1>
            <Badge text={`Grupo ${alumno.grupo}`} color="#fff" />
          </div>
          <button onClick={onLogout} style={{ background:"rgba(255,255,255,0.18)", border:"none", color:"#fff", padding:"9px 16px", borderRadius:10, cursor:"pointer", fontSize:13, fontWeight:700 }}>Salir</button>
        </div>
      </div>

      <div style={{ maxWidth:680, margin:"-40px auto 0", padding:"0 20px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
          {[
            { label:"Promedio",       value:promedio,             icon:"🎯", color:"#059669" },
            { label:"Materias",       value:calificaciones.length,icon:"📚", color:"#4f46e5" },
            { label:"Mejor materia",  value:mejor?mejor.nota:"—", icon:"🏆", color:"#d97706" },
          ].map(s=>(
            <div key={s.label} style={{
              background:"#fff", borderRadius:14, padding:"14px 12px",
              boxShadow:"0 4px 20px rgba(0,0,0,0.08)", textAlign:"center",
            }}>
              <div style={{ fontSize:22 }}>{s.icon}</div>
              <div style={{ fontSize:22, fontWeight:900, color:s.color, lineHeight:1.2 }}>{s.value}</div>
              <div style={{ fontSize:10, color:"#6b7280", marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:680, margin:"18px auto 0", padding:"0 20px" }}>
        <div style={{ display:"flex", gap:8, background:"#fff", padding:6, borderRadius:14, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              flex:1, padding:"9px 6px", borderRadius:10, border:"none", cursor:"pointer",
              background:tab===t.id?"#059669":"transparent",
              color:tab===t.id?"#fff":"#6b7280",
              fontWeight:700, fontSize:13, transition:"all 0.2s",
            }}>{t.icon} {t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth:680, margin:"16px auto", padding:"0 20px 48px" }}>
        {tab==="notas" && (
          <Card>
            <SectionTitle icon="📊" title="Mis Calificaciones" subtitle={`Grupo ${alumno.grupo}`} color="#059669" />
            {calificaciones.length===0
              ? <EmptyState icon="📋" msg="No hay calificaciones registradas aún." />
              : <>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:14 }}>
                    <thead>
                      <tr style={{ borderBottom:"2px solid #f3f4f6" }}>
                        {["Materia","Trimestre","Calificación"].map(h=>(
                          <th key={h} style={{ padding:"8px 10px", textAlign:"left", fontSize:11, fontWeight:700, color:"#9ca3af", letterSpacing:0.5 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {calificaciones.map((c,i)=>(
                        <tr key={c.id||i} style={{ borderBottom:"1px solid #f9fafb" }}>
                          <td style={{ padding:"10px", fontWeight:700, color:"#111" }}>{c.materia}</td>
                          <td style={{ padding:"10px", color:"#6b7280", fontSize:13 }}>{c.periodo}</td>
                          <td style={{ padding:"10px" }}>
                            <span style={{
                              background:colorNota(c.nota)+"15",
                              border:`1.5px solid ${colorNota(c.nota)}40`,
                              borderRadius:8, padding:"3px 12px",
                              fontWeight:900, color:colorNota(c.nota), fontSize:14,
                            }}>{c.nota}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ marginTop:16, background:"#f0fdf4", borderRadius:10, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <span style={{ fontWeight:700, color:"#059669" }}>Promedio general</span>
                  <span style={{ fontWeight:900, fontSize:22, color:colorNota(promedio) }}>{promedio}</span>
                </div>
              </>
            }
          </Card>
        )}

        {tab==="perfil" && (
          <Card>
            <SectionTitle icon="👤" title="Mi Perfil" color="#7c3aed" />
            <div style={{ textAlign:"center", padding:"12px 0 24px" }}>
              <div style={{
                width:82, height:82, borderRadius:"50%", margin:"0 auto 14px",
                background:"linear-gradient(135deg,#059669,#0d9488)",
                display:"flex", alignItems:"center", justifyContent:"center",
                fontSize:38, boxShadow:"0 6px 24px #05966940",
              }}>👨‍🎓</div>
              <div style={{ fontWeight:900, fontSize:20 }}>{alumno.nombre}</div>
              <div style={{ color:"#6b7280", fontSize:14, marginTop:4 }}>Grupo <strong>{alumno.grupo}</strong></div>
            </div>
            <div style={{ background:"#f9fafb", borderRadius:12, padding:"4px 16px" }}>
              {[
                ["Nombre completo",    alumno.nombre],
                ["Grupo",             alumno.grupo],
                ["Promedio actual",   promedio],
                ["Materias cursadas", calificaciones.length],
                ["Ciclo escolar",     "2025–2026"],
              ].map(([k,v])=>(
                <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid #e5e7eb", fontSize:14 }}>
                  <span style={{ color:"#6b7280" }}>{k}</span>
                  <strong style={{ color:"#111" }}>{v}</strong>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTAR ALUMNOS
// ─────────────────────────────────────────────────────────────────────────────
function ImportarAlumnos({ grupo, onImportados, onClose }) {
  const [texto,    setTexto]    = useState("");
  const [preview,  setPreview]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [msg,      setMsg]      = useState(null);
  const fileRef = useRef();

  const actualizarPreview = (t) => {
    setTexto(t);
    setPreview(parsearTexto(t));
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setLoading(true);
    const texto = await leerArchivo(file);
    actualizarPreview(texto);
    setLoading(false);
  };

  const handleImportar = async () => {
    if (!grupo) { setMsg({ type:"error", msg:"Selecciona un grupo antes de importar." }); return; }
    if (preview.length===0) { setMsg({ type:"error", msg:"No se detectaron nombres." }); return; }
    setLoading(true);
    const rows = preview.map(nombre => ({ nombre, grupo, pin:"1234" }));
    const { error } = await supabase.from("alumnos").insert(rows);
    setLoading(false);
    if (error) setMsg({ type:"error", msg:"Error al guardar: "+error.message });
    else {
      setMsg({ type:"success", msg:`✅ ${rows.length} alumno(s) importados al grupo ${grupo}. PIN por defecto: 1234` });
      setTimeout(()=>{ onImportados(); onClose(); }, 2000);
    }
  };

  return (
    <div style={{
      position:"fixed", inset:0, background:"rgba(0,0,0,0.55)",
      display:"flex", alignItems:"center", justifyContent:"center",
      zIndex:1000, padding:20, backdropFilter:"blur(4px)",
    }}>
      <div style={{
        background:"#fff", borderRadius:20, padding:28, width:"100%", maxWidth:540,
        boxShadow:"0 24px 60px rgba(0,0,0,0.18)", maxHeight:"90vh", overflowY:"auto",
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontWeight:900, fontSize:18, color:"#111" }}>📋 Importar Alumnos</div>
          <button onClick={onClose} style={{ background:"#f3f4f6", border:"none", borderRadius:8, width:32, height:32, cursor:"pointer", fontSize:16 }}>✕</button>
        </div>

        {grupo && (
          <div style={{ background:"#ede9fe", borderRadius:10, padding:"8px 14px", marginBottom:16, fontSize:13, color:"#7c3aed", fontWeight:700 }}>
            📌 Grupo destino: {grupo}
          </div>
        )}
        {!grupo && (
          <Alert type="error" msg="Selecciona un grupo en el formulario antes de importar." />
        )}

        <div style={{ marginBottom:16 }}>
          <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#374151", marginBottom:6 }}>
            Pega la lista aquí (un nombre por línea)
          </label>
          <textarea
            value={texto}
            onChange={e=>actualizarPreview(e.target.value)}
            placeholder={"Juan Pérez García\nMaría López Martínez\nCarlos Hernández Ruiz\n..."}
            rows={6}
            style={{
              width:"100%", padding:"10px 14px", borderRadius:10,
              border:"1.5px solid #e5e7eb", fontSize:13, outline:"none",
              background:"#fafafa", boxSizing:"border-box", resize:"vertical", fontFamily:"monospace",
            }}
          />
        </div>

        <div style={{ marginBottom:16 }}>
          <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#374151", marginBottom:6 }}>
            O sube un archivo (.txt, .csv, .docx, .pdf)
          </label>
          <div
            onClick={()=>fileRef.current.click()}
            style={{
              border:"2px dashed #d1d5db", borderRadius:10, padding:"18px", textAlign:"center",
              cursor:"pointer", background:"#fafafa", transition:"border-color 0.2s",
            }}
            onMouseEnter={e=>e.currentTarget.style.borderColor="#4f46e5"}
            onMouseLeave={e=>e.currentTarget.style.borderColor="#d1d5db"}
          >
            <div style={{ fontSize:28, marginBottom:6 }}>📁</div>
            <div style={{ fontSize:13, color:"#6b7280" }}>Haz clic para seleccionar archivo</div>
            <div style={{ fontSize:11, color:"#9ca3af", marginTop:4 }}>TXT · CSV · DOCX · PDF (2010+)</div>
          </div>
          <input ref={fileRef} type="file" accept=".txt,.csv,.docx,.pdf" onChange={handleFile} style={{ display:"none" }} />
        </div>

        {preview.length>0 && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:8 }}>
              Vista previa — {preview.length} alumno(s) detectado(s):
            </div>
            <div style={{
              background:"#f9fafb", borderRadius:10, padding:"10px 14px",
              maxHeight:160, overflowY:"auto", border:"1px solid #e5e7eb",
            }}>
              {preview.map((n,i)=>(
                <div key={i} style={{ fontSize:13, padding:"3px 0", borderBottom:i<preview.length-1?"1px solid #f3f4f6":"none", color:"#111" }}>
                  <span style={{ color:"#9ca3af", marginRight:8 }}>{i+1}.</span>{n}
                </div>
              ))}
            </div>
            <div style={{ fontSize:11, color:"#6b7280", marginTop:6 }}>
              💡 El PIN por defecto será <strong>1234</strong>. Pide a cada alumno que lo cambie.
            </div>
          </div>
        )}

        {msg && <Alert type={msg.type} msg={msg.msg} />}

        <div style={{ display:"flex", gap:10 }}>
          <Btn full color="#4f46e5" onClick={handleImportar} disabled={loading||preview.length===0||!grupo}>
            {loading?"Importando…":`Importar ${preview.length||""} Alumnos`}
          </Btn>
          <Btn color="#6b7280" outline onClick={onClose}>Cancelar</Btn>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RECURSOS DOCENTE
// ─────────────────────────────────────────────────────────────────────────────
const BUCKET = "recursos"; // nombre del bucket en Supabase Storage

// Icono según extensión
function iconoArchivo(nombre = "", tipo = "") {
  const ext = nombre.split(".").pop().toLowerCase();
  if (["pdf"].includes(ext))                     return { ico:"📄", color:"#dc2626", label:"PDF"   };
  if (["doc","docx"].includes(ext))              return { ico:"📝", color:"#2563eb", label:"Word"  };
  if (["xls","xlsx","csv"].includes(ext))        return { ico:"📊", color:"#16a34a", label:"Excel" };
  if (tipo === "link")                           return { ico:"🔗", color:"#7c3aed", label:"Link"  };
  return                                                { ico:"📎", color:"#6b7280", label:"Archivo"};
}

function RecursosDocente({ showAlert }) {
  const [recursos,     setRecursos]     = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const [busqueda,     setBusqueda]     = useState("");
  const [filtroTipo,   setFiltroTipo]   = useState(""); // "archivo" | "link" | ""
  const [dragOver,     setDragOver]     = useState(false);

  // Visor de PDF / archivos
  const [visorRec,     setVisorRec]     = useState(null); // { nombre, url }

  // Form link
  const [linkNombre,   setLinkNombre]   = useState("");
  const [linkUrl,      setLinkUrl]      = useState("");
  const [showLinkForm, setShowLinkForm] = useState(false);

  const fileInputRef = useRef();

  // ── Cargar recursos desde Supabase
  const cargar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("recursos")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) { showAlert("error", "Error cargando recursos: " + error.message); return; }
    setRecursos(data || []);
  };

  useEffect(() => { cargar(); }, []);

  // ── Subir archivo a Supabase Storage y guardar registro
  const subirArchivo = async (file) => {
    // Validar tipo
    const ext = file.name.split(".").pop().toLowerCase();
    const permitidos = ["pdf","doc","docx","xls","xlsx","csv"];
    if (!permitidos.includes(ext)) {
      showAlert("error", `Tipo no permitido (.${ext}). Solo PDF, Word y Excel.`);
      return;
    }
    // Validar tamaño (máx 20 MB)
    if (file.size > 20 * 1024 * 1024) {
      showAlert("error", "El archivo supera 20 MB.");
      return;
    }

    setUploading(true);
    const path = `${Date.now()}_${file.name.replace(/\s+/g, "_")}`;

    // 1. Subir al Storage
    const { error: storageErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false });

    if (storageErr) {
      setUploading(false);
      showAlert("error", "Error al subir archivo: " + storageErr.message);
      return;
    }

    // 2. Obtener URL pública
    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const url = urlData?.publicUrl || "";

    // 3. Guardar en tabla recursos
    const { error: dbErr } = await supabase.from("recursos").insert([{
      nombre: file.name,
      url,
    }]);

    setUploading(false);
    if (dbErr) {
      showAlert("error", "Archivo subido pero error al registrar: " + dbErr.message);
    } else {
      showAlert("success", `✅ "${file.name}" guardado correctamente.`);
      cargar();
    }
  };

  // ── Manejar archivos soltados o seleccionados
  const handleFiles = (files) => {
    [...files].forEach(f => subirArchivo(f));
  };

  // ── Guardar link
  const guardarLink = async (e) => {
    e.preventDefault();
    if (!linkNombre.trim() || !linkUrl.trim()) {
      showAlert("error", "Escribe el nombre y la URL del link."); return;
    }
    let url = linkUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;

    const { error } = await supabase.from("recursos").insert([{
      nombre: linkNombre.trim(),
      url,
    }]);
    if (error) { showAlert("error", "Error al guardar link: " + error.message); return; }
    showAlert("success", `✅ Link "${linkNombre}" guardado.`);
    setLinkNombre(""); setLinkUrl(""); setShowLinkForm(false);
    cargar();
  };

  // ── Eliminar recurso (archivo o link)
  const eliminar = async (rec) => {
    if (!window.confirm(`¿Eliminar "${rec.nombre}"?`)) return;

    // Si es un archivo en Storage, eliminar el objeto también
    const esArchivo = rec.url && rec.url.includes(`/storage/v1/object/public/${BUCKET}/`);
    if (esArchivo) {
      const path = rec.url.split(`/storage/v1/object/public/${BUCKET}/`)[1];
      if (path) {
        await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)]);
      }
    }

    const { error } = await supabase.from("recursos").delete().eq("id", rec.id);
    if (error) { showAlert("error", "Error al eliminar: " + error.message); return; }
    showAlert("success", "Recurso eliminado.");
    cargar();
  };

  // ── Descargar archivo — fuerza descarga real con blob
  const descargar = async (rec) => {
    try {
      const res  = await fetch(rec.url, { mode:"cors" });
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url; a.download = rec.nombre; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      // fallback: forzar descarga via atributo download
      const a = document.createElement("a");
      a.href = rec.url; a.download = rec.nombre;
      a.target = "_blank"; a.click();
    }
  };

  // ── Filtrar
  const recursosFiltrados = recursos.filter(r => {
    const ext = r.nombre?.split(".").pop().toLowerCase();
    const esLink = !["pdf","doc","docx","xls","xlsx","csv"].includes(ext);
    const matchBusq  = !busqueda   || r.nombre.toLowerCase().includes(busqueda.toLowerCase());
    const matchTipo  = !filtroTipo
      || (filtroTipo === "link"    &&  esLink)
      || (filtroTipo === "archivo" && !esLink);
    return matchBusq && matchTipo;
  });

  const totalArchivos = recursos.filter(r => {
    const ext = r.nombre?.split(".").pop().toLowerCase();
    return ["pdf","doc","docx","xls","xlsx","csv"].includes(ext);
  }).length;
  const totalLinks = recursos.length - totalArchivos;

  return (
    <div>

      {/* ═══ VISOR DE ARCHIVOS (PDF, Word, Excel) ═══ */}
      {visorRec && (
        <div style={{
          position:"fixed", inset:0, background:"rgba(0,0,0,0.75)",
          display:"flex", flexDirection:"column",
          zIndex:2000, backdropFilter:"blur(4px)",
        }}>
          {/* Barra superior del visor */}
          <div style={{
            background:"#1e1b4b", padding:"12px 20px",
            display:"flex", justifyContent:"space-between", alignItems:"center",
            flexShrink:0, gap:12,
          }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, minWidth:0 }}>
              <span style={{ fontSize:22 }}>
                {visorRec.nombre.endsWith(".pdf") ? "📄" : visorRec.nombre.match(/\.xlsx?$|\.csv$/i) ? "📊" : "📝"}
              </span>
              <span style={{ color:"#e0e7ff", fontWeight:700, fontSize:14, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {visorRec.nombre}
              </span>
            </div>
            <div style={{ display:"flex", gap:8, flexShrink:0 }}>
              {/* Descargar desde el visor */}
              <button
                onClick={() => descargar(visorRec)}
                style={{ background:"#16a34a", color:"#fff", border:"none", borderRadius:8, padding:"8px 16px", fontWeight:700, fontSize:12, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}
              >⬇ Descargar</button>
              {/* Abrir en nueva pestaña (fallback manual) */}
              <a
                href={`https://docs.google.com/viewer?url=${encodeURIComponent(visorRec.url)}&embedded=true`}
                target="_blank" rel="noopener noreferrer"
                style={{ background:"#4285f4", color:"#fff", borderRadius:8, padding:"8px 16px", fontWeight:700, fontSize:12, textDecoration:"none", display:"flex", alignItems:"center", gap:5 }}
              >🔗 Abrir externo</a>
              <button
                onClick={() => setVisorRec(null)}
                style={{ background:"rgba(255,255,255,0.15)", color:"#fff", border:"none", borderRadius:8, padding:"8px 14px", fontWeight:700, fontSize:14, cursor:"pointer" }}
              >✕ Cerrar</button>
            </div>
          </div>

          {/* Área del visor */}
          <div style={{ flex:1, background:"#111", position:"relative", overflow:"hidden" }}>
            {/* Para PDF: usar Google Docs Viewer que nunca falla con CORS */}
            {visorRec.nombre.toLowerCase().endsWith(".pdf") ? (
              <iframe
                key={visorRec.url}
                src={`https://docs.google.com/viewer?url=${encodeURIComponent(visorRec.url)}&embedded=true`}
                style={{ width:"100%", height:"100%", border:"none" }}
                title={visorRec.nombre}
                allowFullScreen
              />
            ) : visorRec.nombre.match(/\.xlsx?$|\.xls$|\.csv$|\.docx?$/i) ? (
              /* Para Word/Excel: Microsoft Office Online Viewer */
              <iframe
                key={visorRec.url}
                src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(visorRec.url)}`}
                style={{ width:"100%", height:"100%", border:"none" }}
                title={visorRec.nombre}
                allowFullScreen
              />
            ) : (
              /* Fallback genérico */
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", color:"#9ca3af" }}>
                <div style={{ fontSize:48, marginBottom:12 }}>📎</div>
                <div style={{ fontSize:14, marginBottom:16 }}>Vista previa no disponible para este tipo</div>
                <button onClick={() => descargar(visorRec)} style={{ background:"#4f46e5", color:"#fff", border:"none", borderRadius:9, padding:"11px 24px", fontWeight:700, cursor:"pointer" }}>
                  ⬇ Descargar archivo
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Estadísticas ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:20 }}>
        {[
          { label:"Total recursos", value:recursos.length,  icon:"📁", color:"#ea580c" },
          { label:"Archivos",       value:totalArchivos,     icon:"📄", color:"#2563eb" },
          { label:"Links",          value:totalLinks,        icon:"🔗", color:"#7c3aed" },
        ].map(s=>(
          <div key={s.label} style={{ background:"#fff", borderRadius:14, padding:"14px 12px", boxShadow:"0 2px 12px rgba(0,0,0,0.07)", textAlign:"center" }}>
            <div style={{ fontSize:22 }}>{s.icon}</div>
            <div style={{ fontSize:24, fontWeight:900, color:s.color, lineHeight:1.2 }}>{s.value}</div>
            <div style={{ fontSize:10, color:"#9ca3af", marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Zona de arrastrar y soltar ── */}
      <Card>
        <SectionTitle icon="📤" title="Subir Archivo" subtitle="PDF · Word (.doc / .docx) · Excel (.xls / .xlsx / .csv) — máx. 20 MB" color={COLOR.orange} />

        <div
          onDragOver={e  => { e.preventDefault(); setDragOver(true);  }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault(); setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border:`2.5px dashed ${dragOver ? "#ea580c" : "#fed7aa"}`,
            borderRadius:14, padding:"36px 20px", textAlign:"center",
            cursor:"pointer", background: dragOver ? "#fff7ed" : "#fffbf5",
            transition:"all 0.2s",
            boxShadow: dragOver ? "0 0 0 4px #ea580c20" : "none",
          }}
        >
          <div style={{ fontSize:42, marginBottom:10 }}>{uploading ? "⏳" : "📂"}</div>
          <div style={{ fontWeight:800, fontSize:15, color:"#ea580c", marginBottom:6 }}>
            {uploading ? "Subiendo archivo…" : "Arrastra aquí o haz clic para seleccionar"}
          </div>
          <div style={{ fontSize:12, color:"#9ca3af" }}>
            PDF · Word · Excel · CSV · Máximo 20 MB por archivo
          </div>
          {dragOver && (
            <div style={{ marginTop:12, fontSize:13, fontWeight:700, color:"#ea580c" }}>
              ¡Suelta el archivo para subirlo!
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv"
          multiple
          onChange={e => { handleFiles(e.target.files); e.target.value = ""; }}
          style={{ display:"none" }}
        />

        {/* Botón guardar link */}
        <div style={{ marginTop:16 }}>
          {!showLinkForm ? (
            <button
              onClick={() => setShowLinkForm(true)}
              style={{
                width:"100%", padding:"11px", borderRadius:10, border:"1.5px dashed #c4b5fd",
                background:"#faf5ff", color:"#7c3aed", fontWeight:700, fontSize:13,
                cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                transition:"all 0.15s",
              }}
              onMouseEnter={e=>e.currentTarget.style.background="#ede9fe"}
              onMouseLeave={e=>e.currentTarget.style.background="#faf5ff"}
            >
              🔗 Agregar Link / URL
            </button>
          ) : (
            <form onSubmit={guardarLink} style={{ background:"#faf5ff", borderRadius:12, padding:"16px", border:"1.5px solid #c4b5fd", marginTop:8 }}>
              <div style={{ fontWeight:800, fontSize:13, color:"#7c3aed", marginBottom:12, display:"flex", alignItems:"center", gap:6 }}>
                🔗 Guardar Link como Recurso
              </div>
              <div style={{ marginBottom:10 }}>
                <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#374151", marginBottom:4 }}>Nombre del recurso</label>
                <input
                  value={linkNombre} onChange={e=>setLinkNombre(e.target.value)}
                  placeholder="Ej. Formulario SEP, Drive de materiales…"
                  required
                  style={{ width:"100%", padding:"9px 12px", borderRadius:9, border:"1.5px solid #ddd6fe", fontSize:13, background:"#fff", boxSizing:"border-box", outline:"none" }}
                />
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#374151", marginBottom:4 }}>URL / Link</label>
                <input
                  value={linkUrl} onChange={e=>setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  required
                  style={{ width:"100%", padding:"9px 12px", borderRadius:9, border:"1.5px solid #ddd6fe", fontSize:13, background:"#fff", boxSizing:"border-box", outline:"none" }}
                />
              </div>
              <div style={{ display:"flex", gap:9 }}>
                <button type="submit" style={{ flex:1, background:"#7c3aed", color:"#fff", border:"none", borderRadius:9, padding:"10px", fontWeight:700, cursor:"pointer", fontSize:13 }}>
                  💾 Guardar Link
                </button>
                <button type="button" onClick={()=>{ setShowLinkForm(false); setLinkNombre(""); setLinkUrl(""); }}
                  style={{ flex:1, background:"#f3f4f6", border:"none", borderRadius:9, padding:"10px", fontWeight:700, cursor:"pointer", fontSize:13 }}>
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      </Card>

      {/* ── Lista de recursos ── */}
      <Card>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:10 }}>
          <SectionTitle icon="📁" title="Mis Recursos" subtitle={`${recursosFiltrados.length} de ${recursos.length}`} color={COLOR.orange} />
          {/* Filtro tipo */}
          <div style={{ display:"flex", gap:6 }}>
            {[["", "Todos"], ["archivo", "📄 Archivos"], ["link", "🔗 Links"]].map(([val, lbl])=>(
              <button key={val} onClick={()=>setFiltroTipo(val)}
                style={{
                  padding:"6px 12px", borderRadius:8, border:"none", cursor:"pointer", fontSize:11, fontWeight:700,
                  background: filtroTipo===val ? "#ea580c" : "#f3f4f6",
                  color:      filtroTipo===val ? "#fff"    : "#6b7280",
                  transition:"all 0.15s",
                }}
              >{lbl}</button>
            ))}
          </div>
        </div>

        {/* Buscador */}
        <div style={{ marginBottom:14 }}>
          <input
            value={busqueda} onChange={e=>setBusqueda(e.target.value)}
            placeholder="🔍 Buscar por nombre…"
            style={{ width:"100%", padding:"9px 14px", borderRadius:10, border:"1.5px solid #e5e7eb", fontSize:13, background:"#fafafa", outline:"none", boxSizing:"border-box" }}
          />
        </div>

        {loading && <EmptyState icon="⏳" msg="Cargando recursos…" />}

        {!loading && recursosFiltrados.length === 0 && (
          <EmptyState icon="📁" msg="No hay recursos guardados aún." />
        )}

        {/* Cards de recursos */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(260px, 1fr))", gap:12 }}>
          {recursosFiltrados.map((r, i) => {
            const ext   = r.nombre?.split(".").pop().toLowerCase();
            const esLink = !["pdf","doc","docx","xls","xlsx","csv"].includes(ext);
            const { ico, color, label } = iconoArchivo(r.nombre, esLink ? "link" : "archivo");

            return (
              <div key={r.id || i} style={{
                background:"#fff", borderRadius:14, padding:"16px",
                border:`1.5px solid ${color}25`,
                boxShadow:"0 2px 10px rgba(0,0,0,0.06)",
                display:"flex", flexDirection:"column", gap:10,
                transition:"box-shadow 0.15s",
              }}
              onMouseEnter={e=>e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,0.12)"}
              onMouseLeave={e=>e.currentTarget.style.boxShadow="0 2px 10px rgba(0,0,0,0.06)"}
              >
                {/* Cabecera del card */}
                <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                  <div style={{
                    width:44, height:44, borderRadius:11, background:color+"15",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    fontSize:24, flexShrink:0,
                  }}>{ico}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{
                      fontWeight:800, fontSize:13, color:"#111", lineHeight:1.3,
                      wordBreak:"break-word",
                      display:"-webkit-box", WebkitLineClamp:2,
                      WebkitBoxOrient:"vertical", overflow:"hidden",
                    }}>{r.nombre}</div>
                    <span style={{ background:color+"15", color, borderRadius:6, padding:"2px 8px", fontSize:10, fontWeight:700, display:"inline-block", marginTop:4 }}>{label}</span>
                  </div>
                </div>

                {/* Fecha */}
                {r.created_at && (
                  <div style={{ fontSize:11, color:"#9ca3af" }}>
                    📅 {new Date(r.created_at).toLocaleDateString("es-MX", { day:"2-digit", month:"short", year:"numeric" })}
                  </div>
                )}

                {/* Botones de acción */}
                <div style={{ display:"flex", gap:7, marginTop:"auto" }}>
                  {esLink ? (
                    /* Links: botón abrir */
                    <a
                      href={r.url} target="_blank" rel="noopener noreferrer"
                      style={{
                        flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                        background:"#7c3aed", color:"#fff", borderRadius:9,
                        padding:"8px 10px", fontSize:12, fontWeight:700,
                        textDecoration:"none", transition:"filter 0.15s",
                      }}
                      onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.1)"}
                      onMouseLeave={e=>e.currentTarget.style.filter="none"}
                    >🔗 Abrir link</a>
                  ) : (
                    <>
                      {/* Archivos: botón VER (abre visor interno) + botón DESCARGAR */}
                      <button
                        onClick={() => setVisorRec({ nombre: r.nombre, url: r.url })}
                        style={{
                          flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                          background:color, color:"#fff", borderRadius:9,
                          padding:"8px 10px", fontSize:12, fontWeight:700,
                          border:"none", cursor:"pointer", transition:"filter 0.15s",
                        }}
                        onMouseEnter={e=>e.currentTarget.style.filter="brightness(1.1)"}
                        onMouseLeave={e=>e.currentTarget.style.filter="none"}
                      >👁 Ver</button>
                      <button
                        onClick={() => descargar(r)}
                        style={{
                          flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5,
                          background:"#f0fdf4", border:"1.5px solid #16a34a", color:"#16a34a",
                          borderRadius:9, padding:"8px 10px", fontSize:12, fontWeight:700,
                          cursor:"pointer", transition:"all 0.15s",
                        }}
                        onMouseEnter={e=>{ e.currentTarget.style.background="#16a34a"; e.currentTarget.style.color="#fff"; }}
                        onMouseLeave={e=>{ e.currentTarget.style.background="#f0fdf4"; e.currentTarget.style.color="#16a34a"; }}
                      >⬇ Descargar</button>
                    </>
                  )}
                  {/* Eliminar */}
                  <button
                    onClick={() => eliminar(r)}
                    style={{
                      width:34, height:34, background:"#fef2f2", border:"none",
                      color:"#dc2626", borderRadius:9, cursor:"pointer", fontSize:14,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      flexShrink:0, transition:"all 0.15s",
                    }}
                    onMouseEnter={e=>{ e.currentTarget.style.background="#dc2626"; e.currentTarget.style.color="#fff"; }}
                    onMouseLeave={e=>{ e.currentTarget.style.background="#fef2f2"; e.currentTarget.style.color="#dc2626"; }}
                    title="Eliminar"
                  >🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BITÁCORA ESCOLAR
// ─────────────────────────────────────────────────────────────────────────────
function BitacoraEscolar({ alumnos, showAlert }) {
  const [reportes,        setReportes]        = useState([]);
  const [vistaDetalle,    setVistaDetalle]    = useState(null); // reporte seleccionado para ver
  const [loading,         setLoading]         = useState(false);
  const [busqueda,        setBusqueda]        = useState("");
  const [filtroGrupo,     setFiltroGrupo]     = useState("");

  // Formulario nuevo reporte
  const EMPTY_FORM = {
    alumno_nombre:"", grado:"", grupo:"",
    fecha: new Date().toISOString().split("T")[0],
    cituacion:"", acciones:[], personas_involucradas:"",
    descripcion:"", acuerdos:"",
  };
  const [form, setForm] = useState(EMPTY_FORM);
  const [mostrarForm, setMostrarForm] = useState(false);

  const cargar = async () => {
    const { data } = await supabase.from("bitacora_escolar").select("*").order("fecha",{ascending:false});
    if (data) setReportes(data);
  };

  useEffect(()=>{ cargar(); },[]);

  // Si se selecciona un alumno de la lista, autocompletar nombre/grado/grupo
  const handleAlumnoSelect = (e) => {
    const id = e.target.value;
    if (!id) { setForm(f=>({...f, alumno_nombre:"", grado:"", grupo:""})); return; }
    const a = alumnos.find(x=>x.id===parseInt(id));
    if (a) setForm(f=>({...f, alumno_nombre:a.nombre, grado:a.grupo.charAt(0), grupo:a.grupo.slice(1)}));
  };

  const toggleAccion = (accion) => {
    setForm(f=>({
      ...f,
      acciones: f.acciones.includes(accion)
        ? f.acciones.filter(a=>a!==accion)
        : [...f.acciones, accion],
    }));
  };

  const guardarReporte = async (e) => {
    e.preventDefault();
    if (!form.alumno_nombre||!form.cituacion||!form.descripcion) {
      showAlert("error","Completa: alumno, situación y descripción de los hechos."); return;
    }
    setLoading(true);
    const payload = {
      ...form,
      acciones: form.acciones.join(", "),
    };
    const { error } = await supabase.from("bitacora_escolar").insert([payload]);
    setLoading(false);
    if (error) { showAlert("error","Error al guardar: "+error.message); return; }
    showAlert("success","✅ Reporte registrado en la bitácora.");
    setForm(EMPTY_FORM);
    setMostrarForm(false);
    cargar();
  };

  const eliminarReporte = async (id) => {
    if (!window.confirm("¿Eliminar este reporte de la bitácora?")) return;
    await supabase.from("bitacora_escolar").delete().eq("id",id);
    showAlert("success","Reporte eliminado.");
    if (vistaDetalle?.id===id) setVistaDetalle(null);
    cargar();
  };

  // Contar reportes por alumno
  const conteoReportes = reportes.reduce((acc,r)=>{
    acc[r.alumno_nombre] = (acc[r.alumno_nombre]||0)+1;
    return acc;
  },{});

  const reportesFiltrados = reportes.filter(r=>{
    const matchBusq = !busqueda || r.alumno_nombre?.toLowerCase().includes(busqueda.toLowerCase());
    const matchGrupo = !filtroGrupo || `${r.grado}${r.grupo}` === filtroGrupo;
    return matchBusq && matchGrupo;
  });

  // Color según acumulado de reportes
  const colorReporte = (n) => n >= 3 ? "#dc2626" : n === 2 ? "#d97706" : "#059669";
  const labelReporte = (n) => n >= 3 ? "⚠️ Alto" : n === 2 ? "🔶 Medio" : "🟢 Bajo";

  // Alumnos con más reportes (top 5)
  const topAlumnos = Object.entries(conteoReportes)
    .sort((a,b)=>b[1]-a[1]).slice(0,5);

  return (
    <div>
      {/* ── Modal detalle reporte ── */}
      {vistaDetalle && (
        <div style={{
          position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",
          display:"flex",alignItems:"center",justifyContent:"center",
          zIndex:1000,padding:20,backdropFilter:"blur(4px)",
        }}>
          <div style={{
            background:"#fff",borderRadius:20,padding:28,width:"100%",maxWidth:580,
            boxShadow:"0 24px 60px rgba(0,0,0,0.2)",maxHeight:"90vh",overflowY:"auto",
          }}>
            {/* Encabezado estilo folio */}
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18 }}>
              <div style={{ fontWeight:900,fontSize:17,color:"#0f766e",display:"flex",gap:8,alignItems:"center" }}>
                <span style={{ fontSize:22 }}>📋</span> Reporte de Bitácora
              </div>
              <button onClick={()=>setVistaDetalle(null)} style={{ background:"#f3f4f6",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:16 }}>✕</button>
            </div>

            {/* Datos del alumno */}
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16 }}>
              {[
                ["👤 Alumno",   vistaDetalle.alumno_nombre],
                ["📅 Fecha",    vistaDetalle.fecha],
                ["🏫 Grado",    vistaDetalle.grado ? `${vistaDetalle.grado}° Grado` : "—"],
                ["🔤 Grupo",    vistaDetalle.grupo || "—"],
              ].map(([k,v])=>(
                <div key={k} style={{ background:"#f0fdfa",borderRadius:10,padding:"10px 14px" }}>
                  <div style={{ fontSize:10,color:"#6b7280",fontWeight:700,marginBottom:3 }}>{k}</div>
                  <div style={{ fontWeight:800,color:"#111",fontSize:14 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Situación */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11,fontWeight:800,color:"#0f766e",letterSpacing:1,marginBottom:8,textTransform:"uppercase" }}>Situación</div>
              <span style={{ background:"#fef3c7",border:"1.5px solid #fbbf24",borderRadius:10,padding:"5px 14px",fontWeight:700,color:"#92400e",fontSize:13 }}>
                {vistaDetalle.cituacion}
              </span>
            </div>

            {/* Acciones */}
            {vistaDetalle.acciones && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11,fontWeight:800,color:"#0f766e",letterSpacing:1,marginBottom:8,textTransform:"uppercase" }}>Acciones Tomadas</div>
                <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
                  {vistaDetalle.acciones.split(",").map(a=>(
                    <span key={a} style={{ background:"#ede9fe",color:"#7c3aed",borderRadius:8,padding:"4px 12px",fontSize:12,fontWeight:700 }}>{a.trim()}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Personas involucradas */}
            {vistaDetalle.personas_involucradas && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11,fontWeight:800,color:"#0f766e",letterSpacing:1,marginBottom:6,textTransform:"uppercase" }}>Personas Involucradas</div>
                <div style={{ background:"#f9fafb",borderRadius:10,padding:"10px 14px",fontSize:13,color:"#374151" }}>{vistaDetalle.personas_involucradas}</div>
              </div>
            )}

            {/* Descripción */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11,fontWeight:800,color:"#0f766e",letterSpacing:1,marginBottom:6,textTransform:"uppercase" }}>Descripción de los Hechos</div>
              <div style={{ background:"#f9fafb",borderRadius:10,padding:"12px 14px",fontSize:13,color:"#374151",lineHeight:1.6 }}>{vistaDetalle.descripcion}</div>
            </div>

            {/* Acuerdos */}
            {vistaDetalle.acuerdos && (
              <div style={{ marginBottom:18 }}>
                <div style={{ fontSize:11,fontWeight:800,color:"#0f766e",letterSpacing:1,marginBottom:6,textTransform:"uppercase" }}>Acuerdos y Compromisos</div>
                <div style={{ background:"#f0fdf4",borderRadius:10,padding:"12px 14px",fontSize:13,color:"#374151",lineHeight:1.6,border:"1px solid #bbf7d0" }}>{vistaDetalle.acuerdos}</div>
              </div>
            )}

            {/* Contador de reportes del alumno */}
            <div style={{ background:"#fff7ed",borderRadius:10,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,border:"1px solid #fed7aa" }}>
              <span style={{ fontSize:13,color:"#92400e",fontWeight:700 }}>Total de reportes del alumno</span>
              <span style={{ fontWeight:900,fontSize:20,color:colorReporte(conteoReportes[vistaDetalle.alumno_nombre]||0) }}>
                {conteoReportes[vistaDetalle.alumno_nombre]||1} {labelReporte(conteoReportes[vistaDetalle.alumno_nombre]||0)}
              </span>
            </div>

            <div style={{ display:"flex",gap:10 }}>
              <button onClick={()=>setVistaDetalle(null)} style={{ flex:1,background:"#f3f4f6",border:"none",borderRadius:10,padding:"11px",fontWeight:700,cursor:"pointer",fontSize:14 }}>Cerrar</button>
              <button onClick={()=>eliminarReporte(vistaDetalle.id)} style={{ flex:1,background:"#fef2f2",border:"1.5px solid #fca5a5",color:"#dc2626",borderRadius:10,padding:"11px",fontWeight:700,cursor:"pointer",fontSize:14 }}>🗑 Eliminar Reporte</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Formulario nuevo reporte (modal) ── */}
      {mostrarForm && (
        <div style={{
          position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",
          display:"flex",alignItems:"center",justifyContent:"center",
          zIndex:1000,padding:20,backdropFilter:"blur(4px)",
        }}>
          <div style={{
            background:"#fff",borderRadius:20,padding:28,width:"100%",maxWidth:580,
            boxShadow:"0 24px 60px rgba(0,0,0,0.2)",maxHeight:"92vh",overflowY:"auto",
          }}>
            {/* Header del formulario */}
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20 }}>
              <div style={{ fontWeight:900,fontSize:18,color:"#0f766e",display:"flex",gap:8,alignItems:"center" }}>
                <span style={{ background:"#ccfbf1",borderRadius:10,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18 }}>📝</span>
                Nuevo Reporte
              </div>
              <button onClick={()=>setMostrarForm(false)} style={{ background:"#f3f4f6",border:"none",borderRadius:8,width:32,height:32,cursor:"pointer",fontSize:16 }}>✕</button>
            </div>

            <form onSubmit={guardarReporte}>
              {/* Seleccionar alumno registrado O escribir nombre */}
              <div style={{ marginBottom:14 }}>
                <label style={{ display:"block",fontSize:12,fontWeight:700,color:"#374151",marginBottom:5 }}>Seleccionar alumno registrado</label>
                <select onChange={handleAlumnoSelect} style={{ width:"100%",padding:"10px 14px",borderRadius:10,border:"1.5px solid #e5e7eb",fontSize:14,background:"#fafafa",boxSizing:"border-box",appearance:"none" }}>
                  <option value="">— Elegir de la lista o escribir abajo —</option>
                  {alumnos.map(a=>(
                    <option key={a.id} value={a.id}>{a.nombre} ({a.grupo})</option>
                  ))}
                </select>
              </div>

              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:14 }}>
                <div>
                  <label style={{ display:"block",fontSize:12,fontWeight:700,color:"#374151",marginBottom:5 }}>Nombre del alumno</label>
                  <input value={form.alumno_nombre} onChange={e=>setForm(f=>({...f,alumno_nombre:e.target.value}))} placeholder="Nombre completo" required
                    style={{ width:"100%",padding:"10px 12px",borderRadius:10,border:"1.5px solid #e5e7eb",fontSize:13,background:"#fafafa",boxSizing:"border-box" }} />
                </div>
                <div>
                  <label style={{ display:"block",fontSize:12,fontWeight:700,color:"#374151",marginBottom:5 }}>Grado</label>
                  <select value={form.grado} onChange={e=>setForm(f=>({...f,grado:e.target.value}))} style={{ width:"100%",padding:"10px 10px",borderRadius:10,border:"1.5px solid #e5e7eb",fontSize:13,background:"#fafafa",boxSizing:"border-box",appearance:"none" }}>
                    <option value="">—</option>
                    {["1","2","3"].map(g=><option key={g} value={g}>{g}°</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display:"block",fontSize:12,fontWeight:700,color:"#374151",marginBottom:5 }}>Grupo</label>
                  <select value={form.grupo} onChange={e=>setForm(f=>({...f,grupo:e.target.value}))} style={{ width:"100%",padding:"10px 10px",borderRadius:10,border:"1.5px solid #e5e7eb",fontSize:13,background:"#fafafa",boxSizing:"border-box",appearance:"none" }}>
                    <option value="">—</option>
                    {["A","B","C","D"].map(g=><option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom:14 }}>
                <label style={{ display:"block",fontSize:12,fontWeight:700,color:"#374151",marginBottom:5 }}>Fecha</label>
                <input type="date" value={form.fecha} onChange={e=>setForm(f=>({...f,fecha:e.target.value}))} required
                  style={{ width:"100%",padding:"10px 14px",borderRadius:10,border:"1.5px solid #e5e7eb",fontSize:14,background:"#fafafa",boxSizing:"border-box" }} />
              </div>

              {/* SITUACIÓN — chips seleccionables */}
              <div style={{ marginBottom:18 }}>
                <label style={{ display:"block",fontSize:12,fontWeight:800,color:"#0f766e",marginBottom:8,letterSpacing:0.5,textTransform:"uppercase" }}>
                  Situación <span style={{ color:"#dc2626" }}>*</span>
                </label>
                <div style={{ display:"flex",flexWrap:"wrap",gap:8 }}>
                  {SITUACIONES.map(s=>(
                    <button key={s} type="button" onClick={()=>setForm(f=>({...f,cituacion:s}))}
                      style={{
                        padding:"7px 14px",borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer",
                        border:`2px solid ${form.cituacion===s?"#0f766e":"#e5e7eb"}`,
                        background:form.cituacion===s?"#0f766e":"#f9fafb",
                        color:form.cituacion===s?"#fff":"#374151",
                        transition:"all 0.15s",
                      }}
                    >{s}</button>
                  ))}
                </div>
                {form.cituacion && (
                  <div style={{ marginTop:8,fontSize:12,color:"#0f766e",fontWeight:700 }}>✓ Seleccionado: {form.cituacion}</div>
                )}
              </div>

              {/* ACCIONES — checkboxes visuales */}
              <div style={{ marginBottom:18 }}>
                <label style={{ display:"block",fontSize:12,fontWeight:800,color:"#0f766e",marginBottom:8,letterSpacing:0.5,textTransform:"uppercase" }}>Acciones Tomadas</label>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                  {ACCIONES_POSIBLES.map(a=>{
                    const sel = form.acciones.includes(a);
                    return (
                      <button key={a} type="button" onClick={()=>toggleAccion(a)}
                        style={{
                          display:"flex",alignItems:"center",gap:10,padding:"10px 14px",
                          borderRadius:12,cursor:"pointer",textAlign:"left",
                          border:`2px solid ${sel?"#7c3aed":"#e5e7eb"}`,
                          background:sel?"#f5f3ff":"#fafafa",
                          transition:"all 0.15s",
                        }}
                      >
                        <span style={{
                          width:20,height:20,borderRadius:6,border:`2px solid ${sel?"#7c3aed":"#d1d5db"}`,
                          background:sel?"#7c3aed":"#fff",display:"flex",alignItems:"center",justifyContent:"center",
                          flexShrink:0,fontSize:12,color:"#fff",fontWeight:900,
                        }}>{sel?"✓":""}</span>
                        <span style={{ fontSize:12,fontWeight:700,color:sel?"#7c3aed":"#374151" }}>{a}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Personas involucradas */}
              <div style={{ marginBottom:14 }}>
                <label style={{ display:"block",fontSize:12,fontWeight:800,color:"#0f766e",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5 }}>Personas Involucradas</label>
                <input value={form.personas_involucradas} onChange={e=>setForm(f=>({...f,personas_involucradas:e.target.value}))}
                  placeholder="Ej. Juan Pérez, Maestro García, Director Ruiz…"
                  style={{ width:"100%",padding:"10px 14px",borderRadius:10,border:"1.5px solid #e5e7eb",fontSize:14,background:"#fafafa",boxSizing:"border-box" }} />
              </div>

              {/* Descripción de los hechos */}
              <div style={{ marginBottom:14 }}>
                <label style={{ display:"block",fontSize:12,fontWeight:800,color:"#0f766e",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5 }}>
                  Descripción de los Hechos <span style={{ color:"#dc2626" }}>*</span>
                </label>
                <textarea value={form.descripcion} onChange={e=>setForm(f=>({...f,descripcion:e.target.value}))} required
                  placeholder="Describe con detalle lo ocurrido…" rows={4}
                  style={{ width:"100%",padding:"10px 14px",borderRadius:10,border:"1.5px solid #e5e7eb",fontSize:14,background:"#fafafa",boxSizing:"border-box",resize:"vertical",lineHeight:1.6 }} />
              </div>

              {/* Acuerdos y compromisos */}
              <div style={{ marginBottom:20 }}>
                <label style={{ display:"block",fontSize:12,fontWeight:800,color:"#0f766e",marginBottom:5,textTransform:"uppercase",letterSpacing:0.5 }}>Acuerdos y Compromisos</label>
                <textarea value={form.acuerdos} onChange={e=>setForm(f=>({...f,acuerdos:e.target.value}))}
                  placeholder="¿Qué compromisos se establecieron?…" rows={3}
                  style={{ width:"100%",padding:"10px 14px",borderRadius:10,border:"1.5px solid #e5e7eb",fontSize:14,background:"#fafafa",boxSizing:"border-box",resize:"vertical",lineHeight:1.6 }} />
              </div>

              <div style={{ display:"flex",gap:10 }}>
                <button type="submit" disabled={loading} style={{
                  flex:1,background:"#0f766e",color:"#fff",border:"none",borderRadius:10,
                  padding:"13px",fontWeight:800,fontSize:14,cursor:loading?"not-allowed":"pointer",opacity:loading?0.7:1,
                }}>{loading?"Guardando…":"📋 Guardar Reporte"}</button>
                <button type="button" onClick={()=>setMostrarForm(false)} style={{ flex:1,background:"#f3f4f6",border:"none",borderRadius:10,padding:"13px",fontWeight:700,fontSize:14,cursor:"pointer" }}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Panel principal ── */}

      {/* Estadísticas rápidas */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20 }}>
        {[
          { label:"Total Reportes",  value:reportes.length,                                             icon:"📋", color:"#0f766e" },
          { label:"Alumnos con rep.", value:Object.keys(conteoReportes).length,                          icon:"👤", color:"#d97706" },
          { label:"Nivel alto (≥3)",  value:Object.values(conteoReportes).filter(n=>n>=3).length,        icon:"⚠️", color:"#dc2626" },
        ].map(s=>(
          <div key={s.label} style={{ background:"#fff",borderRadius:14,padding:"14px 12px",boxShadow:"0 2px 12px rgba(0,0,0,0.07)",textAlign:"center" }}>
            <div style={{ fontSize:22 }}>{s.icon}</div>
            <div style={{ fontSize:24,fontWeight:900,color:s.color,lineHeight:1.2 }}>{s.value}</div>
            <div style={{ fontSize:10,color:"#9ca3af",marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Alumnos con más reportes */}
      {topAlumnos.length>0 && (
        <Card style={{ marginBottom:20 }}>
          <SectionTitle icon="⚠️" title="Alumnos con Más Reportes" subtitle="Seguimiento acumulado" color="#dc2626" />
          {topAlumnos.map(([nombre,count])=>(
            <div key={nombre} style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 0",borderBottom:"1px solid #f3f4f6" }}>
              <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                <div style={{ width:34,height:34,borderRadius:9,background:colorReporte(count)+"18",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,color:colorReporte(count),fontSize:16 }}>
                  {count}
                </div>
                <div>
                  <div style={{ fontWeight:700,color:"#111",fontSize:13 }}>{nombre}</div>
                  <div style={{ fontSize:11,color:"#9ca3af" }}>{count} reporte{count!==1?"s":""}</div>
                </div>
              </div>
              <span style={{ fontSize:12,fontWeight:700,color:colorReporte(count) }}>{labelReporte(count)}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Barra de herramientas y botón nuevo */}
      <Card>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10 }}>
          <SectionTitle icon="📒" title="Historial de Incidencias" subtitle={`${reportesFiltrados.length} registros`} color="#0f766e" />
          <button onClick={()=>setMostrarForm(true)} style={{
            background:"linear-gradient(135deg,#0f766e,#059669)",color:"#fff",border:"none",
            borderRadius:12,padding:"10px 20px",fontWeight:800,fontSize:13,cursor:"pointer",
            boxShadow:"0 4px 14px #0f766e40",display:"flex",alignItems:"center",gap:6,
          }}>+ Nuevo Reporte</button>
        </div>

        {/* Filtros */}
        <div style={{ display:"grid",gridTemplateColumns:"1fr auto",gap:10,marginBottom:16 }}>
          <input value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="🔍 Buscar por nombre de alumno…"
            style={{ padding:"9px 14px",borderRadius:10,border:"1.5px solid #e5e7eb",fontSize:13,background:"#fafafa",outline:"none" }} />
          <select value={filtroGrupo} onChange={e=>setFiltroGrupo(e.target.value)}
            style={{ padding:"9px 12px",borderRadius:10,border:"1.5px solid #e5e7eb",fontSize:13,background:"#fafafa",appearance:"none",cursor:"pointer",minWidth:120 }}>
            <option value="">Todos los grupos</option>
            {GRUPOS.map(g=><option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Lista de reportes */}
        {reportesFiltrados.length===0
          ? <EmptyState icon="📒" msg="No hay reportes registrados." />
          : reportesFiltrados.map((r,i)=>{
            const nReportes = conteoReportes[r.alumno_nombre]||1;
            return (
              <div
                key={r.id||i}
                onClick={()=>setVistaDetalle(r)}
                style={{
                  display:"flex",justifyContent:"space-between",alignItems:"flex-start",
                  padding:"13px 14px",borderRadius:12,marginBottom:10,cursor:"pointer",
                  background:"#f0fdfa",borderLeft:`4px solid ${colorReporte(nReportes)}`,
                  transition:"box-shadow 0.15s",
                }}
                onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.10)"}
                onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}
              >
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap" }}>
                    <span style={{ fontWeight:800,color:"#111",fontSize:14 }}>{r.alumno_nombre}</span>
                    <span style={{ background:colorReporte(nReportes)+"18",color:colorReporte(nReportes),border:`1px solid ${colorReporte(nReportes)}40`,borderRadius:20,padding:"1px 9px",fontSize:10,fontWeight:700 }}>
                      {nReportes} rep. · {labelReporte(nReportes)}
                    </span>
                    {r.grado && <span style={{ background:"#ede9fe",color:"#7c3aed",borderRadius:8,padding:"1px 9px",fontSize:10,fontWeight:700 }}>{r.grado}°{r.grupo}</span>}
                  </div>
                  <div style={{ fontSize:12,color:"#0f766e",fontWeight:700,marginBottom:3 }}>📌 {r.cituacion}</div>
                  <div style={{ fontSize:12,color:"#6b7280" }}>📅 {r.fecha} {r.acciones&&`· 🔧 ${r.acciones.split(",")[0].trim()}${r.acciones.split(",").length>1?"…":""}`}</div>
                </div>
                <div style={{ display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6,marginLeft:10,flexShrink:0 }}>
                  <button onClick={e=>{e.stopPropagation();eliminarReporte(r.id);}}
                    style={{ background:"#fef2f2",border:"none",color:"#dc2626",padding:"4px 10px",borderRadius:7,cursor:"pointer",fontSize:11,fontWeight:700 }}>✕</button>
                  <span style={{ fontSize:11,color:"#9ca3af" }}>Ver más →</span>
                </div>
              </div>
            );
          })
        }
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PORTAL DOCENTE
// ─────────────────────────────────────────────────────────────────────────────
function PortalDocente({ onBack }) {
  const [tab,            setTab]            = useState("alumnos");
  const [alumnos,        setAlumnos]        = useState([]);
  const [eventos,        setEventos]        = useState([]);
  const [calificaciones, setCalificaciones] = useState([]);
  const [showImport,     setShowImport]     = useState(false);
  const [filtroGrupo,    setFiltroGrupo]    = useState("");
  const [alert,          setAlert]          = useState(null);

  // Form alumnos
  const [fNombre, setFNombre] = useState("");
  const [fGrado,  setFGrado]  = useState("");
  const [fLetra,  setFLetra]  = useState("");
  const [fPin,    setFPin]    = useState("");

  // Form eventos
  const [eTitulo,  setETitulo]  = useState("");
  const [eFecha,   setEFecha]   = useState("");
  const [eNotas,   setENotas]   = useState("");
  const [eLoading, setELoading] = useState(false);

  // Selección múltiple de eventos
  const [eventosSeleccionados, setEventosSeleccionados] = useState(new Set());
  const [modoSeleccion,        setModoSeleccion]        = useState(false);

  // Form calificaciones
  const [cAlumnoId, setCAlumnoId] = useState("");
  const [cMateria,  setCMateria]  = useState("");
  const [cPeriodo,  setCPeriodo]  = useState("");
  const [cNota,     setCNota]     = useState("");

  const showAlert = (type, msg) => {
    setAlert({ type, msg });
    setTimeout(()=>setAlert(null), 4000);
  };

  const cargar = async () => {
    const { data:a  } = await supabase.from("alumnos").select("*").order("nombre");
    const { data:ev } = await supabase.from("calendario").select("*").order("fecha",{ascending:true});
    const { data:cal} = await supabase.from("Calificaciones").select("*");
    if (a)   setAlumnos(a);
    if (ev)  setEventos(ev);
    if (cal) setCalificaciones(cal);
  };

  useEffect(()=>{ cargar(); },[]);

  const grupoSel = fGrado&&fLetra ? `${fGrado}${fLetra}` : "";
  const alumnosFiltrados = filtroGrupo ? alumnos.filter(a=>a.grupo===filtroGrupo) : alumnos;

  // ── Guardar alumno
  const guardarAlumno = async (e) => {
    e.preventDefault();
    if (!grupoSel) { showAlert("error", "Selecciona grado y grupo."); return; }
    const { error } = await supabase
      .from("alumnos")
      .insert([{ nombre: fNombre, grupo: grupoSel, pin: fPin || "1234" }]);
    if (error) {
      showAlert("error", "Error al guardar alumno: " + error.message);
    } else {
      showAlert("success", "✅ Alumno registrado correctamente.");
      setFNombre(""); setFGrado(""); setFLetra(""); setFPin("");
      cargar();
    }
  };

  // ── Eliminar alumno
  const eliminarAlumno = async (id) => {
    if (!window.confirm("¿Eliminar este alumno?")) return;
    await supabase.from("alumnos").delete().eq("id",id);
    cargar();
  };

  // ── Guardar evento — FIX: sin alert() nativo, con manejo correcto de errores
  const guardarEvento = async (e) => {
    e.preventDefault();
    if (!eTitulo || !eFecha) { showAlert("error", "El título y la fecha son obligatorios."); return; }
    setELoading(true);

    // 1. Guardar en Supabase
    const { error: errorSupabase } = await supabase
      .from("calendario")
      .insert([{ titulo: eTitulo, fecha: eFecha, notas: eNotas }]);

    if (errorSupabase) {
      console.error("Error en Supabase:", errorSupabase);
      showAlert("error", "Error al guardar el evento: " + errorSupabase.message);
      setELoading(false);
      return;
    }

    // 2. Intentar enviar correo con EmailJS (no bloquea si falla)
    try {
      await emailjs.send(
        'service_1zc5ouf',
        'template_573udgp',
        {
          titulo:               eTitulo,
          fecha:                eFecha,
          notas:                eNotas,
          name:                 "Ing. Everardo",
          email:                "ing.everardo.rosales@gmail.com",
          google_calendar_link: googleCalendarLink(eTitulo, eFecha, eNotas),
        },
        'nVJhbohgdIkttQDsK'
      );
      showAlert("success", "✅ Evento guardado y correo enviado correctamente.");
    } catch (emailErr) {
      console.error("Error en EmailJS:", emailErr);
      // El evento SÍ se guardó; solo avisamos del correo
      showAlert("warning", "⚠️ Evento guardado, pero el correo no se pudo enviar. Revisa la consola (F12).");
    }

    // 3. Limpiar campos y recargar siempre
    setETitulo(""); setEFecha(""); setENotas("");
    setELoading(false);
    cargar();
  };

  // ── FIX: eliminarEvento estaba faltando — ahora definida
  const eliminarEvento = async (id) => {
    if (!window.confirm("¿Eliminar este evento?")) return;
    const { error } = await supabase.from("calendario").delete().eq("id", id);
    if (error) {
      showAlert("error", "Error al eliminar: " + error.message);
    } else {
      showAlert("success", "Evento eliminado.");
      cargar();
    }
  };

  // ── Selección múltiple de eventos
  const toggleSeleccionEvento = (id) => {
    setEventosSeleccionados(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleTodosEventos = () => {
    if (eventosSeleccionados.size === eventos.length) {
      setEventosSeleccionados(new Set());
    } else {
      setEventosSeleccionados(new Set(eventos.map(ev => ev.id)));
    }
  };

  const eliminarEventosSeleccionados = async () => {
    if (eventosSeleccionados.size === 0) return;
    if (!window.confirm(`¿Eliminar ${eventosSeleccionados.size} evento(s) seleccionado(s)?`)) return;
    const ids = [...eventosSeleccionados];
    const { error } = await supabase.from("calendario").delete().in("id", ids);
    if (error) {
      showAlert("error", "Error al eliminar: " + error.message);
    } else {
      showAlert("success", `✅ ${ids.length} evento(s) eliminado(s).`);
      setEventosSeleccionados(new Set());
      setModoSeleccion(false);
      cargar();
    }
  };

  // ── Guardar calificación
  const guardarCal = async (e) => {
    e.preventDefault();
    const alumno = alumnos.find(a=>a.id===parseInt(cAlumnoId));
    if (!alumno) { showAlert("error","Selecciona un alumno."); return; }
    const { error } = await supabase.from("Calificaciones").insert([{
      materia:cMateria, periodo:cPeriodo, nota:parseFloat(cNota), grupo:alumno.grupo,
    }]);
    if (error) showAlert("error","Error: "+error.message);
    else {
      setCAlumnoId(""); setCMateria(""); setCPeriodo(""); setCNota("");
      cargar();
      showAlert("success","✅ Calificación guardada correctamente.");
    }
  };

  // ── Eliminar calificación
  const eliminarCal = async (id) => {
    await supabase.from("Calificaciones").delete().eq("id",id);
    cargar();
  };

  const TABS = [
    { id:"alumnos",        icon:"👥", label:"Alumnos",       color:COLOR.indigo  },
    { id:"eventos",        icon:"📅", label:"Eventos",        color:COLOR.violet  },
    { id:"calificaciones", icon:"📊", label:"Calificaciones", color:COLOR.amber   },
    { id:"bitacora",       icon:"📒", label:"Bitácora",       color:COLOR.teal    },
    { id:"recursos",       icon:"📁", label:"Recursos",       color:COLOR.orange  },
    { id:"resumen",        icon:"📈", label:"Resumen",        color:COLOR.rose    },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#f8f9ff", fontFamily:"'Segoe UI',sans-serif" }}>
      {showImport && (
        <ImportarAlumnos
          grupo={grupoSel}
          onImportados={cargar}
          onClose={()=>setShowImport(false)}
        />
      )}

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#4f46e5,#7c3aed)", padding:"22px 24px 66px" }}>
        <div style={{ maxWidth:780, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <p style={{ color:"#a5b4fc", fontSize:11, margin:0, letterSpacing:3, fontWeight:700 }}>ESC. TEC.</p>
            <h1 style={{ color:"#fff", margin:"4px 0 4px", fontSize:24, fontWeight:900 }}>Panel Docente</h1>
            <p style={{ color:"#c4b5fd", fontSize:13, margin:0 }}>Ing. Everardo · Sistema Escolar</p>
          </div>
          <button onClick={onBack} style={{ background:"rgba(255,255,255,0.15)", border:"none", color:"#fff", padding:"9px 16px", borderRadius:10, cursor:"pointer", fontSize:13, fontWeight:700 }}>← Inicio</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ maxWidth:780, margin:"-42px auto 0", padding:"0 20px" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
          {[
            { label:"Total alumnos",   value:alumnos.length,        icon:"👥", color:COLOR.indigo },
            { label:"Eventos",         value:eventos.length,         icon:"📅", color:COLOR.violet },
            { label:"Calificaciones",  value:calificaciones.length,  icon:"📊", color:COLOR.amber  },
            { label:"Bitácora",        value:"📒",                   icon:"📒", color:COLOR.teal   },
          ].map(s=>(
            <div key={s.label} style={{
              background:"#fff", borderRadius:14, padding:"14px 12px",
              boxShadow:"0 4px 20px rgba(0,0,0,0.08)", textAlign:"center",
            }}>
              <div style={{ fontSize:22 }}>{s.icon}</div>
              <div style={{ fontSize:typeof s.value==="number"?24:18, fontWeight:900, color:s.color, lineHeight:1.2 }}>{s.value}</div>
              <div style={{ fontSize:10, color:"#9ca3af", marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Alert flotante */}
      {alert && (
        <div style={{ maxWidth:780, margin:"14px auto 0", padding:"0 20px" }}>
          <Alert type={alert.type} msg={alert.msg} />
        </div>
      )}

      {/* Tabs */}
      <div style={{ maxWidth:780, margin:"16px auto 0", padding:"0 20px" }}>
        <div style={{ display:"flex", gap:6, background:"#fff", padding:6, borderRadius:14, boxShadow:"0 1px 4px rgba(0,0,0,0.06)", flexWrap:"wrap" }}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              flex:"1 1 80px", padding:"9px 6px", borderRadius:10, border:"none", cursor:"pointer",
              background:tab===t.id?t.color:"transparent",
              color:tab===t.id?"#fff":"#6b7280",
              fontWeight:700, fontSize:12, transition:"all 0.2s",
            }}>{t.icon} {t.label}</button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <div style={{ maxWidth:780, margin:"16px auto", padding:"0 20px 52px" }}>

        {/* ──── ALUMNOS ──── */}
        {tab==="alumnos" && (
          <>
            <Card>
              <SectionTitle icon="👤" title="Registrar Alumno" subtitle="Asigna grado, grupo y PIN" color={COLOR.indigo} />
              <form onSubmit={guardarAlumno}>
                <Input label="Nombre completo" type="text" placeholder="Nombre del alumno" value={fNombre} onChange={e=>setFNombre(e.target.value)} required />
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <Select label="Grado" options={GRADOS.map(g=>({ value:g, label:`${g}° Grado` }))} value={fGrado} onChange={e=>setFGrado(e.target.value)} placeholder="Grado…" />
                  <Select label="Grupo" options={LETRAS.map(l=>({ value:l, label:`Grupo ${l}` }))} value={fLetra} onChange={e=>setFLetra(e.target.value)} placeholder="Grupo…" />
                </div>
                {grupoSel && (
                  <div style={{ background:"#ede9fe", borderRadius:8, padding:"7px 12px", fontSize:13, color:"#7c3aed", marginBottom:14, fontWeight:700 }}>
                    📌 Grupo asignado: <strong>{grupoSel}</strong>
                  </div>
                )}
                <Input label="PIN (4 dígitos)" type="password" placeholder="••••" maxLength={4} value={fPin} onChange={e=>setFPin(e.target.value)} required />
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <Btn full type="submit" color={COLOR.indigo}>+ Registrar alumno</Btn>
                  <Btn full color="#6d28d9" onClick={()=>setShowImport(true)} type="button">📋 Importar lista</Btn>
                </div>
              </form>
            </Card>

            <Card>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:10 }}>
                {/* FIX: Subtítulo corregido */}
                <SectionTitle icon="👥" title="Lista de Alumnos" subtitle={`${alumnosFiltrados.length} alumno(s) registrado(s)`} color={COLOR.indigo} />
                <Select options={["", ...GRUPOS].map(g=>({ value:g, label:g||"Todos los grupos" }))} value={filtroGrupo} onChange={e=>setFiltroGrupo(e.target.value)} placeholder="Filtrar grupo" />
              </div>
              {alumnosFiltrados.length===0
                ? <EmptyState icon="👥" msg="No hay alumnos registrados." />
                : alumnosFiltrados.map((a,i)=>(
                  <div key={a.id} style={{
                    display:"flex", justifyContent:"space-between", alignItems:"center",
                    padding:"11px 0", borderBottom:i<alumnosFiltrados.length-1?"1px solid #f3f4f6":"none",
                  }}>
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{
                        width:38, height:38, borderRadius:10, background:"#ede9fe",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontWeight:800, color:"#7c3aed", fontSize:14,
                      }}>{a.nombre.charAt(0).toUpperCase()}</div>
                      <div>
                        <div style={{ fontWeight:700, color:"#111", fontSize:14 }}>{a.nombre}</div>
                        <Badge text={`Grupo ${a.grupo}`} color={COLOR.indigo} />
                      </div>
                    </div>
                    <button onClick={()=>eliminarAlumno(a.id)} style={{ background:"#fef2f2", border:"none", color:"#dc2626", padding:"6px 12px", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:700 }}>✕</button>
                  </div>
                ))
              }
            </Card>
          </>
        )}

        {/* ──── EVENTOS ──── */}
        {tab==="eventos" && (
          <>
            {/* ── Formulario nuevo evento ── */}
            <Card>
              <SectionTitle icon="📅" title="Nuevo Evento" subtitle="Agrega fechas importantes al calendario" color={COLOR.violet} />
              <form onSubmit={guardarEvento}>
                <Input label="Título del evento" type="text" placeholder="Ej. Examen trimestral" value={eTitulo} onChange={e=>setETitulo(e.target.value)} required />
                <Input label="Fecha" type="date" value={eFecha} onChange={e=>setEFecha(e.target.value)} required />
                <div style={{ marginBottom:14 }}>
                  <label style={{ display:"block", fontSize:12, fontWeight:700, color:"#374151", marginBottom:5 }}>Descripción / Notas</label>
                  <textarea value={eNotas} onChange={e=>setENotas(e.target.value)} placeholder="Descripción opcional…" rows={3} style={{
                    width:"100%", padding:"10px 14px", borderRadius:10, border:"1.5px solid #e5e7eb",
                    fontSize:14, outline:"none", resize:"vertical", background:"#fafafa", boxSizing:"border-box",
                  }} />
                </div>
                <Btn full type="submit" color={COLOR.violet} disabled={eLoading}>
                  {eLoading ? "Guardando…" : "+ Programar Evento"}
                </Btn>
              </form>
            </Card>

            {/* ── Lista de eventos ── */}
            <Card>
              {/* Cabecera con controles de selección múltiple */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
                <SectionTitle icon="🗓️" title="Eventos Programados" subtitle={`${eventos.length} en agenda`} color={COLOR.violet} />

                {eventos.length > 0 && (
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {/* Botón activar/desactivar modo selección */}
                    <button
                      onClick={()=>{ setModoSeleccion(!modoSeleccion); setEventosSeleccionados(new Set()); }}
                      style={{
                        background: modoSeleccion ? "#7c3aed" : "#f5f3ff",
                        color:      modoSeleccion ? "#fff"    : "#7c3aed",
                        border:"1.5px solid #7c3aed", borderRadius:9,
                        padding:"7px 14px", fontSize:12, fontWeight:700, cursor:"pointer",
                        transition:"all 0.15s",
                      }}
                    >{modoSeleccion ? "✕ Cancelar selección" : "☑ Seleccionar varios"}</button>

                    {/* Controles visibles solo en modo selección */}
                    {modoSeleccion && (
                      <>
                        <button onClick={toggleTodosEventos}
                          style={{ background:"#ede9fe", color:"#7c3aed", border:"none", borderRadius:9, padding:"7px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}
                        >{eventosSeleccionados.size === eventos.length ? "Ninguno" : "Seleccionar todos"}</button>

                        {eventosSeleccionados.size > 0 && (
                          <button onClick={eliminarEventosSeleccionados}
                            style={{ background:"#dc2626", color:"#fff", border:"none", borderRadius:9, padding:"7px 16px", fontSize:12, fontWeight:800, cursor:"pointer", boxShadow:"0 2px 8px #dc262640" }}
                          >🗑 Eliminar ({eventosSeleccionados.size})</button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Hint en modo selección */}
              {modoSeleccion && (
                <div style={{ background:"#f5f3ff", borderRadius:9, padding:"8px 14px", marginBottom:14, fontSize:12, color:"#7c3aed", fontWeight:600 }}>
                  ☑ Haz clic en los eventos para seleccionarlos · {eventosSeleccionados.size} seleccionado(s)
                </div>
              )}

              {eventos.length === 0
                ? <EmptyState icon="🗓️" msg="No hay eventos programados." />
                : eventos.map((ev, i) => {
                  const seleccionado = eventosSeleccionados.has(ev.id);
                  return (
                    <div
                      key={ev.id || i}
                      onClick={() => { if (modoSeleccion) toggleSeleccionEvento(ev.id); }}
                      style={{
                        display:"flex", alignItems:"flex-start", gap:12,
                        padding:"13px 14px", borderRadius:12, marginBottom:10,
                        background: seleccionado ? "#ede9fe" : "#f5f3ff",
                        borderLeft:`4px solid ${seleccionado ? "#4f46e5" : "#7c3aed"}`,
                        cursor: modoSeleccion ? "pointer" : "default",
                        outline: seleccionado ? "2px solid #7c3aed40" : "none",
                        transition:"all 0.15s",
                        boxShadow: seleccionado ? "0 0 0 2px #7c3aed40" : "none",
                      }}
                    >
                      {/* Checkbox visual — solo en modo selección */}
                      {modoSeleccion && (
                        <div style={{
                          width:22, height:22, borderRadius:7, flexShrink:0, marginTop:2,
                          background: seleccionado ? "#7c3aed" : "#fff",
                          border:`2px solid ${seleccionado ? "#7c3aed" : "#d1d5db"}`,
                          display:"flex", alignItems:"center", justifyContent:"center",
                          transition:"all 0.15s",
                        }}>
                          {seleccionado && <span style={{ color:"#fff", fontSize:13, fontWeight:900, lineHeight:1 }}>✓</span>}
                        </div>
                      )}

                      {/* Contenido del evento */}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:800, color:"#111", fontSize:14, marginBottom:2 }}>{ev.titulo}</div>
                        <div style={{ fontSize:12, color:"#7c3aed", marginBottom:ev.notas ? 3 : 0, fontWeight:600 }}>📆 {ev.fecha}</div>
                        {ev.notas && <div style={{ fontSize:12, color:"#6b7280", marginBottom:6, lineHeight:1.5 }}>{ev.notas}</div>}

                        {/* Botones de calendario — ocultos en modo selección */}
                        {!modoSeleccion && (
                          <div style={{ display:"flex", gap:7, marginTop:8, flexWrap:"wrap" }}>
                            {/* Botón Google Calendar */}
                            <a
                              href={googleCalendarLink(ev.titulo, ev.fecha, ev.notas || "")}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{
                                display:"inline-flex", alignItems:"center", gap:5,
                                background:"#fff", border:"1.5px solid #4285f4", color:"#4285f4",
                                borderRadius:8, padding:"5px 12px", fontSize:11, fontWeight:700,
                                textDecoration:"none", cursor:"pointer", transition:"all 0.15s",
                                boxShadow:"0 1px 4px rgba(66,133,244,0.15)",
                              }}
                              onMouseEnter={e=>{ e.currentTarget.style.background="#4285f4"; e.currentTarget.style.color="#fff"; }}
                              onMouseLeave={e=>{ e.currentTarget.style.background="#fff"; e.currentTarget.style.color="#4285f4"; }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M19.5 3h-3V1.5h-1.5V3h-6V1.5H7.5V3h-3C3.675 3 3 3.675 3 4.5v15c0 .825.675 1.5 1.5 1.5h15c.825 0 1.5-.675 1.5-1.5v-15c0-.825-.675-1.5-1.5-1.5zm0 16.5h-15V9h15v10.5zm0-12h-15V4.5h3V6H9V4.5h6V6h1.5V4.5h3V7.5z"/></svg>
                              Google Calendar
                            </a>

                            {/* Botón descargar .ics (celular, Apple, Outlook) */}
                            <button
                              onClick={e => { e.stopPropagation(); descargarICS(ev.titulo, ev.fecha, ev.notas || ""); }}
                              style={{
                                display:"inline-flex", alignItems:"center", gap:5,
                                background:"#fff", border:"1.5px solid #7c3aed", color:"#7c3aed",
                                borderRadius:8, padding:"5px 12px", fontSize:11, fontWeight:700,
                                cursor:"pointer", transition:"all 0.15s",
                                boxShadow:"0 1px 4px rgba(124,58,237,0.15)",
                              }}
                              onMouseEnter={e=>{ e.currentTarget.style.background="#7c3aed"; e.currentTarget.style.color="#fff"; }}
                              onMouseLeave={e=>{ e.currentTarget.style.background="#fff"; e.currentTarget.style.color="#7c3aed"; }}
                            >
                              📲 Guardar en Celular (.ics)
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Botón eliminar individual — solo fuera del modo selección */}
                      {!modoSeleccion && (
                        <button
                          onClick={e => { e.stopPropagation(); eliminarEvento(ev.id); }}
                          style={{ background:"#fef2f2", border:"none", color:"#dc2626", padding:"5px 10px", borderRadius:7, cursor:"pointer", fontSize:11, fontWeight:700, flexShrink:0, marginTop:2 }}
                        >✕</button>
                      )}
                    </div>
                  );
                })
              }

              {/* Barra de acción flotante cuando hay seleccionados */}
              {modoSeleccion && eventosSeleccionados.size > 0 && (
                <div style={{
                  position:"sticky", bottom:0,
                  background:"linear-gradient(to top, #fff 80%, transparent)",
                  padding:"14px 0 2px",
                  display:"flex", justifyContent:"space-between", alignItems:"center",
                  borderTop:"1.5px solid #ede9fe", marginTop:8,
                }}>
                  <span style={{ fontSize:13, color:"#7c3aed", fontWeight:700 }}>
                    {eventosSeleccionados.size} evento{eventosSeleccionados.size !== 1 ? "s" : ""} seleccionado{eventosSeleccionados.size !== 1 ? "s" : ""}
                  </span>
                  <button onClick={eliminarEventosSeleccionados}
                    style={{ background:"#dc2626", color:"#fff", border:"none", borderRadius:10, padding:"10px 20px", fontSize:13, fontWeight:800, cursor:"pointer", boxShadow:"0 3px 10px #dc262650" }}
                  >🗑 Eliminar seleccionados</button>
                </div>
              )}
            </Card>
          </>
        )}

        {/* ──── CALIFICACIONES ──── */}
        {tab==="calificaciones" && (
          <>
            <Card>
              <SectionTitle icon="📝" title="Registrar Calificación" subtitle="Selecciona alumno y asigna nota" color={COLOR.amber} />
              <form onSubmit={guardarCal}>
                <Select
                  label="Alumno"
                  options={alumnos.map(a=>({ value:a.id, label:`${a.nombre} (${a.grupo})` }))}
                  value={cAlumnoId}
                  onChange={e=>setCAlumnoId(e.target.value)}
                  placeholder="Seleccionar alumno…"
                />
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                  <Select label="Materia" options={MATERIAS_DEFAULT} value={cMateria} onChange={e=>setCMateria(e.target.value)} placeholder="Materia…" />
                  <Select label="Periodo" options={PERIODOS} value={cPeriodo} onChange={e=>setCPeriodo(e.target.value)} placeholder="Periodo…" />
                </div>
                <Input label="Calificación (0 – 10)" type="number" step="0.1" min="0" max="10" placeholder="Ej. 8.5" value={cNota} onChange={e=>setCNota(e.target.value)} required />
                <Btn full type="submit" color={COLOR.amber}>+ Guardar Calificación</Btn>
              </form>
            </Card>

            <Card>
              <SectionTitle icon="📊" title="Historial de Calificaciones" subtitle={`${calificaciones.length} registros`} color={COLOR.amber} />
              {calificaciones.length===0
                ? <EmptyState icon="📋" msg="No hay calificaciones registradas." />
                : <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:14 }}>
                      <thead>
                        <tr style={{ borderBottom:"2px solid #f3f4f6" }}>
                          {["Materia","Periodo","Grupo","Calificación",""].map(h=>(
                            <th key={h} style={{ padding:"8px 10px", textAlign:"left", fontSize:11, fontWeight:700, color:"#9ca3af", letterSpacing:0.5 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {calificaciones.map((c,i)=>(
                          <tr key={c.id||i} style={{ borderBottom:"1px solid #f9fafb" }}>
                            <td style={{ padding:"10px", fontWeight:700 }}>{c.materia}</td>
                            <td style={{ padding:"10px", color:"#6b7280", fontSize:12 }}>{c.periodo}</td>
                            <td style={{ padding:"10px" }}><Badge text={c.grupo||"—"} color={COLOR.indigo} /></td>
                            <td style={{ padding:"10px" }}>
                              <span style={{
                                background:colorNota(c.nota)+"15", border:`1.5px solid ${colorNota(c.nota)}40`,
                                borderRadius:8, padding:"3px 12px", fontWeight:900, color:colorNota(c.nota),
                              }}>{c.nota}</span>
                            </td>
                            <td style={{ padding:"10px" }}>
                              <button onClick={()=>eliminarCal(c.id)} style={{ background:"#fef2f2", border:"none", color:"#dc2626", padding:"4px 10px", borderRadius:7, cursor:"pointer", fontSize:11, fontWeight:700 }}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
              }
            </Card>
          </>
        )}

        {/* ──── BITÁCORA ──── */}
        {tab==="bitacora" && (
          <BitacoraEscolar alumnos={alumnos} showAlert={showAlert} />
        )}

        {/* ──── RECURSOS ──── */}
        {tab==="recursos" && (
          <RecursosDocente showAlert={showAlert} />
        )}

        {/* ──── RESUMEN ──── */}
        {tab==="resumen" && (
          <>
            <Card>
              <SectionTitle icon="📈" title="Alumnos por Grupo" subtitle="Distribución actual" color={COLOR.rose} />
              {GRUPOS.map(g=>{
                const count = alumnos.filter(a=>a.grupo===g).length;
                if (count===0) return null;
                const pct = Math.min((count/Math.max(alumnos.length,1))*100*3,100);
                return (
                  <div key={g} style={{ marginBottom:14 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                      <span style={{ fontWeight:700, fontSize:13 }}>Grupo {g}</span>
                      <span style={{ fontSize:12, color:"#6b7280" }}>{count} alumno{count!==1?"s":""}</span>
                    </div>
                    <div style={{ background:"#f3f4f6", borderRadius:8, height:10, overflow:"hidden" }}>
                      <div style={{ width:`${pct}%`, height:"100%", background:"linear-gradient(90deg,#e11d48,#f43f5e)", borderRadius:8, transition:"width 0.6s" }} />
                    </div>
                  </div>
                );
              })}
              {alumnos.length===0 && <EmptyState icon="👥" msg="Registra alumnos para ver el resumen." />}
            </Card>

            <Card>
              <SectionTitle icon="🏆" title="Rendimiento General" subtitle="Basado en calificaciones registradas" color={COLOR.amber} />
              {calificaciones.length===0
                ? <EmptyState icon="📊" msg="Sin calificaciones aún." />
                : (()=>{
                  const prom = calificaciones.reduce((s,c)=>s+parseFloat(c.nota||0),0)/calificaciones.length;
                  const aprob      = calificaciones.filter(c=>parseFloat(c.nota)>=6).length;
                  const reprod     = calificaciones.length - aprob;
                  const excelentes = calificaciones.filter(c=>parseFloat(c.nota)>=9).length;
                  return (
                    <>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:16 }}>
                        {[
                          { label:"Promedio",   value:prom.toFixed(1), color:colorNota(prom), icon:"🎯" },
                          { label:"Aprobados",  value:aprob,           color:"#059669",       icon:"✅" },
                          { label:"Reprobados", value:reprod,          color:"#dc2626",       icon:"❌" },
                          { label:"Excelentes", value:excelentes,      color:"#7c3aed",       icon:"⭐" },
                        ].map(s=>(
                          <div key={s.label} style={{ background:"#f9fafb", borderRadius:12, padding:"12px 8px", textAlign:"center" }}>
                            <div style={{ fontSize:20 }}>{s.icon}</div>
                            <div style={{ fontSize:20, fontWeight:900, color:s.color }}>{s.value}</div>
                            <div style={{ fontSize:9, color:"#9ca3af", marginTop:2 }}>{s.label}</div>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:8 }}>Promedio por materia:</div>
                      {MATERIAS_DEFAULT.map(mat=>{
                        const notas = calificaciones.filter(c=>c.materia===mat);
                        if (notas.length===0) return null;
                        const avg = notas.reduce((s,c)=>s+parseFloat(c.nota||0),0)/notas.length;
                        return (
                          <div key={mat} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"7px 0", borderBottom:"1px solid #f3f4f6", fontSize:13 }}>
                            <span style={{ color:"#374151" }}>{mat}</span>
                            <span style={{ fontWeight:800, color:colorNota(avg) }}>{avg.toFixed(1)}</span>
                          </div>
                        );
                      })}
                    </>
                  );
                })()
              }
            </Card>
          </>
        )}

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APP PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [portal,         setPortal]         = useState(null);
  const [docenteAuth,    setDocenteAuth]    = useState(false);
  const [alumnoLogueado, setAlumnoLogueado] = useState(null);

  if (!portal) return <PortalSelector onSelect={setPortal} />;

  if (portal==="docente") {
    if (!docenteAuth)
      return <LoginDocente onLogin={()=>setDocenteAuth(true)} onBack={()=>setPortal(null)} />;
    return <PortalDocente onBack={()=>{ setPortal(null); setDocenteAuth(false); }} />;
  }

  if (portal==="alumno") {
    if (!alumnoLogueado)
      return <LoginAlumno onLogin={a=>setAlumnoLogueado(a)} onBack={()=>setPortal(null)} />;
    return <PortalAlumno alumno={alumnoLogueado} onLogout={()=>{ setAlumnoLogueado(null); setPortal(null); }} />;
  }
}
