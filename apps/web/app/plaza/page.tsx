"use client";

import Link from "next/link";
import { useState } from "react";

type Place = { id: string; name: string; subtitle: string; icon: string; x: number; y: number; color: string; href?: string; phase: string; description: string };
const places: Place[] = [
  {id:"birthday",name:"Birthday House",subtitle:"Birthday rooms",icon:"🎂",x:180,y:168,color:"#f6a9c5",href:"/create",phase:"MVP",description:"Create a private birthday room, decorate it and invite friends."},
  {id:"wedding",name:"Wedding Garden",subtitle:"Love & anniversaries",icon:"💍",x:460,y:124,color:"#e8b5de",phase:"Next",description:"A romantic garden for weddings and anniversaries."},
  {id:"music",name:"Music Club",subtitle:"Live parties",icon:"🎵",x:745,y:170,color:"#b6a4f6",phase:"Next",description:"Dance, karaoke and watch live performances with friends."},
  {id:"gifts",name:"Gift Shop",subtitle:"Gifts & decorations",icon:"🎁",x:145,y:414,color:"#f6cb85",phase:"Next",description:"Browse virtual gifts, cakes and party decorations."},
  {id:"cafe",name:"Friendship Café",subtitle:"Meet & chat",icon:"☕",x:780,y:406,color:"#b7ddca",phase:"Next",description:"Meet people, chat and discover events together."},
  {id:"photo",name:"Photo Studio",subtitle:"Capture memories",icon:"📸",x:190,y:650,color:"#a6d9ed",phase:"Next",description:"Take group pictures, add frames and create memories."},
  {id:"events",name:"Event Hall",subtitle:"Community events",icon:"🎉",x:475,y:660,color:"#d9b8f5",phase:"Next",description:"Host public celebrations, reunions and community events."},
  {id:"memories",name:"Memory Gallery",subtitle:"Your moments",icon:"💌",x:768,y:644,color:"#e8c2a8",phase:"Next",description:"Save celebration albums, photos and heartfelt wishes."},
];
export default function PlazaPage() {
  const [selected,setSelected]=useState<Place | null>(places[0]);
  const [avatar,setAvatar]=useState({x:493,y:410});
  const [filter,setFilter]=useState("All");
  const [night,setNight]=useState(false);
  const shown=places.filter(p=>filter==="All" || p.phase===filter);
  return <main className={night ? "min-h-screen bg-[#151a37] text-white" : "min-h-screen bg-[#f8f5ff] text-[#293050]"}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-violet-200/60 bg-white/90 px-6 py-4 text-[#293050]">
      <Link href="/" className="font-extrabold tracking-tight text-xl">🎂 HAPPYROOM <span className="text-violet-500">/ Celebrate Plaza</span></Link>
      <div className="flex items-center gap-3 text-sm font-semibold"><Link className="rounded-full bg-violet-100 px-4 py-2" href="/world">3D World</Link><Link className="rounded-full bg-violet-600 px-4 py-2 text-white" href="/create">+ Create Room</Link></div>
    </header>
    <div className="mx-auto max-w-[1460px] px-4 py-6">
      <div className="mb-5 flex flex-wrap justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-violet-500">Welcome to the celebration universe</p><h1 className="mt-1 text-3xl font-black sm:text-4xl">Explore the HAPPYROOM Plaza ✨</h1><p className="mt-2 opacity-70">Walk around, discover party experiences and enter a celebration.</p></div><div className="flex items-center gap-2 self-center"><button onClick={()=>setNight(!night)} className="rounded-full border border-violet-200 px-4 py-2 text-sm font-bold">{night?"☀️ Day":"🌙 Night"}</button><span className="rounded-full bg-green-100 px-4 py-2 text-sm font-bold text-green-800">● Concept world</span></div></div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
        <section className="overflow-hidden rounded-[28px] border-4 border-white bg-[#d7f1dc] shadow-xl shadow-violet-200/30">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white/90 px-5 py-3 text-sm text-[#293050]"><span className="font-extrabold">🗺️ WORLD MAP · CENTRAL PLAZA</span><span>Click anywhere to walk · Select a building</span></div>
          <svg viewBox="0 0 960 800" className="block w-full" role="img" aria-label="Interactive Celebrate Plaza map" onClick={e=>{const svg=e.currentTarget;const rect=svg.getBoundingClientRect();const x=(e.clientX-rect.left)*960/rect.width;const y=(e.clientY-rect.top)*800/rect.height;setAvatar({x,y});}}>
            <defs><pattern id="grass" width="40" height="40" patternUnits="userSpaceOnUse"><circle cx="5" cy="8" r="2" fill="#a6d8ad" opacity=".6"/><circle cx="31" cy="29" r="2" fill="#b2dab0" opacity=".6"/></pattern><pattern id="stone" width="36" height="36" patternUnits="userSpaceOnUse"><rect width="36" height="36" fill="#ffeed8"/><path d="M0 0H36M0 36H36M0 0V36M36 0V36" stroke="#e8d8c1" strokeWidth="1"/></pattern><filter id="shadow"><feDropShadow dx="0" dy="6" stdDeviation="5" floodOpacity=".13"/></filter></defs>
            <rect width="960" height="800" fill="#d7f1dc"/><rect width="960" height="800" fill="url(#grass)"/>
            <path d="M475 0V800 M0 400H960" stroke="#e7cda9" strokeWidth="108"/><path d="M475 0V800 M0 400H960" stroke="#fff0d9" strokeWidth="96"/>
            <path d="M475 0V800 M0 400H960" stroke="#dbc7ac" strokeWidth="2" strokeDasharray="8 17" opacity=".5"/>
            <circle cx="475" cy="400" r="158" fill="#fff0d9" stroke="#f7dfbb" strokeWidth="8"/><circle cx="475" cy="400" r="117" fill="url(#stone)" stroke="#e8cdae" strokeWidth="4"/><circle cx="475" cy="400" r="78" fill="#84cddb" stroke="#fff" strokeWidth="9"/><circle cx="475" cy="400" r="57" fill="#b6e5e9" stroke="#4eaebf" strokeWidth="4"/><circle cx="475" cy="400" r="29" fill="#f5d29c"/><text x="475" y="410" textAnchor="middle" fontSize="27">⛲</text><rect x="383" y="498" width="185" height="32" rx="16" fill="#fff" opacity=".93"/><text x="475" y="519" textAnchor="middle" fontSize="14" fontWeight="900" fill="#705cb5">CELEBRATION PLAZA</text>
            {Array.from({length:26},(_,i)=>{const x=38+(i%13)*73,y=i<13?35:770;return <g key={i}><circle cx={x} cy={y} r="20" fill="#82c99d"/><circle cx={x-8} cy={y-8} r="14" fill="#a5dcad"/></g>})}
            {places.map(p=><g key={p.id} onClick={e=>{e.stopPropagation();setSelected(p);setAvatar({x:p.x+54,y:p.y+92});}} className="cursor-pointer" opacity={filter==="All"||p.phase===filter?1:.32}>
              <rect x={p.x-83} y={p.y-62} width="166" height="131" rx="23" fill={p.color} stroke="#fff" strokeWidth="6" filter="url(#shadow)"/><path d={`M${p.x-89} ${p.y-48} L${p.x} ${p.y-91} L${p.x+89} ${p.y-48}Z`} fill="#fff" opacity=".8"/><rect x={p.x-72} y={p.y+17} width="144" height="38" rx="12" fill="#ffffff" opacity=".88"/><text x={p.x} y={p.y+4} textAnchor="middle" fontSize="46">{p.icon}</text><text x={p.x} y={p.y+40} textAnchor="middle" fontSize="15" fontWeight="900" fill="#3b355b">{p.name}</text><rect x={p.x+46} y={p.y-73} width="52" height="23" rx="11" fill={p.phase==="MVP"?"#58bf91":"#887db7"}/><text x={p.x+72} y={p.y-57} textAnchor="middle" fontSize="12" fontWeight="bold" fill="white">{p.phase}</text>
            </g>)}
            <g transform={`translate(${avatar.x},${avatar.y})`} style={{transition:"transform 450ms ease-out"}}><ellipse cy="17" rx="18" ry="7" fill="#4f586a" opacity=".19"/><rect x="-12" y="-2" width="24" height="25" rx="11" fill="#8275d8"/><circle cy="-12" r="15" fill="#ffdfc5" stroke="white" strokeWidth="3"/><path d="M-14-15Q0-34 14-15" fill="#47384c"/><circle cx="-5" cy="-11" r="1.6"/><circle cx="5" cy="-11" r="1.6"/><path d="M-4-4Q0 0 4-4" fill="none" stroke="#ab6d7b" strokeWidth="1.5"/><rect x="-22" y="-51" width="44" height="17" rx="8" fill="#49406e"/><text y="-39" fill="white" fontSize="10" fontWeight="bold" textAnchor="middle">YOU</text></g>
          </svg>
          <div className="flex flex-wrap items-center justify-between gap-2 bg-white px-5 py-3 text-xs font-bold text-[#6e6893]"><span>🎮 Your avatar can walk across the plaza</span><span>Concept preview · not multiplayer</span></div>
        </section>
        <aside className="space-y-4">
          <div className="rounded-[24px] bg-white p-5 text-[#293050] shadow-sm"><h2 className="mb-3 text-lg font-extrabold">Discover places</h2><div className="mb-4 flex flex-wrap gap-2">{["All","MVP","Next"].map(f=><button key={f} onClick={()=>setFilter(f)} className={`rounded-full px-4 py-2 text-xs font-bold ${filter===f?"bg-violet-600 text-white":"bg-violet-50 text-violet-700"}`}>{f}</button>)}</div><div className="max-h-[400px] space-y-2 overflow-y-auto">{shown.map(p=><button key={p.id} onClick={()=>{setSelected(p);setAvatar({x:p.x+54,y:p.y+92});}} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${selected?.id===p.id?"border-violet-400 bg-violet-50":"border-[#eee9fa] hover:bg-violet-50"}`}><span className="text-2xl">{p.icon}</span><span><strong className="block text-sm">{p.name}</strong><span className="text-xs text-slate-500">{p.subtitle}</span></span></button>)}</div></div>
          {selected&&<div className="rounded-[24px] bg-white p-5 text-[#293050] shadow-sm"><div className="text-4xl">{selected.icon}</div><h3 className="mt-2 text-xl font-black">{selected.name}</h3><p className="mt-2 text-sm leading-relaxed text-slate-600">{selected.description}</p><p className="mt-3 text-xs font-bold text-violet-700">ROADMAP: {selected.phase==="MVP"?"Existing create flow":"Future feature"}</p>{selected.href?<Link href={selected.href} className="mt-4 block rounded-full bg-violet-600 px-4 py-3 text-center text-sm font-bold text-white">Enter experience →</Link>:<p className="mt-4 rounded-full bg-violet-100 px-4 py-3 text-center text-sm font-bold text-violet-700">Coming soon ✨</p>}</div>}
          <div className="rounded-[24px] bg-[#312b68] p-5 text-white"><h3 className="font-extrabold">🌟 Your World, Your Moments</h3><p className="mt-2 text-sm text-white/75">One plaza. Many reasons to celebrate. More neighborhoods can unlock as the community grows.</p></div>
        </aside>
      </div>
    </div>
  </main>;
}
