import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  ChevronRight, Zap, Target, 
  ShieldCheck, BarChart3, Truck, Store, 
  PackageCheck, ArrowRightLeft, Lock, Plus, Minus
} from 'lucide-react';
import { PulseFitHero } from '../components/ui/pulse-fit-hero';
import './LandingPage.css';

export default function LandingPage() {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  // Scroll effect for sticky nav
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 100);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // OPTIMIZED: Native SEO Injection (Title, Meta Description, Canonical)
  useEffect(() => {
    // 1. Set the Meta Title
    document.title = "FNB.ma | Festival Inventory & Event Stock Management";

    // 2. Set the Meta Description
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.name = "description";
      document.head.appendChild(metaDescription);
    }
    metaDescription.content = "Premium event stock management and festival inventory tracking platform. Manage multiple bars, track live stock, and reduce shrinkage to zero.";

    // 3. Set the Canonical Link
    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.rel = "canonical";
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.href = "https://fnb.ma";
  }, []);

  const partners = [
    { name: "Jazzablanca", src: "/jazzablanca.png" },
    { name: "Oasis", src: "/oasis.jpg" },
    { name: "Moga", src: "/moga.jpg" },
    { name: "Origins", src: "/origins.png" },
    { name: "Caprices", src: "/caprices.png" },
    { name: "Sonara", src: "/sonora.png" },
    { name: "Umbra", src: "/umbra.jpg" },
    { name: "Sounds of Africa", src: "/sounds_of_africa.jpg" },
    { name: "Sabotage", src: "/sabotage.png" }
  ];

  const features = [
    { title: "Live Event Inventory", desc: "Track every stock item across all festival locations with instant inventory updates.", icon: BarChart3 },
    { title: "Cashless POS Sync", desc: "Sync with festival cashless systems for instant reporting and seamless beverage stock management.", icon: Zap },
    { title: "Multi-Bar Stock Control", desc: "Control inventory for several bars or event points of sale from one centralized dashboard.", icon: Store },
    { title: "Scale to Any Festival", desc: "Designed to scale for massive outdoor festivals, concerts, and high-volume nightlife venues.", icon: Truck },
    { title: "Real-Time Stock Data", desc: "View real-time sales and remaining inventory data instantly during the live event.", icon: PackageCheck },
    { title: "Zero Loss Target", desc: "Reduce shrinkage and 'l'écart' towards zero with precise event tracking.", icon: Target },
  ];

  const faqs = [
    { q: "How does the platform manage event and festival stock?", a: "Track inventory live across all event locations with instant updates on beverage stock, transfers, and real-time usage." },
    { q: "Is the inventory software compatible with cashless systems?", a: "Yes, our stock management platform integrates directly with festival cashless payments for fast, accurate reconciliation." },
    { q: "Can I manage stock for multiple bars at one event?", a: "Absolutely. You can easily control and monitor stock for several bars or distinct points of sale from a single unified dashboard." },
    { q: "Is this inventory system built for large-scale festivals?", a: "Yes, FNB.ma is specifically designed for high-volume festivals, concerts, and nightlife events, scaling seamlessly to any event size." },
    { q: "How fast is data access for event managers?", a: "Event managers can view real-time sales, theoretical revenue, and live stock data instantly during the event operations." },
    { q: "Do my bar staff need technical skills to use the app?", a: "No experience is needed. The interface is simple for bar managers and zone dispatchers, and we provide full operational support." }
  ];

  const festivalHighlights = [
    { image: "/jazzablanca.png", category: "CASABLANCA", title: "JAZZABLANCA" },
    { image: "/oasis.jpg", category: "MARRAKECH", title: "OASIS FEST" },
    { image: "/moga.jpg", category: "RABAT", title: "MOGA FESTIVAL" },
    { image: "/origins.png", category: "MARRAKECH", title: "ORIGINS" },
  ];

  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "FNB.ma",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Web",
    "description": "Premium event stock management and festival inventory management platform. Track live inventory, manage multiple bars, and reduce shrinkage to zero for large-scale events.",
    "url": "https://fnb.ma",
    "provider": {
      "@type": "Organization",
      "name": "FNB.ma Systems"
    }
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.a
      }
    }))
  };

  return (
    <div className="landing-page-wrapper bg-white text-slate-600 font-sans selection:bg-blue-600 selection:text-white overflow-x-hidden">
      
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />

      {/* --- LIGHT BACKGROUND --- */}
      <div className="fixed inset-0 z-0 twilight-nebula-bg">
        <div className="floating-particles" />
        <div className="drifting-lasers" />
      </div>

      {/* --- STICKY NAVBAR (Appears after scroll) --- */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-500 ${scrolled ? 'translate-y-0 bg-white/90 backdrop-blur-xl border-b border-slate-200 py-4 shadow-sm' : '-translate-y-full'}`}>
        <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-200">
              <Zap size={16} className="fill-white" />
            </div>
            <span className="text-2xl font-[900] tracking-tighter uppercase text-slate-900">
              FNB.ma
            </span>
          </div>
          <Link 
            to="/login" 
            className="px-6 py-2.5 rounded-full font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2 bg-slate-100 text-slate-900 hover:bg-slate-200 border border-slate-200"
          >
            <Lock size={14} /> Portal Access
          </Link>
        </div>
      </nav>

      {/* --- SECTION 01: PULSE FIT HERO --- */}
      <PulseFitHero
        logo="FNB.MA"
        navigation={[
          { label: "Features", onClick: () => navigate('#features') },
          { label: "Events", onClick: () => navigate('#events') },
          { label: "FAQ", onClick: () => navigate('#faq') },
        ]}
        ctaButton={{
          label: "Login",
          onClick: () => navigate('/login'),
        }}
        title="The Magic is Managed."
        subtitle="While the crowd loses themselves in the music, we ensure you never lose track of a single dirham. Premium event stock management and festival inventory tracking for massive stages."
        primaryAction={{
          label: "Access Portal",
          onClick: () => navigate('/login'),
        }}
        secondaryAction={{
          label: "How it works",
          onClick: () => navigate('#grind'),
        }}
        disclaimer="*Authorized event personnel only"
        socialProof={{
          avatars: [
            "/jazzablanca.png",
            "/oasis.jpg",
            "/moga.jpg",
          ],
          text: "Trusted by Morocco's biggest stages",
        }}
        programs={festivalHighlights}
      />

      {/* --- SECTION 02: TRUSTED BY (FESTIVAL LOGOS) --- */}
      <section id="events" className="py-12 bg-white/50 backdrop-blur-sm border-y border-slate-200 relative z-20">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="sr-only">Festivals Using Our Stock Management Platform</h2>
          <p className="text-center text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-8">
            Powering inventory for Morocco's biggest festivals
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16">
            {partners.map((partner, i) => (
              <div key={i} className="group relative w-24 md:w-32 h-16 flex items-center justify-center">
                <img 
                  src={partner.src} 
                  alt={`${partner.name} Festival Stock Management Client`} 
                  className="max-h-full max-w-full object-contain grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- SECTION 03: THE GRIND --- */}
      <section id="grind" className="relative py-32 md:py-48 bg-slate-50 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 items-center gap-20">
          <div className="space-y-8">
            <h2 className="text-5xl md:text-7xl font-black text-slate-900 uppercase tracking-tighter leading-[0.9]">
              Behind every <br /> epic stage, <br /> there’s a <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">relentless grind.</span>
            </h2>
            <div className="w-20 h-1 bg-blue-600 rounded-full" />
            <p className="text-slate-600 text-lg leading-relaxed max-w-md">
              The thousands of beverage crates, the midnight inventory transfers, the heavy lifting, and the endless counting. The crowd sees the lights, but your team manages the event stock in the shadows. 
            </p>
            <p className="text-slate-600 text-lg leading-relaxed max-w-md">
              We respect the hustle. That’s exactly why we built an inventory system to protect it.
            </p>
          </div>
          <div className="relative">
            <div className="absolute inset-0 bg-blue-200 blur-[100px] rounded-full opacity-50" />
            <div className="relative rounded-[2rem] overflow-hidden shadow-2xl border border-slate-200 aspect-[4/5] lg:aspect-square">
              <img 
                src="https://images.unsplash.com/photo-1556740758-90de374c12ad?auto=format&fit=crop&q=80&w=1000" 
                className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-1000 scale-105 hover:scale-100"
                alt="Event staff managing inventory and beverage crates at a festival"
              />
            </div>
          </div>
        </div>
      </section>

      {/* --- SECTION 04: THE PROBLEM (10%) --- */}
      <section className="py-32 bg-white border-y border-slate-100 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-red-100 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-20 items-center relative z-10">
          <div>
            <div className="text-red-500 font-[950] text-8xl md:text-[10rem] tracking-tighter mb-4 leading-none drop-shadow-sm">
              10%
            </div>
            <h2 className="text-4xl md:text-5xl font-[950] uppercase tracking-tighter mb-6 leading-[0.9] text-slate-900">
              The accepted loss. <br /> 
              <span className="text-red-500">We don't accept it.</span>
            </h2>
            <p className="text-slate-600 text-lg mb-8 leading-relaxed">
              In the festival industry, "L'écart" (the gap between initial stock and final sales) is treated as an inevitable cost of event management. Broken bottles, unrecorded stock transfers, miscalculated bar doses, and "phantom" units bleed your margins dry every single night.
            </p>
          </div>
          
          <div className="bg-white/80 backdrop-blur-xl p-10 md:p-14 rounded-[3rem] shadow-xl border border-slate-100 space-y-8">
            <h3 className="text-2xl font-black uppercase tracking-tighter border-b border-slate-100 pb-6 text-slate-900">
              Where event inventory leaks
            </h3>
            <ul className="space-y-6">
              {[
                "Blind transfers between festival zones and bars.",
                "Selling beverages by the dose, but tracking by the bottle.",
                "Stock returns getting lost in the post-event chaos.",
                "No accountability for who moved inventory, and when."
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-4 text-slate-700 font-medium">
                  <div className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 mt-0.5 text-sm font-bold">✕</div>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* --- SECTION 05: THE SOLUTION (BENTO GRID) --- */}
      <section id="features" className="py-32 bg-slate-50 relative">
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="mb-20 text-center md:text-left">
            <h2 className="text-5xl md:text-7xl font-[950] uppercase tracking-tighter leading-[0.9] mb-6 text-slate-900">
              Squeezing the gap <br /> to <span className="text-blue-600">Zero.</span>
            </h2>
            <p className="text-xl text-slate-500 max-w-2xl leading-relaxed">
              Our software replaces paper trails and guesswork with hard data and forced accountability. Event stock management made flawless.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <div key={i} className="feature-bento-box p-10 space-y-6 group">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-100 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <feature.icon className="text-blue-600 group-hover:text-white" size={32} />
                </div>
                <h3 className="text-2xl font-black uppercase tracking-tight text-slate-900">{feature.title}</h3>
                <p className="text-slate-600 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- SECTION 06: THE FLOW --- */}
      <section className="py-32 bg-white border-y border-slate-100 relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-24">
            <h2 className="text-4xl md:text-5xl font-[950] uppercase tracking-tighter text-slate-900 mb-4">The Chain of Custody</h2>
            <p className="text-slate-400 font-black uppercase tracking-widest text-[10px]">How inventory flows through our platform</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
            <div className="hidden md:block absolute top-12 left-[10%] right-[10%] h-[1px] bg-gradient-to-r from-transparent via-slate-200 to-transparent z-0" />

            {[
              { step: "01", icon: Truck, title: "Master Supply", desc: "Admin logs the initial bulk delivery into the inventory system." },
              { step: "02", icon: PackageCheck, title: "Zone Dispatch", desc: "Festival stock is pushed to Sub-Stock Managers." },
              { step: "03", icon: Store, title: "Bar Station", desc: "Final verification before event beverage service begins." },
              { step: "04", icon: BarChart3, title: "Reconciliation", desc: "Returns are processed & event revenue is calculated." }
            ].map((item, i) => (
              <div key={i} className="relative z-10 flex flex-col items-center text-center group">
                <div className="w-24 h-24 bg-white shadow-md border border-slate-100 rounded-full flex items-center justify-center text-blue-600 mb-6 group-hover:bg-blue-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-blue-200 transition-all duration-300">
                  <item.icon size={32} />
                </div>
                <span className="text-blue-500 font-black uppercase tracking-widest text-[10px] mb-2">Step {item.step}</span>
                <h3 className="text-xl font-black uppercase tracking-tighter mb-3 text-slate-900">{item.title}</h3>
                <p className="text-slate-500 text-xs leading-relaxed max-w-[200px]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- SECTION 07: FAQ --- */}
      <section id="faq" className="py-32 bg-slate-50 relative z-10">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-[950] uppercase tracking-tighter text-slate-900 mb-4">Event Stock FAQs</h2>
            <p className="text-slate-500 font-medium">Quick answers about our festival inventory management platform.</p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div 
                key={index} 
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm transition-all duration-300"
              >
                <button 
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full px-8 py-6 flex justify-between items-center text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="font-bold text-lg text-slate-900 pr-8">{faq.q}</span>
                  {openFaq === index ? <Minus className="text-blue-600 shrink-0" /> : <Plus className="text-slate-400 shrink-0" />}
                </button>
                <div 
                  className={`px-8 overflow-hidden transition-all duration-300 ease-in-out ${openFaq === index ? 'max-h-40 pb-6 opacity-100' : 'max-h-0 opacity-0'}`}
                >
                  <p className="text-slate-600 leading-relaxed border-t border-slate-100 pt-4">
                    {faq.a}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --- SECTION 08: CTA & FOOTER --- */}
      <section className="bg-slate-900 pt-32 pb-10 flex flex-col items-center relative overflow-hidden z-10">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-3xl h-px bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/20 blur-[120px] rounded-full pointer-events-none" />

        <div className="max-w-4xl mx-auto px-6 text-center mb-32 relative z-10">
          <h2 className="text-5xl md:text-7xl font-[950] text-white tracking-tighter uppercase leading-[0.9] mb-10">
            Take absolute <br /> control of your <span className="text-blue-400">event bar.</span>
          </h2>
          <Link 
            to="/login" 
            className="cta-button inline-flex items-center gap-4 px-10 py-6 rounded-full font-black uppercase tracking-widest text-sm transition-all"
            aria-label="Access the event inventory portal"
          >
            Access The Portal <ChevronRight />
          </Link>
          <p className="mt-8 text-slate-400 font-bold text-[10px] uppercase tracking-widest">
            For authorized festival and event personnel only.
          </p>
        </div>

        {/* Footer Bottom */}
        <div className="w-full max-w-7xl mx-auto px-6 border-t border-slate-800 pt-10 flex flex-col md:flex-row justify-between items-center gap-6 relative z-10">
          <div className="flex items-center gap-2 text-white">
            <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center">
              <Zap size={12} className="fill-white" />
            </div>
            <span className="text-xl font-black tracking-tighter uppercase">FNB.ma</span>
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            © 2026 FNB.MA Festival Inventory Systems. All rights reserved.
          </p>
        </div>
      </section>

    </div>
  );
}