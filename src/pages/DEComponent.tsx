import React from "react";

/**
 * AI Native Data Engineering overview page.
 * Usage: <AIDataEngineeringOverview studioUrl="/data-engineering-studio" />
 * Set studioUrl to the route or URL for your Data Engineering Studio.
 */
export default function AIDataEngineeringOverview({
  studioUrl = "/data-engineering-studio",
}) {
  const launchStudio = () => {
    // Opens the studio in a separate tab. Replace studioUrl with your app's route/URL.
    window.open(studioUrl, "_blank", "noopener,noreferrer");
  };

  const layers = [
    {
      number: "01",
      name: "Bronze",
      subtitle: "Ingestion",
      description: "Bring source data into the platform using an appropriate load strategy.",
      className: "bronze",
    },
    {
      number: "02",
      name: "Silver",
      subtitle: "Standardisation",
      description: "Apply business transformation rules and standardise data quality.",
      className: "silver",
    },
    {
      number: "03",
      name: "Gold",
      subtitle: "Analytics-ready data",
      description: "Shape data into fact and dimension tables with business KPIs.",
      className: "gold",
    },
  ];

  const steps = [
    {
      number: "1",
      title: "Profile the dataset",
      description: "Inspect the data with standard data-quality and null checks.",
    },
    {
      number: "2",
      title: "Generate layer notebooks",
      description: "Use the dataset context and supplied rules or mappings to generate notebooks for the Medallion layers.",
    },
    {
      number: "3",
      title: "Review and approve",
      description: "A data engineer checks the generated outputs and approves each step before execution.",
    },
    {
      number: "4",
      title: "Orchestrate and model",
      description: "Generate an orchestrator for the notebooks and a semantic model on top of Gold tables.",
    },
  ];

  return (
    <main className="ade-page">
      <style>{`
        .ade-page{--ade-ink:#F4F8FC;--ade-muted:#8FA7BF;--ade-line:#214260;--ade-blue:#2DA8FF;--ade-violet:#A875FF;--ade-bg:#061426;color:var(--ade-ink);background:var(--ade-bg);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;min-height:100vh}
        .ade-page *{box-sizing:border-box}.ade-container{width:min(1160px,calc(100% - 40px));margin:0 auto}
        .ade-nav{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:22px 0}
        .ade-brand{display:flex;align-items:center;gap:11px;font-weight:750;letter-spacing:-.03em}.ade-brand-mark{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:linear-gradient(135deg,#2DA8FF,#A875FF);color:#fff;box-shadow:0 8px 20px rgba(45,168,255,0.2)}
        .ade-nav-label{font-size:13px;color:var(--ade-muted)}.ade-button{border:0;border-radius:12px;padding:12px 17px;font-size:14px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:9px;transition:transform .18s ease,box-shadow .18s ease,background .18s ease;text-decoration:none}
        .ade-button:hover{transform:translateY(-1px)}.ade-button-primary{background:var(--ade-blue);color:#fff;box-shadow:0 8px 20px rgba(45,168,255,0.2)}.ade-button-primary:hover{background:#1A9AEF;box-shadow:0 10px 25px rgba(45,168,255,0.3)}.ade-button-secondary{color:var(--ade-ink);background:#0C1F35;border:1px solid var(--ade-line)}
        .ade-hero{position:relative;overflow:hidden;border:1px solid #214260;border-radius:28px;background:radial-gradient(ellipse at 88% 10%,rgba(45,168,255,0.08) 0,transparent 34%),linear-gradient(135deg,#0C1F35 0%,#0D2040 100%);padding:clamp(30px,6vw,72px);display:grid;grid-template-columns:minmax(0,1.15fr) minmax(280px,.85fr);gap:42px;align-items:center;box-shadow:0 18px 50px rgba(0,0,0,0.3)}
        .ade-eyebrow{display:inline-flex;align-items:center;gap:8px;padding:7px 11px;border:1px solid #214260;border-radius:999px;background:#0D2040;color:#2DA8FF;font-size:12px;font-weight:750;letter-spacing:.04em;text-transform:uppercase}.ade-dot{width:7px;height:7px;border-radius:50%;background:#2DA8FF}
        .ade-hero h1{font-size:clamp(36px,5vw,60px);line-height:1.04;letter-spacing:-.055em;margin:22px 0 18px;max-width:680px}.ade-gradient-text{background:linear-gradient(90deg,#2DA8FF,#A875FF);-webkit-background-clip:text;background-clip:text;color:transparent}.ade-hero-copy{max-width:620px;color:#8FA7BF;font-size:17px;line-height:1.75;margin:0}.ade-hero-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}.ade-note{font-size:12px;color:#4A6580;margin-top:14px}
        .ade-visual{position:relative;min-height:330px;display:grid;place-items:center}.ade-orbit{position:absolute;width:300px;height:300px;border:1px dashed #214260;border-radius:50%;opacity:.8}.ade-orbit:before,.ade-orbit:after{content:"";position:absolute;border:1px solid #18334F;border-radius:50%}.ade-orbit:before{inset:28px}.ade-orbit:after{inset:58px}.ade-core{position:relative;z-index:2;width:132px;height:132px;border-radius:30px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#fff;background:linear-gradient(145deg,#2DA8FF,#A875FF);box-shadow:0 18px 45px rgba(45,168,255,0.2)}.ade-core strong{font-size:14px}.ade-core small{font-size:10px;opacity:.85}.ade-float{position:absolute;z-index:3;display:flex;align-items:center;gap:9px;background:#0C1F35;border:1px solid #214260;border-radius:14px;padding:11px 13px;box-shadow:0 10px 30px rgba(0,0,0,0.3);font-size:12px;font-weight:700;color:#F4F8FC}.ade-float span{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:rgba(45,168,255,0.1);color:#2DA8FF}.ade-float-one{top:30px;left:0}.ade-float-two{right:-3px;top:105px}.ade-float-three{left:15px;bottom:35px}.ade-float-four{right:4px;bottom:20px}
        .ade-section{padding:76px 0 0}.ade-section-heading{text-align:center;max-width:690px;margin:0 auto 34px}.ade-kicker{color:#2DA8FF;font-size:12px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}.ade-section h2{font-size:clamp(27px,3.2vw,39px);letter-spacing:-.04em;line-height:1.15;margin:12px 0}.ade-section-heading p{color:var(--ade-muted);line-height:1.7;margin:0}
        .ade-layer-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:17px}.ade-layer{background:#0C1F35;border:1px solid #214260;border-radius:20px;padding:23px;box-shadow:0 8px 24px rgba(0,0,0,0.2)}.ade-layer-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px}.ade-layer-icon{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;font-weight:850;font-size:16px}.ade-layer.bronze .ade-layer-icon{background:rgba(245,166,35,0.1);color:#F5A623;border:1px solid rgba(245,166,35,0.25)}.ade-layer.silver .ade-layer-icon{background:rgba(167,139,250,0.1);color:#A78BFA;border:1px solid rgba(167,139,250,0.25)}.ade-layer.gold .ade-layer-icon{background:rgba(6,182,212,0.1);color:#06B6D4;border:1px solid rgba(6,182,212,0.25)}.ade-layer-number{font-size:12px;color:#4A6580;font-weight:800}.ade-layer h3{font-size:20px;margin:0 0 5px;color:#F4F8FC}.ade-layer-subtitle{font-size:12px;font-weight:750;color:#8FA7BF}.ade-layer p{font-size:14px;color:var(--ade-muted);line-height:1.7;margin:15px 0 0}
        .ade-process{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:15px}.ade-step{position:relative;background:#0C1F35;border:1px solid #214260;border-radius:18px;padding:22px}.ade-step-number{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:rgba(45,168,255,0.1);color:#2DA8FF;font-weight:850;font-size:13px;margin-bottom:20px;border:1px solid rgba(45,168,255,0.25)}.ade-step h3{font-size:16px;line-height:1.35;margin:0 0 9px;color:#F4F8FC}.ade-step p{font-size:13px;line-height:1.7;color:var(--ade-muted);margin:0}
        .ade-control{margin-top:70px;border-radius:24px;padding:clamp(26px,4vw,44px);background:#0C1F35;border:1px solid #214260;color:#fff;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:25px;align-items:center}.ade-control h2{font-size:clamp(25px,3vw,34px);letter-spacing:-.04em;margin:0 0 10px}.ade-control p{color:#8FA7BF;line-height:1.7;margin:0;max-width:680px;font-size:14px}.ade-control .ade-button{white-space:nowrap}.ade-footer{display:flex;justify-content:space-between;gap:16px;padding:26px 0 30px;color:#4A6580;font-size:12px}
        @media(max-width:850px){.ade-hero{grid-template-columns:1fr;gap:12px}.ade-visual{min-height:290px}.ade-layer-grid{grid-template-columns:1fr}.ade-process{grid-template-columns:repeat(2,minmax(0,1fr))}.ade-control{grid-template-columns:1fr}.ade-control .ade-button{justify-self:start}}
        @media(max-width:520px){.ade-container{width:min(100% - 24px,1160px)}.ade-nav-label{display:none}.ade-nav .ade-button{padding:10px 12px;font-size:12px}.ade-hero{padding:25px 20px;border-radius:22px}.ade-hero h1{font-size:38px}.ade-hero-copy{font-size:15px}.ade-visual{min-height:270px;transform:scale(.9)}.ade-orbit{width:260px;height:260px}.ade-float-one{left:-8px}.ade-float-two{right:-14px}.ade-float-three{left:-7px}.ade-float-four{right:-13px}.ade-process{grid-template-columns:1fr}.ade-section{padding-top:56px}.ade-footer{flex-direction:column}}
        @media(prefers-reduced-motion:reduce){.ade-button{transition:none}}
      `}</style>

      <div className="ade-container">
        <nav className="ade-nav" aria-label="Main navigation">
          <div className="ade-brand">
            <span className="ade-brand-mark" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M5 7.5 12 3l7 4.5v9L12 21l-7-4.5v-9Z" stroke="currentColor" strokeWidth="1.7"/><path d="m8 9 4-2.5L16 9v5.5L12 17l-4-2.5V9Z" stroke="currentColor" strokeWidth="1.7"/></svg>
            </span>
            <span>AI Data Engineering</span>
          </div>
          <div className="ade-nav-label">AI-assisted. Engineer-approved.</div>
          <button className="ade-button ade-button-primary" onClick={launchStudio}>
            Launch Studio <span aria-hidden="true">↗</span>
          </button>
        </nav>

        <section className="ade-hero" aria-labelledby="ade-title">
          <div>
            <div className="ade-eyebrow"><span className="ade-dot" /> AI-native workflow</div>
            <h1 id="ade-title">Build data pipelines <span className="ade-gradient-text">with AI.</span></h1>
            <p className="ade-hero-copy">
              Accelerate Medallion architecture development with AI-generated notebooks,
              data profiling, and orchestration—while data engineers stay in control of
              every review, approval, and run.
            </p>
            <div className="ade-hero-actions">
              <button className="ade-button ade-button-primary" onClick={launchStudio}>
                Launch Data Engineering Studio <span aria-hidden="true">↗</span>
              </button>
              <a className="ade-button ade-button-secondary" href="#ade-workflow">Explore the workflow <span aria-hidden="true">↓</span></a>
            </div>
            <div className="ade-note">Designed to reduce repetitive implementation work—not remove engineering oversight.</div>
          </div>

          <div className="ade-visual" aria-label="AI and data engineering workflow illustration">
            <div className="ade-orbit" />
            <div className="ade-core">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.8 14.2 9.8 21.2 12l-7 2.2-2.2 7-2.2-7L2.8 12l7-2.2L12 2.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/><path d="m19 2 .7 2.3L22 5l-2.3.7L19 8l-.7-2.3L16 5l2.3-.7L19 2Z" fill="currentColor"/></svg>
              <strong>AI Engine</strong><small>Generate · Review · Run</small>
            </div>
            <div className="ade-float ade-float-one"><span>⌘</span> Data profile</div>
            <div className="ade-float ade-float-two"><span>▤</span> Notebooks</div>
            <div className="ade-float ade-float-three"><span>✓</span> Engineer approval</div>
            <div className="ade-float ade-float-four"><span>↗</span> Orchestration</div>
          </div>
        </section>

        <section className="ade-section" aria-labelledby="ade-layers-title">
          <div className="ade-section-heading">
            <div className="ade-kicker">One connected architecture</div>
            <h2 id="ade-layers-title">From source data to business-ready insights</h2>
            <p>The AI tool helps build each layer of the Medallion architecture. Engineers provide business context and validate the generated work.</p>
          </div>
          <div className="ade-layer-grid">
            {layers.map((layer) => (
              <article className={`ade-layer ${layer.className}`} key={layer.name}>
                <div className="ade-layer-top">
                  <div className="ade-layer-icon" aria-hidden="true">{layer.name.slice(0, 1)}</div>
                  <span className="ade-layer-number">LAYER {layer.number}</span>
                </div>
                <h3>{layer.name}</h3>
                <div className="ade-layer-subtitle">{layer.subtitle}</div>
                <p>{layer.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="ade-section" id="ade-workflow" aria-labelledby="ade-workflow-title">
          <div className="ade-section-heading">
            <div className="ade-kicker">How it works</div>
            <h2 id="ade-workflow-title">AI does the drafting. Engineers make the call.</h2>
            <p>A guided workflow combines AI-generated artefacts with human review and approval at each important stage.</p>
          </div>
          <div className="ade-process">
            {steps.map((step) => (
              <article className="ade-step" key={step.number}>
                <div className="ade-step-number">{step.number}</div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="ade-control" aria-labelledby="ade-control-title">
          <div>
            <h2 id="ade-control-title">Ready to start building?</h2>
            <p>Open the Data Engineering Studio to work with your datasets, generate pipeline assets, and review the results before execution.</p>
          </div>
          <button className="ade-button ade-button-primary" onClick={launchStudio}>
            Launch Studio <span aria-hidden="true">↗</span>
          </button>
        </section>

        <footer className="ade-footer">
          <span>AI Native Data Engineering</span>
          <span>AI-assisted development · Human-reviewed execution</span>
        </footer>
      </div>
    </main>
  );
}
