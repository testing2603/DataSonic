import React from "react";

export default function AIDataEngineeringOverview({
  studioUrl = "http://localhost:5173",
}) {
  const launchStudio = () => {
    window.open(studioUrl, "_blank", "noopener,noreferrer");
  };

  const layers = [
    {
      number: "01",
      name: "Bronze",
      subtitle: "Ingestion",
      description: "Bring source data into the engine using an appropriate load strategy.",
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
    <div className="h-full overflow-y-auto" style={{ background: '#061426' }}>
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '0 28px' }}>

        {/* Hero */}
        <section style={{ padding: '40px 0 32px' }}>
          <div style={{
            borderRadius: 20, border: '1px solid #214260', overflow: 'hidden',
            background: 'radial-gradient(ellipse at 85% 10%, rgba(45,168,255,0.08) 0, transparent 34%), linear-gradient(135deg, #0C1F35 0%, #0D2040 100%)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
            display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 36, alignItems: 'center',
            padding: 'clamp(28px, 5vw, 56px)',
          }}>
            <div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '6px 12px', borderRadius: 999, border: '1px solid #214260',
                background: '#0D2040', color: '#2DA8FF', fontSize: 11, fontWeight: 600,
                letterSpacing: '0.04em', textTransform: 'uppercase' as const,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2DA8FF' }} />
                AI-native workflow
              </div>
              <h1 style={{
                fontSize: 'clamp(28px, 4vw, 44px)', lineHeight: 1.1, letterSpacing: '-0.04em',
                margin: '18px 0 16px', color: '#F4F8FC', fontWeight: 700,
              }}>
                Build data pipelines{' '}
                <span style={{
                  background: 'linear-gradient(90deg, #2DA8FF, #A875FF)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>with AI.</span>
              </h1>
              <p style={{ maxWidth: 560, color: '#8FA7BF', fontSize: 13, lineHeight: 1.75, margin: 0 }}>
                Accelerate Medallion architecture development with AI-generated notebooks,
                data profiling, and orchestration — while data engineers stay in control of
                every review, approval, and run.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 10, marginTop: 22 }}>
                <button onClick={launchStudio} style={{
                  border: 0, borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: '#2DA8FF', color: '#fff', boxShadow: '0 6px 18px rgba(45,168,255,0.2)',
                  transition: 'transform 0.18s ease',
                }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'none')}
                >
                  Launch Studio <span aria-hidden="true">↗</span>
                </button>
                <a href="#ade-workflow" style={{
                  border: '1px solid #214260', borderRadius: 10, padding: '10px 18px',
                  fontSize: 13, fontWeight: 500, color: '#8FA7BF', background: '#0C1F35',
                  display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none',
                  cursor: 'pointer',
                }}>
                  Explore workflow <span aria-hidden="true">↓</span>
                </a>
              </div>
              <div style={{ fontSize: 11, color: '#4A6580', marginTop: 12 }}>
                Designed to reduce repetitive implementation work — not remove engineering oversight.
              </div>
            </div>

            {/* Visual */}
            <div style={{ position: 'relative', minHeight: 300, display: 'grid', placeItems: 'center' }}>
              {/* Orbit rings */}
              <div style={{
                position: 'absolute', width: 260, height: 260,
                border: '1px dashed #214260', borderRadius: '50%', opacity: 0.8,
              }} />
              <div style={{
                position: 'absolute', width: 200, height: 200,
                border: '1px solid #18334F', borderRadius: '50%',
              }} />
              <div style={{
                position: 'absolute', width: 140, height: 140,
                border: '1px solid #18334F', borderRadius: '50%',
              }} />
              {/* Core */}
              <div style={{
                position: 'relative', zIndex: 2, width: 120, height: 120, borderRadius: 26,
                display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 6,
                color: '#fff', background: 'linear-gradient(145deg, #2DA8FF, #A875FF)',
                boxShadow: '0 14px 36px rgba(45,168,255,0.2)',
              }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 2.8 14.2 9.8 21.2 12l-7 2.2-2.2 7-2.2-7L2.8 12l7-2.2L12 2.8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                  <path d="m19 2 .7 2.3L22 5l-2.3.7L19 8l-.7-2.3L16 5l2.3-.7L19 2Z" fill="currentColor"/>
                </svg>
                <strong style={{ fontSize: 13, fontWeight: 600 }}>AI Engine</strong>
                <small style={{ fontSize: 9, opacity: 0.85, fontWeight: 400 }}>Generate · Review · Run</small>
              </div>
              {/* Floating labels */}
              {[
                { label: 'Data profile', icon: '⌘', top: 20, left: 0 },
                { label: 'Notebooks', icon: '▤', top: 90, right: -6 },
                { label: 'Engineer approval', icon: '✓', bottom: 30, left: 8 },
                { label: 'Orchestration', icon: '↗', bottom: 14, right: 0 },
              ].map((f, i) => (
                <div key={i} style={{
                  position: 'absolute', zIndex: 3, display: 'flex', alignItems: 'center', gap: 8,
                  background: '#0C1F35', border: '1px solid #214260', borderRadius: 12,
                  padding: '9px 12px', boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                  fontSize: 11, fontWeight: 500, color: '#F4F8FC',
                  ...f,
                }}>
                  <span style={{
                    display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: 8,
                    background: 'rgba(45,168,255,0.1)', color: '#2DA8FF',
                  }}>{f.icon}</span>
                  {f.label}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Medallion layers */}
        <section style={{ paddingTop: 48 }}>
          <div style={{ textAlign: 'center' as const, maxWidth: 640, margin: '0 auto 28px' }}>
            <div style={{ color: '#2DA8FF', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>
              One connected architecture
            </div>
            <h2 style={{ fontSize: 'clamp(22px, 2.8vw, 30px)', letterSpacing: '-0.03em', lineHeight: 1.2, margin: '10px 0', color: '#F4F8FC', fontWeight: 700 }}>
              From source data to business-ready insights
            </h2>
            <p style={{ color: '#8FA7BF', lineHeight: 1.7, margin: 0, fontSize: 13 }}>
              The AI tool helps build each layer of the Medallion architecture. Engineers provide business context and validate the generated work.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {layers.map((layer) => {
              const colors: Record<string, { bg: string; color: string; border: string }> = {
                bronze: { bg: 'rgba(245,166,35,0.1)', color: '#F5A623', border: 'rgba(245,166,35,0.25)' },
                silver: { bg: 'rgba(167,139,250,0.1)', color: '#A78BFA', border: 'rgba(167,139,250,0.25)' },
                gold: { bg: 'rgba(6,182,212,0.1)', color: '#06B6D4', border: 'rgba(6,182,212,0.25)' },
              };
              const c = colors[layer.className];
              return (
                <div key={layer.name} style={{
                  background: '#0C1F35', border: '1px solid #214260', borderRadius: 16, padding: 20,
                  boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center',
                      fontWeight: 700, fontSize: 15, background: c.bg, color: c.color, border: `1px solid ${c.border}`,
                    }}>
                      {layer.name.slice(0, 1)}
                    </div>
                    <span style={{ fontSize: 11, color: '#4A6580', fontWeight: 600 }}>LAYER {layer.number}</span>
                  </div>
                  <h3 style={{ fontSize: 16, margin: '0 0 4px', color: '#F4F8FC', fontWeight: 600 }}>{layer.name}</h3>
                  <div style={{ fontSize: 11, fontWeight: 500, color: '#8FA7BF' }}>{layer.subtitle}</div>
                  <p style={{ fontSize: 13, color: '#8FA7BF', lineHeight: 1.7, margin: '12px 0 0' }}>{layer.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* How it works */}
        <section id="ade-workflow" style={{ padding: '56px 0 0' }}>
          <div style={{ textAlign: 'center' as const, maxWidth: 640, margin: '0 auto 28px' }}>
            <div style={{ color: '#2DA8FF', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>
              How it works
            </div>
            <h2 style={{ fontSize: 'clamp(22px, 2.8vw, 30px)', letterSpacing: '-0.03em', lineHeight: 1.2, margin: '10px 0', color: '#F4F8FC', fontWeight: 700 }}>
              AI does the drafting. Engineers make the call.
            </h2>
            <p style={{ color: '#8FA7BF', lineHeight: 1.7, margin: 0, fontSize: 13 }}>
              A guided workflow combines AI-generated artefacts with human review and approval at each important stage.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {steps.map((step, i) => (
              <div key={step.number} style={{
                position: 'relative', background: '#0C1F35', border: '1px solid #214260',
                borderRadius: 14, padding: 20,
              }}>
                {i < steps.length - 1 && (
                  <div style={{
                    position: 'absolute', top: 28, right: -8, width: 14, height: 2,
                    background: '#214260', zIndex: 1,
                  }} />
                )}
                <div style={{
                  display: 'grid', placeItems: 'center', width: 32, height: 32, borderRadius: 10,
                  background: 'rgba(45,168,255,0.1)', color: '#2DA8FF', border: '1px solid rgba(45,168,255,0.25)',
                  fontWeight: 600, fontSize: 12, marginBottom: 16,
                }}>
                  {step.number}
                </div>
                <h3 style={{ fontSize: 14, lineHeight: 1.35, margin: '0 0 8px', color: '#F4F8FC', fontWeight: 600 }}>{step.title}</h3>
                <p style={{ fontSize: 12, lineHeight: 1.7, color: '#8FA7BF', margin: 0 }}>{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: '48px 0 40px' }}>
          <div style={{
            borderRadius: 18, padding: 'clamp(22px, 3.5vw, 36px)',
            background: '#0C1F35', border: '1px solid #214260', color: '#fff',
            display: 'grid', gridTemplateColumns: '1fr auto', gap: 20, alignItems: 'center',
          }}>
            <div>
              <h2 style={{ fontSize: 'clamp(20px, 2.5vw, 26px)', letterSpacing: '-0.03em', margin: '0 0 8px', fontWeight: 700 }}>
                Ready to start building?
              </h2>
              <p style={{ color: '#8FA7BF', lineHeight: 1.7, margin: 0, maxWidth: 600, fontSize: 13 }}>
                Open the Data Engineering Studio to work with your datasets, generate pipeline assets, and review the results before execution.
              </p>
            </div>
            <button onClick={launchStudio} style={{
              border: 0, borderRadius: 10, padding: '10px 18px', fontSize: 13, fontWeight: 600,
              cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#2DA8FF', color: '#fff', boxShadow: '0 6px 18px rgba(45,168,255,0.2)',
              whiteSpace: 'nowrap' as const, transition: 'transform 0.18s ease',
            }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'none')}
            >
              Launch Studio <span aria-hidden="true">↗</span>
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}
